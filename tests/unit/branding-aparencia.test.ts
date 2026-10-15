import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { marcaDaOrganizacaoDeSettings, resolverMarcaDaOrganizacao } from "@/lib/branding/organizacao";
import { REGUA_DO_PRODUTO } from "@/lib/branding/regua-do-produto";
import { camadaDaInstalacao, resolverMarca } from "@/lib/branding/resolve";
import {
  BARRAS_LATERAIS_DA_MARCA,
  DENSIDADES_DA_MARCA,
  RAIOS_DA_MARCA,
  barraLateralDeTexto,
  barraLateralEscolhida,
  densidadeDeTexto,
  densidadeEscolhida,
  raioDeTexto,
  raioEscolhido,
} from "@/lib/branding/schema";
import { marcaDaOrganizacaoSchema, platformBrandingSchema } from "@/lib/schemas/settings";

/**
 * APARENCIA DA MARCA — raio e barra lateral. Mesma regra dos neutros: vocabulario
 * fechado, precedencia por campo (organizacao > instalacao > padrao), valor fora
 * do vocabulario NUNCA lanca e nunca apaga a camada de baixo.
 */

const LIXO = ["verde", "", "PADRAO", " escura", null, undefined, 3, {}, [], true];

describe("vocabularios", () => {
  it("sao fechados e o padrao e o primeiro/historico", () => {
    expect(RAIOS_DA_MARCA).toEqual(["suave", "padrao", "arredondado"]);
    expect(BARRAS_LATERAIS_DA_MARCA).toEqual(["padrao", "escura"]);
    expect(DENSIDADES_DA_MARCA).toEqual(["aerada", "equilibrada", "compacta"]);
  });

  it("densidadeDeTexto: vocabulario passa, o resto vira aerada", () => {
    for (const v of DENSIDADES_DA_MARCA) expect(densidadeDeTexto(v)).toBe(v);
    for (const l of LIXO) expect(densidadeDeTexto(l)).toBe("aerada");
    expect(densidadeDeTexto("padrao")).toBe("aerada");
  });

  it("densidadeEscolhida devolve null para o que nao e do vocabulario", () => {
    expect(densidadeEscolhida("compacta")).toBe("compacta");
    for (const l of LIXO) expect(densidadeEscolhida(l)).toBeNull();
  });

  it("raioDeTexto: vocabulario passa, o resto vira padrao", () => {
    for (const v of RAIOS_DA_MARCA) expect(raioDeTexto(v)).toBe(v);
    for (const l of LIXO) expect(raioDeTexto(l)).toBe("padrao");
  });

  it("barraLateralDeTexto: vocabulario passa, o resto vira padrao", () => {
    for (const v of BARRAS_LATERAIS_DA_MARCA) expect(barraLateralDeTexto(v)).toBe(v);
    for (const l of LIXO) expect(barraLateralDeTexto(l)).toBe("padrao");
  });

  it("*Escolhida devolve null para o que nao e do vocabulario", () => {
    expect(raioEscolhido("suave")).toBe("suave");
    expect(barraLateralEscolhida("escura")).toBe("escura");
    for (const l of LIXO) {
      expect(raioEscolhido(l)).toBeNull();
      expect(barraLateralEscolhida(l)).toBeNull();
    }
  });
});

