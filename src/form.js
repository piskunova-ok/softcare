/**
 * Демонстрационный блок заявки: проверка полей и расчёт в скрытых полях.
 *
 * Режим демонстрации: разметка не является <form>, сетевые запросы не выполняются.
 * Введённые данные не отправляются в Netlify Forms, на почту и в другие внешние
 * сервисы, а также не сохраняются. Кнопка формирует демо-заявку только локально,
 * посетитель видит сообщение о сформированной демо-заявке.
 */

const NAME_PATTERN = /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё' -]{1,49}$/;
const MAX_COMMENT_LENGTH = 500;

/** Сообщение после демонстрационной отправки — текст из требований проекта. */
export const DEMO_SUCCESS_MESSAGE =
  'Демо-заявка сформирована. В учебном режиме данные никуда не отправляются';

const DEMO_DONE_LABEL = 'Демо-заявка сформирована';
const EMPTY_ORDER_MESSAGE = 'Сначала выберите мебель в калькуляторе — демо-заявка формируется вместе с расчётом.';
const INVALID_FIELDS_MESSAGE = 'Проверьте выделенные поля — часть данных заполнена неверно.';

/** Имя: 2–50 символов, буквы, пробелы, дефис, апостроф. */
export function validateName(value) {
  const name = String(value ?? '').trim();
  if (name === '') return 'Укажите имя';
  if (name.length < 2) return 'Имя слишком короткое';
  if (!NAME_PATTERN.test(name)) return 'Используйте буквы, пробелы, дефис или апостроф';
  return null;
}

/** Телефон: 10–15 цифр, допускаются +, скобки, пробелы и дефисы. */
export function validatePhone(value) {
  const phone = String(value ?? '').trim();
  if (phone === '') return 'Укажите телефон';

  if (!/^\+?[\d\s\-()]+$/.test(phone)) {
    return 'Допустимы только цифры, пробелы, скобки и знак «+»';
  }

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return 'В телефоне должно быть не менее 10 цифр';
  if (digits.length > 15) return 'Слишком длинный номер';

  return null;
}

/** Комментарий: необязателен, но не длиннее 500 символов. */
export function validateComment(value) {
  const comment = String(value ?? '');
  if (comment.length > MAX_COMMENT_LENGTH) return `Максимум ${MAX_COMMENT_LENGTH} символов`;
  return null;
}

export function initOrderForm() {
  const root = document.getElementById('order-form');

  if (!root) {
    return { setOrder() {} };
  }

  const fields = [
    { input: root.querySelector('#name'), error: root.querySelector('#name-error'), validate: validateName },
    { input: root.querySelector('#phone'), error: root.querySelector('#phone-error'), validate: validatePhone },
    { input: root.querySelector('#comment'), error: root.querySelector('#comment-error'), validate: validateComment },
    { input: root.querySelector('#consent'), error: root.querySelector('#consent-error'), validate: (v) => (v ? null : 'Нужно согласие на обработку данных') },
  ];

  const calculationField = root.querySelector('#calculation-field');
  const itemsField = root.querySelector('#order-items-field');
  const servicesField = root.querySelector('#order-services-field');
  const totalField = root.querySelector('#order-total-field');
  const submitBtn = root.querySelector('#submit-btn');
  const successEl = root.querySelector('#form-success');
  const errorEl = root.querySelector('#form-error');

  let sent = false;

  function hideStatus() {
    if (successEl) successEl.hidden = true;
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
  }

  function showError(message) {
    if (successEl) successEl.hidden = true;
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }
  }

  function showSuccess() {
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
    if (successEl) {
      successEl.textContent = DEMO_SUCCESS_MESSAGE;
      successEl.hidden = false;
    }
  }

  function showErrorFor(field, message) {
    if (!field.input || !field.error) return;
    if (message) {
      field.error.textContent = message;
      field.input.setAttribute('aria-invalid', 'true');
    } else {
      field.error.textContent = '';
      field.input.removeAttribute('aria-invalid');
    }
  }

  function validateField(field) {
    const value = field.input.type === 'checkbox' ? field.input.checked : field.input.value;
    const message = field.validate(value);
    showErrorFor(field, message);
    return !message;
  }

  /** Гасит сводную ошибку, когда все поля снова корректны. */
  function clearErrorWhenValid() {
    if (!errorEl || errorEl.hidden) return;
    const allValid = fields.every((field) => !field.input || field.input.getAttribute('aria-invalid') !== 'true');
    if (allValid) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
  }

  function refreshField(field) {
    validateField(field);
    clearErrorWhenValid();
  }

  for (const field of fields) {
    if (!field.input) continue;

    field.input.addEventListener('blur', () => refreshField(field));
    field.input.addEventListener('input', () => {
      if (field.input.getAttribute('aria-invalid') === 'true') refreshField(field);
    });
    field.input.addEventListener('change', () => {
      if (field.input.getAttribute('aria-invalid') === 'true') refreshField(field);
    });
  }

  function buildDemoRequest() {
    if (sent) return;

    hideStatus();

    const results = fields.map(validateField);
    if (results.includes(false)) {
      showError(INVALID_FIELDS_MESSAGE);
      const firstInvalid = fields.find((field) => field.input.getAttribute('aria-invalid') === 'true');
      if (firstInvalid) firstInvalid.input.focus();
      return;
    }

    if (!calculationField || calculationField.value.trim() === '') {
      showError(EMPTY_ORDER_MESSAGE);
      return;
    }

    // Демо-режим: страница не перезагружается, запрос на сервер не выполняется
    sent = true;
    showSuccess();
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = DEMO_DONE_LABEL;
    }
  }

  root.addEventListener('submit', (event) => event.preventDefault());

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.target.tagName !== 'INPUT') return;
    event.preventDefault();
    buildDemoRequest();
  });

  if (submitBtn) {
    submitBtn.addEventListener('click', () => buildDemoRequest());
  }

  return {
    /** Передаёт данные расчёта в скрытые поля формы. */
    setOrder(order) {
      const data = order || {};
      if (calculationField) calculationField.value = data.calculation || '';
      if (itemsField) itemsField.value = data.items || '';
      if (servicesField) servicesField.value = data.services || '';
      if (totalField) totalField.value = data.total || '0';
    },
  };
}
