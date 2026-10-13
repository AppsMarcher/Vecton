-- 04: substitui o REALIZADO de 2025 (meses presentes no arquivo) pelas linhas do staging.
-- Tudo em UMA transacao: se qualquer linha falhar na validacao do sistema, NADA e alterado.
-- Usa o mesmo caminho da tela de carga (lote 'complete' por mes + apply_comercial_realizado_import_batch).
-- Se estourar o tempo limite do editor, ajuste v_mes_ini / v_mes_fim (ex.: 1..6 e depois 7..12) e rode de novo.
begin;

-- Evita 1 notificacao/e-mail por lote aplicado (o trigger e reativado no fim, na mesma transacao).
alter table public.comercial_realizado_import_batches disable trigger trg_notify_batch_applied;

do $$
declare
  v_ano     constant integer := 2025;
  v_mes_ini constant integer := 1;
  v_mes_fim constant integer := 12;
  v_org     uuid;
  v_uid     uuid;
  v_mes     integer;
  v_batch   uuid;
  v_total   integer;
  v_erros   integer;
  v_detalhe text;
begin
  select id into v_org from public.organizations where name = 'Marcher Brasil' limit 1;
  if v_org is null then raise exception 'Organizacao Marcher Brasil nao encontrada'; end if;
  select user_id into v_uid from public.organization_users where organization_id = v_org and role = 'owner' order by created_at limit 1;
  if v_uid is null then raise exception 'Nenhum owner encontrado em organization_users'; end if;

  -- Assume o owner nesta transacao (a funcao de aplicar exige is_org_editor(auth.uid())).
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  for v_mes in
    select distinct extract(month from data)::integer from public.stg_carga_vendas_2023_2026
    where extract(year from data) = v_ano and extract(month from data) between v_mes_ini and v_mes_fim
    order by 1
  loop
    insert into public.comercial_realizado_import_batches
      (organization_id, reference_year, reference_month, load_mode, source_type, source_file_name, status, uploaded_by, notes)
    values
      (v_org, v_ano, v_mes, 'complete', 'file', '2023 a 2026.xlsx', 'draft', v_uid, 'Carga unica via SQL (staging stg_carga_vendas_2023_2026) - novo layout FAT/RL/MP')
    returning id into v_batch;

    insert into public.comercial_realizado_import_rows
      (batch_id, row_number, origem, tipo_informado, entry_date, documento, cod_produto, cod_cliente, cod_vendedor, cod_territorio, quantidade, valor, rl, mp, mb_pct, raw_payload)
    select v_batch, row_number() over (order by s.n), s.origem, s.tipo, s.data, s.documento, s.cod_produto, s.cod_cliente, s.cod_vendedor, nullif(btrim(s.territorio), ''),
           s.qtd, s.fat, s.rl, s.mp,
           case when s.rl is not null and s.mp is not null and s.rl <> 0 then s.mp / s.rl end,
           jsonb_build_object('arquivo', '2023 a 2026.xlsx', 'linha_excel', s.n)
    from public.stg_carga_vendas_2023_2026 s
    where extract(year from s.data) = v_ano and extract(month from s.data) = v_mes
    order by s.n;

    select count(*), count(*) filter (where validation_status <> 'valid') into v_total, v_erros
    from public.comercial_realizado_import_rows where batch_id = v_batch;

    if v_erros > 0 then
      select string_agg('linha excel ' || (r.raw_payload ->> 'linha_excel') || ': ' || r.validation_errors::text, E'\n') into v_detalhe
      from (select * from public.comercial_realizado_import_rows where batch_id = v_batch and validation_status <> 'valid' order by row_number limit 25) r;
      raise exception E'Mes %/%: % de % linhas com erro de validacao (nada foi alterado). Primeiras:\n%', v_mes, v_ano, v_erros, v_total, v_detalhe;
    end if;

    perform public.apply_comercial_realizado_import_batch(v_batch);
    raise notice 'Mes %/% aplicado: % linhas', v_mes, v_ano, v_total;
  end loop;
end $$;

alter table public.comercial_realizado_import_batches enable trigger trg_notify_batch_applied;

commit;
