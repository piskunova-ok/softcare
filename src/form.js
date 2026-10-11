/**
 * Форма заявки: проверка полей, honeypot, расчёт в скрытых полях
 * и отправка через Netlify Forms (AJAX, URL-encoded).
 *
 * Успешным считается только подтверждённый ответ сервера:
 * 2xx без HTML-тела или серверный редирект после приёма заявки.
 * Локально (без публикации) сервис форм не отвечает — показывается ошибка.
 */

const NAME_PATTERN = /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё' -]{1,49}$/;
const MAX_COMMENT_LENGTH = 500;
const SUBMIT_ENDPOINT = '/';
const SUCCESS_MESSAGE = 'Спасибо! Ваша заявка отправлена. Мы свяжемся с вами для уточнения деталей';
const NETWORK_ERROR_MESSAGE = 'Не удалось отправить заявку. Проверьте соединение и попробуйте ещё раз.';
const NOT_CONNECTED_MESSAGE = 'Не удалось отправить заявку: сервис приёма заявок пока не подключён. Мы не получили ваши данные — попробуйте позже.';
const EMPTY_ORDER_MESSAGE = 'Сначала выберите мебель в калькуляторе — заявка отправляется вместе с расчётом.';
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

/**
 * Разбирает ответ сервера на отправку формы.
 * Успех — только при подтверждении от сервера, HTML-страница успехом не считается.
 * @param {Response} response
 * @returns {Promise<{ok: boolean, kind: 'ok'|'not-connected'|'failed', status: number}>}
 */
export async function interpretSubmitResponse(response) {
  const status = response.status;
  const redirected = response.type === 'opaqueredirect';

  if (redirected) return { ok: true, kind: 'ok', status };
  if (!response.ok) return { ok: false, kind: 'failed', status };

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    return { ok: false, kind: 'not-connected', status };
  }

  return { ok: true, kind: 'ok', status };
}

export function initOrderForm() {
  const form = document.getElementById('order-form');

  if (!form) {
    return { setOrder() {} };
  }

  const fields = [
    { input: form.querySelector('#name'), error: form.querySelector('#name-error'), validate: validateName },
    { input: form.querySelector('#phone'), error: form.querySelector('#phone-error'), validate: validatePhone },
    { input: form.querySelector('#comment'), error: form.querySelector('#comment-error'), validate: validateComment },
    { input: form.querySelector('#consent'), error: form.querySelector('#consent-error'), validate: (v) => (v ? null : 'Нужно согласие на обработку данных') },
  ];

  const calculationField = form.querySelector('#calculation-field');
  const itemsField = form.querySelector('#order-items-field');
  const servicesField = form.querySelector('#order-services-field');
  const totalField = form.querySelector('#order-total-field');
  const submitBtn = form.querySelector('#submit-btn');
  const successEl = form.querySelector('#form-success');
  const errorEl = form.querySelector('#form-error');
  const honeypot = form.querySelector('[name="bot-field"]');

  let submitting = false;
  let sent = false;
  const submitLabel = submitBtn ? submitBtn.textContent.trim() : 'Отправить заявку';

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
    if (successEl) successEl.textContent = SUCCESS_MESSAGE;
    if (successEl) successEl.hidden = false;
  }

  function setSending(sending) {
    form.setAttribute('aria-busy', sending ? 'true' : 'false');
    if (!submitBtn) return;
    submitBtn.disabled = sending;
    submitBtn.textContent = sending ? 'Отправляем…' : submitLabel;
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

  for (const field of fields) {
    if (!field.input) continue;

    field.input.addEventListener('blur', () => validateField(field));
    field.input.addEventListener('input', () => {
      if (field.input.getAttribute('aria-invalid') === 'true') validateField(field);
    });
    field.input.addEventListener('change', () => {
      if (field.input.getAttribute('aria-invalid') === 'true') validateField(field);
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting || sent) return;

    hideStatus();

    // Honeypot: заполненное скрытое поле — признак бота, отправки нет
    if (honeypot && honeypot.value.trim() !== '') return;

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

    submitting = true;
    setSending(true);

    try {
      const body = new URLSearchParams(new FormData(form)).toString();
      const response = await fetch(SUBMIT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        redirect: 'manual',
      });

      const result = await interpretSubmitResponse(response);

      if (result.ok) {
        sent = true;
        showSuccess();
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Заявка отправлена';
        }
      } else if (result.kind === 'not-connected') {
        showError(NOT_CONNECTED_MESSAGE);
      } else {
        showError(NETWORK_ERROR_MESSAGE);
      }
    } catch {
      showError(NETWORK_ERROR_MESSAGE);
    } finally {
      submitting = false;
      form.setAttribute('aria-busy', 'false');
      if (submitBtn && !sent) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
      }
    }
  });

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
