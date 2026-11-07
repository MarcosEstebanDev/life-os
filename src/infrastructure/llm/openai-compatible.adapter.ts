import type { LlmPort } from '../../domain/ports/llm.port.js';

/**
 * Cualquier proveedor con API compatible con OpenAI: Ollama local por
 * defecto, o uno remoto si se habilitó a propósito. Adaptado del de
 * agent-platform, sin tools y pidiendo JSON.
 */
export interface OpenAiCompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** En CPU un 7B tarda minutos con un trozo largo. */
  timeoutMs?: number;
}

export class OpenAiCompatibleAdapter implements LlmPort {
  private readonly baseUrl: string;

  constructor(private readonly config: OpenAiCompatibleConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
  }

  get modelName(): string {
    return this.config.model;
  }

  async completeJson(input: { system: string; user: string }): Promise<string> {
    const res = await this.post(input);
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
    return body.choices?.[0]?.message?.content ?? '';
  }

  /** "fetch failed" no le dice nada a nadie: se nombra a dónde se intentó ir. */
  private async post(input: { system: string; user: string }): Promise<Response> {
    try {
      return await this.request(input);
    } catch (e) {
      throw new Error(`no se pudo conectar al LLM en ${this.baseUrl} (¿está corriendo Ollama?): ${(e as Error).message}`);
    }
  }

  private request(input: { system: string; user: string }): Promise<Response> {
    return fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 300_000),
    });
  }
}
