import { afterEach, describe, expect, it } from "vitest";

import { scriptDosNeutros } from "@/lib/branding/script-dos-neutros";

/**
 * O FLASH: o HTML do servidor so conhecia os neutros da instalacao, e a troca
 * para os da organizacao esperava a hidratacao — medido 112–144 ms (4–5 quadros)
 * com a paleta errada em `evidence/marca-neutros/flash.json`. O script inline que
 * o layout de /app emite troca o atributo no parse, antes da primeira pintura.
 * Ele roda fora do React, entao a funcao que o escreve e a unidade testada.
 */
describe("scriptDosNeutros", () => {
  const raiz = document.documentElement;
  const rodar = (js: string) => new Function(js)();

  afterEach(() => raiz.removeAttribute("data-neutros"));

  it("liga a escolha da organizacao no <html>", () => {
    raiz.setAttribute("data-neutros", "cinza");
    rodar(scriptDosNeutros("frio"));
    expect(raiz.getAttribute("data-neutros")).toBe("frio");
  });

  it("quente REMOVE o atributo (quente e a ausencia, nao um bloco)", () => {
    raiz.setAttribute("data-neutros", "frio");
    rodar(scriptDosNeutros("quente"));
    expect(raiz.hasAttribute("data-neutros")).toBe(false);
  });

  it("valor fora do vocabulario vira quente — nunca escreve lixo no <html> nem no script", () => {
    const js = scriptDosNeutros('frio");alert(1);("' as never);
    expect(js).not.toContain("alert");
    raiz.setAttribute("data-neutros", "cinza");
    rodar(js);
    expect(raiz.hasAttribute("data-neutros")).toBe(false);
  });

  it("nao contem </script> nem depende de nada alem do documento", () => {
    for (const v of ["quente", "cinza", "frio"] as const) {
      expect(scriptDosNeutros(v)).not.toMatch(/<\/script/i);
    }
  });
});
