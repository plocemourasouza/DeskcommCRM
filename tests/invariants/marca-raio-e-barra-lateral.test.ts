import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";
import { motivoDoErro } from "./psql-transporte";

/**
 * RAIO E BARRA LATERAL DA MARCA (migration 0704).
 *
 *  - instalacao: `platform_branding.raio` (suave|padrao|arredondado) e
 *    `.barra_lateral` (padrao|escura), `not null default 'padrao'` + CHECK.
 *  - organizacao: `settings.branding.raio` / `.barra_lateral`, validados e
 *    PRESERVADOS por `fn_definir_marca_da_organizacao`, que substitui o objeto
 *    `branding` inteiro: chave enviada manda, `null` apaga, ausente mantem.
 *
 * Namespace `a4ca0671`: o banco do `test:db` e compartilhado entre arquivos.
 */

const ORG_A = "a4ca0671-0000-4000-8000-000000000001";
const ORG_B = "a4ca0671-0000-4000-8000-000000000002";
const ADMIN_A = "a4ca0671-1111-4000-8000-000000000001";
const ADMIN_B = "a4ca0671-1111-4000-8000-000000000002";
const FN = "public.fn_definir_marca_da_organizacao(uuid,uuid,jsonb)";

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
      ('${ADMIN_A}', 'aparencia-a@invariant.test'),
      ('${ADMIN_B}', 'aparencia-b@invariant.test') on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'aparencia-inv-a', 'Aparencia A', 'Aparencia A'),
      ('${ORG_B}', 'aparencia-inv-b', 'Aparencia B', 'Aparencia B') on conflict do nothing;
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
  { coluna: "raio", validos: ["suave", "padrao", "arredondado"], invalidos: ["verde", "", "PADRAO", "quadrado"] },
  { coluna: "barra_lateral", validos: ["padrao", "escura"], invalidos: ["azul", "", "ESCURA", "clara"] },
])("platform_branding.$coluna (instalacao)", ({ coluna, validos, invalidos }) => {
  it("a coluna existe, e not null com default 'padrao'", () => {
    expect(
      lastLine(
        sql(`select is_nullable || '/' || column_default from information_schema.columns
              where table_schema='public' and table_name='platform_branding' and column_name='${coluna}';`),
      ),
    ).toBe("NO/'padrao'::text");
  });

  it("linha nova sem dizer nada nasce 'padrao' — o visual de hoje", () => {
    sql(`delete from public.platform_branding; insert into public.platform_branding (id, app_name) values (1, 'Aparencia Inv');`);
    expect(lastLine(sql(`select ${coluna} from public.platform_branding where id = 1;`))).toBe("padrao");
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

describe("settings.branding.raio / .barra_lateral (organizacao)", () => {
  it.each(["suave", "padrao", "arredondado"])("grava raio '%s'", (v) => {
    expect(definir(ORG_A, ADMIN_A, `'{"raio":"${v}"}'::jsonb`)).toBe(1);
    expect(chave(ORG_A, "raio")).toBe(v);
  });

  it.each(["padrao", "escura"])("grava barra_lateral '%s'", (v) => {
    expect(definir(ORG_A, ADMIN_A, `'{"barra_lateral":"${v}"}'::jsonb`)).toBe(1);
    expect(chave(ORG_A, "barra_lateral")).toBe(v);
  });

  it.each(["quadrado", "", "Suave"])("recusa raio '%s' com 22023, sem gravar nada", (v) => {
    definir(ORG_A, ADMIN_A, `'{"raio":"suave"}'::jsonb`);
    const erro = erroAoDefinir(ORG_A, ADMIN_A, `'{"raio":"${v}"}'::jsonb`);
    expect(erro, "o valor invalido foi ACEITO").toContain("marca_da_organizacao_raio_invalido");
    expect(chave(ORG_A, "raio")).toBe("suave");
  });

  it.each(["azul", "", "Escura"])("recusa barra_lateral '%s' com 22023", (v) => {
    expect(erroAoDefinir(ORG_A, ADMIN_A, `'{"barra_lateral":"${v}"}'::jsonb`)).toContain(
      "marca_da_organizacao_barra_lateral_invalida",
    );
  });

  it("recusa o que nao e texto (numero, objeto)", () => {
    expect(erroAoDefinir(ORG_A, ADMIN_A, `'{"raio":3}'::jsonb`)).toContain("marca_da_organizacao_raio_invalido");
    expect(erroAoDefinir(ORG_A, ADMIN_A, `'{"barra_lateral":{"a":1}}'::jsonb`)).toContain(
      "marca_da_organizacao_barra_lateral_invalida",
    );
  });

  it("CHAVE AUSENTE PRESERVA: salvar so o nome nao leva raio, barra, neutros nem logos", () => {
    sql(`
      update public.organizations set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{branding}',
        '{"raio":"arredondado","barra_lateral":"escura","densidade":"compacta","neutros":"frio","logo_path":"x/logo.png","logo_dark_path":"x/dark.png"}'::jsonb)
       where id = '${ORG_A}';
    `);
    definir(ORG_A, ADMIN_A, `'{"app_name":"So o nome","neutros":"frio"}'::jsonb`);
    expect(chave(ORG_A, "app_name")).toBe("So o nome");
    expect(chave(ORG_A, "raio")).toBe("arredondado");
    expect(chave(ORG_A, "barra_lateral")).toBe("escura");
    expect(chave(ORG_A, "densidade")).toBe("compacta");
    expect(chave(ORG_A, "neutros")).toBe("frio");
    expect(chave(ORG_A, "logo_path")).toBe("x/logo.png");
    expect(chave(ORG_A, "logo_dark_path")).toBe("x/dark.png");
  });

  it("null EXPLICITO apaga a chave (herdar) e so ela", () => {
    definir(ORG_A, ADMIN_A, `'{"raio":"suave","barra_lateral":"escura"}'::jsonb`);
    definir(ORG_A, ADMIN_A, `'{"raio":null}'::jsonb`);
    expect(chave(ORG_A, "raio")).toBe("AUSENTE");
    expect(chave(ORG_A, "barra_lateral")).toBe("escura");
  });

  it("limpar a marca (p_marca null) apaga raio e barra", () => {
    definir(ORG_A, ADMIN_A, `'{"raio":"suave","barra_lateral":"escura"}'::jsonb`);
    expect(definir(ORG_A, ADMIN_A, `null`)).toBe(1);
    expect(chave(ORG_A, "raio")).toBe("AUSENTE");
    expect(chave(ORG_A, "barra_lateral")).toBe("AUSENTE");
  });

  it("isolamento: gravar na A nao toca a B, e admin da A nao grava na B", () => {
    definir(ORG_B, ADMIN_B, `'{"raio":"arredondado"}'::jsonb`);
    definir(ORG_A, ADMIN_A, `'{"raio":"suave"}'::jsonb`);
    expect(chave(ORG_B, "raio")).toBe("arredondado");
    expect(erroAoDefinir(ORG_B, ADMIN_A, `'{"raio":"suave"}'::jsonb`)).toContain(
      "marca_da_organizacao_sem_permissao",
    );
    expect(chave(ORG_B, "raio")).toBe("arredondado");
  });

  it("a funcao segue fechada: so service_role executa (sem grant a anon/PUBLIC)", () => {
    expect(
      lastLine(
        sql(`select has_function_privilege('anon','${FN}','execute')::text || '/' ||
                    has_function_privilege('authenticated','${FN}','execute')::text || '/' ||
                    has_function_privilege('service_role','${FN}','execute')::text;`),
      ),
    ).toBe("false/false/true");
  });
});
