/**
 * SOFTCARE — точка входа: каталог, калькулятор, интерфейс.
 * Здесь только отображение, выбор и расчёты. Данные приходят из каталога.
 */

import './styles/main.css';

import {
  calculate,
  clampQuantity,
  normalizeSelection,
  formatMoney,
  QTY_MIN,
  QTY_MAX,
} from './lib/calculator.js';
import {
  fetchCatalog,
  loadCachedCatalog,
  saveCatalog,
  getDemoCatalog,
} from './catalog-loader.js';
import { initOrderForm } from './form.js';
import {
  buildOrderLines,
  buildCalculationText,
  buildOrderFields,
} from './lib/order-summary.js';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const state = {
  items: [],
  selection: { quantities: {}, services: [] },
  source: null,
  lastFreshAt: 0,
};

const dom = {};
const formApi = initOrderForm();

const timeFormatter = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

/* ---------------------------------------------------------
   Утилиты
--------------------------------------------------------- */

function $(selector) {
  return document.querySelector(selector);
}

function furnitureItems() {
  return state.items.filter((item) => item.type === 'furniture' && item.active !== false);
}

function serviceItems() {
  return state.items.filter((item) => item.type === 'service' && item.active !== false);
}

/* ---------------------------------------------------------
   Статус каталога
--------------------------------------------------------- */

function setStatus(kind, text, { retry = false } = {}) {
  const container = dom.catalogStatus;
  container.dataset.state = kind;
  container.innerHTML = '';

  const dot = document.createElement('span');
  dot.className = 'status__dot';
  dot.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = 'status__text';
  label.textContent = text;

  container.append(dot, label);

  if (retry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'status__retry';
    button.textContent = 'Обновить';
    button.addEventListener('click', refreshCatalog);
    container.append(button);
  }
}

function statusFor(catalog) {
  if (catalog.state === 'fresh') {
    const time = catalog.updatedAt ? timeFormatter.format(new Date(catalog.updatedAt)) : timeFormatter.format(new Date());
    setStatus('fresh', `Каталог обновлён в ${time} — цены из таблицы`);
    return;
  }

  if (catalog.state === 'stale') {
    setStatus('stale', 'Свежие цены получить не удалось — показаны сохранённые данные', { retry: true });
    return;
  }

  if (catalog.state === 'demo') {
    setStatus('demo', 'Демонстрационный каталог — Google Таблица недоступна или не подключена', { retry: true });
    return;
  }

  setStatus('error', 'Не удалось загрузить каталог', { retry: true });
}

/* ---------------------------------------------------------
   Карточки мебели
--------------------------------------------------------- */

function buildPlaceholder(item) {
  const placeholder = document.createElement('div');
  placeholder.className = 'item-card__placeholder';
  placeholder.textContent = `Изображение: ${item.name}`;
  return placeholder;
}

function createCard(item) {
  const card = document.createElement('article');
  card.className = 'item-card';
  card.dataset.id = item.id;

  const media = document.createElement('div');
  media.className = 'item-card__media';

  if (item.image) {
    const img = document.createElement('img');
    img.className = 'item-card__img';
    img.src = item.image;
    img.alt = item.name;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 720;
    img.height = 540;
    img.addEventListener('error', () => {
      media.replaceChildren(buildPlaceholder(item));
    });
    media.append(img);
  } else {
    media.append(buildPlaceholder(item));
  }

  const badge = document.createElement('span');
  badge.className = 'item-card__qty-badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = '0';
  media.append(badge);

  const body = document.createElement('div');
  body.className = 'item-card__body';

  const name = document.createElement('h4');
  name.className = 'item-card__name';
  name.textContent = item.name;

  const price = document.createElement('p');
  price.className = 'item-card__price';
  const priceValue = document.createElement('strong');
  priceValue.textContent = formatMoney(item.price);
  price.append(priceValue, document.createTextNode(' / изделие'));

  const stepper = document.createElement('div');
  stepper.className = 'stepper';

  const dec = document.createElement('button');
  dec.type = 'button';
  dec.className = 'stepper__btn';
  dec.dataset.action = 'dec';
  dec.dataset.id = item.id;
  dec.textContent = '−';
  dec.setAttribute('aria-label', `Уменьшить количество: ${item.name}`);

  const input = document.createElement('input');
  input.className = 'stepper__input';
  input.type = 'number';
  input.min = String(QTY_MIN);
  input.max = String(QTY_MAX);
  input.step = '1';
  input.value = '0';
  input.inputMode = 'numeric';
  input.dataset.id = item.id;
  input.setAttribute('aria-label', `Количество: ${item.name}`);

  const inc = document.createElement('button');
  inc.type = 'button';
  inc.className = 'stepper__btn';
  inc.dataset.action = 'inc';
  inc.dataset.id = item.id;
  inc.textContent = '+';
  inc.setAttribute('aria-label', `Увеличить количество: ${item.name}`);

  stepper.append(dec, input, inc);
  body.append(name, price, stepper);
  card.append(media, body);

  return card;
}

