import * as XLSX from 'xlsx';

/**
 * Parse the VIT mess menu Excel/CSV file into structured JSON
 * Supports both formats:
 *   - Old: grouped by day (e.g., "Mon 2,16" in column 0)
 *   - New: one row per date with columns: ,,,,, Date, Day, Breakfast, Lunch, Snacks, Dinner
 * @param {ArrayBuffer} data - The file data
 * @returns {Object} Parsed menu data
 */
export function parseMenuExcel(data) {
    const workbook = XLSX.read(data, { type: 'array' });

    const result = {
        month: '',
        lastUpdated: new Date().toISOString(),
        sheets: [],
        menu: {
            vegNonVeg: [],
            special: []
        }
    };

    workbook.SheetNames.forEach((sheetName, sheetIndex) => {
        result.sheets.push(sheetName);
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const isVegNonVeg = sheetName.toLowerCase().includes('veg') ||
            sheetName.toLowerCase().includes('non') ||
            sheetName.toLowerCase().includes('sheet');
        const menuArray = isVegNonVeg ? result.menu.vegNonVeg : result.menu.special;

        // Detect format: check if the header row has Date/Day columns at offset 5-6
        const format = detectFormat(jsonData);

        if (format === 'per-date') {
            parsePerDateSheet(jsonData, menuArray, result, sheetIndex === 0);
        } else {
            parseGroupedSheet(jsonData, menuArray, result, sheetIndex === 0);
        }
    });

    return result;
}

/**
 * Detect whether the file uses the new per-date CSV format or the old grouped format
 */
