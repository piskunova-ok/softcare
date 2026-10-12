import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateName, validatePhone, validateComment, interpretSubmitResponse } from '../src/form.js';

describe('validateName', () => {
  test('принимает корректные имена', () => {
    assert.equal(validateName('Анна'), null);
    assert.equal(validateName('Анна-Мария'), null);
    assert.equal(validateName("O'Brien"), null);
    assert.equal(validateName('  Иван  '), null);
  });

  test('отклоняет пустое и слишком короткое имя', () => {
    assert.ok(validateName(''));
    assert.ok(validateName('   '));
    assert.ok(validateName('И'));
  });

  test('отклоняет цифры и спецсимволы', () => {
    assert.ok(validateName('Иван123'));
    assert.ok(validateName('<script>'));
  });
});

describe('validatePhone', () => {
  test('принимает российские и международные номера', () => {
    assert.equal(validatePhone('+7 (999) 123-45-67'), null);
    assert.equal(validatePhone('89991234567'), null);
    assert.equal(validatePhone('+380 44 123 4567'), null);
  });

  test('отклоняет пустой и короткий номер', () => {
    assert.ok(validatePhone(''));
    assert.ok(validatePhone('12345'));
    assert.ok(validatePhone('+7 (999) 12-34'));
  });

  test('отклоняет буквенные значения', () => {
    assert.ok(validatePhone('позвоните мне'));
  });
});

describe('validateComment', () => {
  test('пустой комментарий допустим', () => {
    assert.equal(validateComment(''), null);
    assert.equal(validateComment('   '), null);
  });

  test('принимает обычный текст', () => {
    assert.equal(validateComment('Диван с пятном от кофе'), null);
  });

  test('не ограничивает длину ниже лимита формы', () => {
    assert.equal(validateComment('а'.repeat(500)), null);
  });
});

describe('interpretSubmitResponse', () => {
  // Заглушка ответа: у Response в Node нельзя задать url/redirected
  function makeResponse({
    ok = true,
    status = 200,
    url = '',
    redirected = false,
    body = '',
    contentType = 'text/html; charset=utf-8',
  } = {}) {
    return {
      ok,
      status,
      redirected,
      url,
      headers: new Headers({ 'content-type': contentType }),
      text: async () => body,
    };
  }

  test('перенаправление на страницу подтверждения — успех', async () => {
    const result = await interpretSubmitResponse(makeResponse({
      redirected: true,
      url: 'https://softcare-piskunova.netlify.app/thanks.html',
      body: '<!DOCTYPE html><html lang="ru" data-order-success>...</html>',
    }));
    assert.deepEqual(result, { ok: true, kind: 'ok', status: 200 });
  });

  test('200 с содержимым подтверждения (без редиректа) — успех', async () => {
    const result = await interpretSubmitResponse(makeResponse({
      body: '<!DOCTYPE html><html lang="ru" data-order-success><body>Спасибо</body></html>',
    }));
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'ok');
  });

  test('200 с HTML главной без маркера — не успех (локальная разработка)', async () => {
    const result = await interpretSubmitResponse(makeResponse({
      body: '<!DOCTYPE html><html lang="ru"><head><title>SOFTCARE</title></head><body>калькулятор</body></html>',
    }));
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'not-connected');
  });

  test('ошибки сервера не считаются отправкой', async () => {
    for (const status of [404, 500]) {
      const result = await interpretSubmitResponse(makeResponse({ ok: false, status, body: 'error' }));
      assert.equal(result.ok, false);
      assert.equal(result.kind, 'failed');
      assert.equal(result.status, status);
    }
  });
});