function renderFurniture() {
  const items = furnitureItems();
  dom.furnitureGrid.replaceChildren(...items.map(createCard));
  dom.furnitureGrid.setAttribute('aria-busy', 'false');
  dom.furnitureGrid.hidden = items.length === 0;
  dom.furnitureEmpty.hidden = items.length !== 0;

  for (const item of items) {
    syncCard(item.id);
  }
}

function syncCard(id) {
  const card = dom.furnitureGrid.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!card) return;

  const quantity = clampQuantity(state.selection.quantities[id]);
  const input = card.querySelector('.stepper__input');
  const badge = card.querySelector('.item-card__qty-badge');
  const dec = card.querySelector('[data-action="dec"]');
  const inc = card.querySelector('[data-action="inc"]');

  if (input && document.activeElement !== input) input.value = String(quantity);
  if (badge) badge.textContent = String(quantity);
  if (dec) dec.disabled = quantity <= QTY_MIN;
  if (inc) inc.disabled = quantity >= QTY_MAX;
  card.classList.toggle('is-selected', quantity > 0);
}

/* ---------------------------------------------------------
   Дополнительные услуги
--------------------------------------------------------- */

function createService(item) {
  const label = document.createElement('label');
  label.className = 'service';
  label.dataset.id = item.id;

  const control = document.createElement('span');
  control.className = 'service__control';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'service__checkbox';
  checkbox.name = 'services';
  checkbox.value = item.id;
  checkbox.checked = state.selection.services.includes(item.id);

  control.append(checkbox);

  const text = document.createElement('span');
  text.className = 'service__text';

  const name = document.createElement('span');
  name.className = 'service__name';
  name.textContent = item.name;

  const price = document.createElement('span');
  price.className = 'service__price';
  price.textContent = `${formatMoney(item.price)} за изделие`;

  text.append(name, price);

  const amount = document.createElement('span');
  amount.className = 'service__amount';
  amount.dataset.role = 'amount';

  label.append(control, text, amount);

  checkbox.addEventListener('change', () => {
    toggleService(item.id, checkbox.checked);
  });

  return label;
}

function renderServices() {
  const items = serviceItems();
  dom.servicesGroup.hidden = items.length === 0;
  dom.servicesList.replaceChildren(...items.map(createService));
  syncServices();
}

function syncServices() {
  const result = calculate(state.items, state.selection);
  const amountById = new Map(result.services.map((line) => [line.id, line.subtotal]));
  const hasFurniture = result.itemsCount > 0;

  // Услуги доступны только при выбранной мебели
  if (dom.servicesHint) dom.servicesHint.hidden = hasFurniture;

  for (const label of dom.servicesList.querySelectorAll('.service')) {
    const id = label.dataset.id;
    const checkbox = label.querySelector('.service__checkbox');
    const amount = label.querySelector('[data-role="amount"]');
    const checked = hasFurniture && state.selection.services.includes(id);

    checkbox.disabled = !hasFurniture;
    checkbox.checked = checked;
    label.classList.toggle('is-locked', !hasFurniture);
    label.classList.toggle('is-checked', checked);
    amount.textContent = checked ? formatMoney(amountById.get(id) || 0) : '';
  }
}

/* ---------------------------------------------------------
   Выбор количества
--------------------------------------------------------- */

