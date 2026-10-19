-- manifest: **Aparencia da marca: raio dos cantos (suave, padrao, arredondado) e barra lateral (padrao, escura).** Colunas platform_branding.raio e .barra_lateral (CHECK de conjunto, default padrao = visual de hoje) e validacao + preservacao de settings.branding.raio/.barra_lateral em fn_definir_marca_da_organizacao.
-- 0704: aparencia da marca (platform_branding.raio/.barra_lateral + chaves na RPC da organizacao)
--
-- Aditiva e idempotente; linhas existentes ficam 'padrao'. Espelhada no apendice do baseline.sql.

alter table public.platform_branding
  add column if not exists raio text not null default 'padrao';
alter table public.platform_branding
  add column if not exists barra_lateral text not null default 'padrao';

comment on column public.platform_branding.raio is
  'Raio dos cantos da instalacao: suave, padrao (o visual de sempre) ou arredondado. Vocabulario fechado no CHECK; a organizacao pode sobrepor em settings.branding.raio. Linhas antigas nascem padrao.';
comment on column public.platform_branding.barra_lateral is
  'Barra lateral da instalacao: padrao (acompanha o tema) ou escura (sempre escura). Vocabulario fechado no CHECK; a organizacao pode sobrepor em settings.branding.barra_lateral. Linhas antigas nascem padrao.';

-- drop + add: torna a REGRA idempotente. O default 'padrao' garante que nenhuma
-- linha existente viole o CHECK.
alter table public.platform_branding
  drop constraint if exists platform_branding_raio;
alter table public.platform_branding
  add constraint platform_branding_raio check (raio in ('suave', 'padrao', 'arredondado'));
alter table public.platform_branding
  drop constraint if exists platform_branding_barra_lateral;
alter table public.platform_branding
  add constraint platform_branding_barra_lateral check (barra_lateral in ('padrao', 'escura'));

-- Forward-fix de fn_definir_marca_da_organizacao (ultima definicao: a da 0650,
-- neutros). O corpo e identico, mais: (1) validacao de `raio`/`barra_lateral`
-- (valor do vocabulario ou JSON null) e (2) a funcao SUBSTITUI o objeto
-- `branding` inteiro, entao as duas chaves entram na preservacao que ja existe
-- para os logos: enviada = manda, ausente = mantem a gravada.
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

  -- raio e barra_lateral: valor do vocabulario, ou JSON null = "herde da
  -- instalacao" (apaga a chave). Ao contrario de `neutros`, o null e aceito: e o
  -- unico jeito de dizer "apague" quando a chave AUSENTE significa "preserve".
  if not v_limpar and p_marca ? 'raio'
     and jsonb_typeof(p_marca -> 'raio') <> 'null'
     and (jsonb_typeof(p_marca -> 'raio') <> 'string'
          or (p_marca ->> 'raio') not in ('suave', 'padrao', 'arredondado'))
  then
    raise exception 'marca_da_organizacao_raio_invalido'
      using errcode = '22023';
  end if;

  if not v_limpar and p_marca ? 'barra_lateral'
     and jsonb_typeof(p_marca -> 'barra_lateral') <> 'null'
     and (jsonb_typeof(p_marca -> 'barra_lateral') <> 'string'
          or (p_marca ->> 'barra_lateral') not in ('padrao', 'escura'))
  then
    raise exception 'marca_da_organizacao_barra_lateral_invalida'
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

  -- Nome/cor/aparencia nao podem injetar nem apagar os arquivos, que tem rota propria.
  update public.organizations o
     set settings = case
       when v_limpar
         and coalesce(o.settings #>> '{branding,logo_path}', '') = ''
         and coalesce(o.settings #>> '{branding,logo_dark_path}', '') = ''
       then coalesce(o.settings, '{}'::jsonb) - 'branding'
       else jsonb_set(
       coalesce(o.settings, '{}'::jsonb), '{branding}',
       (case when v_limpar then '{}'::jsonb
             else p_marca - 'logo_path' - 'logo_dark_path' - 'raio' - 'barra_lateral' end)
       || jsonb_strip_nulls(jsonb_build_object(
         'logo_path', o.settings #> '{branding,logo_path}',
         'logo_dark_path', o.settings #> '{branding,logo_dark_path}',
         -- raio/barra_lateral: chave enviada manda (null = apaga, pelo strip);
         -- ausente = PRESERVA a gravada; limpar tudo = apaga. E o que faz salvar
         -- so o nome nunca levar embora uma escolha que o formulario nao enviou.
         'raio', case when v_limpar then null
                      when p_marca ? 'raio' then p_marca -> 'raio'
                      else o.settings #> '{branding,raio}' end,
         'barra_lateral', case when v_limpar then null
                               when p_marca ? 'barra_lateral' then p_marca -> 'barra_lateral'
                               else o.settings #> '{branding,barra_lateral}' end
       )), true) end
   where o.id = p_org;

  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$$;

revoke execute on function public.fn_definir_marca_da_organizacao(uuid, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.fn_definir_marca_da_organizacao(uuid, uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
