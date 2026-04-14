import fs from 'fs';

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

export function parseCsv(text) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map(cell => cell.trim());

  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] ?? '';
      return row;
    }, {});
  });
}

function stringifyCell(value) {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function stringifyCsv(rows, headers) {
  const lines = [headers.map(stringifyCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map(header => stringifyCell(row[header] ?? '')).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function readCsvFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return parseCsv(fs.readFileSync(filePath, 'utf8'));
}

export function writeCsvFile(filePath, rows, headers) {
  fs.writeFileSync(filePath, stringifyCsv(rows, headers), 'utf8');
}

export function parseBoolean(value, defaultValue = false) {
  if (value == null || value === '') return defaultValue;
  return ['true', '1', 'yes', 'y', 'on'].includes(String(value).trim().toLowerCase());
}

export function parseNumber(value, defaultValue = 0) {
  if (value == null || value === '') return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function parseJsonCell(value, defaultValue) {
  if (value == null || String(value).trim() === '') return defaultValue;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON cell: ${value}`);
  }
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}
