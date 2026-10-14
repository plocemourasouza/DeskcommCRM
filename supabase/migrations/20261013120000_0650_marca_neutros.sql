-- manifest: **Neutros da marca: a instalacao e a organizacao escolhem quente, cinza ou frio.** Coluna platform_branding.neutros (CHECK de conjunto, default quente = visual de hoje) e validacao de settings.branding.neutros em fn_definir_marca_da_organizacao.
-- 0650: paleta de neutros da marca (platform_branding.neutros + allowlist na RPC da organizacao)
--
-- Aditiva e idempotente; linhas existentes ficam 'quente'. Espelhada no apendice do baseline.sql.

alter table public.platform_branding
  add column if not exists neutros text not null default 'quente';

comment on column public.platform_branding.neutros is
  'Paleta de neutros da instalacao: quente (greige, o visual de sempre), cinza ou frio. Vocabulario fechado no CHECK; a organizacao pode sobrepor em settings.branding.neutros. Linhas antigas nascem quente.';

-- drop + add: torna a REGRA idempotente (o Postgres nao tem a forma
-- condicional para constraint). O default 'quente' garante que nenhuma linha existente viole o CHECK.
alter table public.platform_branding
  drop constraint if exists platform_branding_neutros;
alter table public.platform_branding
  add constraint platform_branding_neutros check (neutros in ('quente', 'cinza', 'frio'));

-- Forward-fix de fn_definir_marca_da_organizacao (ultima definicao: baseline,
-- bloco da 0243/logo por tema): o corpo e identico, mais UMA guarda — `neutros`,
-- quando presente, tem de ser um dos tres valores. `settings` e jsonb sem CHECK,
-- entao esta funcao e o unico lugar onde o vocabulario da organizacao e imposto.
create or replace function public.fn_definir_marca_da_organizacao(
  p_org   uuid,
  p_actor uuid,
  p_marca jsonb
) returns integer
    language plpgsql
    volatile
    security definer
    set search_path to 'public', 'pg_temp'
as $$
declare
  v_linhas integer;
  v_hex    text;
  v_limpar boolean;
begin
  if p_org is null or p_actor is null then
    raise exception 'marca_da_organizacao_argumento_nulo'
      using errcode = '22023';
  end if;

  v_limpar := p_marca is null or jsonb_typeof(p_marca) = 'null';

  if not v_limpar and jsonb_typeof(p_marca) <> 'object' then
    raise exception 'marca_da_organizacao_forma_invalida: %', jsonb_typeof(p_marca)
      using errcode = '22023';
  end if;

  v_hex := nullif(p_marca ->> 'accent_hex', '');
  if v_hex is not null and v_hex !~ '^#[0-9a-f]{6}$' then
    raise exception 'marca_da_organizacao_accent_hex_invalido'
      using errcode = '22023';
  end if;

  if not v_limpar and p_marca ? 'neutros'
     and (jsonb_typeof(p_marca -> 'neutros') <> 'string'
          or (p_marca ->> 'neutros') not in ('quente', 'cinza', 'frio'))
  then
    raise exception 'marca_da_organizacao_neutros_invalido'
      using errcode = '22023';
  end if;

  if not exists (
       select 1 from public.user_organizations uo
        where uo.user_id = p_actor
          and uo.organization_id = p_org
          and uo.role = 'admin'
          and uo.revoked_at is null
     )
     and not exists (
       select 1 from public.platform_admins pa
        where pa.user_id = p_actor
          and pa.revoked_at is null
     )
  then
    raise exception 'marca_da_organizacao_sem_permissao'
      using errcode = '42501';
  end if;

  -- Nome/cor/neutros nao podem injetar nem apagar os arquivos, que tem rota propria.
  update public.organizations o
     set settings = case
       when v_limpar
         and coalesce(o.settings #>> '{branding,logo_path}', '') = ''
         and coalesce(o.settings #>> '{branding,logo_dark_path}', '') = ''
       then coalesce(o.settings, '{}'::jsonb) - 'branding'
       else jsonb_set(
       coalesce(o.settings, '{}'::jsonb), '{branding}',
       (case when v_limpar then '{}'::jsonb
             else p_marca - 'logo_path' - 'logo_dark_path' end)
       || jsonb_strip_nulls(jsonb_build_object(
         'logo_path', o.settings #> '{branding,logo_path}',
         'logo_dark_path', o.settings #> '{branding,logo_dark_path}'
       )), true) end
   where o.id = p_org;

  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$$;

revoke execute on function public.fn_definir_marca_da_organizacao(uuid, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.fn_definir_marca_da_organizacao(uuid, uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
