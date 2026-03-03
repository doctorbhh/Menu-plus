import * as XLSX from 'xlsx';

/**
 * Parse the VIT mess menu Excel/CSV file into structured JSON.
 * Supports:
 *   - Old format: grouped by day of week (e.g., "Mon 2,16" in column 0)
 *   - New format: one row per date with columns: Date, Day, Breakfast, Lunch, Snacks, Dinner
 * New format outputs 31 individual entries (one per calendar date).
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

        // Auto-detect format
        const format = detectFormat(jsonData);
        if (format === 'per-date') {
            parsePerDateSheet(jsonData, menuArray, result, sheetIndex === 0);
        } else {
            parseGroupedSheet(jsonData, menuArray, result, sheetIndex === 0);
        }
    });

    return result;
}

// ===== Format Detection =====

function detectFormat(data) {
    for (let i = 0; i < Math.min(5, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        const rowStr = row.map(c => (c || '').toString().toLowerCase().trim()).join('|');
        if (rowStr.includes('date') && rowStr.includes('day') &&
            rowStr.includes('breakfast') && rowStr.includes('lunch')) {
            const dateIdx = row.findIndex(c => (c || '').toString().toLowerCase().trim() === 'date');
            const dayIdx = row.findIndex(c => (c || '').toString().toLowerCase().trim() === 'day');
            if (dateIdx >= 0 && dayIdx >= 0 && dayIdx === dateIdx + 1) {
                return 'per-date';
            }
        }
    }
    return 'grouped';
}

// ===== Helpers =====

function cleanBold(text) {
    if (!text) return '';
    return text.toString().replace(/\*\*/g, '').trim();
}

function parseDateNum(dateStr) {
    const cleaned = cleanBold(dateStr);
    const match = cleaned.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

function parseDayName(dayStr) {
    const dayMap = {
        'sun': 'Sunday', 'mon': 'Monday', 'tue': 'Tuesday',
        'wed': 'Wednesday', 'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday'
    };
    const cleaned = cleanBold(dayStr).toLowerCase();
    return dayMap[cleaned] || dayStr.trim();
}

function splitMealItems(cell) {
    if (!cell) return [];
    const text = cleanBold(cell.toString());
    if (!text) return [];

    const items = text.split(',');
    const merged = [];
    let i = 0;
    while (i < items.length) {
        let item = items[i];
        while (item.split('(').length > item.split(')').length && i + 1 < items.length) {
            i++;
            item += ', ' + items[i];
        }
        const trimmed = item.trim();
        if (trimmed) merged.push(trimmed);
        i++;
    }
    return merged;
}

// ===== NEW FORMAT: One row per date (31 entries) =====

function parsePerDateSheet(data, menuArray, result, extractMonth) {
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

    // Each row becomes its own entry — no grouping
    for (let i = headerRow + 1; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;

        const dateCell = (row[colMap.date] || '').toString().trim();
        const dayCell = (row[colMap.day] || '').toString().trim();
        if (!dateCell || !dayCell) continue;

        const dateNum = parseDateNum(dateCell);
        const dayName = parseDayName(dayCell);
        if (dateNum === null) continue;

        menuArray.push({
            day: dayName,
            dates: [dateNum],
            rawDate: `${cleanBold(dateCell)} - ${dayName.substring(0, 3)}`,
            meals: {
                breakfast: splitMealItems(row[colMap.breakfast]),
                lunch: splitMealItems(row[colMap.lunch]),
                snacks: splitMealItems(row[colMap.snacks]),
                dinner: splitMealItems(row[colMap.dinner])
            }
        });
    }

    // Try to extract month from content
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
}

// ===== OLD FORMAT: Grouped by day of week =====

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

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;

        const dateCell = row[colIndices.dates];
        const isNewDay = dateCell && typeof dateCell === 'string' &&
            /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(dateCell.toString().trim());

        if (isNewDay) {
            if (currentDay && currentMeals) {
                menuArray.push({ ...currentDay, meals: { ...currentMeals } });
            }
            const dayInfo = parseDayInfo(dateCell);
            currentDay = dayInfo;
            currentMeals = { breakfast: [], lunch: [], snacks: [], dinner: [] };
        }

        if (currentMeals) {
            addMealItem(row[colIndices.breakfast], currentMeals.breakfast);
            addMealItem(row[colIndices.lunch], currentMeals.lunch);
            addMealItem(row[colIndices.snacks], currentMeals.snacks);
            addMealItem(row[colIndices.dinner], currentMeals.dinner);
        }
    }

    if (currentDay && currentMeals) {
        menuArray.push({ ...currentDay, meals: { ...currentMeals } });
    }
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

function addMealItem(cell, mealArray) {
    if (!cell) return;
    const value = cell.toString().trim();
    if (!value) return;
    if (!mealArray.includes(value)) mealArray.push(value);
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
