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

  describe("data-raio", () => {
    async function raio(): Promise<unknown> {
      const html = await RootLayout({ children: null });
      return (html.props as Record<string, unknown>)["data-raio"];
    }

    it("instalacao suave / arredondado: o <html> leva data-raio", async () => {
      estado.linha = { raio: "suave" };
      expect(await raio()).toBe("suave");
      estado.linha = { raio: "arredondado" };
      expect(await raio()).toBe("arredondado");
    });

    it("padrao, linha ausente, valor desconhecido ou leitura que falha: sem atributo", async () => {
      estado.linha = { raio: "padrao" };
      expect(await raio()).toBeUndefined();
      estado.linha = null;
      expect(await raio()).toBeUndefined();
      estado.linha = { raio: "quadrado" };
      expect(await raio()).toBeUndefined();
      estado.lanca = true;
      expect(await raio()).toBeUndefined();
    });

    it("neutros e raio convivem", async () => {
      estado.linha = { neutros: "frio", raio: "suave" };
      expect(await atributo()).toBe("frio");
      expect(await raio()).toBe("suave");
    });
  });

  describe("data-densidade", () => {
    async function densidade(): Promise<unknown> {
      const html = await RootLayout({ children: null });
      return (html.props as Record<string, unknown>)["data-densidade"];
    }

    it("instalacao equilibrada / compacta: o <html> leva data-densidade", async () => {
      estado.linha = { densidade: "equilibrada" };
      expect(await densidade()).toBe("equilibrada");
      estado.linha = { densidade: "compacta" };
      expect(await densidade()).toBe("compacta");
    });

    it("aerada, linha ausente, valor desconhecido ou leitura que falha: sem atributo", async () => {
      estado.linha = { densidade: "aerada" };
      expect(await densidade()).toBeUndefined();
      estado.linha = null;
      expect(await densidade()).toBeUndefined();
      estado.linha = { densidade: "apertada" };
      expect(await densidade()).toBeUndefined();
      estado.lanca = true;
      expect(await densidade()).toBeUndefined();
    });

    it("convive com neutros e raio", async () => {
      estado.linha = { neutros: "frio", raio: "suave", densidade: "compacta" };
      expect(await atributo()).toBe("frio");
      expect(await densidade()).toBe("compacta");
    });
  });
});
