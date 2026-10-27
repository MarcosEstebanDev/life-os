import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSessionCookie } from './cookies.js';

test('lee la cookie de sesión entre otras', () => {
  assert.equal(readSessionCookie('theme=dark; lifeos_session=abc-_123; other=x'), 'abc-_123');
});

test('sin la cookie, o sin header, no hay token', () => {
  assert.equal(readSessionCookie('theme=dark'), null);
  assert.equal(readSessionCookie(undefined), null);
  assert.equal(readSessionCookie('lifeos_session_old=abc'), null);
});
