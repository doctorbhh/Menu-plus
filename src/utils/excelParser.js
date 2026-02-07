import * as XLSX from 'xlsx';

/**
 * Parse the VIT mess menu Excel file into structured JSON
 * @param {ArrayBuffer} data - The Excel file data
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

    // Parse each sheet
    workbook.SheetNames.forEach((sheetName, sheetIndex) => {
        result.sheets.push(sheetName);
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Determine which menu array to use
        const isVegNonVeg = sheetName.toLowerCase().includes('veg');
        const menuArray = isVegNonVeg ? result.menu.vegNonVeg : result.menu.special;

        // Parse the sheet data
        parseSheet(jsonData, menuArray, result, sheetIndex === 0);
    });

    return result;
}

function isExcelSerialDate(value) {
    // Check for Excel serial number (numeric)
    if (typeof value === 'number' && value >= 40000 && value <= 50000) {
        return true;
    }
    // Check string representation of serial numbers
    if (typeof value === 'string') {
        const num = parseFloat(value);
        if (!isNaN(num) && num >= 40000 && num <= 50000) {
            return true;
        }
        // Check for formatted date strings like "2026-02-06 00:00:00" or "2026-02-06"
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
            return true;
        }
        // Check for date format "06-02-2026" or "6-2-2026"
        if (/^\d{1,2}-\d{1,2}-\d{4}/.test(value)) {
            return true;
        }
    }
    // Check if it's a JavaScript Date object
    if (value instanceof Date && !isNaN(value)) {
        return true;
    }
    return false;
}

function getDateDay(value) {
    // Extract day of month from various date formats
    if (typeof value === 'number' && value >= 40000 && value <= 50000) {
        // Excel serial
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
        // Parse "2026-02-06 00:00:00" or "2026-02-06"
        const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
            return parseInt(isoMatch[3], 10);
        }
        // Parse "06-02-2026"
        const dmyMatch = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
        if (dmyMatch) {
            return parseInt(dmyMatch[1], 10);
        }
    }
    if (value instanceof Date && !isNaN(value)) {
        return value.getDate();
    }
    return null;
}

/**
 * Convert Excel serial date to day of month
 */
function excelSerialToDay(serial) {
    const num = typeof serial === 'string' ? parseFloat(serial) : serial;
    // Excel serial date: days since 1900-01-01 (with Excel's date bug)
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000);
    return date.getDate();
}

/**
 * Convert Excel serial date to formatted date string
 */
