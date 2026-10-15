/**
 * COMO AS FONTES CHEGAM AO NAVEGADOR — e o que isso NÃO pode custar ao padrão.
 *
 * Declarar sete famílias no `<html>` seria um imposto para toda instalação, a
 * que nunca troca de fonte inclusive, se cada uma virasse um `<link
 * rel="preload">`. Aqui se prova a configuração: só a Atkinson e a Plex Mono são
 * pré-carregadas; as seis outras entram com `preload: false` (o navegador só
 * baixa o woff2 de uma família que algum elemento renderizado usa). Os bytes
 * reais são conferidos no `pnpm build` — este teste vigia que ninguém troque
 * isso sem notar.
 */
import fs from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it, vi } from "vitest";

type Opcoes = {
  src: string | { path: string; weight?: string; style?: string }[];
  weight?: string;
  display?: string;
  variable: string;
  preload?: boolean;
  adjustFontFallback?: string | false;
};

const chamadas = vi.hoisted(() => [] as unknown[]);

vi.mock("next/font/local", () => ({
  default: (o: { variable: string }) => {
    chamadas.push(o);
    return { variable: `classe${o.variable}` };
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("sonner", () => ({ Toaster: () => null }));
vi.mock("@/app/providers", () => ({ Providers: () => null }));
vi.mock("@/app/public-env-script", () => ({ PublicEnvScript: () => null }));
vi.mock("@/lib/branding/instalacao", () => ({
  marcaDaInstalacao: async () => null,
  motivoDoFallback: () => null,
  registrarEstadoDaMarca: async () => undefined,
}));

import { FONTES_DA_MARCA, SERIFADAS_DA_MARCA, VARIAVEL_DA_FONTE } from "@/lib/branding/schema";

let opcoes: Opcoes[] = [];
let classeDoHtml = "";

beforeAll(async () => {
  const { default: RootLayout } = await import("@/app/layout");
  await import("@/app/fontes-da-marca");
  opcoes = chamadas as Opcoes[];
  const html = await RootLayout({ children: null });
  classeDoHtml = String((html.props as Record<string, unknown>).className);
});

const arquivosDe = (o: Opcoes) =>
  typeof o.src === "string" ? [o.src] : o.src.map((s) => s.path);

describe("fontes da marca — carregamento", () => {
  it("SÓ a Atkinson e a Plex Mono são pré-carregadas (o padrão não paga pelas outras)", () => {
    const preload = opcoes.filter((o) => o.preload !== false).map((o) => o.variable).sort();
    expect(preload).toEqual(["--font-atkinson", "--font-mono"]);
  });

  it.each(FONTES_DA_MARCA.filter((f) => f !== "atkinson"))(
    "%s: declarada com preload:false, swap e a própria variável",
    (id) => {
      const o = opcoes.find((x) => x.variable === VARIAVEL_DA_FONTE[id]);
      expect(o, `nenhuma chamada de localFont com ${VARIAVEL_DA_FONTE[id]}`).toBeDefined();
      expect(o!.preload).toBe(false);
      expect(o!.display).toBe("swap");
    },
  );

  it("serifadas mantêm o ajuste de fallback em Times New Roman; as outras não o desligam", () => {
    for (const id of FONTES_DA_MARCA.filter((f) => f !== "atkinson")) {
      const o = opcoes.find((x) => x.variable === VARIAVEL_DA_FONTE[id])!;
      if (SERIFADAS_DA_MARCA.includes(id)) expect(o.adjustFontFallback, id).toBe("Times New Roman");
      else expect(o.adjustFontFallback, id).not.toBe(false);
    }
  });

  it("os arquivos existem em app/fonts e têm a licença versionada ao lado", () => {
    for (const o of opcoes) {
      for (const f of arquivosDe(o)) {
        expect(fs.existsSync(path.join(process.cwd(), "app", f)), f).toBe(true);
      }
    }
    expect(fs.existsSync(path.join(process.cwd(), "app/fonts/OFL.txt"))).toBe(true);
  });

  it("o <html> carrega a classe de TODA variável (a classe só define a variável e o @font-face)", () => {
    for (const id of FONTES_DA_MARCA) {
      expect(classeDoHtml, id).toContain(`classe${VARIAVEL_DA_FONTE[id]}`);
    }
    expect(classeDoHtml).toContain("classe--font-mono");
  });

  it("cada fonte nova declara o intervalo de pesos que o produto usa (400–700)", () => {
    for (const id of FONTES_DA_MARCA.filter((f) => f !== "atkinson")) {
      const o = opcoes.find((x) => x.variable === VARIAVEL_DA_FONTE[id])!;
      const faixa = typeof o.weight === "string" ? o.weight.split(" ").map(Number) : [];
      expect(faixa.length, `${id} sem faixa de pesos`).toBe(2);
      expect(faixa[0]!, id).toBeLessThanOrEqual(400);
      expect(faixa[1]!, id).toBeGreaterThanOrEqual(700);
    }
  });
});
