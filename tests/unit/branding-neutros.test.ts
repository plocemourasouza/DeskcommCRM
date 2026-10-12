import { describe, expect, it } from "vitest";

import { marcaDaOrganizacaoDeSettings, resolverMarcaDaOrganizacao } from "@/lib/branding/organizacao";
import { REGUA_DO_PRODUTO } from "@/lib/branding/regua-do-produto";
import { camadaDaInstalacao, resolverMarca } from "@/lib/branding/resolve";
import { neutrosDeTexto } from "@/lib/branding/schema";
import { marcaDaOrganizacaoSchema, platformBrandingSchema } from "@/lib/schemas/settings";

/**
 * NEUTROS DA MARCA — resolucao, heranca e o formato aceito pelos schemas.
 *
 * Precedencia por campo: a organizacao que escolheu vence a instalacao; a que
 * nao escolheu HERDA. Valor desconhecido (versao futura, jsonb escrito a mao)
 * degrada para `quente` e nunca lanca — isto roda no layout que embrulha o produto.
 */

describe("neutrosDeTexto — nunca lanca, degrada para quente", () => {
  it("aceita o vocabulario fechado", () => {
    expect(neutrosDeTexto("quente")).toBe("quente");
    expect(neutrosDeTexto("cinza")).toBe("cinza");
    expect(neutrosDeTexto("frio")).toBe("frio");
  });

  it("qualquer outra coisa vira quente", () => {
    for (const lixo of ["verde", "", "FRIO", " frio", null, undefined, 3, {}, [], true]) {
      expect(neutrosDeTexto(lixo)).toBe("quente");
    }
  });
});

describe("resolverMarca — neutros", () => {
  it("sem camada alguma, e quente e de origem padrao", () => {
    const m = resolverMarca([], REGUA_DO_PRODUTO);
    expect(m.neutros).toBe("quente");
    expect(m.origens.neutros).toBe("padrao");
  });

  it("a instalacao escolhe", () => {
    const m = resolverMarca([camadaDaInstalacao({ neutros: "cinza" })], REGUA_DO_PRODUTO);
    expect(m.neutros).toBe("cinza");
    expect(m.origens.neutros).toBe("banco");
  });

  it("a organizacao vence a instalacao", () => {
    const m = resolverMarcaDaOrganizacao(
      { branding: { neutros: "frio" } },
      { neutros: "cinza" },
      {},
    );
    expect(m.neutros).toBe("frio");
    expect(m.origens.neutros).toBe("organizacao");
  });

  it("a organizacao sem escolha herda da instalacao", () => {
    const m = resolverMarcaDaOrganizacao({ branding: { app_name: "X" } }, { neutros: "frio" }, {});
    expect(m.neutros).toBe("frio");
    expect(m.origens.neutros).toBe("banco");
  });

  it("valor invalido na organizacao herda (nao lanca, nao apaga o de baixo)", () => {
    const m = resolverMarcaDaOrganizacao({ branding: { neutros: "verde" } }, { neutros: "cinza" }, {});
    expect(m.neutros).toBe("cinza");
  });

  it("linha da instalacao sem a coluna (codigo novo, banco antigo) e quente", () => {
    const m = resolverMarcaDaOrganizacao(null, { app_name: "X" }, {});
    expect(m.neutros).toBe("quente");
  });

  it("settings.branding de forma errada nao derruba", () => {
    for (const settings of [null, "x", 3, [], { branding: "x" }, { branding: [] }, { branding: { neutros: 7 } }]) {
      expect(() => resolverMarcaDaOrganizacao(settings, null, {})).not.toThrow();
      expect(resolverMarcaDaOrganizacao(settings, null, {}).neutros).toBe("quente");
    }
  });
});

describe("marcaDaOrganizacaoDeSettings — neutros", () => {
  it("devolve a chave so quando e do vocabulario", () => {
    expect(marcaDaOrganizacaoDeSettings({ branding: { neutros: "frio" } })?.neutros).toBe("frio");
    expect("neutros" in (marcaDaOrganizacaoDeSettings({ branding: { neutros: "verde" } }) ?? {})).toBe(false);
    expect("neutros" in (marcaDaOrganizacaoDeSettings({ branding: { app_name: "X" } }) ?? {})).toBe(false);
  });
});

describe("schemas — neutros", () => {
  const base = { app_name: null, logo_url: null, accent_hex: null, accent_dark_hex: null, show_powered_by: true };

  it("instalacao: aceita o vocabulario, recusa o resto, e a ausencia e 'nao mexa'", () => {
    expect(platformBrandingSchema.safeParse({ ...base, neutros: "frio" }).success).toBe(true);
    expect(platformBrandingSchema.safeParse({ ...base, neutros: "verde" }).success).toBe(false);
    expect(platformBrandingSchema.safeParse({ ...base, neutros: null }).success).toBe(false);
    expect(platformBrandingSchema.safeParse(base).success).toBe(true);
  });

  it("organizacao: null e 'herde da instalacao'", () => {
    const org = { app_name: null, accent_hex: null, accent_dark_hex: null };
    expect(marcaDaOrganizacaoSchema.safeParse({ ...org, neutros: null }).success).toBe(true);
    expect(marcaDaOrganizacaoSchema.safeParse({ ...org, neutros: "cinza" }).success).toBe(true);
    expect(marcaDaOrganizacaoSchema.safeParse({ ...org, neutros: "verde" }).success).toBe(false);
  });
});
