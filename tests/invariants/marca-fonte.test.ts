import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";
import { motivoDoErro } from "./psql-transporte";

/**
 * FONTE DA MARCA (migration 0676).
 *
 *  - instalacao: `platform_branding.fonte`
 *    (atkinson|manrope|jakarta|plex-sans|bricolage|fraunces|source-serif),
 *    `not null default 'atkinson'` + CHECK.
 *  - organizacao: `settings.branding.fonte`, validada e PRESERVADA por
 *    `fn_definir_marca_da_organizacao`, que substitui o objeto `branding`
 *    inteiro: chave enviada manda, `null` apaga, ausente mantem — inclusive
 *    quando o que se salva e so o nome, e junto de logos, neutros, raio, barra
 *    e densidade.
 *
 * Namespace `a4ca0676`: o banco do `test:db` e compartilhado entre arquivos.
 */

const ORG_A = "a4ca0676-0000-4000-8000-000000000001";
const ORG_B = "a4ca0676-0000-4000-8000-000000000002";
const ADMIN_A = "a4ca0676-1111-4000-8000-000000000001";
const ADMIN_B = "a4ca0676-1111-4000-8000-000000000002";
const FN = "public.fn_definir_marca_da_organizacao(uuid,uuid,jsonb)";

const FONTES = ["atkinson", "manrope", "jakarta", "plex-sans", "bricolage", "fraunces", "source-serif"];

function definir(org: string, ator: string, marca: string): number {
  return Number(
    lastLine(sql(`select public.fn_definir_marca_da_organizacao('${org}', '${ator}', ${marca});`)),
  );
}

function erroAoDefinir(org: string, ator: string, marca: string): string | null {
  try {
    definir(org, ator, marca);
    return null;
  } catch (err) {
    return motivoDoErro(err);
  }
}

function chave(org: string, nome: string): string {
  return lastLine(
    sql(
      `select coalesce(settings #>> '{branding,${nome}}', 'AUSENTE') from public.organizations where id = '${org}';`,
    ),
  );
}

