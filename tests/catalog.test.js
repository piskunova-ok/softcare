import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseCsv, csvToRecords } from '../src/lib/csv.js';
import {
  parseCatalogCsv,
  parsePrice,
  parseActive,
  sanitizeImageSrc,
  activeItems,
} from '../src/lib/catalog.js';
import { DEMO_CATALOG_CSV } from '../src/data/demo-catalog.js';

describe('parseCsv', () => {
  test('разбирает простой CSV', () => {
    const rows = parseCsv('a,b\n1,2');
    assert.deepEqual(rows, [['a', 'b'], ['1', '2']]);
  });

  test('поддерживает кавычки и запятые внутри значения', () => {
    const rows = parseCsv('"Диван, угловой",100\n"с ""кавычками""",5');
    assert.deepEqual(rows[0], ['Диван, угловой', '100']);
    assert.deepEqual(rows[1], ['с "кавычками"', '5']);
  });

  test('нормализует CRLF и BOM', () => {
    const rows = parseCsv('\uFEFFid,name\r\nsofa,Диван\r\n');
    assert.deepEqual(rows, [['id', 'name'], ['sofa', 'Диван']]);
  });

  test('пропускает пустые строки', () => {
    const rows = parseCsv('id\nsofa\n\n\n');
    assert.equal(rows.length, 2);
  });

  test('возвращает пустой массив для нестрок', () => {
    assert.deepEqual(parseCsv(null), []);
  });
});

describe('csvToRecords', () => {
  test('нумерует строки с учётом заголовка', () => {
    const { headers, records } = csvToRecords('id,name\nsofa,Диван');
    assert.deepEqual(headers, ['id', 'name']);
    assert.equal(records[0].index, 2);
  });
});

describe('parsePrice', () => {
  test('принимает разные форматы цены', () => {
    assert.equal(parsePrice('2500'), 2500);
    assert.equal(parsePrice('2 500'), 2500);
    assert.equal(parsePrice('2500,5'), 2500.5);
    assert.equal(parsePrice(1800), 1800);
    assert.equal(parsePrice('1 800 ₽'), 1800);
  });

  test('отклоняет некорректные значения', () => {
    assert.equal(parsePrice('abc'), null);
    assert.equal(parsePrice('-100'), null);
    assert.equal(parsePrice(''), null);
    assert.equal(parsePrice(undefined), null);
  });
});

describe('parseActive', () => {
  test('распознаёт значения', () => {
    assert.equal(parseActive('да').active, true);
    assert.equal(parseActive('нет').active, false);
    assert.equal(parseActive('false').active, false);
    assert.equal(parseActive('1').active, true);
    assert.equal(parseActive('да').known, true);
  });

  test('учитывает пробелы и регистр', () => {
    assert.equal(parseActive('  ДА ').active, true);
    assert.equal(parseActive(' Нет').active, false);
    assert.equal(parseActive('YES').active, true);
  });

  test('пустое значение отключает позицию', () => {
    const result = parseActive('');
    assert.equal(result.active, false);
    assert.equal(result.known, false);
    assert.equal(result.reason, 'empty');
    assert.equal(parseActive('   ').active, false);
    assert.equal(parseActive(null).active, false);
    assert.equal(parseActive(undefined).active, false);
  });

  test('неизвестное значение отключает позицию', () => {
    const result = parseActive('может быть');
    assert.equal(result.active, false);
    assert.equal(result.known, false);
    assert.equal(result.reason, 'unknown');
    assert.equal(parseActive('1 да 0').active, false);
  });
});

describe('sanitizeImageSrc', () => {
  test('принимает https и локальные пути', () => {
    assert.equal(sanitizeImageSrc('https://example.com/photo.jpg').src, 'https://example.com/photo.jpg');
    assert.equal(sanitizeImageSrc('/images/item.webp').src, '/images/item.webp');
  });

  test('отклоняет опасные схемы', () => {
    assert.equal(sanitizeImageSrc('javascript:alert(1)').src, null);
    assert.equal(sanitizeImageSrc('data:text/html,<script>').src, null);
    assert.equal(sanitizeImageSrc('http://insecure.com/a.jpg').src, null);
  });

  test('пустая ссылка допустима', () => {
    assert.deepEqual(sanitizeImageSrc(''), { ok: true, src: null });
  });
});