describe("resolverMarca — raio e barra lateral", () => {
  it("sem camada alguma: padrao, de origem padrao", () => {
    const m = resolverMarca([], REGUA_DO_PRODUTO);
    expect(m.raio).toBe("padrao");
    expect(m.barraLateral).toBe("padrao");
    expect(m.origens.raio).toBe("padrao");
    expect(m.origens.barraLateral).toBe("padrao");
    expect(m.densidade).toBe("aerada");
    expect(m.origens.densidade).toBe("padrao");
  });

  it("densidade: a instalacao escolhe; a organizacao vence; invalido herda; coluna ausente = aerada", () => {
    const inst = resolverMarca([camadaDaInstalacao({ densidade: "compacta" })], REGUA_DO_PRODUTO);
    expect(inst.densidade).toBe("compacta");
    expect(inst.origens.densidade).toBe("banco");
    const org = resolverMarcaDaOrganizacao(
      { branding: { densidade: "equilibrada" } },
      { densidade: "compacta" },
      {},
    );
    expect(org.densidade).toBe("equilibrada");
    expect(org.origens.densidade).toBe("organizacao");
    const herda = resolverMarcaDaOrganizacao(
      { branding: { densidade: "apertada" } },
      { densidade: "compacta" },
      {},
    );
    expect(herda.densidade).toBe("compacta");
    expect(resolverMarcaDaOrganizacao(null, { app_name: "X" }, {}).densidade).toBe("aerada");
    const lixo = resolverMarca([camadaDaInstalacao({ densidade: "enorme" })], REGUA_DO_PRODUTO);
    expect(lixo.densidade).toBe("aerada");
    expect(lixo.origens.densidade).toBe("padrao");
  });

  it("densidade nao mexe em raio nem neutros (campos independentes)", () => {
    const m = resolverMarcaDaOrganizacao({ branding: { densidade: "compacta" } }, { raio: "suave" }, {});
    expect(m.raio).toBe("suave");
    expect(m.origens.raio).toBe("banco");
  });

  it("a instalacao escolhe", () => {
    const m = resolverMarca(
      [camadaDaInstalacao({ raio: "suave", barra_lateral: "escura" })],
      REGUA_DO_PRODUTO,
    );
    expect(m.raio).toBe("suave");
    expect(m.barraLateral).toBe("escura");
    expect(m.origens.raio).toBe("banco");
    expect(m.origens.barraLateral).toBe("banco");
  });

  it("a organizacao vence a instalacao, campo a campo", () => {
    const m = resolverMarcaDaOrganizacao(
      { branding: { raio: "arredondado" } },
      { raio: "suave", barra_lateral: "escura" },
      {},
    );
    expect(m.raio).toBe("arredondado");
    expect(m.origens.raio).toBe("organizacao");
    expect(m.barraLateral).toBe("escura");
    expect(m.origens.barraLateral).toBe("banco");
  });

  it("valor invalido na organizacao herda a instalacao (nao lanca)", () => {
    const m = resolverMarcaDaOrganizacao(
      { branding: { raio: "quadrado", barra_lateral: 7 } },
      { raio: "suave", barra_lateral: "escura" },
      {},
    );
    expect(m.raio).toBe("suave");
    expect(m.barraLateral).toBe("escura");
  });

  it("linha da instalacao sem as colunas (codigo novo, banco antigo): padrao", () => {
    const m = resolverMarcaDaOrganizacao(null, { app_name: "X" }, {});
    expect(m.raio).toBe("padrao");
    expect(m.barraLateral).toBe("padrao");
  });

  it("valor invalido na instalacao: padrao", () => {
    const m = resolverMarca(
      [camadaDaInstalacao({ raio: "verde", barra_lateral: "azul" })],
      REGUA_DO_PRODUTO,
    );
    expect(m.raio).toBe("padrao");
    expect(m.barraLateral).toBe("padrao");
    expect(m.origens.raio).toBe("padrao");
  });

  it("settings.branding de forma errada nao derruba", () => {
    for (const settings of [null, "x", 3, [], { branding: "x" }, { branding: { raio: 7, barra_lateral: {} } }]) {
      expect(() => resolverMarcaDaOrganizacao(settings, null, {})).not.toThrow();
      expect(resolverMarcaDaOrganizacao(settings, null, {}).raio).toBe("padrao");
    }
  });

  it("raio e barra nao mexem nos neutros (campos independentes)", () => {
    const m = resolverMarcaDaOrganizacao({ branding: { raio: "suave" } }, { neutros: "frio" }, {});
    expect(m.neutros).toBe("frio");
    expect(m.origens.neutros).toBe("banco");
  });
});

describe("marcaDaOrganizacaoDeSettings — raio e barra", () => {
  it("devolve a chave so quando e do vocabulario", () => {
    const ok = marcaDaOrganizacaoDeSettings({ branding: { raio: "suave", barra_lateral: "escura" } });
    expect(ok?.raio).toBe("suave");
    expect(ok?.barra_lateral).toBe("escura");
    const ruim = marcaDaOrganizacaoDeSettings({ branding: { raio: "x", barra_lateral: 1 } }) ?? {};
    expect("raio" in ruim).toBe(false);
    expect("barra_lateral" in ruim).toBe(false);
  });

  it("densidade: so quando e do vocabulario", () => {
    expect(marcaDaOrganizacaoDeSettings({ branding: { densidade: "compacta" } })?.densidade).toBe("compacta");
    const ruim = marcaDaOrganizacaoDeSettings({ branding: { densidade: "x" } }) ?? {};
    expect("densidade" in ruim).toBe(false);
  });
});

