/**
 * A FONTE DA MARCA E O CSS NÃO PODEM DIVERGIR — e a Atkinson não pode mudar.
 *
 * `app/globals.css` decide qual família o produto usa por UMA custom property,
 * `--font-ui`. O `:root` a define como a pilha de hoje (Atkinson) e cada fonte
 * escolhível a redefine em `:root[data-fonte="<id>"]`. Esta suíte amarra o CSS
 * ao vocabulário de `lib/branding/schema.ts`, que é de onde a prévia dos
 * formulários tira as mesmas pilhas.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  FONTES_DA_MARCA,
  SERIFADAS_DA_MARCA,
  VARIAVEL_DA_FONTE,
  estiloDaFonte,
  pilhaDaFonte,
} from "@/lib/branding/schema";

const CSS = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

/**
 * A pilha que o produto tinha ANTES de existir `--font-ui`: o `font-family` do
 * `body`, literal. É a régua independente do schema — se `pilhaDaFonte` e o
 * `:root` mudassem juntos, só este literal acusaria que o padrão deixou de ser
 * o de hoje.
 */
const PILHA_DE_HOJE =
  'var(--font-atkinson), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const compacta = (texto: string) => texto.replace(/\s+/g, " ").replace(/,\s*/g, ", ").trim();

/** O corpo `{ ... }` que começa no seletor `seletor` (ancorado em início de linha). */
function bloco(seletor: string): string {
  const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^\\s*${escapado}\\s*\\{`, "m").exec(CSS);
  if (!m) throw new Error(`bloco ${seletor} não achado em globals.css`);
  const abre = m.index + m[0].length - 1;
  let fundo = 0;
  for (let i = abre; i < CSS.length; i++) {
    if (CSS[i] === "{") fundo++;
    else if (CSS[i] === "}" && --fundo === 0) return CSS.slice(abre + 1, i);
  }
  throw new Error(`bloco ${seletor} sem fechamento`);
}

function fontUi(corpo: string): string {
  const m = /--font-ui\s*:\s*([^;]+);/.exec(corpo);
  if (!m) throw new Error("--font-ui não declarada no bloco");
  return compacta(m[1] as string);
}

describe("--font-ui × schema × globals.css", () => {
  it("o :root declara o padrão IDÊNTICO à pilha de hoje (Atkinson)", () => {
    expect(fontUi(bloco(":root"))).toBe(compacta(PILHA_DE_HOJE));
    expect(pilhaDaFonte("atkinson")).toBe(compacta(PILHA_DE_HOJE));
  });

  it("o padrão não tem bloco de atributo: Atkinson é a AUSÊNCIA de data-fonte", () => {
    expect(CSS).not.toMatch(/:root\[data-fonte="atkinson"\]/);
  });

  it.each(FONTES_DA_MARCA.filter((f) => f !== "atkinson"))(
    "%s: existe :root[data-fonte] e a pilha é a do schema",
    (id) => {
      const corpo = bloco(`:root[data-fonte="${id}"]`);
      expect(fontUi(corpo)).toBe(pilhaDaFonte(id));
      expect(fontUi(corpo)).toContain(`var(${VARIAVEL_DA_FONTE[id]})`);
    },
  );

  it("nenhum bloco de data-fonte além do vocabulário", () => {
    // Só BLOCOS (seletor no início da linha, seguido de `{`): os comentários do CSS citam o padrão.
    const achados = [...CSS.matchAll(/^:root\[data-fonte="([^"]+)"\]\s*\{/gm)].map((m) => m[1] as string);
    expect([...new Set(achados)].sort()).toEqual(FONTES_DA_MARCA.filter((f) => f !== "atkinson").sort());
  });

  it("serifadas fecham a pilha em serif; as demais em sans-serif", () => {
    for (const id of FONTES_DA_MARCA) {
      const pilha = pilhaDaFonte(id);
      if (SERIFADAS_DA_MARCA.includes(id)) {
        expect(pilha, id).toMatch(/, serif$/);
        expect(pilha, id).not.toContain("sans-serif");
      } else {
        expect(pilha, id).toMatch(/, sans-serif$/);
      }
    }
  });

  it("o body e o --font-sans do Tailwind leem --font-ui (um lugar só decide a família)", () => {
    expect(compacta(bloco("@theme inline"))).toMatch(/--font-sans:\s*var\(--font-ui\)/);
    const body = /^\s*body\s*\{/m.exec(CSS);
    expect(body, "bloco body não achado").not.toBeNull();
    expect(compacta(bloco("body"))).toMatch(/font-family:\s*var\(--font-ui\)/);
  });

  it("a prévia põe a pilha da escolha em --font-ui inline", () => {
    for (const id of FONTES_DA_MARCA) {
      expect(estiloDaFonte(id)).toEqual({ "--font-ui": pilhaDaFonte(id) });
    }
  });

  it("toda variável de fonte é distinta e a da Atkinson segue sendo --font-atkinson", () => {
    expect(VARIAVEL_DA_FONTE.atkinson).toBe("--font-atkinson");
    expect(new Set(Object.values(VARIAVEL_DA_FONTE)).size).toBe(FONTES_DA_MARCA.length);
  });
});
