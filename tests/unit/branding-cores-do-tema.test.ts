import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { extrairCoresPadrao, extrairRegua, PISOS } from "@/lib/branding/contraste";
import { CORES_PADRAO } from "@/lib/branding/cores-padrao";
import {
  conferirCores,
  empilharCores,
  PARES_DAS_CORES,
  reguaComCores,
  valoresEfetivos,
} from "@/lib/branding/cores-do-tema";
import { frasesDasReprovas } from "@/lib/branding/linguagem";
import { reguaDoProduto } from "@/lib/branding/regua-do-produto";
import {
  coresDoTemaEscolhidas,
  esquemaDasCoresDoTema,
  NEUTROS_DA_MARCA,
  TOKENS_DE_COR_DO_TEMA,
} from "@/lib/branding/schema";

/**
 * As cores do tema editáveis (decisão do dono do produto, 2026-10-15) e a TRAVA
 * de contraste que as guarda.
 *
 * A trava é a única coisa entre "liberdade de escolher o fundo" e "um texto que
 * ninguém lê". Por isso este arquivo prova as duas direções: (1) o produto SEM
 * cores passa em todos os pares que a trava mede — senão ela bloquearia o
 * próprio padrão, e o dono veria "Salvar" travado sem ter mexido em nada; (2) uma
 * cor ruim reprova, com o par, o tema, a razão e o piso.
 */

const CSS = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

/** A mesma fixture adversarial de `branding-pares-pintados.test.ts`. */
const SEMENTES = [
  "#0f172a", "#f5c518", "#ffffff", "#000000", "#808080", "#dc2626", "#22c55e",
  "#f59e0b", "#2563eb", "#14b8a6", "#4b0082", "#e11d48", "#7c3aed", "#1a1f36",
  "#fafafa", "#506d48",
] as const;

describe("a allowlist é a do globals.css", () => {
  it("todo token editável existe nos dois temas de todo preset — e nenhum é inventado", () => {
    for (const neutros of NEUTROS_DA_MARCA) {
      const extraido = extrairCoresPadrao(CSS, neutros);
      for (const tema of ["claro", "escuro"] as const) {
        expect(Object.keys(extraido[tema]).sort(), `${neutros}/${tema}`).toEqual(
          [...TOKENS_DE_COR_DO_TEMA].sort(),
        );
      }
    }
  });

  it("os padrões congelados são o globals.css (gerado, não escrito à mão)", () => {
    for (const neutros of NEUTROS_DA_MARCA) {
      expect(
        CORES_PADRAO[neutros],
        `CORES_PADRAO.${neutros} divergiu do globals.css; literal certo:\n` +
          JSON.stringify(extrairCoresPadrao(CSS, neutros), null, 2),
      ).toEqual(extrairCoresPadrao(CSS, neutros));
    }
  });
});

describe("a trava não bloqueia o próprio produto", () => {
  it.each(NEUTROS_DA_MARCA)("neutros %s, sem cores e sem marca: todos os pares passam", (neutros) => {
    const r = conferirCores({ regua: reguaDoProduto(neutros), neutros, cores: {}, sementes: { claro: null, escuro: null } });
    // Vacuidade: uma trava que medisse zero pares passaria sempre.
    expect(r.pares).toBeGreaterThanOrEqual(60);
    expect(r.reprovas).toEqual([]);
    expect(r.passa).toBe(true);
  });

  it.each(SEMENTES)("semente %s sobre o produto: a caminhada segue cabendo", (hex) => {
    const r = conferirCores({
      regua: reguaDoProduto("quente"),
      neutros: "quente",
      cores: {},
      sementes: { claro: hex, escuro: hex },
    });
    expect(r.reprovas).toEqual([]);
  });

  it("cada par medido tem piso de texto ou de componente — nada inventado", () => {
    for (const par of PARES_DAS_CORES) {
      expect([PISOS.texto, PISOS.componente]).toContain(PISOS[par.tipo]);
    }
  });
});

describe("a trava reprova o que não se lê", () => {
  it("texto secundário apagado sobre o cartão no escuro: nomeia par, tema, razão e piso", () => {
    const r = conferirCores({
      regua: reguaDoProduto("quente"),
      neutros: "quente",
      cores: { escuro: { "text-muted": "#4a4840" } },
      sementes: { claro: null, escuro: null },
    });
    expect(r.passa).toBe(false);
    const par = r.reprovas.find(
      (p) => p.papel === "--color-text-muted" && p.superficie === "--color-surface",
    );
    expect(par).toBeDefined();
    expect(par?.tema).toBe("escuro");
    expect(par?.piso).toBe(PISOS.texto);
    expect(par?.razao).toBeLessThan(PISOS.texto);
    // O claro não foi tocado e não pode aparecer na lista.
    expect(r.reprovas.every((p) => p.tema === "escuro")).toBe(true);
  });

  it("fundo novo que derruba a cor do produto (sem marca) reprova o papel da marca", () => {
    // Sem semente não há caminhada: a escala do produto pinta no grau fixo, e um
    // fundo verde-médio a engole.
    const r = conferirCores({
      regua: reguaDoProduto("quente"),
      neutros: "quente",
      cores: { claro: { bg: "#6f8a66" } },
      sementes: { claro: null, escuro: null },
    });
    expect(r.reprovas.some((p) => p.papel === "--color-accent" && p.superficie === "--color-bg")).toBe(
      true,
    );
  });

  it("com marca, a caminhada é refeita SOBRE o fundo novo", () => {
    const regua = reguaDoProduto("quente");
    const comFundoEscuro = reguaComCores(regua, { claro: { bg: "#d8d2c4", surface: "#e9e4d8" } });
    expect(comFundoEscuro.claro.base.find((b) => b.chave === "--color-bg")?.hex).toBe("#d8d2c4");
    // Cores que não mexem em superfície devolvem A MESMA régua (identidade =
    // cache da derivação preservado, e saída byte a byte igual à de antes).
    expect(reguaComCores(regua, { claro: { text: "#000000" } })).toBe(regua);
    expect(reguaComCores(regua, {})).toBe(regua);
  });

  it("a semântica: texto de aviso sobre o próprio fundo de aviso", () => {
    const r = conferirCores({
      regua: reguaDoProduto("quente"),
      neutros: "quente",
      cores: { claro: { "warning-bg": "#b07a2b" } },
      sementes: { claro: null, escuro: null },
    });
    expect(
      r.reprovas.some((p) => p.papel === "--color-warning-fg" && p.superficie.startsWith("--color-warning-bg")),
    ).toBe(true);
  });
});