describe("schemas — raio e barra lateral", () => {
  const inst = { app_name: null, logo_url: null, accent_hex: null, accent_dark_hex: null, show_powered_by: true };
  const org = { app_name: null, accent_hex: null, accent_dark_hex: null, neutros: null };

  it("instalacao: aceita o vocabulario, recusa o resto, ausencia = nao mexa", () => {
    expect(platformBrandingSchema.safeParse({ ...inst, raio: "suave", barra_lateral: "escura" }).success).toBe(true);
    expect(platformBrandingSchema.safeParse({ ...inst, raio: "quadrado" }).success).toBe(false);
    expect(platformBrandingSchema.safeParse({ ...inst, barra_lateral: "azul" }).success).toBe(false);
    expect(platformBrandingSchema.safeParse({ ...inst, raio: null }).success).toBe(false);
    expect(platformBrandingSchema.safeParse(inst).success).toBe(true);
  });

  it("instalacao: densidade aceita o vocabulario, recusa o resto e null", () => {
    expect(platformBrandingSchema.safeParse({ ...inst, densidade: "compacta" }).success).toBe(true);
    expect(platformBrandingSchema.safeParse({ ...inst, densidade: "padrao" }).success).toBe(false);
    expect(platformBrandingSchema.safeParse({ ...inst, densidade: null }).success).toBe(false);
  });

  it("organizacao: densidade valor, null (herde) ou ausente (nao mexa)", () => {
    expect(marcaDaOrganizacaoSchema.safeParse({ ...org, densidade: "equilibrada" }).success).toBe(true);
    expect(marcaDaOrganizacaoSchema.safeParse({ ...org, densidade: null }).success).toBe(true);
    expect(marcaDaOrganizacaoSchema.safeParse({ ...org, densidade: "apertada" }).success).toBe(false);
  });

  it("organizacao: valor, null (herde) ou ausente (nao mexa)", () => {
    expect(marcaDaOrganizacaoSchema.safeParse({ ...org, raio: "arredondado", barra_lateral: "escura" }).success).toBe(true);
    expect(marcaDaOrganizacaoSchema.safeParse({ ...org, raio: null, barra_lateral: null }).success).toBe(true);
    expect(marcaDaOrganizacaoSchema.safeParse(org).success).toBe(true);
    expect(marcaDaOrganizacaoSchema.safeParse({ ...org, raio: "quadrado" }).success).toBe(false);
    expect(marcaDaOrganizacaoSchema.safeParse({ ...org, barra_lateral: "azul" }).success).toBe(false);
  });
});

describe("globals.css — blocos do raio", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const bloco = (seletor: string): Record<string, string> => {
    const i = css.indexOf(`${seletor} {`);
    expect(i, `bloco ${seletor} ausente`).toBeGreaterThan(-1);
    const corpo = css.slice(css.indexOf("{", i) + 1, css.indexOf("}", i));
    return Object.fromEntries(
      [...corpo.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1] as string, (m[2] as string).trim()]),
    );
  };

  it("padrao e o :root de hoje (4/8/12/16)", () => {
    const raiz = bloco(":root");
    expect([raiz["--radius-sm"], raiz["--radius-md"], raiz["--radius-lg"], raiz["--radius-xl"]]).toEqual([
      "4px", "8px", "12px", "16px",
    ]);
  });

  it("suave aperta e nunca zera; arredondado folga; none e full nao se mexem", () => {
    expect(bloco(':root[data-raio="suave"]')).toEqual({
      "--radius-sm": "2px", "--radius-md": "4px", "--radius-lg": "6px", "--radius-xl": "10px",
    });
    expect(bloco(':root[data-raio="arredondado"]')).toEqual({
      "--radius-sm": "6px", "--radius-md": "12px", "--radius-lg": "16px", "--radius-xl": "24px",
    });
  });

  it("so um bloco por valor (nada mais redeclara --radius-* por cima)", () => {
    expect(css.match(/data-raio="suave"\] \{/g)).toHaveLength(1);
    expect(css.match(/data-raio="arredondado"\] \{/g)).toHaveLength(1);
  });
});
