import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AparenciaDaOrganizacao } from "@/app/app/_components/AparenciaDaOrganizacao";

/**
 * A ORGANIZACAO QUE SOBREPOE A APARENCIA troca os atributos do <html> enquanto a
 * subarvore de /app existe, e os devolve ao desmontar (logout -> /login volta a
 * da instalacao). A cor da organizacao e escopada por `body:has(...)`, mas o
 * preset escuro dos neutros so casa no proprio <html> — por isso o atributo.
 */
describe("AparenciaDaOrganizacao", () => {
  const raiz = document.documentElement;
  const QUENTE = { neutros: "quente", raio: "padrao" } as const;

  beforeEach(() => {
    raiz.removeAttribute("data-neutros");
    raiz.removeAttribute("data-raio");
  });
  afterEach(() => {
    cleanup();
    raiz.removeAttribute("data-neutros");
    raiz.removeAttribute("data-raio");
  });

  it("aplica a escolha da organizacao", () => {
    render(<AparenciaDaOrganizacao aparencia={{ neutros: "frio", raio: "suave" }} instalacao={QUENTE} />);
    expect(raiz.getAttribute("data-neutros")).toBe("frio");
    expect(raiz.getAttribute("data-raio")).toBe("suave");
  });

  it("sobrepoe a da instalacao e a devolve ao desmontar", () => {
    raiz.setAttribute("data-neutros", "cinza");
    raiz.setAttribute("data-raio", "arredondado");
    const { unmount } = render(
      <AparenciaDaOrganizacao
        aparencia={{ neutros: "frio", raio: "suave" }}
        instalacao={{ neutros: "cinza", raio: "arredondado" }}
      />,
    );
    expect(raiz.getAttribute("data-neutros")).toBe("frio");
    expect(raiz.getAttribute("data-raio")).toBe("suave");
    unmount();
    expect(raiz.getAttribute("data-neutros")).toBe("cinza");
    expect(raiz.getAttribute("data-raio")).toBe("arredondado");
  });

  it("quente/padrao sobre instalacao com escolha REMOVE os atributos (e os devolve depois)", () => {
    raiz.setAttribute("data-neutros", "frio");
    raiz.setAttribute("data-raio", "suave");
    const { unmount } = render(
      <AparenciaDaOrganizacao aparencia={QUENTE} instalacao={{ neutros: "frio", raio: "suave" }} />,
    );
    expect(raiz.hasAttribute("data-neutros")).toBe(false);
    expect(raiz.hasAttribute("data-raio")).toBe(false);
    unmount();
    expect(raiz.getAttribute("data-neutros")).toBe("frio");
    expect(raiz.getAttribute("data-raio")).toBe("suave");
  });

  it("desmontar sem atributo anterior deixa o <html> sem atributo", () => {
    const { unmount } = render(
      <AparenciaDaOrganizacao aparencia={{ neutros: "cinza", raio: "arredondado" }} instalacao={QUENTE} />,
    );
    unmount();
    expect(raiz.hasAttribute("data-neutros")).toBe(false);
    expect(raiz.hasAttribute("data-raio")).toBe(false);
  });

  // O script do servidor (`scriptDaAparencia`) ja trocou os atributos antes da
  // hidratacao, entao o <html> que o efeito encontra e o da ORGANIZACAO. Devolver
  // "o que havia na montagem" deixaria a aparencia da empresa no /login.
  it("o script do servidor ja aplicou: desmontar devolve a da INSTALACAO, nao o que achou", () => {
    raiz.setAttribute("data-neutros", "frio");
    raiz.setAttribute("data-raio", "suave");
    const { unmount } = render(
      <AparenciaDaOrganizacao
        aparencia={{ neutros: "frio", raio: "suave" }}
        instalacao={{ neutros: "cinza", raio: "arredondado" }}
      />,
    );
    unmount();
    expect(raiz.getAttribute("data-neutros")).toBe("cinza");
    expect(raiz.getAttribute("data-raio")).toBe("arredondado");
  });

  it("valor fora do vocabulario e tratado como padrao (nunca escreve lixo no <html>)", () => {
    const { unmount } = render(
      <AparenciaDaOrganizacao aparencia={{ neutros: "verde" as never, raio: "x" as never }} instalacao={QUENTE} />,
    );
    expect(raiz.hasAttribute("data-neutros")).toBe(false);
    expect(raiz.hasAttribute("data-raio")).toBe(false);
    unmount();
  });
});
