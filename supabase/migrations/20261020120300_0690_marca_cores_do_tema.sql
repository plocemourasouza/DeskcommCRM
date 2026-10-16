-- manifest: **Aparencia da marca: cores do tema (variaveis de cor claro/escuro editaveis).** Coluna platform_branding.cores (jsonb objeto, default {}) e validacao + preservacao de settings.branding.cores em fn_definir_marca_da_organizacao (20 tokens fechados, hex minusculo).
-- 0690: cores do tema da marca (platform_branding.cores + chave na RPC da organizacao)
--
-- Aditiva e idempotente; linhas existentes ficam '{}'. Espelhada no apendice do baseline.sql.

alter table public.platform_branding
  add column if not exists cores jsonb not null default '{}'::jsonb;

comment on column public.platform_branding.cores is
  'Cores do tema da instalacao: { claro?: {token: #rrggbb}, escuro?: {...} }, tokens de vocabulario fechado (validado no app); a organizacao pode sobrepor em settings.branding.cores. Linhas antigas nascem {} (tema de fabrica).';

-- drop + add: torna a REGRA idempotente. O default '{}' garante que nenhuma
-- linha existente viole o CHECK.
alter table public.platform_branding
  drop constraint if exists platform_branding_cores;
alter table public.platform_branding
  add constraint platform_branding_cores check (jsonb_typeof(cores) = 'object');

-- Forward-fix de fn_definir_marca_da_organizacao (ultima definicao: a da 0689,
-- fonte). O corpo e identico, mais a chave `cores`: validacao (objeto com
-- claro/escuro, tokens fechados, hex minusculo, ou JSON null) e preservacao
-- (enviada = manda, null = apaga, ausente = mantem a gravada).
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

  if not v_limpar and p_marca ? 'fonte'
     and jsonb_typeof(p_marca -> 'fonte') <> 'null'
     and (jsonb_typeof(p_marca -> 'fonte') <> 'string'
          or (p_marca ->> 'fonte') not in ('atkinson', 'manrope', 'jakarta', 'plex-sans', 'bricolage', 'fraunces', 'source-serif'))
  then
    raise exception 'marca_da_organizacao_fonte_invalida'
      using errcode = '22023';
  end if;

  if not v_limpar and p_marca ? 'densidade'
     and jsonb_typeof(p_marca -> 'densidade') <> 'null'
     and (jsonb_typeof(p_marca -> 'densidade') <> 'string'
          or (p_marca ->> 'densidade') not in ('aerada', 'equilibrada', 'compacta'))
  then
    raise exception 'marca_da_organizacao_densidade_invalida'
      using errcode = '22023';
  end if;

  -- cores: objeto { claro?, escuro? } de objetos { token: '#rrggbb' }, tokens de
  -- vocabulario fechado; JSON null = "herde" (apaga a chave). Aninhado em ifs
  -- porque jsonb_each estoura em nao-objeto e o SQL nao garante curto-circuito.
  if not v_limpar and p_marca ? 'cores'
     and jsonb_typeof(p_marca -> 'cores') <> 'null'
  then
    if jsonb_typeof(p_marca -> 'cores') <> 'object' then
      raise exception 'marca_da_organizacao_cores_invalidas'
        using errcode = '22023';
    end if;
    if exists (
         select 1 from jsonb_each(p_marca -> 'cores') t(k, v)
          where t.k not in ('claro', 'escuro') or jsonb_typeof(t.v) <> 'object'
       )
       or exists (
         select 1
           from jsonb_each(p_marca -> 'cores') t(k, v),
                jsonb_each(case when jsonb_typeof(t.v) = 'object' then t.v else '{}'::jsonb end) i(ik, iv)
          where i.ik not in ('bg', 'surface', 'surface-elevated', 'text', 'text-muted', 'text-subtle',
                             'border', 'border-strong', 'success', 'success-bg', 'success-fg',
                             'warning', 'warning-bg', 'warning-fg', 'error', 'error-bg', 'error-fg',
                             'info', 'info-bg', 'info-fg')
             or jsonb_typeof(i.iv) <> 'string'
             or (i.iv #>> '{}') !~ '^#[0-9a-f]{6}$'
       )
    then
      raise exception 'marca_da_organizacao_cores_invalidas'
        using errcode = '22023';
    end if;
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
             else p_marca - 'logo_path' - 'logo_dark_path' - 'raio' - 'barra_lateral' - 'densidade' - 'fonte' - 'cores' end)
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
                               else o.settings #> '{branding,barra_lateral}' end,
         'densidade', case when v_limpar then null
                           when p_marca ? 'densidade' then p_marca -> 'densidade'
                           else o.settings #> '{branding,densidade}' end,
         'fonte', case when v_limpar then null
                       when p_marca ? 'fonte' then p_marca -> 'fonte'
                       else o.settings #> '{branding,fonte}' end,
         'cores', case when v_limpar then null
                       when p_marca ? 'cores' then p_marca -> 'cores'
                       else o.settings #> '{branding,cores}' end
       )), true) end
   where o.id = p_org;

  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$$;

revoke execute on function public.fn_definir_marca_da_organizacao(uuid, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.fn_definir_marca_da_organizacao(uuid, uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
