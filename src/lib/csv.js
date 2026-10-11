/**
 * Минимальный CSV-парсер (RFC 4180): разделитель — запятая,
 * поля в кавычках, поддержка переносов строк и кавычек внутри значения.
 * Без зависимостей — работает и в браузере, и в Netlify Function.
 */

/**
 * @param {string} text
 * @returns {string[][]} массив строк, каждая строка — массив ячеек
 */
export function parseCsv(text) {
  if (typeof text !== 'string') return [];

  // Убираем BOM, если он есть
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else if (char === '\r') {
      // игнорируем — парсим по \n
    } else {
      value += char;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/**
 * Превращает массив строк в объекты с заголовками колонок.
 * @param {string} text
 * @returns {{headers: string[], rows: Array<{index: number, cells: string[]}>}}
 */
export function csvToRecords(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((cells, i) => ({
    index: i + 2, // номер строки в таблице (с учётом заголовка)
    cells,
  }));

  return { headers, records };
}