function excelSerialToDateStr(serial) {
    const num = typeof serial === 'string' ? parseFloat(serial) : serial;
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000);
    return `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
}

function parseSheet(data, menuArray, result, extractMonth) {
    let currentDay = null;
    let currentMeals = null;

    // Find header row (Dates, Breakfast, Lunch, Snacks, Dinner)
    let headerRowIndex = -1;
    let colIndices = { dates: 0, breakfast: 1, lunch: 2, snacks: 3, dinner: 4 };

    for (let i = 0; i < Math.min(10, data.length); i++) {
        const row = data[i];
        if (!row) continue;

        // Check for month title
        if (extractMonth && row[0] && typeof row[0] === 'string') {
            const monthMatch = row[0].match(/MONTH\s+OF\s*[-–]\s*(\w+)\s*[-–]?\s*(\d{4})?/i);
            if (monthMatch) {
                result.month = `${monthMatch[1]} ${monthMatch[2] || ''}`.trim();
            }
        }

        // Check for header row
        const rowStr = row.join(' ').toLowerCase();
        if (rowStr.includes('breakfast') && rowStr.includes('lunch')) {
            headerRowIndex = i;
            // Map columns
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

    if (headerRowIndex === -1) {
        headerRowIndex = 2;
    }

    // Track per-date items for each meal type

    let perDateMeals = {
        breakfast: {},
        lunch: {},
        snacks: {},
        dinner: {}
    };
    let currentDateKey = 'default';

    // Process data rows - collect ALL rows for each day
    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;

        const dateCell = row[colIndices.dates];

        // Check if this is a new day row (has day name like Mon, Tue, etc.)
        const isNewDay = dateCell && typeof dateCell === 'string' &&
            /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(dateCell.toString().trim());

        if (isNewDay) {
            // Save previous day if exists
            if (currentDay && currentMeals) {
                // Merge per-date items into regular arrays if no dates found
                const finalMeals = finalizeMeals(currentMeals, perDateMeals, currentDay.dates);
                menuArray.push({
                    ...currentDay,
                    meals: finalMeals
                });
            }

            // Parse day info
            const dayInfo = parseDayInfo(dateCell);
            currentDay = dayInfo;
            currentMeals = {
                breakfast: [],
                lunch: [],
                snacks: [],
                dinner: []
            };
            // Reset per-date tracking
            perDateMeals = {
                breakfast: {},
                lunch: {},
                snacks: {},
                dinner: {}
            };
            currentDateKey = 'default';
        }

        // Process each meal column, handling embedded dates
        if (currentMeals) {
            processMealCell(row[colIndices.breakfast], currentMeals.breakfast, perDateMeals.breakfast);
            processMealCell(row[colIndices.lunch], currentMeals.lunch, perDateMeals.lunch);
            processMealCell(row[colIndices.snacks], currentMeals.snacks, perDateMeals.snacks);
            processMealCell(row[colIndices.dinner], currentMeals.dinner, perDateMeals.dinner);
        }
    }


    if (currentDay && currentMeals) {
        const finalMeals = finalizeMeals(currentMeals, perDateMeals, currentDay.dates);
        menuArray.push({
            ...currentDay,
            meals: finalMeals
        });
    }
}

/**
 * Process a meal cell that may contain embedded dates
 */
function processMealCell(cell, mealArray, perDateItems) {
    if (!cell) return;

    const value = cell.toString().trim();
    if (!value) return;


    if (isExcelSerialDate(cell)) {
        const day = getDateDay(cell);

        if (day && !perDateItems[day]) {
            perDateItems[day] = [];
        }

        if (day) {
            perDateItems._currentDate = day;
        }
        return;
    }


    const currentDate = perDateItems._currentDate || 'default';


    if (!perDateItems[currentDate]) {
        perDateItems[currentDate] = [];
    }
    if (!perDateItems[currentDate].includes(value)) {
        perDateItems[currentDate].push(value);
    }

    if (!mealArray.includes(value)) {
        mealArray.push(value);
    }
}

/**
 * Finalize meals by organizing per-date items
 */
function finalizeMeals(currentMeals, perDateMeals, dayDates) {
    const result = {
        breakfast: [],
        lunch: [],
        snacks: [],
        dinner: []
    };


    ['breakfast', 'lunch', 'snacks', 'dinner'].forEach(mealType => {
        const perDate = perDateMeals[mealType];
        const dates = Object.keys(perDate).filter(k => k !== '_currentDate');


        if (dates.length > 1 || (dates.length === 1 && dates[0] !== 'default')) {

            const itemsWithDates = [];

            dates.forEach(dateKey => {
                if (dateKey === 'default') return;
                const items = perDate[dateKey];
                items.forEach(item => {

                    itemsWithDates.push({
                        date: parseInt(dateKey),
                        item: item
                    });
                });
            });


            if (perDate['default']) {
                perDate['default'].forEach(item => {
                    itemsWithDates.push({
                        date: null,
                        item: item
                    });
                });
            }


            const groupedByDate = {};
            itemsWithDates.forEach(({ date, item }) => {
                const key = date || 'common';
                if (!groupedByDate[key]) groupedByDate[key] = [];
                if (!groupedByDate[key].includes(item)) {
                    groupedByDate[key].push(item);
                }
            });


            result[mealType] = [];


            if (groupedByDate['common']) {
                groupedByDate['common'].forEach(item => {
                    result[mealType].push(item);
                });
            }


            Object.keys(groupedByDate).forEach(dateKey => {
                if (dateKey === 'common') return;
                groupedByDate[dateKey].forEach(item => {
                    // Tag items with their specific date
                    result[mealType].push(`[${dateKey}] ${item}`);
                });
            });

        } else {
            // No per-date separation needed, use original items
            result[mealType] = [...currentMeals[mealType]];
        }
    });

    return result;
}

function parseDayInfo(dateStr) {
    const cleanStr = dateStr.toString().trim();

    // Match patterns like "Mon 2,16" or "Sun   1,15" or "Sat      7,21"
    const match = cleanStr.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s*([\d,\s]+)/i);

    if (match) {
        const dayAbbrev = match[1].toLowerCase();
        const dateNums = match[2].split(/\s*,\s*/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));

        const dayMap = {
            'sun': 'Sunday',
            'mon': 'Monday',
            'tue': 'Tuesday',
            'wed': 'Wednesday',
            'thu': 'Thursday',
            'fri': 'Friday',
            'sat': 'Saturday'
        };

        return {
            day: dayMap[dayAbbrev] || cleanStr,
            dates: dateNums,
            rawDate: cleanStr
        };
    }

    return {
        day: cleanStr,
        dates: [],
        rawDate: cleanStr
    };
}

/**
 * Export menu data as downloadable JSON file
 */
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

/**
 * Copy JSON to clipboard
 */
export async function copyToClipboard(menuData) {
    const jsonStr = JSON.stringify(menuData, null, 2);
    await navigator.clipboard.writeText(jsonStr);
}
