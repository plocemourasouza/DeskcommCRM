import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { extrairRegua, razaoDeContraste } from "@/lib/branding/contraste";
import { cssDaMarca, ESCOPO_DA_INSTALACAO, ESCOPO_DA_ORGANIZACAO } from "@/lib/branding/css";
import { GRAUS, normalizarHex } from "@/lib/branding/rampa";
import { REGUA_DO_PRODUTO } from "@/lib/branding/regua-do-produto";
import { camadaDoAmbiente, resolverMarca, type CorResolvida } from "@/lib/branding/resolve";

/**
 * BARRA LATERAL ESCURA — as duas lacunas que `data-theme="dark"` na barra abre.
 *
 * A barra escura é um `[data-theme="dark"]` DENTRO de uma página clara. O bloco
 * escuro do `globals.css` casa por atributo em qualquer elemento, mas:
 *
 *  1. o CSS da marca só emitia o bloco escuro keyed no `<html>`; a subárvore
 *     receberia o mapeamento genérico do globals aplicado à rampa CLARA da marca,
 *     ignorando a rampa deslocada e a segunda semente (`corEscura`);
 *  2. os neutros `cinza`/`frio` escuros eram compound no `<html>` só.
 */

const REGUA = extrairRegua(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"));

const SEMENTES = [
  "#0f172a", "#f5c518", "#ffffff", "#000000", "#808080", "#dc2626", "#22c55e", "#f59e0b",
  "#2563eb", "#14b8a6", "#4b0082", "#e11d48", "#7c3aed", "#1a1f36", "#fafafa", "#506d48",
] as const;

const SUBARVORE = {
  instalacao: ':root:root [data-theme="dark"]',
  organizacao: ':root:root body:has([data-marca-org]) [data-theme="dark"]',
} as const;

const ESCOPOS = {
  instalacao: ESCOPO_DA_INSTALACAO,
  organizacao: ESCOPO_DA_ORGANIZACAO,
} as const;

type Bloco = Readonly<Record<string, string>>;

function lerBlocos(css: string): Record<string, Bloco> {
  const saida: Record<string, Bloco> = {};
  for (const bruto of css.split("}")) {
    const abre = bruto.indexOf("{");
    if (abre === -1) continue;
    const decls: Record<string, string> = {};
    for (const linha of bruto.slice(abre + 1).split(";")) {
      const corte = linha.indexOf(":");
      if (corte === -1) continue;
      decls[linha.slice(0, corte).trim()] = linha.slice(corte + 1).trim();
    }
    saida[bruto.slice(0, abre).trim()] = decls;
  }
  return saida;
}

function corDe(hex: string, escura?: string): CorResolvida {
  const env: Record<string, string> = { APP_ACCENT_HEX: hex };
  if (escura) env.APP_ACCENT_DARK_HEX = escura;
  const cor = resolverMarca([camadaDoAmbiente(env)], REGUA_DO_PRODUTO).cor;
  if (!cor) throw new Error(`fixture ${hex} não resolveu`);
  return cor;
}

/** `--color-accent` e `--color-accent-fg` → hex, seguindo `var(--color-accent-NNN)`. */
function hexDe(bloco: Bloco, token: string): string {
  const valor = bloco[token];
  if (valor === undefined) throw new Error(`${token} ausente`);
  const m = /^var\((--[a-z0-9-]+)\)$/.exec(valor);
  return normalizarHex(m?.[1] ? (bloco[m[1]] ?? "") : valor);
}

describe.each(["instalacao", "organizacao"] as const)("subárvore escura — escopo da %s", (nome) => {
  const seletor = SUBARVORE[nome];
  const escopo = ESCOPOS[nome];

  it("o escopo emite o bloco escuro também para a subárvore [data-theme=dark]", () => {
    const { css } = cssDaMarca(corDe("#2563eb"), escopo);
    expect(Object.keys(lerBlocos(css ?? ""))).toContain(seletor);
    expect(escopo.map(([s]) => s as string)).toContain(seletor);
  });

  it.each(SEMENTES)("%s: a subárvore declara EXATAMENTE o que o bloco escuro do escopo declara", (hex) => {
    const blocos = lerBlocos(cssDaMarca(corDe(hex), escopo).css ?? "");
    const escuroDoEscopo = escopo[1][0];
    expect(blocos[seletor], hex).toBeDefined();
    expect(blocos[seletor]).toEqual(blocos[escuroDoEscopo]);
  });

  it("com segunda semente, a subárvore usa a rampa ESCURA da marca, não a clara deslocada", () => {
    const blocos = lerBlocos(cssDaMarca(corDe("#1c261d", "#d9ac62"), escopo).css ?? "");
    const claro = blocos[escopo[0][0]] ?? {};
    const sub = blocos[seletor] ?? {};
    expect(sub["--color-accent"]).toBeDefined();
    expect(sub["--color-accent"]).not.toBe(claro["--color-accent"]);
    expect(hexDe(sub, "--color-accent")).not.toBe(hexDe(claro, "--color-accent"));
  });

  it.each(SEMENTES)("%s: o item ativo (accent × accent-fg) da subárvore cumpre 4,5:1", (hex) => {
    const sub = lerBlocos(cssDaMarca(corDe(hex), escopo).css ?? "")[seletor] ?? {};
    const razao = razaoDeContraste(hexDe(sub, "--color-accent"), hexDe(sub, "--color-accent-fg"));
    // Marcas acromáticas não pintam accent: nesse caso o bloco só tem --color-brand.
    if (sub["--color-accent"] === undefined) return;
    expect(razao, hex).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SEMENTES)("%s: nunca pinta superfície; 11 paradas; --color-accent É o stop do papel", (hex) => {
    const sub = lerBlocos(cssDaMarca(corDe(hex), escopo).css ?? "")[seletor] ?? {};
    for (const proibido of ["--color-bg", "--color-surface", "--color-surface-elevated"]) {
      expect(sub[proibido], `${hex} ${proibido}`).toBeUndefined();
    }
    if (sub["--color-accent"] === undefined) return;
    for (const grau of GRAUS) expect(sub[`--color-accent-${grau}`], `${hex} ${grau}`).toBeDefined();
    expect(sub["--color-accent"]).toBe(sub[`--color-accent-${GRAUS[REGUA.escuro.indices.accent]}`]);
  });
});

describe("a instalação e a organização nunca disputam a subárvore", () => {
  /** Especificidade (a,b,c) calculada à mão para estes seletores. */
  const espec = (s: string): [number, number, number] => {
    const attrs = (s.match(/\[[^\]]+\]/g) ?? []).length;
    const pseudo = (s.match(/:(root|has)/g) ?? []).length;
    const tipos = /(^|\s)body\b/.test(s) ? 1 : 0;
    return [0, attrs + pseudo, tipos];
  };
  const maior = (a: number[], b: number[]) => a[1]! - b[1]! || a[2]! - b[2]!;

  it("a organização vence a instalação no mesmo elemento", () => {
    expect(maior(espec(SUBARVORE.organizacao), espec(SUBARVORE.instalacao))).toBeGreaterThan(0);
  });

  it("ambas vencem o [data-theme=dark] do globals.css (0,1,0)", () => {
    for (const s of Object.values(SUBARVORE)) expect(espec(s)[1]).toBeGreaterThan(1);
  });
});

describe("neutros escuros na subárvore (globals.css)", () => {
  const CSS = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
  it.each(["cinza", "frio"] as const)("%s: existe a forma descendente [data-neutros] [data-theme=dark]", (n) => {
    const seletores = [...CSS.matchAll(/^([^{}\n]*\[data-neutros="[a-z]+"\][^{}\n]*)\{/gm)].map((m) => m[1]!);
    const escuro = seletores.filter((s) => s.includes(`[data-neutros="${n}"]`) && s.includes('"dark"'));
    expect(escuro.some((s) => s.includes(`[data-neutros="${n}"] [data-theme="dark"]`)), n).toBe(true);
    // O compound original continua (a página escura inteira).
    expect(escuro.some((s) => s.includes(`[data-theme="dark"][data-neutros="${n}"]`)), n).toBe(true);
  });

  it.each(["cinza", "frio"] as const)("%s: a forma descendente declara exatamente o que o compound declara", (n) => {
    const corpo = (sel: string) => {
      const i = CSS.indexOf(`\n${sel} {`);
      expect(i, sel).toBeGreaterThan(-1);
      return CSS.slice(i, CSS.indexOf("\n}", i)).split("{")[1];
    };
    expect(corpo(`[data-neutros="${n}"] [data-theme="dark"]`)).toBe(
      corpo(`[data-theme="dark"][data-neutros="${n}"]`),
    );
  });
});
