import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculate, formatMoney } from '../src/lib/calculator.js';
import {
  buildOrderLines,
  buildCalculationText,
  buildOrderFields,
} from '../src/lib/order-summary.js';

const CATALOG = [
  { id: 'sofa2', type: 'furniture', name: 'Двухместный диван', price: 2500, active: true },
  { id: 'chair', type: 'furniture', name: 'Кресло', price: 1200, active: true },
  { id: 'stains', type: 'service', name: 'Удаление сложных пятен', price: 500, active: true },
  { id: 'odor', type: 'service', name: 'Устранение запахов', price: 300, active: true },
];

const selection = { quantities: { sofa2: 1, chair: 2 }, serviceQuantities: { stains: 2 } };
const result = calculate(CATALOG, selection);
// база = 2500*1 + 1200*2 = 4900; услуги = 500 * 2 = 1000; итого = 5900
const HAS = result.furniture.length > 0;

describe('buildOrderLines', () => {
  test('строки соответствуют результату расчёта', () => {
    const lines = buildOrderLines(result);
    assert.equal(lines.length, 3);

    const sofa = lines.find((l) => l.id === 'sofa2');
    assert.equal(sofa.title, 'Двухместный диван');
    assert.equal(sofa.service, false);
    assert.equal(sofa.sum, 2500 * 1);
    assert.match(sofa.meta, new RegExp(formatMoney(2500)));

    const stains = lines.find((l) => l.id === 'stains');
    assert.equal(stains.service, true);
    assert.equal(stains.sum, 500 * 2);
    assert.match(stains.meta, /2 изделия/);
  });

  test('услуги с разным количеством дают разные суммы', () => {
    const multi = calculate(CATALOG, {
      quantities: { sofa2: 1, chair: 1 },
      serviceQuantities: { stains: 2, odor: 1 },
    });
    const lines = buildOrderLines(multi);

    const stains = lines.find((l) => l.id === 'stains');
    const odor = lines.find((l) => l.id === 'odor');
    assert.equal(stains.sum, 1000);
    assert.equal(odor.sum, 300);
    assert.equal(multi.total, 3700 + 1300);
  });

  test('цены берутся из каталога, а не из захардкоженных значений', () => {
    const custom = calculate([{ id: 'x', type: 'furniture', name: 'Кресло', price: 777, active: true }], { quantities: { x: 1 }, serviceQuantities: {} });
    const lines = buildOrderLines(custom);
    assert.equal(lines[0].sum, 777);
    assert.ok(lines[0].meta.includes(formatMoney(777)));
  });
});

describe('buildCalculationText', () => {
  test('содержит состав, количество, цены и предварительную стоимость', () => {
    const text = buildCalculationText(result, HAS);

    assert.match(text, /^Заказ:/);
    assert.ok(text.includes('- Двухместный диван — 1 шт.'));
    assert.ok(text.includes('- Кресло — 2 шт.'));
    assert.ok(text.includes('- Удаление сложных пятен — 2 изделия'));
    assert.ok(text.includes(`Предварительная стоимость: ${formatMoney(result.total)}`));
    assert.equal(result.total, 5900);
  });

  test('пустой выбор — пустой текст', () => {
    assert.equal(buildCalculationText(result, false), '');
    const empty = calculate(CATALOG, { quantities: {}, serviceQuantities: {} });
    assert.equal(buildCalculationText(empty, false), '');
  });

  test('корректно склоняет единицы', () => {
    const one = calculate(CATALOG, { quantities: { chair: 1 }, serviceQuantities: { stains: 1 } });
    const text = buildCalculationText(one, true);
    assert.ok(text.includes('1 изделие'));
    assert.ok(text.includes('1 шт.'));

    const four = calculate(CATALOG, { quantities: { chair: 4 }, serviceQuantities: { stains: 4 } });
    assert.ok(buildCalculationText(four, true).includes('4 изделия'));

    const five = calculate(CATALOG, { quantities: { chair: 5 }, serviceQuantities: { stains: 5 } });
    assert.ok(buildCalculationText(five, true).includes('5 изделий'));
  });
});

describe('buildOrderFields', () => {
  test('передаёт все данные расчёта', () => {
    const fields = buildOrderFields(result, HAS);

    assert.ok(fields.items.includes('Двухместный диван: 1 шт.'));
    assert.ok(fields.items.includes('Кресло: 2 шт.'));
    assert.ok(fields.services.includes('Удаление сложных пятен: 2 изделия'));
    assert.equal(fields.total, String(result.total));
    assert.ok(fields.calculation.includes('Предварительная стоимость'));
  });

  test('услуги без мебели не попадают в поля', () => {
    const noFurniture = calculate(CATALOG, { quantities: {}, serviceQuantities: { stains: 2 } });
    const fields = buildOrderFields(noFurniture, noFurniture.furniture.length > 0);

    assert.equal(fields.items, '');
    assert.equal(fields.services, '');
    assert.equal(fields.total, '0');
    assert.equal(fields.calculation, '');
  });

  test('нет HTML-разметки в передаваемых значениях', () => {
    const withTag = calculate([{ id: 'x', type: 'furniture', name: '<b>Диван</b>', price: 100, active: true }], { quantities: { x: 1 }, serviceQuantities: {} });
    const fields = buildOrderFields(withTag, true);
    assert.ok(!fields.calculation.includes('<script'));
    assert.ok(fields.calculation.includes('<b>Диван</b>'));
  });
});
