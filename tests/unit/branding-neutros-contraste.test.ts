import { describe, expect, it } from "vitest";

import { aprovarContrasteNosNeutros } from "@/lib/branding/neutros";
import { REGUA_DO_PRODUTO, reguaDoProduto } from "@/lib/branding/regua-do-produto";
import type { Regua } from "@/lib/branding/contraste";

/**
 * A REGUA BLOQUEIA O SALVAR quando a cor da marca nao tem contraste possivel
 * sobre os neutros escolhidos. Nos presets reais nenhuma semente falha (medido
 * em branding-contraste.test.ts); o controle abaixo sabota a regua para provar
 * que o bloqueio existe e que a mensagem nomeia o tema.
 */

/** Superficies e neutros todos no mesmo cinza medio: nenhum accent alcanca o piso. */
function reguaSemSaida(): Regua {
  const base = REGUA_DO_PRODUTO;
  const medio = "#808080";
  const sabotar = (t: Regua["claro"]): Regua["claro"] => ({
    ...t,
    base: t.base.map((b) => ({ ...b, hex: medio })),
    neutros: t.neutros.map(() => medio) as unknown as Regua["claro"]["neutros"],
  });
  return { ...base, claro: sabotar(base.claro), escuro: sabotar(base.escuro) };
}

describe("aprovarContrasteNosNeutros", () => {
  it("sem cor nenhuma, aprova (nada a medir)", () => {
    expect(aprovarContrasteNosNeutros({ accent: null, accentEscuro: null, neutros: "frio" })).toEqual({ ok: true });
  });

  it("as sementes reais passam nos tres presets", () => {
    for (const neutros of ["quente", "cinza", "frio"] as const) {
      for (const accent of ["#2563eb", "#f5c518", "#7a5cd6", "#0f766e", "#e11d48"]) {
        expect(aprovarContrasteNosNeutros({ accent, accentEscuro: null, neutros }), `${neutros}/${accent}`).toEqual({
          ok: true,
        });
      }
    }
  });

  it("regua sem saida: reprova e nomeia o tema", () => {
    const r = aprovarContrasteNosNeutros(
      { accent: "#2563eb", accentEscuro: null, neutros: "cinza" },
      reguaSemSaida(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.temas.length).toBeGreaterThan(0);
  });

  it("usa a regua do preset escolhido por padrao", () => {
    expect(reguaDoProduto("frio")).not.toBe(REGUA_DO_PRODUTO);
  });
});
