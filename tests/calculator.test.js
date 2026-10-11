import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculate,
  clampQuantity,
  normalizeSelection,
  formatMoney,
  QTY_MAX,
} from '../src/lib/calculator.js';

const CATALOG = [
  { id: 'sofa2', type: 'furniture', name: 'Двухместный диван', price: 2500, active: true },
  { id: 'corner', type: 'furniture', name: 'Угловой диван', price: 4200, active: true },
  { id: 'chair', type: 'furniture', name: 'Кресло', price: 1200, active: true },
  { id: 'mattress', type: 'furniture', name: 'Матрас', price: 1800, active: true },
  { id: 'stains', type: 'service', name: 'Удаление сложных пятен', price: 500, active: true },
  { id: 'odor', type: 'service', name: 'Устранение запахов', price: 300, active: true },
];

describe('clampQuantity', () => {
  test('нормализует дробные и нечисловые значения', () => {
    assert.equal(clampQuantity(3.7), 3);
    assert.equal(clampQuantity('7'), 7);
    assert.equal(clampQuantity('abc'), 0);
    assert.equal(clampQuantity(undefined), 0);
    assert.equal(clampQuantity(NaN), 0);
  });

  test('защищает от отрицательных значений', () => {
    assert.equal(clampQuantity(-5), 0);
    assert.equal(clampQuantity('-100'), 0);
  });

  test('ограничивает сверху', () => {
    assert.equal(clampQuantity(999), QTY_MAX);
    assert.equal(clampQuantity(QTY_MAX), QTY_MAX);
  });
});

describe('calculate', () => {
  test('пустой заказ обрабатывается корректно', () => {
    const result = calculate(CATALOG, { quantities: {}, services: [] });
    assert.equal(result.total, 0);
    assert.equal(result.itemsCount, 0);
    assert.equal(result.furniture.length, 0);
    assert.equal(result.services.length, 0);
  });

  test('считает базовую стоимость', () => {
    const result = calculate(CATALOG, {
      quantities: { sofa2: 1, chair: 2 },
      services: [],
    });

    assert.equal(result.baseTotal, 2500 + 1200 * 2);
    assert.equal(result.itemsCount, 3);
    assert.equal(result.total, 4900);
    assert.equal(result.furniture.length, 2);
  });

  test('услуги умножаются на общее количество изделий', () => {
    const result = calculate(CATALOG, {
      quantities: { sofa2: 2, mattress: 1 },
      services: ['stains', 'odor'],
    });

    assert.equal(result.itemsCount, 3);
    assert.equal(result.servicesTotal, (500 + 300) * 3);
    assert.equal(result.total, 2500 * 2 + 1800 + 2400);
    assert.equal(result.services.length, 2);
  });

  test('не выбранные услуги не добавляют стоимость', () => {
    const result = calculate(CATALOG, { quantities: { chair: 1 }, services: [] });
    assert.equal(result.servicesTotal, 0);
    assert.equal(result.total, 1200);
  });

  test('позиции с количеством 0 не попадают в расчёт', () => {
    const result = calculate(CATALOG, {
      quantities: { sofa2: 0, chair: 1 },
      services: ['stains'],
    });

    assert.equal(result.furniture.length, 1);
    assert.equal(result.itemsCount, 1);
    assert.equal(result.total, 1200 + 500);
  });

  test('игнорирует id, которых нет в каталоге', () => {
    const result = calculate(CATALOG, {
      quantities: { unknown: 5, chair: 1 },
      services: ['unknown-service'],
    });

    assert.equal(result.furniture.length, 1);
    assert.equal(result.services.length, 0);
    assert.equal(result.total, 1200);
  });

  test('отрицательное количество не уменьшает сумму', () => {
    const result = calculate(CATALOG, { quantities: { sofa2: -3 }, services: [] });
    assert.equal(result.total, 0);
  });

  test('учитывает отключённые позиции каталога', () => {
    const catalog = CATALOG.map((item) =>
      item.id === 'chair' ? { ...item, active: false } : item,
    );

    const result = calculate(catalog, { quantities: { chair: 3, sofa2: 1 }, services: ['stains'] });
    assert.equal(result.furniture.length, 1);
    assert.equal(result.total, 2500 + 500);
  });

  test('услуги не применяются, если не выбрано ни одного изделия', () => {
    const result = calculate(CATALOG, { quantities: {}, services: ['stains'] });
    assert.equal(result.servicesTotal, 0);
  });
});

describe('normalizeSelection', () => {
  test('удаляет позиции, которых больше нет в каталоге', () => {
    const selection = normalizeSelection(CATALOG, {
      quantities: { sofa2: 2, removed: 4 },
      services: ['stains', 'removed-service'],
    });

    assert.deepEqual(selection.quantities, { sofa2: 2 });
    assert.deepEqual(selection.services, ['stains']);
  });

  test('приводит количество к допустимому диапазону', () => {
    const selection = normalizeSelection(CATALOG, {
      quantities: { sofa2: -2, chair: 99 },
      services: [],
    });

    assert.equal(selection.quantities.sofa2, undefined);
    assert.equal(selection.quantities.chair, QTY_MAX);
  });

  test('отключает услуги при отключённой позиции', () => {
    const catalog = CATALOG.map((item) =>
      item.id === 'stains' ? { ...item, active: false } : item,
    );

    const selection = normalizeSelection(catalog, {
      quantities: { sofa2: 1 },
      services: ['stains'],
    });

    assert.deepEqual(selection.services, []);
  });
});

describe('formatMoney', () => {
  test('форматирует рубли', () => {
    const plain = (value) => formatMoney(value).replace(/\u00A0/g, ' ');
    assert.equal(plain(2500), '2 500 ₽');
    assert.equal(plain(0), '0 ₽');
    assert.equal(plain(NaN), '0 ₽');
  });
});
