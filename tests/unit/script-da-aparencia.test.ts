import { afterEach, describe, expect, it } from "vitest";

import { scriptDaAparencia } from "@/lib/branding/script-da-aparencia";

/**
 * O FLASH: o HTML do servidor so conhecia a aparencia da instalacao, e a troca
 * para a da organizacao esperava a hidratacao — medido 112–144 ms (4–5 quadros)
 * com a paleta errada em `evidence/marca-neutros/flash.json`. O script inline que
 * o layout de /app emite troca os atributos no parse, antes da primeira pintura.
 * Ele roda fora do React, entao a funcao que o escreve e a unidade testada.
 */
describe("scriptDaAparencia", () => {
  const raiz = document.documentElement;
  const rodar = (js: string) => new Function(js)();
  const limpar = () => {
    raiz.removeAttribute("data-neutros");
    raiz.removeAttribute("data-raio");
  };

  afterEach(limpar);

  it("liga a escolha da organizacao no <html>", () => {
    raiz.setAttribute("data-neutros", "cinza");
    rodar(scriptDaAparencia({ neutros: "frio", raio: "padrao" }));
    expect(raiz.getAttribute("data-neutros")).toBe("frio");
  });

  it("quente REMOVE o atributo (quente e a ausencia, nao um bloco)", () => {
    raiz.setAttribute("data-neutros", "frio");
    rodar(scriptDaAparencia({ neutros: "quente", raio: "padrao" }));
    expect(raiz.hasAttribute("data-neutros")).toBe(false);
  });

  it.each(["suave", "arredondado"] as const)("raio %s liga data-raio", (raio) => {
    rodar(scriptDaAparencia({ neutros: "quente", raio }));
    expect(raiz.getAttribute("data-raio")).toBe(raio);
  });

  it("raio padrao REMOVE o atributo", () => {
    raiz.setAttribute("data-raio", "suave");
    rodar(scriptDaAparencia({ neutros: "quente", raio: "padrao" }));
    expect(raiz.hasAttribute("data-raio")).toBe(false);
  });

  it("todas as combinacoes aplicam os DOIS atributos", () => {
    for (const neutros of ["quente", "cinza", "frio"] as const) {
      for (const raio of ["suave", "padrao", "arredondado"] as const) {
        limpar();
        rodar(scriptDaAparencia({ neutros, raio }));
        expect(raiz.getAttribute("data-neutros")).toBe(neutros === "quente" ? null : neutros);
        expect(raiz.getAttribute("data-raio")).toBe(raio === "padrao" ? null : raio);
      }
    }
  });

  it("valor fora do vocabulario vira o padrao — nunca escreve lixo no <html> nem no script", () => {
    const js = scriptDaAparencia({
      neutros: 'frio");alert(1);("' as never,
      raio: 'x");alert(2);("' as never,
    });
    expect(js).not.toContain("alert");
    raiz.setAttribute("data-neutros", "cinza");
    raiz.setAttribute("data-raio", "suave");
    rodar(js);
    expect(raiz.hasAttribute("data-neutros")).toBe(false);
    expect(raiz.hasAttribute("data-raio")).toBe(false);
  });

  it("nao contem </script> nem depende de nada alem do documento", () => {
    for (const n of ["quente", "cinza", "frio"] as const) {
      for (const r of ["suave", "padrao", "arredondado"] as const) {
        expect(scriptDaAparencia({ neutros: n, raio: r })).not.toMatch(/<\/script/i);
      }
    }
  });
});