describe('parseCatalogCsv', () => {
  test('разбирает демонстрационный каталог', () => {
    const { items, errors } = parseCatalogCsv(DEMO_CATALOG_CSV);

    assert.equal(errors.length, 0);
    assert.equal(items.length, 6);
    assert.equal(items.filter((i) => i.type === 'furniture').length, 4);
    assert.equal(items.filter((i) => i.type === 'service').length, 2);
    assert.equal(items.find((i) => i.id === 'sofa2').price, 2500);
    assert.equal(items.find((i) => i.id === 'corner').price, 4200);
    assert.equal(items.find((i) => i.id === 'stains').image, null);
  });

  test('находит ошибки в строках', () => {
    const csv = [
      'ID,Тип,Название,Цена,Изображение,Активен',
      'a,furniture,Диван,2500,,да',
      'a,furniture,Дубль,2500,,да',
      'b,unknown,Кресло,1200,,да',
      'c,furniture,,1200,,да',
      'd,furniture,Стол,дорого,,да',
      'e,furniture,Кровать,900,javascript:alert(1),да',
    ].join('\n');

    const { items, errors } = parseCatalogCsv(csv);

    assert.equal(items.length, 2);
    assert.ok(errors.some((e) => e.includes('дубликат')));
    assert.ok(errors.some((e) => e.includes('неизвестный тип')));
    assert.ok(errors.some((e) => e.includes('пустое название')));
    assert.ok(errors.some((e) => e.includes('некорректная цена')));
    assert.ok(errors.some((e) => e.includes('небезопасная ссылка')));
    assert.equal(items.find((i) => i.id === 'e').image, null);
  });

  test('возвращает ошибку при отсутствии обязательных колонок', () => {
    const { items, errors } = parseCatalogCsv('foo,bar\n1,2');
    assert.equal(items.length, 0);
    assert.ok(errors[0].includes('колонки'));
  });

  test('обрабатывает пустой файл', () => {
    const { items, errors } = parseCatalogCsv('');
    assert.equal(items.length, 0);
    assert.ok(errors.length > 0);
  });

  test('отключённые позиции сохраняются, но фильтруются activeItems', () => {
    const csv = [
      'ID,Тип,Название,Цена,Изображение,Активен',
      'a,furniture,Диван,2500,,да',
      'b,furniture,Кресло,1200,,нет',
    ].join('\n');

    const { items } = parseCatalogCsv(csv);
    assert.equal(items.length, 2);
    assert.equal(activeItems(items).length, 1);
    assert.equal(activeItems(items)[0].id, 'a');
  });

  test('позиции генерируются динамически — новый id появляется в каталоге', () => {
    const csv = [
      'ID,Тип,Название,Цена,Изображение,Активен',
      'new-item,furniture,Пуф,900,,да',
    ].join('\n');

    const { items } = parseCatalogCsv(csv);
    assert.equal(items[0].id, 'new-item');
    assert.equal(items[0].name, 'Пуф');
  });

  test('пустой столбец «Активен» отключает позицию, остальной каталог жив', () => {
    const csv = [
      'ID,Тип,Название,Цена,Изображение,Активен',
      'a,furniture,Диван,2500,,да',
      'b,furniture,Стул,900,,',
      'c,service,Запах,300,,  ',
    ].join('\n');

    const { items, errors } = parseCatalogCsv(csv);
    assert.equal(items.length, 3);
    assert.equal(items.find((i) => i.id === 'a').active, true);
    assert.equal(items.find((i) => i.id === 'b').active, false);
    assert.equal(items.find((i) => i.id === 'c').active, false);
    assert.equal(activeItems(items).length, 1);
    assert.ok(errors.filter((e) => e.includes('пустой столбец «Активен»')).length === 2);
  });

  test('неизвестное значение «Активен» не валит каталог', () => {
    const csv = [
      'ID,Тип,Название,Цена,Изображение,Активен',
      'a,furniture,Диван,2500,,да',
      'b,furniture,Кресло,1200,,пожалуй',
    ].join('\n');

    const { items, errors } = parseCatalogCsv(csv);
    assert.equal(items.length, 2);
    assert.equal(items.find((i) => i.id === 'b').active, false);
    assert.ok(errors.some((e) => e.includes('не распознано — позиция отключена')));
  });
});
