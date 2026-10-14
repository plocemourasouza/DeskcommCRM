import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";
import { motivoDoErro } from "./psql-transporte";

/**
 * OS NEUTROS DA MARCA (migration 0650): quente | cinza | frio.
 *
 * Dois lugares guardam a escolha, e o BANCO e o dono do vocabulario nos dois:
 *
 *  - instalacao: `platform_branding.neutros`, `text not null default 'quente'` com
 *    CHECK de conjunto. Linhas existentes (e clones que atualizam) nascem `quente`,
 *    que e exatamente o visual de hoje.
 *  - organizacao: `organizations.settings.branding.neutros`, validado dentro de
 *    `fn_definir_marca_da_organizacao` (o jsonb nao tem CHECK; a funcao e o unico
 *    escritor).
 *
 * Organizacoes dedicadas (namespace `a4ca0650`): o banco do `test:db` e
 * compartilhado entre arquivos e `fileParallelism` esta desligado.
 */

const ORG_A = "a4ca0650-0000-4000-8000-000000000001";
const ORG_B = "a4ca0650-0000-4000-8000-000000000002";
const ADMIN_A = "a4ca0650-1111-4000-8000-000000000001";
const ADMIN_B = "a4ca0650-1111-4000-8000-000000000002";
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

function neutrosDa(org: string): string {
  return lastLine(
    sql(
      `select coalesce(settings #>> '{branding,neutros}', 'AUSENTE') from public.organizations where id = '${org}';`,
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
      ('${ADMIN_A}', 'neutros-a@invariant.test'),
      ('${ADMIN_B}', 'neutros-b@invariant.test') on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'neutros-inv-a', 'Neutros A', 'Neutros A'),
      ('${ORG_B}', 'neutros-inv-b', 'Neutros B', 'Neutros B') on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${ADMIN_A}', '${ORG_A}', 'admin', now()),
      ('${ADMIN_B}', '${ORG_B}', 'admin', now()) on conflict do nothing;
    delete from public.platform_branding;
  `);
});

afterAll(() => {
  sql(`delete from public.platform_branding;`);
});

describe("platform_branding.neutros (instalacao)", () => {
  it("a coluna existe, e not null com default 'quente'", () => {
    expect(
      lastLine(
        sql(`select is_nullable || '/' || column_default from information_schema.columns
              where table_schema='public' and table_name='platform_branding' and column_name='neutros';`),
      ),
    ).toBe("NO/'quente'::text");
  });

  it("linha nova sem dizer nada nasce 'quente' — o visual de hoje", () => {
    sql(`insert into public.platform_branding (id, app_name) values (1, 'Neutros Inv');`);
    expect(lastLine(sql(`select neutros from public.platform_branding where id = 1;`))).toBe(
      "quente",
    );
  });

  it.each(["cinza", "frio", "quente"])("aceita '%s'", (v) => {
    expect(
      erroDeSql(`update public.platform_branding set neutros = '${v}' where id = 1;`),
    ).toBeNull();
    expect(lastLine(sql(`select neutros from public.platform_branding where id = 1;`))).toBe(v);
  });

  it.each(["verde", "", "QUENTE", "greige"])("recusa '%s' com check_violation (23514)", (v) => {
    const erro = erroDeSql(`update public.platform_branding set neutros = '${v}' where id = 1;`);
    expect(erro, "o valor invalido foi ACEITO").not.toBeNull();
    expect(erro).toContain("platform_branding_neutros");
  });

  it("recusa NULL (not null)", () => {
    const erro = erroDeSql(`update public.platform_branding set neutros = null where id = 1;`);
    expect(erro).not.toBeNull();
    expect(erro).toContain("null value");
  });

  it("anon e authenticated continuam sem privilegio na coluna nova", () => {
    expect(
      lastLine(
        sql(`select count(*) from information_schema.role_table_grants
              where table_schema='public' and table_name='platform_branding'
                and grantee in ('anon','authenticated');`),
      ),
    ).toBe("0");
  });
});

describe("settings.branding.neutros (organizacao) via fn_definir_marca_da_organizacao", () => {
  it.each(["quente", "cinza", "frio"])("grava '%s' e o devolve", (v) => {
    expect(definir(ORG_A, ADMIN_A, `'{"accent_hex":"#0f766e","neutros":"${v}"}'::jsonb`)).toBe(1);
    expect(neutrosDa(ORG_A)).toBe(v);
  });

  it.each(["verde", "", "Frio"])("recusa '%s' com 22023, sem gravar nada", (v) => {
    definir(ORG_A, ADMIN_A, `'{"neutros":"cinza"}'::jsonb`);
    const erro = erroAoDefinir(ORG_A, ADMIN_A, `'{"neutros":"${v}"}'::jsonb`);
    expect(erro, "o valor invalido foi ACEITO").not.toBeNull();
    expect(erro).toContain("marca_da_organizacao_neutros_invalido");
    expect(neutrosDa(ORG_A)).toBe("cinza");
  });

  it("recusa neutros que nao e texto (numero, objeto)", () => {
    expect(erroAoDefinir(ORG_A, ADMIN_A, `'{"neutros":3}'::jsonb`)).toContain(
      "marca_da_organizacao_neutros_invalido",
    );
    expect(erroAoDefinir(ORG_A, ADMIN_A, `'{"neutros":{"a":1}}'::jsonb`)).toContain(
      "marca_da_organizacao_neutros_invalido",
    );
  });

  it("sem a chave, a organizacao herda a instalacao (chave AUSENTE)", () => {
    definir(ORG_A, ADMIN_A, `'{"accent_hex":"#0f766e"}'::jsonb`);
    expect(neutrosDa(ORG_A)).toBe("AUSENTE");
  });

  it("isolamento: gravar na A nao toca a B, e admin da A nao grava na B", () => {
    definir(ORG_B, ADMIN_B, `'{"neutros":"frio"}'::jsonb`);
    definir(ORG_A, ADMIN_A, `'{"neutros":"cinza"}'::jsonb`);
    expect(neutrosDa(ORG_B)).toBe("frio");
    const erro = erroAoDefinir(ORG_B, ADMIN_A, `'{"neutros":"cinza"}'::jsonb`);
    expect(erro).toContain("marca_da_organizacao_sem_permissao");
    expect(neutrosDa(ORG_B)).toBe("frio");
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
