import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";
import { motivoDoErro } from "./psql-transporte";

/**
 * CORES DO TEMA DA MARCA (migration 0678).
 *
 *  - instalacao: `platform_branding.cores` jsonb `not null default '{}'` + CHECK
 *    de que e um objeto.
 *  - organizacao: `settings.branding.cores`, validada e PRESERVADA por
 *    `fn_definir_marca_da_organizacao`: chave enviada manda, `null` apaga,
 *    ausente mantem, limpar tudo apaga.
 *
 * Forma: { claro?: { token: "#rrggbb" }, escuro?: { ... } }, 20 tokens fechados,
 * hex minusculo de 6 digitos.
 *
 * Namespace `a4ca0678`: o banco do `test:db` e compartilhado entre arquivos.
 */

const ORG_A = "a4ca0678-0000-4000-8000-000000000001";
const ADMIN_A = "a4ca0678-1111-4000-8000-000000000001";
const FN = "public.fn_definir_marca_da_organizacao(uuid,uuid,jsonb)";

function definir(marca: string): number {
  return Number(
    lastLine(sql(`select public.fn_definir_marca_da_organizacao('${ORG_A}', '${ADMIN_A}', ${marca});`)),
  );
}

function erroAoDefinir(marca: string): string | null {
  try {
    definir(marca);
    return null;
  } catch (err) {
    return motivoDoErro(err);
  }
}

function sqlstateAoDefinir(marca: string): string {
  const erro = erroDeSql(`do $$ begin
    perform public.fn_definir_marca_da_organizacao('${ORG_A}', '${ADMIN_A}', ${marca});
  exception when others then raise exception 'SQLSTATE=%', sqlstate;
  end $$;`);
  return /SQLSTATE=(\w{5})/.exec(erro ?? "")?.[1] ?? "NENHUM";
}

function chave(nome: string): string {
  return lastLine(
    sql(
      `select coalesce(settings #>> '{branding,${nome}}', 'AUSENTE') from public.organizations where id = '${ORG_A}';`,
    ),
  );
}

function cores(): string {
  return lastLine(
    sql(
      `select coalesce((settings #> '{branding,cores}')::text, 'AUSENTE') from public.organizations where id = '${ORG_A}';`,
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
    insert into auth.users (id, email) values ('${ADMIN_A}', 'cores-a@invariant.test') on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'cores-inv-a', 'Cores A', 'Cores A') on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${ADMIN_A}', '${ORG_A}', 'admin', now()) on conflict do nothing;
    delete from public.platform_branding;
  `);
});

afterAll(() => {
  sql(`delete from public.platform_branding;`);
});

describe("platform_branding.cores (instalacao)", () => {
  it("a coluna existe, e jsonb not null com default '{}'", () => {
    expect(
      lastLine(
        sql(`select data_type || '/' || is_nullable || '/' || column_default from information_schema.columns
              where table_schema='public' and table_name='platform_branding' and column_name='cores';`),
      ),
    ).toBe("jsonb/NO/'{}'::jsonb");
  });

  it("linha nova sem dizer nada nasce {}", () => {
    sql(`delete from public.platform_branding; insert into public.platform_branding (id, app_name) values (1, 'Cores Inv');`);
    expect(lastLine(sql(`select cores::text from public.platform_branding where id = 1;`))).toBe("{}");
  });

  it("aceita um objeto", () => {
    expect(
      erroDeSql(`update public.platform_branding set cores = '{"claro":{"bg":"#ffffff"}}'::jsonb where id = 1;`),
    ).toBeNull();
    expect(lastLine(sql(`select cores #>> '{claro,bg}' from public.platform_branding where id = 1;`))).toBe("#ffffff");
  });

  it.each([`'[]'`, `'"x"'`, `'3'`])("recusa %s (nao e objeto) com check_violation", (v) => {
    const erro = erroDeSql(`update public.platform_branding set cores = ${v}::jsonb where id = 1;`);
    expect(erro, "o valor invalido foi ACEITO").not.toBeNull();
    expect(erro).toContain("platform_branding_cores");
  });

  it("recusa NULL (not null)", () => {
    expect(erroDeSql(`update public.platform_branding set cores = null where id = 1;`)).toContain("null value");
  });
});