function detectFormat(data) {
    for (let i = 0; i < Math.min(5, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        const rowStr = row.map(c => (c || '').toString().toLowerCase().trim()).join('|');
        // New format: has "date" and "day" as separate columns, plus breakfast/lunch
        if (rowStr.includes('date') && rowStr.includes('day') &&
            rowStr.includes('breakfast') && rowStr.includes('lunch')) {
            // Check if date and day are in separate columns (new format)
            const dateIdx = row.findIndex(c => (c || '').toString().toLowerCase().trim() === 'date');
            const dayIdx = row.findIndex(c => (c || '').toString().toLowerCase().trim() === 'day');
            if (dateIdx >= 0 && dayIdx >= 0 && dayIdx === dateIdx + 1) {
                return 'per-date';
            }
        }
    }
    return 'grouped';
}

/**
 * Clean markdown bold markers ** from text
 */
function cleanBold(text) {
    if (!text) return '';
    return text.toString().replace(/\*\*/g, '').trim();
}

/**
 * Extract numeric date from strings like "1st", "2nd", "15th", "**3rd**"
 */
function parseDateNum(dateStr) {
    const cleaned = cleanBold(dateStr);
    const match = cleaned.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

/**
 * Normalize day abbreviation to full name
 */
function parseDayName(dayStr) {
    const dayMap = {
        'sun': 'Sunday', 'mon': 'Monday', 'tue': 'Tuesday',
        'wed': 'Wednesday', 'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday'
    };
    const cleaned = cleanBold(dayStr).toLowerCase();
    return dayMap[cleaned] || dayStr.trim();
}

/**
 * Split a comma-separated meal cell into individual items,
 * handling parentheses properly
 */
function splitMealItems(cell) {
    if (!cell) return [];
    const text = cleanBold(cell.toString());
    if (!text) return [];

    const items = text.split(',');
    const merged = [];
    let i = 0;
    while (i < items.length) {
        let item = items[i];
        // Rejoin items split mid-parenthesis
        while (item.split('(').length > item.split(')').length && i + 1 < items.length) {
            i++;
            item += ', ' + items[i];
        }
        // Rejoin items split mid-quote
        while ((item.split('"').length - 1) % 2 !== 0 && i + 1 < items.length) {
            i++;
            item += ', ' + items[i];
        }
        const trimmed = item.trim();
        if (trimmed) {
            merged.push(trimmed);
        }
        i++;
    }
    return merged;
}

// ===== NEW FORMAT: One row per date =====

function parsePerDateSheet(data, menuArray, result, extractMonth) {
    // Find header row
    let headerRow = -1;
    let colMap = {};

    for (let i = 0; i < Math.min(5, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        const rowStr = row.map(c => (c || '').toString().toLowerCase().trim()).join('|');
        if (rowStr.includes('breakfast') && rowStr.includes('lunch')) {
            headerRow = i;
            row.forEach((cell, idx) => {
                const c = (cell || '').toString().toLowerCase().trim();
                if (c === 'date') colMap.date = idx;
                if (c === 'day') colMap.day = idx;
                if (c.includes('breakfast')) colMap.breakfast = idx;
                if (c.includes('lunch')) colMap.lunch = idx;
                if (c.includes('snack')) colMap.snacks = idx;
                if (c.includes('dinner')) colMap.dinner = idx;
            });
            break;
        }
    }

    if (headerRow === -1) return;

    // Group rows by day of week
    const dayGroups = {}; // dayName -> { dates: [], mealsByDate: { dateNum: meals } }
    const dayOrder = [];

    for (let i = headerRow + 1; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;

        const dateCell = (row[colMap.date] || '').toString().trim();
        const dayCell = (row[colMap.day] || '').toString().trim();

        if (!dateCell || !dayCell) continue;

        const dateNum = parseDateNum(dateCell);
        const dayName = parseDayName(dayCell);

        if (dateNum === null) continue;

        // Extract month from first data row if needed
        if (extractMonth && !result.month && dateNum) {
            // Try to infer month from filename context or date
            // The CSV doesn't have explicit month, so we use current context
            // This will be overridden by the user if they set it in the UI
        }

        if (!dayGroups[dayName]) {
            dayGroups[dayName] = { dates: [], mealsByDate: {} };
            dayOrder.push(dayName);
        }

        dayGroups[dayName].dates.push(dateNum);

        const breakfast = splitMealItems(row[colMap.breakfast]);
        const lunch = splitMealItems(row[colMap.lunch]);
        const snacks = splitMealItems(row[colMap.snacks]);
        const dinner = splitMealItems(row[colMap.dinner]);

        dayGroups[dayName].mealsByDate[dateNum] = { breakfast, lunch, snacks, dinner };
    }

    // Try to extract month from the filename embedded in the sheet data
    // or from the first row content
    if (extractMonth && !result.month) {
        for (let i = 0; i < Math.min(3, data.length); i++) {
            const row = data[i];
            if (!row) continue;
            const fullRow = row.map(c => (c || '').toString()).join(' ');
            const monthMatch = fullRow.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})/i);
            if (monthMatch) {
                result.month = `${monthMatch[1]} ${monthMatch[2]}`;
                break;
            }
        }
    }

    // Build menu entries, ordering by canonical day order
    const canonicalOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const orderedDays = canonicalOrder.filter(d => dayGroups[d]);

    orderedDays.forEach(dayName => {
        const group = dayGroups[dayName];
        const dates = group.dates.sort((a, b) => a - b);
        const meals = buildMergedMeals(group.mealsByDate, dates);
        const rawDate = `${dayName.substring(0, 3)} ${dates.join(',')}`;

        menuArray.push({
            day: dayName,
            dates: dates,
            rawDate: rawDate,
            meals: meals
        });
    });
}

/**
 * Merge meals across same-weekday dates.
 * Common items (same across all dates) are kept as-is.
 * Differing items are tagged with (dateNum) prefix.
 */
