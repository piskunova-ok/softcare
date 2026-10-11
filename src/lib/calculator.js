/**
 * Чистая логика расчёта стоимости. Не зависит от DOM — тестируется отдельно.
 *
 * Формула:
 *   база   = Σ (цена изделия × количество)
 *   услуги = Σ (цена услуги × общее количество изделий)
 *   итого  = база + услуги
 */

export const QTY_MIN = 0;
export const QTY_MAX = 20;

/**
 * Приводит количество к допустимому целому значению.
 * Отрицательные, NaN и дробные значения обнуляются/ограничиваются.
 * @param {unknown} value
 * @returns {number}
 */
export function clampQuantity(value, min = QTY_MIN, max = QTY_MAX) {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(parsed)) return min;
  const rounded = Math.trunc(parsed);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

/**
 * @typedef {Object} CatalogItem
 * @property {string} id
 * @property {'furniture'|'service'} type
 * @property {string} name
 * @property {number} price
 * @property {boolean} [active]
 */

/**
 * @typedef {Object} Selection
 * @property {Object<string, number>} quantities - количество по id изделия
 * @property {string[]} services - id выбранных услуг
 */

/**
 * Считает стоимость заказа по каталогу и выбору пользователя.
 * Позиции, отсутствующие в каталоге, и значения с количеством 0 игнорируются.
 *
 * @param {CatalogItem[]} items - активные позиции каталога
 * @param {Selection} selection
 * @returns {{
 *   furniture: Array<{id:string,name:string,price:number,quantity:number,subtotal:number}>,
 *   services: Array<{id:string,name:string,price:number,quantity:number,subtotal:number}>,
 *   itemsCount: number,
 *   baseTotal: number,
 *   servicesTotal: number,
 *   total: number
 * }}
 */
export function calculate(items, selection) {
  const catalog = Array.isArray(items) ? items : [];
  const quantities = (selection && selection.quantities) || {};
  const selectedServices = Array.isArray(selection && selection.services) ? selection.services : [];

  const furniture = [];
  let itemsCount = 0;
  let baseTotal = 0;

  for (const item of catalog) {
    if (!item || item.type !== 'furniture' || item.active === false) continue;

    const quantity = clampQuantity(quantities[item.id]);
    if (quantity <= 0) continue;

    const subtotal = item.price * quantity;
    itemsCount += quantity;
    baseTotal += subtotal;
    furniture.push({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity,
      subtotal,
    });
  }

  const services = [];
  let servicesTotal = 0;

  if (itemsCount > 0) {
    for (const item of catalog) {
      if (!item || item.type !== 'service' || item.active === false) continue;
      if (!selectedServices.includes(item.id)) continue;

      const subtotal = item.price * itemsCount;
      servicesTotal += subtotal;
      services.push({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: itemsCount,
        subtotal,
      });
    }
  }

  return {
    furniture,
    services,
    itemsCount,
    baseTotal,
    servicesTotal,
    total: baseTotal + servicesTotal,
  };
}

/**
 * Оставляет в выборе только те позиции, которые есть в каталоге,
 * и приводит количество к допустимому диапазону.
 * @param {CatalogItem[]} items
 * @param {Selection} selection
 * @returns {Selection}
 */
export function normalizeSelection(items, selection) {
  const catalog = Array.isArray(items) ? items : [];
  const furnitureIds = new Set(catalog.filter((i) => i.type === 'furniture' && i.active !== false).map((i) => i.id));
  const serviceIds = new Set(catalog.filter((i) => i.type === 'service' && i.active !== false).map((i) => i.id));

  const source = selection || {};
  const quantities = {};
  for (const [id, value] of Object.entries(source.quantities || {})) {
    if (!furnitureIds.has(id)) continue;
    const quantity = clampQuantity(value);
    if (quantity > 0) quantities[id] = quantity;
  }

  const services = Array.isArray(source.services)
    ? source.services.filter((id) => serviceIds.has(id))
    : [];

  return { quantities, services };
}

/**
 * Форматирует сумму в рублях.
 * @param {number} value
 * @returns {string}
 */
export function formatMoney(value) {
  const amount = Number.isFinite(value) ? Math.round(value) : 0;
  return `${new Intl.NumberFormat('ru-RU').format(amount)} ₽`;
}