function erroDeSql(script: string): string | null {
  try {
    sql(script);
    return null;
  } catch (err) {
    return motivoDoErro(err);
  }
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${ADMIN_A}', 'fonte-a@invariant.test'),
      ('${ADMIN_B}', 'fonte-b@invariant.test') on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'fonte-inv-a', 'Fonte A', 'Fonte A'),
      ('${ORG_B}', 'fonte-inv-b', 'Fonte B', 'Fonte B') on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${ADMIN_A}', '${ORG_A}', 'admin', now()),
      ('${ADMIN_B}', '${ORG_B}', 'admin', now()) on conflict do nothing;
    delete from public.platform_branding;
  `);
});

afterAll(() => {
  sql(`delete from public.platform_branding;`);
});

describe.each([
  { coluna: "fonte", validos: FONTES, invalidos: ["padrao", "", "ATKINSON", "comic", "plex_sans"] },
])("platform_branding.$coluna (instalacao)", ({ coluna, validos, invalidos }) => {
  it("a coluna existe, e not null com default 'atkinson'", () => {
    expect(
      lastLine(
        sql(`select is_nullable || '/' || column_default from information_schema.columns
              where table_schema='public' and table_name='platform_branding' and column_name='${coluna}';`),
      ),
    ).toBe("NO/'atkinson'::text");
  });

  it("linha nova sem dizer nada nasce 'atkinson' — a fonte de hoje", () => {
    sql(`delete from public.platform_branding; insert into public.platform_branding (id, app_name) values (1, 'Fonte Inv');`);
    expect(lastLine(sql(`select ${coluna} from public.platform_branding where id = 1;`))).toBe("atkinson");
  });

  it.each(validos)("aceita '%s'", (v) => {
    expect(erroDeSql(`update public.platform_branding set ${coluna} = '${v}' where id = 1;`)).toBeNull();
    expect(lastLine(sql(`select ${coluna} from public.platform_branding where id = 1;`))).toBe(v);
  });

  it.each(invalidos)("recusa '%s' com check_violation", (v) => {
    const erro = erroDeSql(`update public.platform_branding set ${coluna} = '${v}' where id = 1;`);
    expect(erro, "o valor invalido foi ACEITO").not.toBeNull();
    expect(erro).toContain(`platform_branding_${coluna}`);
  });

  it("recusa NULL (not null)", () => {
    const erro = erroDeSql(`update public.platform_branding set ${coluna} = null where id = 1;`);
    expect(erro).toContain("null value");
  });
});

describe("settings.branding.fonte (organizacao)", () => {
  it.each(FONTES)("grava fonte '%s'", (v) => {
    expect(definir(ORG_A, ADMIN_A, `'{"fonte":"${v}"}'::jsonb`)).toBe(1);
    expect(chave(ORG_A, "fonte")).toBe(v);
  });

  it.each(["padrao", "", "Fraunces", "comic"])(
    "recusa fonte '%s' com 22023, sem gravar nada",
    (v) => {
      definir(ORG_A, ADMIN_A, `'{"fonte":"fraunces"}'::jsonb`);
      const erro = erroAoDefinir(ORG_A, ADMIN_A, `'{"fonte":"${v}"}'::jsonb`);
      expect(erro, "o valor invalido foi ACEITO").toContain("marca_da_organizacao_fonte_invalida");
      expect(chave(ORG_A, "fonte")).toBe("fraunces");
    },
  );

  it("recusa o que nao e texto (numero, objeto)", () => {
    expect(erroAoDefinir(ORG_A, ADMIN_A, `'{"fonte":3}'::jsonb`)).toContain(
      "marca_da_organizacao_fonte_invalida",
    );
    expect(erroAoDefinir(ORG_A, ADMIN_A, `'{"fonte":{"a":1}}'::jsonb`)).toContain(
      "marca_da_organizacao_fonte_invalida",
    );
  });

  it("CHAVE AUSENTE PRESERVA: salvar so o nome nao leva fonte, densidade, raio, barra, neutros nem logos", () => {
    sql(`
      update public.organizations set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{branding}',
        '{"fonte":"source-serif","densidade":"compacta","raio":"arredondado","barra_lateral":"escura","neutros":"frio","logo_path":"x/logo.png","logo_dark_path":"x/dark.png"}'::jsonb)
       where id = '${ORG_A}';
    `);
    definir(ORG_A, ADMIN_A, `'{"app_name":"So o nome","neutros":"frio"}'::jsonb`);
    expect(chave(ORG_A, "app_name")).toBe("So o nome");
    expect(chave(ORG_A, "fonte")).toBe("source-serif");
    expect(chave(ORG_A, "densidade")).toBe("compacta");
    expect(chave(ORG_A, "raio")).toBe("arredondado");
    expect(chave(ORG_A, "barra_lateral")).toBe("escura");
    expect(chave(ORG_A, "neutros")).toBe("frio");
    expect(chave(ORG_A, "logo_path")).toBe("x/logo.png");
    expect(chave(ORG_A, "logo_dark_path")).toBe("x/dark.png");
  });

  it("enviar fonte nao apaga densidade, raio nem barra (campos independentes)", () => {
    definir(ORG_A, ADMIN_A, `'{"densidade":"equilibrada","raio":"suave","barra_lateral":"escura"}'::jsonb`);
    definir(ORG_A, ADMIN_A, `'{"fonte":"manrope"}'::jsonb`);
    expect(chave(ORG_A, "fonte")).toBe("manrope");
    expect(chave(ORG_A, "densidade")).toBe("equilibrada");
    expect(chave(ORG_A, "raio")).toBe("suave");
    expect(chave(ORG_A, "barra_lateral")).toBe("escura");
  });

  it("enviar so densidade/raio/barra preserva a fonte gravada", () => {
    definir(ORG_A, ADMIN_A, `'{"fonte":"fraunces"}'::jsonb`);
    definir(ORG_A, ADMIN_A, `'{"densidade":"compacta"}'::jsonb`);
    definir(ORG_A, ADMIN_A, `'{"raio":"suave"}'::jsonb`);
    definir(ORG_A, ADMIN_A, `'{"barra_lateral":"escura"}'::jsonb`);
    expect(chave(ORG_A, "fonte")).toBe("fraunces");
  });

  it("null EXPLICITO apaga a chave (herdar) e so ela", () => {
    definir(ORG_A, ADMIN_A, `'{"fonte":"fraunces","densidade":"compacta"}'::jsonb`);
    definir(ORG_A, ADMIN_A, `'{"fonte":null}'::jsonb`);
    expect(chave(ORG_A, "fonte")).toBe("AUSENTE");
    expect(chave(ORG_A, "densidade")).toBe("compacta");
  });

  it("limpar a marca (p_marca null) apaga a fonte", () => {
    definir(ORG_A, ADMIN_A, `'{"fonte":"fraunces"}'::jsonb`);
    expect(definir(ORG_A, ADMIN_A, `null`)).toBe(1);
    expect(chave(ORG_A, "fonte")).toBe("AUSENTE");
  });

  it("isolamento: gravar na A nao toca a B, e admin da A nao grava na B", () => {
    definir(ORG_B, ADMIN_B, `'{"fonte":"fraunces"}'::jsonb`);
    definir(ORG_A, ADMIN_A, `'{"fonte":"manrope"}'::jsonb`);
    expect(chave(ORG_B, "fonte")).toBe("fraunces");
    expect(erroAoDefinir(ORG_B, ADMIN_A, `'{"fonte":"jakarta"}'::jsonb`)).toContain(
      "marca_da_organizacao_sem_permissao",
    );
    expect(chave(ORG_B, "fonte")).toBe("fraunces");
  });

  it("a funcao segue fechada: so service_role executa (sem grant a anon/PUBLIC) — uma unica definicao", () => {
    expect(
      lastLine(
        sql(`select has_function_privilege('anon','${FN}','execute')::text || '/' ||
                    has_function_privilege('authenticated','${FN}','execute')::text || '/' ||
                    has_function_privilege('service_role','${FN}','execute')::text;`),
      ),
    ).toBe("false/false/true");
    expect(
      lastLine(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'fn_definir_marca_da_organizacao';`)),
    ).toBe("1");
  });
});
