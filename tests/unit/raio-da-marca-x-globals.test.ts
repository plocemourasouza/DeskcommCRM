/**
 * O MAPA DO RAIO E O CSS NÃO PODEM DIVERGIR.
 *
 * `RAIO_EM_PX` alimenta a prévia do formulário (custom properties inline); o
 * `app/globals.css` alimenta o produto de verdade (`:root` e
 * `:root[data-raio=...]`). Duas fontes dos mesmos quatro números: a que
 * divergisse faria a prévia prometer um canto que o sistema não desenha.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RAIO_EM_PX, RAIOS_DA_MARCA, estiloDoRaio } from "@/lib/branding/schema";

const CSS = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

function valoresDoBloco(seletor: string): Record<string, number> {
  const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^${escapado}\\s*\\{([^}]*)\\}`, "m").exec(CSS);
  if (!m) throw new Error(`bloco ${seletor} não achado em globals.css`);
  const saida: Record<string, number> = {};
  for (const [, nome, px] of (m[1] ?? "").matchAll(/--radius-(sm|md|lg|xl)\s*:\s*(\d+)px/g)) {
    if (nome && px) saida[nome] = Number(px);
  }
  return saida;
}

describe("RAIO_EM_PX × globals.css", () => {
  it("cobre todo o vocabulário", () => {
    expect(Object.keys(RAIO_EM_PX).sort()).toEqual([...RAIOS_DA_MARCA].sort());
  });

  it("padrao = o :root", () => {
    expect(valoresDoBloco(":root")).toEqual(RAIO_EM_PX.padrao);
  });

  it.each(["suave", "arredondado"] as const)("%s = o bloco :root[data-raio]", (raio) => {
    expect(valoresDoBloco(`:root[data-raio="${raio}"]`)).toEqual(RAIO_EM_PX[raio]);
  });

  it("estiloDoRaio devolve as quatro custom properties em px", () => {
    expect(estiloDoRaio("suave")).toEqual({
      "--radius-sm": "2px",
      "--radius-md": "4px",
      "--radius-lg": "6px",
      "--radius-xl": "10px",
    });
  });
});
