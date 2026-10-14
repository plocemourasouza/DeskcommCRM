import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({ linha: null as unknown, lanca: false }));

vi.mock("next/font/local", () => ({ default: () => ({ variable: "fonte" }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("sonner", () => ({ Toaster: () => null }));
vi.mock("@/app/providers", () => ({ Providers: () => null }));
vi.mock("@/app/public-env-script", () => ({ PublicEnvScript: () => null }));
vi.mock("@/lib/branding/instalacao", () => ({
  marcaDaInstalacao: async () => {
    if (estado.lanca) throw new Error("banco fora");
    return estado.linha;
  },
  motivoDoFallback: () => null,
  registrarEstadoDaMarca: async () => undefined,
}));

import RootLayout from "@/app/layout";

/**
 * O ATRIBUTO `data-neutros` NO <html>: e a unica forma de ligar o preset sem
 * o CSS de marca declarar `--color-bg` (vigiado por branding-pares-pintados).
 * `quente` NAO escreve atributo: o produto sem escolha e byte a byte o de hoje.
 */
describe("RootLayout — data-neutros", () => {
  beforeEach(() => {
    estado.linha = null;
    estado.lanca = false;
  });

  async function atributo(): Promise<unknown> {
    const html = await RootLayout({ children: null });
    return (html.props as Record<string, unknown>)["data-neutros"];
  }

  it("instalacao frio: o <html> leva data-neutros=frio", async () => {
    estado.linha = { neutros: "frio" };
    expect(await atributo()).toBe("frio");
  });

  it("instalacao cinza: data-neutros=cinza", async () => {
    estado.linha = { neutros: "cinza" };
    expect(await atributo()).toBe("cinza");
  });

  it("quente (default) nao escreve o atributo", async () => {
    estado.linha = { neutros: "quente" };
    expect(await atributo()).toBeUndefined();
  });

  it("sem linha, ou valor desconhecido: sem atributo", async () => {
    expect(await atributo()).toBeUndefined();
    estado.linha = { neutros: "verde" };
    expect(await atributo()).toBeUndefined();
  });

  it("leitura que falha nao derruba o documento", async () => {
    estado.lanca = true;
    expect(await atributo()).toBeUndefined();
  });
});
