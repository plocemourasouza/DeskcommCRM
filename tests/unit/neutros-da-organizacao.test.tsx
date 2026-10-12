import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NeutrosDaOrganizacao } from "@/app/app/_components/NeutrosDaOrganizacao";

/**
 * A ORGANIZACAO QUE SOBREPOE OS NEUTROS troca o atributo do <html> enquanto a
 * subarvore de /app existe, e o devolve ao desmontar (logout -> /login volta a
 * paleta da instalacao). A cor da organizacao e escopada por `body:has(...)`, mas
 * o preset escuro so casa no proprio <html> — por isso o atributo, e nao um bloco.
 */
describe("NeutrosDaOrganizacao", () => {
  const raiz = document.documentElement;

  beforeEach(() => raiz.removeAttribute("data-neutros"));
  afterEach(() => {
    cleanup();
    raiz.removeAttribute("data-neutros");
  });

  it("aplica a escolha da organizacao", () => {
    render(<NeutrosDaOrganizacao neutros="frio" />);
    expect(raiz.getAttribute("data-neutros")).toBe("frio");
  });

  it("sobrepoe a da instalacao e a devolve ao desmontar", () => {
    raiz.setAttribute("data-neutros", "cinza");
    const { unmount } = render(<NeutrosDaOrganizacao neutros="frio" />);
    expect(raiz.getAttribute("data-neutros")).toBe("frio");
    unmount();
    expect(raiz.getAttribute("data-neutros")).toBe("cinza");
  });

  it("quente sobre instalacao fria REMOVE o atributo (e o devolve depois)", () => {
    raiz.setAttribute("data-neutros", "frio");
    const { unmount } = render(<NeutrosDaOrganizacao neutros="quente" />);
    expect(raiz.hasAttribute("data-neutros")).toBe(false);
    unmount();
    expect(raiz.getAttribute("data-neutros")).toBe("frio");
  });

  it("desmontar sem atributo anterior deixa o <html> sem atributo", () => {
    const { unmount } = render(<NeutrosDaOrganizacao neutros="cinza" />);
    unmount();
    expect(raiz.hasAttribute("data-neutros")).toBe(false);
  });

  it("valor fora do vocabulario e tratado como quente (nunca escreve lixo no <html>)", () => {
    const { unmount } = render(<NeutrosDaOrganizacao neutros={"verde" as never} />);
    expect(raiz.hasAttribute("data-neutros")).toBe(false);
    unmount();
  });
});
