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
  test('2xx без HTML — успех', async () => {
    const result = await interpretSubmitResponse(
      new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    );
    assert.deepEqual(result, { ok: true, kind: 'ok', status: 200 });
  });

  test('HTML-ответ 200 не считается успехом (форма не обработана)', async () => {
    const result = await interpretSubmitResponse(
      new Response('<!DOCTYPE html><html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'not-connected');
  });

  test('серверный редирект после приёма заявки — успех', async () => {
    const result = await interpretSubmitResponse({
      type: 'opaqueredirect',
      status: 0,
      ok: false,
      headers: new Headers(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'ok');
  });

  test('ошибки сервера не считаются отправкой', async () => {
    for (const status of [404, 500]) {
      const result = await interpretSubmitResponse(
        new Response('error', { status, headers: { 'Content-Type': 'text/plain' } }),
      );
      assert.equal(result.ok, false);
      assert.equal(result.kind, 'failed');
      assert.equal(result.status, status);
    }
  });
});
