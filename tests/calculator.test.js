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
    const result = calculate(CATALOG, { quantities: {}, serviceQuantities: {} });
    assert.equal(result.total, 0);
    assert.equal(result.itemsCount, 0);
    assert.equal(result.furniture.length, 0);
    assert.equal(result.services.length, 0);
  });

  test('считает базовую стоимость', () => {
    const result = calculate(CATALOG, {
      quantities: { sofa2: 1, chair: 2 },
      serviceQuantities: {},
    });

    assert.equal(result.baseTotal, 2500 + 1200 * 2);
    assert.equal(result.itemsCount, 3);
    assert.equal(result.total, 4900);
    assert.equal(result.furniture.length, 2);
  });

  test('услуга с количеством 0 не входит в расчёт', () => {
    const result = calculate(CATALOG, {
      quantities: { sofa2: 2 },
      serviceQuantities: { stains: 0 },
    });

    assert.equal(result.services.length, 0);
    assert.equal(result.servicesTotal, 0);
    assert.equal(result.total, 5000);
  });

  test('одна услуга для одного изделия', () => {
    const result = calculate(CATALOG, {
      quantities: { chair: 1 },
      serviceQuantities: { stains: 1 },
    });

    assert.equal(result.itemsCount, 1);
    assert.equal(result.services.length, 1);
    assert.equal(result.services[0].quantity, 1);
    assert.equal(result.services[0].subtotal, 500);
    assert.equal(result.servicesTotal, 500);
    assert.equal(result.total, 1200 + 500);
  });

  test('несколько единиц одной услуги', () => {
    const result = calculate(CATALOG, {
      quantities: { sofa2: 1, chair: 1 },
      serviceQuantities: { stains: 2 },
    });

    assert.equal(result.itemsCount, 2);
    assert.equal(result.services[0].quantity, 2);
    assert.equal(result.servicesTotal, 500 * 2);
    assert.equal(result.total, 2500 + 1200 + 1000);
  });

  test('разные услуги считаются независимо', () => {
    const result = calculate(CATALOG, {
      quantities: { sofa2: 1, chair: 1, mattress: 2 },
      serviceQuantities: { stains: 3, odor: 1 },
    });

    assert.equal(result.itemsCount, 4);
    assert.equal(result.services.length, 2);
    assert.equal(result.servicesTotal, 500 * 3 + 300 * 1);
    assert.equal(result.total, 2500 + 1200 + 1800 * 2 + 1800);
  });

  test('количество услуги не может превысить количество мебели', () => {
    const result = calculate(CATALOG, {
      quantities: { chair: 2 },
      serviceQuantities: { stains: 5 },
    });

    assert.equal(result.itemsCount, 2);
    assert.equal(result.services[0].quantity, 2);
    assert.equal(result.servicesTotal, 1000);
    assert.equal(result.total, 2400 + 1000);
  });

  test('услуги не применяются, если не выбрано ни одного изделия', () => {
    const result = calculate(CATALOG, {
      quantities: {},
      serviceQuantities: { stains: 2 },
    });

    assert.equal(result.services.length, 0);
    assert.equal(result.servicesTotal, 0);
  });

  test('позиции с количеством 0 не попадают в расчёт', () => {
    const result = calculate(CATALOG, {
      quantities: { sofa2: 0, chair: 1 },
      serviceQuantities: { stains: 1 },
    });

    assert.equal(result.furniture.length, 1);
    assert.equal(result.itemsCount, 1);
    assert.equal(result.total, 1200 + 500);
  });

  test('игнорирует id, которых нет в каталоге', () => {
    const result = calculate(CATALOG, {
      quantities: { unknown: 5, chair: 1 },
      serviceQuantities: { 'unknown-service': 3 },
    });

    assert.equal(result.furniture.length, 1);
    assert.equal(result.services.length, 0);
    assert.equal(result.total, 1200);
  });

  test('отрицательное количество не уменьшает сумму', () => {
    const result = calculate(CATALOG, { quantities: { sofa2: -3 }, serviceQuantities: {} });
    assert.equal(result.total, 0);
  });

  test('учитывает отключённые позиции каталога', () => {
    const catalog = CATALOG.map((item) =>
      item.id === 'chair' ? { ...item, active: false } : item,
    );

    const result = calculate(catalog, {
      quantities: { chair: 3, sofa2: 1 },
      serviceQuantities: { stains: 1 },
    });
    assert.equal(result.furniture.length, 1);
    assert.equal(result.total, 2500 + 500);
  });

  test('отключённая услуга не участвует в расчёте', () => {
    const catalog = CATALOG.map((item) =>
      item.id === 'stains' ? { ...item, active: false } : item,
    );

    const result = calculate(catalog, {
      quantities: { sofa2: 2 },
      serviceQuantities: { stains: 2 },
    });
    assert.equal(result.services.length, 0);
    assert.equal(result.servicesTotal, 0);
    assert.equal(result.total, 5000);
  });

  test('итог складывается из мебели и услуг', () => {
    const result = calculate(CATALOG, {
      quantities: { sofa2: 1, chair: 1 },
      serviceQuantities: { stains: 2, odor: 1 },
    });

    assert.equal(result.baseTotal, 3700);
    assert.equal(result.servicesTotal, 1300);
    assert.equal(result.total, 5000);
  });
});

describe('normalizeSelection', () => {
  test('удаляет позиции, которых больше нет в каталоге', () => {
    const selection = normalizeSelection(CATALOG, {
      quantities: { sofa2: 2, removed: 4 },
      serviceQuantities: { stains: 1, 'removed-service': 2 },
    });

    assert.deepEqual(selection.quantities, { sofa2: 2 });
    assert.deepEqual(selection.serviceQuantities, { stains: 1 });
  });

  test('приводит количество мебели к допустимому диапазону', () => {
    const selection = normalizeSelection(CATALOG, {
      quantities: { sofa2: -2, chair: 99 },
      serviceQuantities: {},
    });

    assert.equal(selection.quantities.sofa2, undefined);
    assert.equal(selection.quantities.chair, QTY_MAX);
  });

  test('удаляет нулевые и отрицательные количества услуг', () => {
    const selection = normalizeSelection(CATALOG, {
      quantities: { sofa2: 2 },
      serviceQuantities: { stains: 0, odor: -1 },
    });

    assert.deepEqual(selection.serviceQuantities, {});
  });

  test('обрезает количество услуги до количества мебели', () => {
    const selection = normalizeSelection(CATALOG, {
      quantities: { sofa2: 1, chair: 1 },
      serviceQuantities: { stains: 4 },
    });

    assert.equal(selection.serviceQuantities.stains, 2);
  });

  test('сбрасывает услуги при отсутствии мебели', () => {
    const selection = normalizeSelection(CATALOG, {
      quantities: {},
      serviceQuantities: { stains: 3, odor: 1 },
    });

    assert.deepEqual(selection.serviceQuantities, {});
  });

  test('отключает услуги при отключённой позиции', () => {
    const catalog = CATALOG.map((item) =>
      item.id === 'stains' ? { ...item, active: false } : item,
    );

    const selection = normalizeSelection(catalog, {
      quantities: { sofa2: 1 },
      serviceQuantities: { stains: 1 },
    });

    assert.deepEqual(selection.serviceQuantities, {});
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