function setQuantity(id, value) {
  const quantity = clampQuantity(value);

  if (quantity > QTY_MIN) {
    state.selection.quantities[id] = quantity;
  } else {
    delete state.selection.quantities[id];
  }

  syncCard(id);
  syncServices();
  renderSummary();
}

function toggleService(id, checked) {
  const services = new Set(state.selection.services);
  if (checked) services.add(id);
  else services.delete(id);
  state.selection.services = Array.from(services);

  syncServices();
  renderSummary();
}

function bindCalculatorEvents() {
  dom.furnitureGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const { id, action } = button.dataset;
    const current = clampQuantity(state.selection.quantities[id]);

    if (action === 'inc') setQuantity(id, current + 1);
    if (action === 'dec') setQuantity(id, current - 1);
  });

  dom.furnitureGrid.addEventListener('input', (event) => {
    const input = event.target.closest('.stepper__input');
    if (!input) return;

    const id = input.dataset.id;
    const raw = input.value;

    if (raw === '') {
      setQuantity(id, QTY_MIN);
      return;
    }

    setQuantity(id, raw);
  });

  // Возврат фокуса-значения после нормализации
  dom.furnitureGrid.addEventListener('change', (event) => {
    const input = event.target.closest('.stepper__input');
    if (!input) return;
    syncCard(input.dataset.id);
  });
}

/**
 * Кнопка «Заказать химчистку» ведёт к форме только при выбранной мебели.
 * Блокирует и мышь, и переход по Enter с клавиатуры — рядом показана подсказка.
 */
