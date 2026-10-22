/**
 * Mensagem escrita por um colega humano (celular da empresa ou Inbox) aparece
 * no histórico marcada como da equipe; o ritual de abertura precisa dizer ao
 * agente o que fazer com a marca — senão ele a lê como palavra sua.
 */
import { describe, expect, it } from "vitest";

import { buildOpeningMessage } from "@/lib/agent-engine/agent/abertura/ritual";

const contexto = {
  contact: { name: "Alice", email: null },
  messages: [
    { direction: "outbound", body: "Alice, eu recebi aqui.", sent_at: "2026-10-20T12:00:00-03:00", autor: "equipe" },
  ],
} as never;

describe("ritual — mensagens da equipe", () => {
  it("a abertura explica que as marcadas como da equipe não são palavra do agente", () => {
    const t = buildOpeningMessage(null, null, contexto, "sem notas");
    expect(t).toContain("escritas por um colega humano, não por você");
    expect(t).toContain("não as repita nem as contradiga");
  });

  it("e a instrução vem ANTES do histórico que ela explica", () => {
    const t = buildOpeningMessage(null, null, contexto, "sem notas");
    expect(t.indexOf("colega humano")).toBeLessThan(t.indexOf("Alice, eu recebi aqui."));
  });
});
