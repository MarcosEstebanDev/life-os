import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundError } from '../domain/errors.js';
import { UuidOr404Pipe } from './uuid-param.js';

const pipe = new UuidOr404Pipe();

test('un UUID pasa tal cual', () => {
  assert.equal(pipe.transform('44939ae5-b27f-45c8-a74e-e27ef5d20790'), '44939ae5-b27f-45c8-a74e-e27ef5d20790');
});

test('algo que no es UUID es un recurso que no existe', () => {
  assert.throws(() => pipe.transform('abc'), NotFoundError);
  assert.throws(() => pipe.transform("1' or '1'='1"), NotFoundError);
});