function buildMergedMeals(mealsByDate, dates) {
    const result = { breakfast: [], lunch: [], snacks: [], dinner: [] };

    ['breakfast', 'lunch', 'snacks', 'dinner'].forEach(mealType => {
        const allDateItems = {};
        dates.forEach(d => {
            allDateItems[d] = mealsByDate[d] ? mealsByDate[d][mealType] : [];
        });

        // Check if all dates have the same items
        const first = allDateItems[dates[0]] || [];
        const allSame = dates.every(d => {
            const items = allDateItems[d] || [];
            return items.length === first.length &&
                items.every((item, idx) => item === first[idx]);
        });

        if (allSame) {
            result[mealType] = [...first];
        } else {
            // Find common items (same at same position across all dates)
            const maxLen = Math.max(...dates.map(d => (allDateItems[d] || []).length));
            const common = [];
            const varying = [];

            for (let pos = 0; pos < maxLen; pos++) {
                const itemsAtPos = {};
                dates.forEach(d => {
                    const items = allDateItems[d] || [];
                    if (pos < items.length) {
                        itemsAtPos[d] = items[pos];
                    }
                });

                const uniqueValues = [...new Set(Object.values(itemsAtPos))];
                if (uniqueValues.length === 1 && Object.keys(itemsAtPos).length === dates.length) {
                    // Same item at this position for all dates
                    common.push(uniqueValues[0]);
                } else {
                    // Different — tag each with date
                    Object.entries(itemsAtPos).forEach(([d, item]) => {
                        const tagged = `(${d}) ${item}`;
                        if (!varying.includes(tagged)) {
                            varying.push(tagged);
                        }
                    });
                }
            }

            result[mealType] = [...common, ...varying];
        }
    });

    return result;
}

// ===== OLD FORMAT: Grouped by day =====

function isExcelSerialDate(value) {
    if (typeof value === 'number' && value >= 40000 && value <= 50000) return true;
    if (typeof value === 'string') {
        const num = parseFloat(value);
        if (!isNaN(num) && num >= 40000 && num <= 50000) return true;
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) return true;
        if (/^\d{1,2}-\d{1,2}-\d{4}/.test(value)) return true;
    }
    if (value instanceof Date && !isNaN(value)) return true;
    return false;
}

function getDateDay(value) {
    if (typeof value === 'number' && value >= 40000 && value <= 50000) {
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
        return date.getDate();
    }
    if (typeof value === 'string') {
        const num = parseFloat(value);
        if (!isNaN(num) && num >= 40000 && num <= 50000) {
            const excelEpoch = new Date(1899, 11, 30);
            const date = new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000);
            return date.getDate();
        }
        const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) return parseInt(isoMatch[3], 10);
        const dmyMatch = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
        if (dmyMatch) return parseInt(dmyMatch[1], 10);
    }
    if (value instanceof Date && !isNaN(value)) return value.getDate();
    return null;
}

function parseGroupedSheet(data, menuArray, result, extractMonth) {
    let currentDay = null;
    let currentMeals = null;

    let headerRowIndex = -1;
    let colIndices = { dates: 0, breakfast: 1, lunch: 2, snacks: 3, dinner: 4 };

    for (let i = 0; i < Math.min(10, data.length); i++) {
        const row = data[i];
        if (!row) continue;

        if (extractMonth && row[0] && typeof row[0] === 'string') {
            const monthMatch = row[0].match(/MONTH\s+OF\s*[-–]\s*(\w+)\s*[-–]?\s*(\d{4})?/i);
            if (monthMatch) {
                result.month = `${monthMatch[1]} ${monthMatch[2] || ''}`.trim();
            }
        }

        const rowStr = row.join(' ').toLowerCase();
        if (rowStr.includes('breakfast') && rowStr.includes('lunch')) {
            headerRowIndex = i;
            row.forEach((cell, idx) => {
                const cellLower = (cell || '').toString().toLowerCase().trim();
                if (cellLower.includes('date')) colIndices.dates = idx;
                if (cellLower.includes('breakfast')) colIndices.breakfast = idx;
                if (cellLower.includes('lunch')) colIndices.lunch = idx;
                if (cellLower.includes('snack')) colIndices.snacks = idx;
                if (cellLower.includes('dinner')) colIndices.dinner = idx;
            });
            break;
        }
    }

    if (headerRowIndex === -1) headerRowIndex = 2;

    let perDateMeals = { breakfast: {}, lunch: {}, snacks: {}, dinner: {} };

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;

        const dateCell = row[colIndices.dates];

        const isNewDay = dateCell && typeof dateCell === 'string' &&
            /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(dateCell.toString().trim());

        if (isNewDay) {
            if (currentDay && currentMeals) {
                const finalMeals = finalizeMeals(currentMeals, perDateMeals, currentDay.dates);
                menuArray.push({ ...currentDay, meals: finalMeals });
            }

            const dayInfo = parseDayInfo(dateCell);
            currentDay = dayInfo;
            currentMeals = { breakfast: [], lunch: [], snacks: [], dinner: [] };
            perDateMeals = { breakfast: {}, lunch: {}, snacks: {}, dinner: {} };
        }

        if (currentMeals) {
            processMealCell(row[colIndices.breakfast], currentMeals.breakfast, perDateMeals.breakfast);
            processMealCell(row[colIndices.lunch], currentMeals.lunch, perDateMeals.lunch);
            processMealCell(row[colIndices.snacks], currentMeals.snacks, perDateMeals.snacks);
            processMealCell(row[colIndices.dinner], currentMeals.dinner, perDateMeals.dinner);
        }
    }

    if (currentDay && currentMeals) {
        const finalMeals = finalizeMeals(currentMeals, perDateMeals, currentDay.dates);
        menuArray.push({ ...currentDay, meals: finalMeals });
    }
}

