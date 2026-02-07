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
                menuArray.push({
                    ...currentDay,
                    meals: { ...currentMeals }
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
        }

        // Add meal items from this row (whether it's the day header row or continuation rows)
        if (currentMeals) {
            addMealItem(row[colIndices.breakfast], currentMeals.breakfast);
            addMealItem(row[colIndices.lunch], currentMeals.lunch);
            addMealItem(row[colIndices.snacks], currentMeals.snacks);
            addMealItem(row[colIndices.dinner], currentMeals.dinner);
        }
    }

    // Don't forget the last day
    if (currentDay && currentMeals) {
        menuArray.push({
            ...currentDay,
            meals: { ...currentMeals }
        });
    }
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

function addMealItem(cell, mealArray) {
    if (!cell) return;

    const value = cell.toString().trim();
    if (!value) return;

    // Don't add duplicates
    if (!mealArray.includes(value)) {
        mealArray.push(value);
    }
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
