import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAiCompatibleAdapter } from './openai-compatible.adapter.js';

test('si el LLM no responde, el error dice dónde se intentó conectar', async () => {
  const llm = new OpenAiCompatibleAdapter({ baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'x', model: 'm' });
  await assert.rejects(llm.completeJson({ system: 's', user: 'u' }), /no se pudo conectar al LLM en http:\/\/127\.0\.0\.1:9\/v1/);
});
