/**
 * Загрузка каталога: сервер (Netlify Function → Google Таблица)
 *   → сохранённый в браузере каталог → демонстрационные данные.
 *
 * В браузере нет ключей и секретов: функция читает CSV по переменной
 * окружения на стороне Netlify.
 */

import { parseCatalogCsv } from './lib/catalog.js';
import { DEMO_CATALOG_CSV } from './data/demo-catalog.js';

const STORAGE_KEY = 'softcare:catalog:v1';
const DEFAULT_ENDPOINT = '/api/catalog';
const FETCH_TIMEOUT_MS = 9000;

/** Принимает только ожидаемую структуру позиции — лишнее отбрасывается. */
function sanitizeItems(list) {
  if (!Array.isArray(list)) return [];
  const items = [];
  const seen = new Set();

  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const type = raw.type === 'furniture' || raw.type === 'service' ? raw.type : null;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const price = Number(raw.price);

    if (!id || !type || !name || !Number.isFinite(price) || price < 0 || seen.has(id)) continue;

    seen.add(id);
    items.push({
      id,
      type,
      name: name.slice(0, 100),
      price,
      image: typeof raw.image === 'string' && raw.image.trim() !== '' ? raw.image.trim() : null,
      active: raw.active !== false,
    });
  }

  return items;
}

/**
 * Загружает каталог у Netlify Function.
 * @returns {Promise<{items: Array, updatedAt: string|null, source: string, state: 'fresh'}>}
 */
export async function fetchCatalog(endpoint = DEFAULT_ENDPOINT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.ok !== true) {
      throw new Error((data && data.error) || 'Некорректный ответ сервера');
    }

    const items = sanitizeItems(data.items);
    if (items.length === 0) {
      throw new Error('Каталог пуст');
    }

    return {
      items,
      updatedAt: data.updatedAt || null,
      source: data.source || 'remote',
      state: data.source === 'demo' ? 'demo' : 'fresh',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Сохраняет последний корректный каталог в localStorage. */
export function saveCatalog(catalog) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        items: sanitizeItems(catalog.items),
        updatedAt: catalog.updatedAt || null,
        savedAt: Date.now(),
      }),
    );
  } catch {
    /* приватный режим или переполненное хранилище — не критично */
  }
}

/** Читает сохранённый каталог (или null). */
export function loadCachedCatalog() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const items = sanitizeItems(parsed && parsed.items);
    if (items.length === 0) return null;

    return {
      items,
      updatedAt: (parsed && parsed.updatedAt) || null,
      savedAt: (parsed && parsed.savedAt) || null,
      source: 'cache',
      state: 'stale',
    };
  } catch {
    return null;
  }
}

/** Демонстрационный каталог из встроенного CSV. */
export function getDemoCatalog() {
  const { items } = parseCatalogCsv(DEMO_CATALOG_CSV);
  return {
    items,
    updatedAt: null,
    source: 'demo',
    state: 'demo',
  };
}
