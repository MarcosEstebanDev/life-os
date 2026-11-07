/**
 * Puerto de LLM. Mismo patrón que agent-platform: el dominio no sabe qué
 * proveedor hay del otro lado. Acá no hay tools: sólo un pedido que vuelve
 * como JSON crudo, y el parseo es responsabilidad de quien lo pide.
 */
export interface LlmPort {
  readonly modelName: string;
  completeJson(input: { system: string; user: string }): Promise<string>;
}
