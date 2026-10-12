import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateName, validatePhone, validateComment } from '../src/form.js';

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