describe("precedência por token", () => {
  it("a camada de cima vence token a token; o que ela não define desce", () => {
    const pilha = empilharCores(
      { claro: { bg: "#ffffff" } },
      { claro: { bg: "#eeeeee", text: "#111111" }, escuro: { surface: "#222222" } },
    );
    expect(pilha).toEqual({
      claro: { bg: "#ffffff", text: "#111111" },
      escuro: { surface: "#222222" },
    });
  });

  it("os valores efetivos caem no preset de neutros quando ninguém definiu", () => {
    const v = valoresEfetivos("frio", { escuro: { bg: "#000000" } });
    expect(v.escuro.bg).toBe("#000000");
    expect(v.claro.bg).toBe("#f5faff");
    expect(v.escuro.surface).toBe("#191c21");
  });
});

describe("a forma gravada", () => {
  it("o esquema aceita só a allowlist, só #rrggbb minúsculo", () => {
    expect(esquemaDasCoresDoTema.safeParse({ claro: { bg: "#ffffff" } }).success).toBe(true);
    expect(esquemaDasCoresDoTema.safeParse({ claro: { bg: "#FFFFFF" } }).success).toBe(false);
    expect(esquemaDasCoresDoTema.safeParse({ claro: { bg: "#fff" } }).success).toBe(false);
    expect(esquemaDasCoresDoTema.safeParse({ claro: { "accent": "#ffffff" } }).success).toBe(false);
    expect(esquemaDasCoresDoTema.safeParse({ sepia: { bg: "#ffffff" } }).success).toBe(false);
    expect(esquemaDasCoresDoTema.safeParse({ claro: { bg: "#ffffff; } body {" } }).success).toBe(false);
  });

  it("a leitura defensiva nunca lança e descarta o que não entende", () => {
    expect(coresDoTemaEscolhidas(null)).toBeNull();
    expect(coresDoTemaEscolhidas("x")).toBeNull();
    expect(coresDoTemaEscolhidas([])).toBeNull();
    expect(coresDoTemaEscolhidas({})).toBeNull();
    expect(
      coresDoTemaEscolhidas({ claro: { bg: "#ffffff", accent: "#000000", text: "#FFF", border: 3 }, x: 1 }),
    ).toEqual({ claro: { bg: "#ffffff" } });
  });
});

describe("a frase da reprova", () => {
  const PROIBIDO =
    /\boklch\b|\brampa\b|\bstop\b|ΔE|\bwcag\b|\btoken\b|\bcss\b|var\(--|\baccent\b|\bhex\b|allowlist|serializ|acrom[áa]t|dicromac|#[0-9a-f]{3,6}|--color/i;

  it("nomeia o par em português, o tema, a razão com vírgula e o que ajustar", () => {
    const [frase] = frasesDasReprovas([
      { papel: "--color-text-muted", superficie: "--color-surface", tema: "escuro", razao: 3.14, piso: 4.5 },
    ]);
    expect(frase).toBe(
      "Texto secundário sobre Cartões (tema escuro): 3,1 de 4,5 — clareie texto secundário ou escureça cartões.",
    );
  });

  it("nenhuma frase vaza jargão nem código de cor, para nenhum par medido", () => {
    const reprovas = PARES_DAS_CORES.flatMap((par) =>
      (["claro", "escuro"] as const).map((tema) => ({
        papel: par.papel,
        superficie: "--color-accent-soft@--color-surface-elevated",
        tema,
        razao: 1.234,
        piso: PISOS[par.tipo],
      })),
    );
    for (const frase of frasesDasReprovas(reprovas)) expect(frase).not.toMatch(PROIBIDO);
    // E os papéis da marca, que vêm da régua com nome de seletor.
    const daMarca = extrairRegua(CSS).claro.papeis.map((p) => ({
      papel: p.token,
      superficie: "--color-bg",
      tema: "claro" as const,
      razao: 2,
      piso: PISOS[p.tipo],
    }));
    for (const frase of frasesDasReprovas(daMarca)) expect(frase).not.toMatch(PROIBIDO);
  });
});
