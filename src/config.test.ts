import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, loadConfig } from './config.js';

const base = {
  DATABASE_URL: 'postgresql://x',
  REDIS_URL: 'redis://localhost:6381',
  WATCH_DIR: 'C:/papeles',
  LLM_BASE_URL: 'http://localhost:11434/v1',
  LLM_MODEL: 'qwen2.5:7b-instruct',
};

test('un LLM local arranca sin opt-in', () => {
  assert.equal(loadConfig({ ...base, LLM_BASE_URL: 'http://127.0.0.1:11434/v1' }).llm.allowRemote, false);
});

test('un LLM remoto sin LLM_ALLOW_REMOTE no arranca', () => {
  assert.throws(() => loadConfig({ ...base, LLM_BASE_URL: 'https://api.groq.com/openai/v1' }), (e: unknown) => e instanceof ConfigError && /LLM_ALLOW_REMOTE/.test(e.message));
});

test('un LLM remoto con LLM_ALLOW_REMOTE=true arranca', () => {
  const config = loadConfig({ ...base, LLM_BASE_URL: 'https://api.groq.com/openai/v1', LLM_ALLOW_REMOTE: 'true' });
  assert.equal(config.llm.allowRemote, true);
});

test('un host que sólo empieza con localhost no cuenta como local', () => {
  assert.throws(() => loadConfig({ ...base, LLM_BASE_URL: 'http://localhost.evil.com/v1' }), ConfigError);
});

test('un modelo cloud de Ollama cuenta como remoto aunque la URL sea local', () => {
  assert.throws(() => loadConfig({ ...base, LLM_MODEL: 'gpt-oss:120b-cloud' }), (e: unknown) => e instanceof ConfigError && /LLM_ALLOW_REMOTE/.test(e.message));
  assert.equal(loadConfig({ ...base, LLM_MODEL: 'gpt-oss:120b-cloud', LLM_ALLOW_REMOTE: 'true' }).llm.allowRemote, true);
});

test('autenticación: orígenes de la web y registro abierto por defecto', () => {
  const config = loadConfig(base);
  assert.deepEqual(config.auth.webOrigins, ['http://localhost:3011', 'http://127.0.0.1:3011']);
  assert.equal(config.auth.allowSignup, true);
  assert.equal(config.auth.encryptionKey, null);
  assert.equal(config.watchOwnerEmail, null);
});

test('autenticación: variables explícitas', () => {
  const config = loadConfig({
    ...base, WEB_ORIGINS: 'https://lifeos.example.com, http://localhost:3011', ALLOW_SIGNUP: 'false',
    AUTH_ENCRYPTION_KEY: 'a2V5', WATCH_OWNER_EMAIL: ' User@Example.com ',
  });
  assert.deepEqual(config.auth.webOrigins, ['https://lifeos.example.com', 'http://localhost:3011']);
  assert.equal(config.auth.allowSignup, false);
  assert.equal(config.auth.encryptionKey, 'a2V5');
  assert.equal(config.watchOwnerEmail, 'user@example.com');
});

test('falta una variable obligatoria', () => {
  assert.throws(() => loadConfig({ ...base, WATCH_DIR: undefined }), (e: unknown) => e instanceof ConfigError && /WATCH_DIR/.test(e.message));
});

test('defaults de puerto y LLM', () => {
  const config = loadConfig({ DATABASE_URL: 'x', REDIS_URL: 'y', WATCH_DIR: 'z' });
  assert.equal(config.port, 3010);
  assert.equal(config.llm.baseUrl, 'http://localhost:11434/v1');
  assert.equal(config.llm.model, 'qwen2.5:7b-instruct');
});