function processMealCell(cell, mealArray, perDateItems) {
    if (!cell) return;
    const value = cell.toString().trim();
    if (!value) return;

    if (isExcelSerialDate(cell)) {
        const day = getDateDay(cell);
        if (day && !perDateItems[day]) perDateItems[day] = [];
        if (day) perDateItems._currentDate = day;
        return;
    }

    const currentDate = perDateItems._currentDate || 'default';
    if (!perDateItems[currentDate]) perDateItems[currentDate] = [];
    if (!perDateItems[currentDate].includes(value)) perDateItems[currentDate].push(value);
    if (!mealArray.includes(value)) mealArray.push(value);
}

function finalizeMeals(currentMeals, perDateMeals, dayDates) {
    const result = { breakfast: [], lunch: [], snacks: [], dinner: [] };

    ['breakfast', 'lunch', 'snacks', 'dinner'].forEach(mealType => {
        const perDate = perDateMeals[mealType];
        const dates = Object.keys(perDate).filter(k => k !== '_currentDate');

        if (dates.length > 1 || (dates.length === 1 && dates[0] !== 'default')) {
            const itemsWithDates = [];

            dates.forEach(dateKey => {
                if (dateKey === 'default') return;
                perDate[dateKey].forEach(item => {
                    itemsWithDates.push({ date: parseInt(dateKey), item });
                });
            });

            if (perDate['default']) {
                perDate['default'].forEach(item => {
                    itemsWithDates.push({ date: null, item });
                });
            }

            const groupedByDate = {};
            itemsWithDates.forEach(({ date, item }) => {
                const key = date || 'common';
                if (!groupedByDate[key]) groupedByDate[key] = [];
                if (!groupedByDate[key].includes(item)) groupedByDate[key].push(item);
            });

            result[mealType] = [];
            if (groupedByDate['common']) {
                groupedByDate['common'].forEach(item => result[mealType].push(item));
            }
            Object.keys(groupedByDate).forEach(dateKey => {
                if (dateKey === 'common') return;
                groupedByDate[dateKey].forEach(item => {
                    result[mealType].push(`(${dateKey}) ${item}`);
                });
            });
        } else {
            result[mealType] = [...currentMeals[mealType]];
        }
    });

    return result;
}

function parseDayInfo(dateStr) {
    const cleanStr = dateStr.toString().trim();
    const match = cleanStr.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s*([\d,\s]+)/i);

    if (match) {
        const dayAbbrev = match[1].toLowerCase();
        const dateNums = match[2].split(/\s*,\s*/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
        const dayMap = {
            'sun': 'Sunday', 'mon': 'Monday', 'tue': 'Tuesday',
            'wed': 'Wednesday', 'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday'
        };
        return { day: dayMap[dayAbbrev] || cleanStr, dates: dateNums, rawDate: cleanStr };
    }

    return { day: cleanStr, dates: [], rawDate: cleanStr };
}

// ===== Utility exports =====

export function downloadMenuJSON(menuData, filename = 'menu.json') {
    const jsonStr = JSON.stringify(menuData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function copyToClipboard(menuData) {
    const jsonStr = JSON.stringify(menuData, null, 2);
    await navigator.clipboard.writeText(jsonStr);
}
