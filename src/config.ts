/**
 * Configuración desde el entorno. Son datos financieros: un LLM fuera de
 * esta máquina tiene que ser una decisión explícita, no un typo en .env.
 */
export interface Config {
  databaseUrl: string;
  redisUrl: string;
  watchDir: string;
  port: number;
  llm: { baseUrl: string; apiKey: string; model: string; allowRemote: boolean; timeoutMs: number };
  auth: {
    /** 32 bytes en base64 para cifrar el secreto TOTP. Sólo la API la exige. */
    encryptionKey: string | null;
    /** Orígenes de la web: un POST con otro Origin se rechaza. */
    webOrigins: string[];
    /** open: cualquiera; first: sólo la primera cuenta; closed: nadie. */
    signup: 'open' | 'first' | 'closed';
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

/**
 * El timeout cuenta también la carga del modelo: desde un disco lento un 7B tarda más
 * de 5 minutos en frío, y si el pedido se corta antes Ollama aborta la carga,
 * así que cada reintento vuelve a empezar de cero. 30 minutos por pedido.
 */
const DEFAULT_LLM_TIMEOUT_MS = 30 * 60_000;

function llmTimeout(raw: string | undefined): number {
  if (!raw) return DEFAULT_LLM_TIMEOUT_MS;
  const ms = Number(raw);
  if (!Number.isInteger(ms) || ms <= 0) throw new ConfigError(`LLM_TIMEOUT_MS tiene que ser un entero de milisegundos, no "${raw}"`);
  return ms;
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
      timeoutMs: llmTimeout(env.LLM_TIMEOUT_MS),
    },
    auth: {
      encryptionKey: env.AUTH_ENCRYPTION_KEY || null,
      webOrigins: (env.WEB_ORIGINS || 'http://localhost:3011,http://127.0.0.1:3011').split(',').map((o) => o.trim()).filter(Boolean),
      signup: env.ALLOW_SIGNUP === 'true' ? 'open' : env.ALLOW_SIGNUP === 'false' ? 'closed' : 'first',
    },
    watchOwnerEmail: env.WATCH_OWNER_EMAIL ? env.WATCH_OWNER_EMAIL.trim().toLowerCase() : null,
  };
}