function bindOrderCta() {
  if (!dom.summaryCta) return;

  dom.summaryCta.addEventListener('click', (event) => {
    if (dom.summaryCta.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

/* ---------------------------------------------------------
   Панель расчёта и блок заказа
--------------------------------------------------------- */

function renderSummary() {
  const result = calculate(state.items, state.selection);
  const hasSelection = result.furniture.length > 0;

  // Без мебели дополнительные услуги сбрасываются и не участвуют в расчёте
  if (!hasSelection && state.selection.services.length > 0) {
    state.selection.services = [];
    syncServices();
  }

  // Панель расчёта
  dom.summaryEmpty.hidden = hasSelection;
  dom.summaryLines.replaceChildren();

  if (hasSelection) {
    const lines = buildOrderLines(result);

    for (const line of lines) {
      const li = document.createElement('li');
      li.className = `summary__line${line.service ? ' summary__line--service' : ''}`;

      const name = document.createElement('span');
      name.className = 'summary__line-name';
      name.textContent = line.title;

      const meta = document.createElement('small');
      meta.textContent = line.meta;
      name.append(meta);

      const sum = document.createElement('span');
      sum.className = 'summary__line-sum';
      sum.textContent = formatMoney(line.sum);

      li.append(name, sum);
      dom.summaryLines.append(li);
    }
  }

  dom.summaryTotals.hidden = !hasSelection;
  dom.rowServices.hidden = result.servicesTotal <= 0;

  dom.sumBase.textContent = formatMoney(result.baseTotal);
  dom.sumServices.textContent = formatMoney(result.servicesTotal);
  dom.sumTotal.classList.add('is-updating');
  window.requestAnimationFrame(() => {
    dom.sumTotal.textContent = formatMoney(result.total);
    dom.sumTotal.classList.remove('is-updating');
  });

  dom.summaryCta.setAttribute('aria-disabled', hasSelection ? 'false' : 'true');
  if (dom.ctaHint) dom.ctaHint.hidden = hasSelection;

  // Блок заказа в форме
  const previewLines = hasSelection ? buildOrderLines(result) : [];
  renderOrderPreview(previewLines, result, hasSelection);

  // Поля формы с расчётом
  formApi.setOrder(buildOrderFields(result, hasSelection));
}

function renderOrderPreview(previewLines, result, hasSelection) {
  dom.orderLines.replaceChildren();

  if (!hasSelection) {
    const li = document.createElement('li');
    li.className = 'order__line order__line--empty';
    li.textContent = 'Заказ пока не сформирован — выберите мебель в калькуляторе.';
    dom.orderLines.append(li);
    dom.orderTotal.hidden = true;
    return;
  }

  for (const line of previewLines) {
    const li = document.createElement('li');
    li.className = `order__line${line.service ? ' order__line--service' : ''}`;

    const title = document.createElement('span');
    title.textContent = line.service ? `${line.title} (${line.meta})` : `${line.title} — ${line.meta}`;

    const sum = document.createElement('span');
    sum.textContent = formatMoney(line.sum);

    li.append(title, sum);
    dom.orderLines.append(li);
  }

  dom.orderTotal.hidden = false;
  dom.orderTotalValue.textContent = formatMoney(result.total);
}

/* ---------------------------------------------------------
   Загрузка и автообновление каталога
--------------------------------------------------------- */

function applyCatalog(catalog) {
  state.items = Array.isArray(catalog.items) ? catalog.items : [];
  state.source = catalog.source;
  state.selection = normalizeSelection(state.items, state.selection);

  renderFurniture();
  renderServices();
  renderSummary();
  statusFor(catalog);

  if (catalog.state === 'fresh') {
    state.lastFreshAt = Date.now();
    saveCatalog(catalog);
  }
}

async function loadInitialCatalog() {
  try {
    applyCatalog(await fetchCatalog());
    return;
  } catch {
    /* переходим к резервным источникам */
  }

  const cached = loadCachedCatalog();
  if (cached) {
    applyCatalog(cached);
    return;
  }

  applyCatalog(getDemoCatalog());
}

async function refreshCatalog() {
  setStatus(state.source ? 'stale' : 'error', 'Обновляем каталог…');

  try {
    applyCatalog(await fetchCatalog());
  } catch {
    const kind = state.source === 'demo' ? 'demo' : state.source ? 'stale' : 'error';
    const text = state.source === 'demo'
      ? 'Не удалось получить каталог из Google Таблицы — показаны демонстрационные данные'
      : state.source
        ? 'Не удалось обновить каталог — показаны сохранённые цены'
        : 'Не удалось загрузить каталог';
    setStatus(kind, text, { retry: true });
  }
}

function scheduleRefresh() {
  window.setInterval(() => {
    if (document.hidden) return;
    refreshCatalog();
  }, REFRESH_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (Date.now() - state.lastFreshAt < REFRESH_INTERVAL_MS) return;
    refreshCatalog();
  });
}

/* ---------------------------------------------------------
   Навигация (мобильное меню)
--------------------------------------------------------- */

function initNavigation() {
  const burger = dom.burger;
  const menu = dom.mobileMenu;
  if (!burger || !menu) return;

  const close = () => {
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Открыть меню');
    menu.classList.remove('is-open');
    menu.hidden = true;
  };

  burger.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') === 'true';
    if (open) {
      close();
    } else {
      burger.setAttribute('aria-expanded', 'true');
      burger.setAttribute('aria-label', 'Закрыть меню');
      menu.classList.add('is-open');
      menu.hidden = false;
    }
  });

  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) close();
  });
}

/* ---------------------------------------------------------
   Инициализация
--------------------------------------------------------- */

function collectDom() {
  dom.catalogStatus = $('#catalog-status');
  dom.furnitureGrid = $('#furniture-grid');
  dom.furnitureEmpty = $('#furniture-empty');
  dom.servicesGroup = $('#services-group');
  dom.servicesList = $('#services-list');
  dom.summaryEmpty = $('#summary-empty');
  dom.summaryLines = $('#summary-lines');
  dom.summaryTotals = $('#summary-totals');
  dom.rowServices = $('#row-services');
  dom.sumBase = $('#sum-base');
  dom.sumServices = $('#sum-services');
    dom.sumTotal = $('#sum-total');
    dom.summaryCta = $('#summary-cta');
    dom.ctaHint = $('#cta-hint');
    dom.servicesHint = $('#services-hint');
  dom.orderLines = $('#order-lines');
  dom.orderTotal = $('#order-total');
  dom.orderTotalValue = $('#order-total-value');
  dom.burger = $('.burger');
  dom.mobileMenu = $('#mobile-menu');
  dom.year = $('#year');
}

function init() {
  collectDom();
  bindCalculatorEvents();
  bindOrderCta();
  initNavigation();
  scheduleRefresh();

  if (dom.year) dom.year.textContent = String(new Date().getFullYear());

  loadInitialCatalog();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