describe("settings.branding.cores (organizacao)", () => {
  it("grava cores validas (claro e escuro)", () => {
    expect(
      definir(`'{"cores":{"claro":{"bg":"#ffffff","text-muted":"#5d594f"},"escuro":{"surface":"#1d1c17"}}}'::jsonb`),
    ).toBe(1);
    expect(chave("cores")).not.toBe("AUSENTE");
    expect(lastLine(sql(`select settings #>> '{branding,cores,claro,text-muted}' from public.organizations where id='${ORG_A}';`))).toBe("#5d594f");
    expect(lastLine(sql(`select settings #>> '{branding,cores,escuro,surface}' from public.organizations where id='${ORG_A}';`))).toBe("#1d1c17");
  });

  it("aceita objetos vazios e os 20 tokens", () => {
    const tokens = [
      "bg", "surface", "surface-elevated", "text", "text-muted", "text-subtle", "border", "border-strong",
      "success", "success-bg", "success-fg", "warning", "warning-bg", "warning-fg",
      "error", "error-bg", "error-fg", "info", "info-bg", "info-fg",
    ];
    const claro = Object.fromEntries(tokens.map((t) => [t, "#0a0b0c"]));
    expect(definir(`'${JSON.stringify({ cores: { claro, escuro: {} } })}'::jsonb`)).toBe(1);
    expect(lastLine(sql(`select count(*) from jsonb_object_keys((select settings #> '{branding,cores,claro}' from public.organizations where id='${ORG_A}'));`))).toBe("20");
  });

  it.each([
    ["chave de topo desconhecida", `{"cores":{"medio":{"bg":"#ffffff"}}}`],
    ["token desconhecido", `{"cores":{"claro":{"fundo":"#ffffff"}}}`],
    ["hex em maiusculas", `{"cores":{"claro":{"bg":"#FFFFFF"}}}`],
    ["hex de 3 digitos", `{"cores":{"claro":{"bg":"#fff"}}}`],
    ["hex sem #", `{"cores":{"claro":{"bg":"ffffff"}}}`],
    ["valor que nao e texto", `{"cores":{"claro":{"bg":3}}}`],
    ["valor null", `{"cores":{"claro":{"bg":null}}}`],
    ["claro que nao e objeto", `{"cores":{"claro":"#ffffff"}}`],
    ["escuro que e array", `{"cores":{"escuro":[]}}`],
    ["cores que nao e objeto (texto)", `{"cores":"#ffffff"}`],
    ["cores que e array", `{"cores":[]}`],
  ])("recusa %s com 22023, sem gravar nada", (_nome, marca) => {
    definir(`'{"cores":{"claro":{"bg":"#111111"}}}'::jsonb`);
    const antes = cores();
    const erro = erroAoDefinir(`'${marca}'::jsonb`);
    expect(erro, "o valor invalido foi ACEITO").toContain("marca_da_organizacao_cores_invalidas");
    expect(sqlstateAoDefinir(`'${marca}'::jsonb`)).toBe("22023");
    expect(cores()).toBe(antes);
  });

  it("cores: null apaga so a chave cores", () => {
    definir(`'{"cores":{"claro":{"bg":"#111111"}},"densidade":"compacta"}'::jsonb`);
    definir(`'{"cores":null}'::jsonb`);
    expect(cores()).toBe("AUSENTE");
    expect(chave("densidade")).toBe("compacta");
  });

  it("chave AUSENTE PRESERVA: salvar so o nome nao leva nenhuma escolha de aparencia nem as cores", () => {
    definir(
      `'{"app_name":"Tudo","accent_hex":"#336699","neutros":"frio","raio":"arredondado","barra_lateral":"escura","densidade":"compacta","fonte":"fraunces","cores":{"claro":{"bg":"#ffffff"},"escuro":{"surface":"#1d1c17"}}}'::jsonb`,
    );
    const antes = cores();
    expect(antes).not.toBe("AUSENTE");
    definir(`'{"app_name":"Outro"}'::jsonb`);
    expect(chave("app_name")).toBe("Outro");
    expect(chave("accent_hex")).toBe("AUSENTE");
    expect(chave("neutros")).toBe("AUSENTE");
    expect(chave("raio")).toBe("arredondado");
    expect(chave("barra_lateral")).toBe("escura");
    expect(chave("densidade")).toBe("compacta");
    expect(chave("fonte")).toBe("fraunces");
    expect(cores()).toBe(antes);
  });

  it("limpar a marca (p_marca null) apaga as cores", () => {
    definir(`'{"cores":{"claro":{"bg":"#111111"}}}'::jsonb`);
    expect(definir(`null`)).toBe(1);
    expect(cores()).toBe("AUSENTE");
  });

  it("a funcao segue fechada: so service_role executa — uma unica definicao", () => {
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
