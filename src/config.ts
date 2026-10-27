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
  auth: {
    /** 32 bytes en base64 para cifrar el secreto TOTP. Sólo la API la exige. */
    encryptionKey: string | null;
    /** Orígenes de la web: un POST con otro Origin se rechaza. */
    webOrigins: string[];
    allowSignup: boolean;
  };
  /** Dueño de lo que entra por la carpeta observada. Sólo el worker lo exige. */
  watchOwnerEmail: string | null;
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
  const model = env.LLM_MODEL || 'qwen2.5:7b-instruct';
  // Los modelos "-cloud" de Ollama se piden al endpoint local pero corren en ollama.com.
  if (/[-:]cloud$/.test(model) && !allowRemote) {
    throw new ConfigError(`LLM_MODEL=${model} corre fuera de esta máquina. Si es a propósito, poné LLM_ALLOW_REMOTE=true.`);
  }
  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    redisUrl: required(env, 'REDIS_URL'),
    watchDir: required(env, 'WATCH_DIR'),
    port: Number(env.PORT ?? 3010),
    llm: {
      baseUrl,
      apiKey: env.LLM_API_KEY || 'ollama',
      model,
      allowRemote,
    },
    auth: {
      encryptionKey: env.AUTH_ENCRYPTION_KEY || null,
      webOrigins: (env.WEB_ORIGINS || 'http://localhost:3011,http://127.0.0.1:3011').split(',').map((o) => o.trim()).filter(Boolean),
      allowSignup: env.ALLOW_SIGNUP !== 'false',
    },
    watchOwnerEmail: env.WATCH_OWNER_EMAIL ? env.WATCH_OWNER_EMAIL.trim().toLowerCase() : null,
  };
}
