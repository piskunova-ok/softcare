import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { handler } from '../netlify/functions/catalog.js';

const originalUrl = process.env.CATALOG_CSV_URL;
const originalFetch = globalThis.fetch;

describe('Netlify Function: catalog', () => {
  before(() => {
    delete process.env.CATALOG_CSV_URL;
  });

  after(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.CATALOG_CSV_URL;
    else process.env.CATALOG_CSV_URL = originalUrl;
  });

  test('без CATALOG_CSV_URL отдаёт демонстрационный каталог', async () => {
    const response = await handler({ httpMethod: 'GET' });
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(body.ok, true);
    assert.equal(body.source, 'demo');
    assert.equal(body.items.length, 6);
    assert.equal(body.items.find((i) => i.id === 'sofa2').price, 2500);
    assert.ok(response.headers['Cache-Control'].includes('no-store'));
  });

  test('разбирает CSV из Google Таблицы', async () => {
    process.env.CATALOG_CSV_URL = 'https://example.com/published.csv';

    const csv = [
      'ID,Тип,Название,Цена,Изображение,Активен',
      'sofa2,furniture,Двухместный диван,2600,/images/a.webp,да',
      'stains,service,Удаление сложных пятен,500,,да',
      'old,furniture,Старая позиция,1000,,нет',
    ].join('\n');

    globalThis.fetch = async () => new Response(csv, { status: 200 });

    const response = await handler({ httpMethod: 'GET' });
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(body.source, 'google-sheets');
    assert.equal(body.items.length, 2, 'отключённые позиции отфильтрованы');
    assert.equal(body.items[0].price, 2600);
    assert.ok(response.headers['Cache-Control'].includes('s-maxage=300'));
  });

  test('возвращает 502 при недоступном CSV', async () => {
    process.env.CATALOG_CSV_URL = 'https://example.com/published.csv';
    globalThis.fetch = async () => new Response('not found', { status: 404 });

    const response = await handler({ httpMethod: 'GET' });
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 502);
    assert.equal(body.ok, false);
    assert.ok(response.headers['Cache-Control'].includes('no-store'));
  });

  test('возвращает 502 при пустом или некорректном CSV', async () => {
    process.env.CATALOG_CSV_URL = 'https://example.com/published.csv';
    globalThis.fetch = async () => new Response('foo,bar\n1,2', { status: 200 });

    const response = await handler({ httpMethod: 'GET' });
    assert.equal(response.statusCode, 502);
  });

  test('отклоняет не-https адрес таблицы', async () => {
    process.env.CATALOG_CSV_URL = 'http://insecure.example.com/catalog.csv';

    const response = await handler({ httpMethod: 'GET' });
    assert.equal(response.statusCode, 500);
  });

  test('отклоняет POST-запросы', async () => {
    const response = await handler({ httpMethod: 'POST' });
    assert.equal(response.statusCode, 405);
  });
});
