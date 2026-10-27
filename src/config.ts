/**
 * Configuración desde el entorno. Son datos financieros: un LLM fuera de
 * esta máquina tiene que ser una decisión explícita, no un typo en .env.
 */
export interface Config {
  databaseUrl: string;
  redisUrl: string;
  watchDir: string;
  port: number;
  llm: { baseUrl: string; apiKey: string; model: string; allowRemote: boolean };
}

export class ConfigError extends Error {}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new ConfigError(`falta la variable ${name}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const baseUrl = env.LLM_BASE_URL || 'http://localhost:11434/v1';
  const allowRemote = env.LLM_ALLOW_REMOTE === 'true';
  if (!LOCAL_HOSTS.has(new URL(baseUrl).hostname) && !allowRemote) {
    throw new ConfigError(
      `LLM_BASE_URL apunta a ${new URL(baseUrl).host}, fuera de esta máquina. ` +
        'Si querés mandar tus documentos ahí, poné LLM_ALLOW_REMOTE=true.',
    );
  }
  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    redisUrl: required(env, 'REDIS_URL'),
    watchDir: required(env, 'WATCH_DIR'),
    port: Number(env.PORT ?? 3010),
    llm: {
      baseUrl,
      apiKey: env.LLM_API_KEY || 'ollama',
      model: env.LLM_MODEL || 'qwen2.5:7b-instruct',
      allowRemote,
    },
  };
}
