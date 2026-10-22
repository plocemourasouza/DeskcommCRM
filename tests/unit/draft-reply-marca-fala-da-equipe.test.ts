import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// O rascunho do modo assistido não pode continuar a fala de um colega como se
// fosse sua: a mensagem marcada `autor: 'equipe'` entra com o prefixo [Equipe].
describe("draft-reply — fala da equipe", () => {
  it("prefixa [Equipe] nas mensagens com autor 'equipe'", () => {
    const src = readFileSync("lib/agent-engine/agent/draft-reply.ts", "utf8");
    expect(src).toMatch(/m\.autor === 'equipe' \? `\[Equipe\] \$\{m\.body\}` : m\.body/);
  });
});
