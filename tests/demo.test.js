import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO_SUCCESS_MESSAGE } from '../src/form.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('демонстрационный режим', () => {
  test('сообщение о демо-заявке совпадает с требованием проекта', () => {
    assert.equal(
      DEMO_SUCCESS_MESSAGE,
      'Демо-заявка сформирована. Данные никуда не отправляются',
    );
  });

  test('клиентский код формы не выполняет сетевых запросов', () => {
    const source = read('src/form.js');
    assert.ok(!/\bfetch\s*\(/.test(source), 'в form.js не должно быть fetch');
    assert.ok(!source.includes('XMLHttpRequest'), 'в form.js не должно быть XMLHttpRequest');
    assert.ok(!source.includes('sendBeacon'), 'в form.js не должно быть sendBeacon');
  });

  test('введённые данные формы не сохраняются локально', () => {
    const source = read('src/form.js');
    assert.ok(!source.includes('localStorage'), 'form.js не должен использовать localStorage');
    assert.ok(!source.includes('sessionStorage'), 'form.js не должен использовать sessionStorage');
    assert.ok(!source.includes('indexedDB'), 'form.js не должен использовать indexedDB');
    assert.ok(!source.includes('document.cookie'), 'form.js не должен использовать cookies');
  });

  test('форма не подключена к Netlify Forms', () => {
    const html = read('index.html');
    assert.ok(!html.includes('data-netlify'), 'в index.html не должно быть data-netlify');
    assert.ok(!html.includes('netlify-honeypot'), 'в index.html не должно быть netlify-honeypot');
    assert.ok(!html.includes('name="form-name"'), 'скрытое поле form-name должно быть удалено');
    assert.ok(!html.includes('name="bot-field"'), 'поле honeypot bot-field должно быть удалено');
  });

  test('на странице есть предупреждение о демонстрационном режиме', () => {
    const html = read('index.html');
    assert.ok(html.includes('class="demo-bar"'), 'баннер деморежима отсутствует');
    assert.ok(html.includes('демонстрационн'), 'нет формулировки о демонстрационном характере проекта');
  });

  test('кнопка и текст подтверждения говорят о демо-режиме', () => {
    const html = read('index.html');
    assert.ok(html.includes('Сформировать демо-заявку'), 'нет демонстрационной подписи кнопки');
    assert.ok(html.includes(DEMO_SUCCESS_MESSAGE), 'нет текста демо-подтверждения в разметке');
  });
});

describe('исключение нативной отправки', () => {
  test('в разметке нет элемента формы, method и action', () => {
    const html = read('index.html');
    assert.ok(!/<form[\s>]/i.test(html), 'элемент <form> должен быть убран');
    assert.ok(!/<\/form>/i.test(html), 'закрывающий тег </form> должен быть убран');
    assert.ok(!/method="/i.test(html), 'атрибут method должен быть убран');
    assert.ok(!/action="/i.test(html), 'атрибут action должен быть убран');
  });

  test('кнопка не является submit-кнопкой', () => {
    const html = read('index.html');
    assert.ok(!/type="submit"/.test(html), 'submit-кнопок быть не должно');
    assert.ok(/id="submit-btn"[^>]*type="button"|type="button"[^>]*id="submit-btn"/.test(html), 'кнопка должна быть type="button"');
  });

  test('поля блока не имеют атрибутов name — сериализовать нечего', () => {
    const html = read('index.html');
    const start = html.indexOf('id="order-form"');
    const end = html.indexOf('</section>', start);
    assert.ok(start > 0 && end > start, 'блока #order-form нет в разметке');
    const block = html.slice(start, end);
    assert.ok(!/name="/.test(block), 'внутри блока не должно быть атрибутов name');
  });

  test('контейнер сохраняет семантику, подписи и ошибки полей', () => {
    const html = read('index.html');
    assert.ok(html.includes('role="form"'), 'нет role="form" у контейнера');
    assert.ok(html.includes('aria-labelledby="order-title"'), 'нет aria-labelledby');
    for (const id of ['name', 'phone', 'comment', 'consent']) {
      assert.ok(html.includes(`id="${id}"`), `нет поля ${id}`);
      assert.ok(html.includes(`for="${id}"`), `нет подписи для ${id}`);
      assert.ok(html.includes(`id="${id}-error"`), `нет области ошибки для ${id}`);
      assert.ok(html.includes(`aria-describedby="${id}-error`), `нет aria-describedby для ${id}`);
    }
  });

  test('при отключённом JavaScript показывается сообщение', () => {
    const html = read('index.html');
    assert.ok(html.includes('<noscript>'), 'нет блока noscript');
    assert.ok(html.includes('#order-form { display: none; }'), 'блок не скрывается без JavaScript');
    assert.ok(html.includes('Интерактивная демонстрация недоступна без JavaScript'), 'нет сообщения о недоступности');
  });

  test('демо-заявка формируется только локальными обработчиками', () => {
    const source = read('src/form.js');
    assert.ok(source.includes("submitBtn.addEventListener('click'"), 'нет локального обработчика кнопки');
    assert.ok(source.includes("root.addEventListener('keydown'"), 'нет обработчика клавиатуры');
    assert.ok(source.includes("root.addEventListener('submit'"), 'нет страховки от submit');
  });
});
