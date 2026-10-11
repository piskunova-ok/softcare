/**
 * Разбор и проверка каталога из CSV (Google Таблица).
 * Единственное место, где «сырые» данные превращаются в объекты каталога.
 * Никакой HTML из данных не формируется — только обычные строки.
 */

import { csvToRecords } from './csv.js';

const HEADER_ALIASES = {
  id: ['id', 'идентификатор'],
  type: ['тип', 'type'],
  name: ['название', 'name', 'наименование'],
  price: ['цена', 'price', 'стоимость'],
  image: ['изображение', 'image', 'фото', 'картинка', 'url'],
  active: ['активен', 'active', 'доступен', 'включен'],
};

const TYPE_MAP = {
  furniture: 'furniture',
  'мебель': 'furniture',
  service: 'service',
  'услуга': 'service',
  'услуги': 'service',
  'доп. услуга': 'service',
  'дополнительная услуга': 'service',
};

const ACTIVE_TRUE = ['да', 'yes', 'true', '1', 'y', '+', 'вкл'];
const ACTIVE_FALSE = ['нет', 'no', 'false', '0', 'n', '-', 'выкл'];

const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_NAME_LENGTH = 100;

/** Нормализует заголовок колонки для поиска aliases */
function normalizeHeader(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Сопоставляет заголовки таблицы с ожидаемыми полями */
function mapHeaders(headers) {
  const map = {};
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(normalized) && map[field] === undefined) {
        map[field] = index;
      }
    }
  });
  return map;
}

/** Цена: «2 500», «2500», «2500,5» → число */
export function parsePrice(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;

  const cleaned = raw
    .replace(/\u00A0/g, '')
    .replace(/\s/g, '')
    .replace(/₽|руб\.?/gi, '')
    .replace(',', '.')
    .trim();

  if (cleaned === '' || !/^\d+(\.\d+)?$/.test(cleaned)) return null;

  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Активна ли позиция.
 * Правила: «да»/«нет» — явное значение; пустая ячейка и любое
 * нераспознанное значение означают, что позиция НЕ активна.
 * @param {unknown} raw
 * @returns {{active: boolean, known: boolean, reason: 'ok'|'empty'|'unknown'}}
 */
export function parseActive(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === '') return { active: false, known: false, reason: 'empty' };
  if (ACTIVE_TRUE.includes(value)) return { active: true, known: true, reason: 'ok' };
  if (ACTIVE_FALSE.includes(value)) return { active: false, known: true, reason: 'ok' };
  return { active: false, known: false, reason: 'unknown' };
}

/**
 * Проверяет ссылку на изображение: только https:// или локальный путь /...
 * Любые подозрительные схемы (javascript:, data:) отбрасываются.
 * @returns {{ok: boolean, src: string|null}}
 */
export function sanitizeImageSrc(raw) {
  const value = String(raw ?? '').trim();
  if (value === '') return { ok: true, src: null };

  if (value.startsWith('/')) {
    return { ok: true, src: value.split('#')[0].split('?')[0] };
  }

  if (/^https:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return { ok: true, src: url.toString() };
    } catch {
      return { ok: false, src: null };
    }
  }

  return { ok: false, src: null };
}

/**
 * Разбирает CSV каталога.
 * @param {string} text
 * @returns {{items: Array, errors: string[]}}
 */
export function parseCatalogCsv(text) {
  const errors = [];
  const items = [];

  const { headers, records } = csvToRecords(text);

  if (headers.length === 0) {
    return { items, errors: ['Файл пуст'] };
  }

  const columns = mapHeaders(headers);
  const missing = ['id', 'type', 'name', 'price'].filter((field) => columns[field] === undefined);

  if (missing.length > 0) {
    return { items, errors: [`Не найдены обязательные колонки: ${missing.join(', ')}`] };
  }

  const seenIds = new Set();

  for (const record of records) {
    const cell = (field) => {
      const index = columns[field];
      return index === undefined ? '' : (record.cells[index] ?? '');
    };

    const id = String(cell('id')).trim();
    if (id === '') {
      errors.push(`Строка ${record.index}: пустой ID`);
      continue;
    }
    if (!ID_PATTERN.test(id)) {
      errors.push(`Строка ${record.index}: недопустимый ID «${id}»`);
      continue;
    }
    if (seenIds.has(id)) {
      errors.push(`Строка ${record.index}: дубликат ID «${id}»`);
      continue;
    }

    const typeKey = normalizeHeader(String(cell('type')));
    const type = TYPE_MAP[typeKey];
    if (!type) {
      errors.push(`Строка ${record.index}: неизвестный тип «${cell('type')}»`);
      continue;
    }

    const name = String(cell('name')).trim().slice(0, MAX_NAME_LENGTH);
    if (name === '') {
      errors.push(`Строка ${record.index}: пустое название`);
      continue;
    }

    const price = parsePrice(cell('price'));
    if (price === null) {
      errors.push(`Строка ${record.index}: некорректная цена «${cell('price')}»`);
      continue;
    }

    const imageCheck = sanitizeImageSrc(cell('image'));
    if (!imageCheck.ok) {
      errors.push(`Строка ${record.index}: небезопасная ссылка на изображение`);
    }

    const activeInfo = parseActive(cell('active'));
    if (activeInfo.reason === 'empty') {
      errors.push(`Строка ${record.index}: пустой столбец «Активен» — позиция отключена`);
    } else if (activeInfo.reason === 'unknown') {
      errors.push(
        `Строка ${record.index}: значение «Активен» «${cell('active')}» не распознано — позиция отключена`,
      );
    }

    seenIds.add(id);
    items.push({
      id,
      type,
      name,
      price,
      image: imageCheck.ok ? imageCheck.src : null,
      active: activeInfo.active,
    });
  }

  if (items.length === 0) {
    errors.push('Каталог не содержит ни одной корректной позиции');
  }

  return { items, errors };
}

/** Только активные позиции */
export function activeItems(items) {
  return items.filter((item) => item && item.active !== false);
}
