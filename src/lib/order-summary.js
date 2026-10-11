/**
 * Тексты расчёта для блока заказа и полей формы заявки.
 * Чистые функции без DOM — используются в интерфейсе и тестируются отдельно.
 * Цены берутся только из фактического результата расчёта (каталог),
 * никаких зашитых значений здесь нет.
 */

import { formatMoney } from './calculator.js';

/** Склонение: 1 изделие, 2 изделия, 5 изделий. */
function pluralRu(n, [one, few, many]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Строка позиции в виде «1 шт.», «3 изделия». */
function quantityLabel(quantity, isService) {
  if (!isService) return `${quantity} шт.`;
  return `${quantity} ${pluralRu(quantity, ['изделие', 'изделия', 'изделий'])}`;
}

/**
 * Строки расчёта для панели расчёта и блока «Ваш заказ».
 * @param {{furniture: Array, services: Array}} result
 * @returns {Array<{id: string, title: string, meta: string, sum: number, service: boolean}>}
 */
export function buildOrderLines(result) {
  const lines = [];

  for (const line of result.furniture) {
    lines.push({
      id: line.id,
      title: line.name,
      meta: `${formatMoney(line.price)} × ${line.quantity}`,
      sum: line.subtotal,
      service: false,
    });
  }

  for (const line of result.services) {
    lines.push({
      id: line.id,
      title: line.name,
      meta: `${formatMoney(line.price)} × ${line.quantity} ${pluralRu(line.quantity, ['изделие', 'изделия', 'изделий'])}`,
      sum: line.subtotal,
      service: true,
    });
  }

  return lines;
}

/**
 * Читаемая детализация заказа — скрытое поле `calculation` формы.
 * Содержит состав, количество, цены и предварительную стоимость.
 * @param {{furniture: Array, services: Array, total: number}} result
 * @param {boolean} hasSelection
 * @returns {string}
 */
export function buildCalculationText(result, hasSelection) {
  if (!hasSelection) return '';

  const rows = [];
  for (const line of result.furniture) {
    rows.push(`- ${line.name} — ${quantityLabel(line.quantity, false)} × ${formatMoney(line.price)} = ${formatMoney(line.subtotal)}`);
  }
  for (const line of result.services) {
    rows.push(`- ${line.name} — ${quantityLabel(line.quantity, true)} × ${formatMoney(line.price)} = ${formatMoney(line.subtotal)}`);
  }

  return [
    'Заказ:',
    ...rows,
    '',
    `Предварительная стоимость: ${formatMoney(result.total)}`,
  ].join('\n');
}

/**
 * Машиночитаемые поля расчёта для формы Netlify Forms.
 * @param {{furniture: Array, services: Array, total: number}} result
 * @param {boolean} hasSelection
 * @returns {{items: string, services: string, total: string, calculation: string}}
 */
export function buildOrderFields(result, hasSelection) {
  if (!hasSelection) {
    return { items: '', services: '', total: '0', calculation: '' };
  }

  const items = result.furniture
    .map((line) => `${line.name}: ${quantityLabel(line.quantity, false)} × ${formatMoney(line.price)} = ${formatMoney(line.subtotal)}`)
    .join('\n');

  const services = result.services
    .map((line) => `${line.name}: ${quantityLabel(line.quantity, true)} × ${formatMoney(line.price)} = ${formatMoney(line.subtotal)}`)
    .join('\n');

  return {
    items,
    services,
    total: String(result.total),
    calculation: buildCalculationText(result, hasSelection),
  };
}
