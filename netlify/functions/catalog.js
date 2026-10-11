/**
 * Netlify Function: чтение каталога из Google Таблицы.
 *
 * Архитектура:
 *   Google Sheets (лист опубликован как CSV)
 *     → fetch по переменной окружения CATALOG_CSV_URL
 *       → валидация и разбор CSV
 *         → JSON для браузера
 *
 * Никаких ключей и OAuth не требуется: CSV публикуется открыто.
 * В браузер попадают только проверенные данные каталога.
 */

import { parseCatalogCsv } from '../../src/lib/catalog.js';
import { DEMO_CATALOG_CSV } from '../../src/data/demo-catalog.js';

const FETCH_TIMEOUT_MS = 8000;

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
};

const CACHEABLE = {
  ...JSON_HEADERS,
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
  'netlify-cdn-cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
};

const NO_STORE = {
  ...JSON_HEADERS,
  'Cache-Control': 'no-store',
};

function respond(statusCode, body, headers) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

function demoItems() {
  const { items } = parseCatalogCsv(DEMO_CATALOG_CSV);
  return items;
}

export async function handler(event) {
  const method = event.httpMethod || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    return respond(405, { ok: false, error: 'Метод не поддерживается' }, NO_STORE);
  }

  const csvUrl = process.env.CATALOG_CSV_URL;

  // Каталог из таблицы ещё не подключён — отдаём демонстрационные данные
  if (!csvUrl) {
    return respond(
      200,
      {
        ok: true,
        source: 'demo',
        updatedAt: new Date().toISOString(),
        items: demoItems(),
        note: 'Переменная окружения CATALOG_CSV_URL не задана',
      },
      NO_STORE,
    );
  }

  if (!/^https:\/\//i.test(csvUrl)) {
    return respond(
      500,
      { ok: false, error: 'CATALOG_CSV_URL должен быть https-адресом' },
      NO_STORE,
    );
  }

  try {
    const response = await fetch(csvUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'text/csv,*/*' },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`CSV недоступен: HTTP ${response.status}`);
    }

    const csvText = await response.text();
    const { items, errors } = parseCatalogCsv(csvText);

    if (items.length === 0) {
      throw new Error('CSV не содержит корректных позиций');
    }

    return respond(
      200,
      {
        ok: true,
        source: 'google-sheets',
        updatedAt: new Date().toISOString(),
        items: items.filter((item) => item.active !== false),
        warnings: errors.slice(0, 20),
      },
      CACHEABLE,
    );
  } catch (error) {
    // Не кешируем ошибки: клиент сам решает, каким резервом воспользоваться
    return respond(
      502,
      { ok: false, error: error && error.message ? error.message : 'Не удалось получить каталог' },
      NO_STORE,
    );
  }
}
