/**
 * A DENSIDADE DA MARCA E O CSS NÃO PODEM DIVERGIR — e `aerada` não pode mudar.
 *
 * Três fontes dos mesmos números: `DENSIDADE_EM_PX` (a prévia dos formulários),
 * o `app/globals.css` (o produto de verdade) e as classes que os primitivos
 * tinham ANTES das custom properties. Esta suíte amarra as três.
 *
 * Regra de toque: `equilibrada` e `compacta` só existem sob `@media (pointer:
 * fine)`. Celular e tablet mantêm os tamanhos de `aerada` (o piso de 44px).
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DENSIDADE_EM_PX,
  DENSIDADES_DA_MARCA,
  VARIAVEIS_DA_DENSIDADE,
  estiloDaDensidade,
} from "@/lib/branding/schema";

const RAIZ = process.cwd();
const CSS = fs.readFileSync(path.join(RAIZ, "app/globals.css"), "utf8");
const lerFonte = (arquivo: string) => fs.readFileSync(path.join(RAIZ, arquivo), "utf8");
/** O código sem as linhas de comentário (os comentários explicam o `h-10` que saiu). */
const semComentarios = (arquivo: string) =>
  lerFonte(arquivo)
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");

/** O corpo (`{ ... }`) que começa no `{` de `abre`, já com chaves casadas. */
function corpoDe(texto: string, abre: number): string {
  let fundo = 0;
  for (let i = abre; i < texto.length; i++) {
    if (texto[i] === "{") fundo++;
    else if (texto[i] === "}" && --fundo === 0) return texto.slice(abre + 1, i);
  }
  throw new Error("bloco sem fechamento");
}

function propriedades(corpo: string): Record<string, number> {
  return Object.fromEntries(
    [...corpo.matchAll(/(--[a-z-]+)\s*:\s*(\d+)px/g)].map((m) => [m[1] as string, Number(m[2])]),
  );
}

/** Só as variáveis da densidade, do bloco cujo seletor é `seletor`. */
function valoresDoBloco(escopo: string, seletor: string): Record<string, number> {
  const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^\\s*${escapado}\\s*\\{`, "m").exec(escopo);
  if (!m) throw new Error(`bloco ${seletor} não achado`);
  const todas = propriedades(corpoDe(escopo, m.index + m[0].length - 1));
  const nomes: string[] = Object.values(VARIAVEIS_DA_DENSIDADE);
  return Object.fromEntries(Object.entries(todas).filter(([k]) => nomes.includes(k)));
}

function emPx(densidade: (typeof DENSIDADES_DA_MARCA)[number]): Record<string, number> {
  return Object.fromEntries(
    (Object.keys(VARIAVEIS_DA_DENSIDADE) as (keyof typeof VARIAVEIS_DA_DENSIDADE)[]).map((k) => [
      VARIAVEIS_DA_DENSIDADE[k],
      DENSIDADE_EM_PX[densidade][k],
    ]),
  );
}

/** Os blocos `@media (pointer: fine) { ... }` do arquivo, em texto. */
function blocosPointerFine(): string[] {
  return [...CSS.matchAll(/@media\s*\(\s*pointer\s*:\s*fine\s*\)\s*\{/g)].map((m) =>
    corpoDe(CSS, m.index + m[0].length - 1),
  );
}

describe("DENSIDADE_EM_PX × globals.css", () => {
  it("cobre todo o vocabulário", () => {
    expect(Object.keys(DENSIDADE_EM_PX).sort()).toEqual([...DENSIDADES_DA_MARCA].sort());
  });

  it("aerada = o :root", () => {
    expect(valoresDoBloco(CSS, ":root")).toEqual(emPx("aerada"));
  });

  it.each(["equilibrada", "compacta"] as const)("%s = o bloco :root[data-densidade]", (d) => {
    const dentro = blocosPointerFine().join("\n");
    expect(valoresDoBloco(dentro, `:root[data-densidade="${d}"]`)).toEqual(emPx(d));
  });

  it("estiloDaDensidade devolve as custom properties em px", () => {
    expect(estiloDaDensidade("compacta")).toEqual(
      Object.fromEntries(
        Object.entries(emPx("compacta")).map(([k, v]) => [k, `${v}px`]),
      ),
    );
  });

  it("a escala só aperta: aerada >= equilibrada >= compacta em toda variável", () => {
    for (const k of Object.keys(VARIAVEIS_DA_DENSIDADE) as (keyof typeof VARIAVEIS_DA_DENSIDADE)[]) {
      expect(DENSIDADE_EM_PX.aerada[k]).toBeGreaterThan(DENSIDADE_EM_PX.equilibrada[k]);
      expect(DENSIDADE_EM_PX.equilibrada[k]).toBeGreaterThan(DENSIDADE_EM_PX.compacta[k]);
    }
  });
});

describe("regra de toque", () => {
  it("TODO override de densidade mora dentro de @media (pointer: fine)", () => {
    const todas = CSS.match(/data-densidade=/g) ?? [];
    expect(todas.length, "os dois blocos de override").toBe(2);
    const dentro = blocosPointerFine().join("\n").match(/data-densidade=/g) ?? [];
    expect(dentro.length, "overrides fora do @media (pointer: fine)").toBe(todas.length);
  });

  it("um bloco por valor, e nenhum seletor `aerada` (aerada é o :root)", () => {
    expect(CSS.match(/data-densidade="equilibrada"\]\s*\{/g)).toHaveLength(1);
    expect(CSS.match(/data-densidade="compacta"\]\s*\{/g)).toHaveLength(1);
    expect(CSS).not.toMatch(/data-densidade="aerada"/);
  });

  it("os overrides vêm depois dos blocos do raio (a cascata do arquivo)", () => {
    expect(CSS.indexOf('data-densidade="equilibrada"')).toBeGreaterThan(
      CSS.indexOf('data-raio="arredondado"'),
    );
  });
});

/**
 * O PISO DE `aerada`: o valor de cada variável no `:root` é o PIXEL que a classe
 * original dos primitivos tinha. Trocar `lg:h-9` por `lg:h-(--controle-h)` só é
 * "byte-identical" enquanto `--controle-h` for 36px. Os números à esquerda vêm
 * das classes ANTES da troca (Tailwind: h-9 = 36px, h-8 = 32px, h-10 = 40px,
 * p-2 = 8px, py-1 = 4px); mudar um default aqui exige mudar o visual de todo mundo.
 */
describe("aerada não deriva do que os primitivos tinham", () => {
  it("os defaults do :root são os pixels das classes originais", () => {
    expect(valoresDoBloco(CSS, ":root")).toEqual({
      "--controle-h": 36, //     button default/md/icon `lg:h-9` · select `h-9`
      "--controle-h-sm": 32, //  button sm `lg:h-8`
      "--campo-h": 40, //        input `h-10`
      "--linha-h": 40, //        table head `h-10`
      "--linha-py": 8, //        table cell `p-2`
      "--nav-py": 4, //          sidebar item `py-1`
    });
  });
});

describe("os primitivos consomem as variáveis (e não o pixel solto)", () => {
  const consome = (arquivo: string, trecho: string) =>
    expect(lerFonte(arquivo), `${arquivo} deveria conter ${trecho}`).toContain(trecho);

  it("button", () => {
    consome("components/ui/button.tsx", "lg:h-(--controle-h-sm)");
    consome("components/ui/button.tsx", "lg:h-(--controle-h)");
    consome("components/ui/button.tsx", "lg:w-(--controle-h)");
    expect(semComentarios("components/ui/button.tsx")).not.toMatch(/lg:(h|w)-[89]\b/);
  });

  it("input e select", () => {
    consome("components/ui/input.tsx", "h-(--campo-h)");
    consome("components/ui/select.tsx", "h-(--controle-h)");
    expect(semComentarios("components/ui/input.tsx")).not.toMatch(/\bh-10\b/);
    expect(semComentarios("components/ui/select.tsx")).not.toMatch(/\bh-9\b[^"]*min-h-11/);
  });

  it("table", () => {
    consome("components/ui/table.tsx", "h-(--linha-h)");
    consome("components/ui/table.tsx", "py-(--linha-py)");
  });

  it("sidebar", () => {
    consome("components/shell/Sidebar.tsx", "py-(--nav-py)");
  });
});
