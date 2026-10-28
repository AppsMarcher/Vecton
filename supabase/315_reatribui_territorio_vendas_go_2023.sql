-- Correcao pontual do razao: 5 lancamentos de 2023 (Itumbiara e Mineiros/GO) gravados no
-- territorio MG (heranca do antigo GO_MG SUL) passam para GO, como pede o mapa de
-- municipios desde a migration 314 (territorio = UF). Responsavel acompanha a atribuicao
-- vigente de GO + linha na data do lancamento. Coordenacao e campanha nao mudam
-- (coordenacao igual nos dois territorios; campanha_status = sem_atribuicao_valida).
-- Nao toca Pecas (373 lancamentos): la o territorio gravado e so referencia.
--
-- DESFAZER (valores originais):
--   territorio_id = '456737d3-45ff-48c5-b08d-23744c83d502' (MG) nas 5 linhas
--   responsavel: RENAN BORBA nas 4 de Grao (63ffcf5f..., bf28da28..., b2018f78..., abec3c73...)
--                NULL na de Outros (69b7210e...)

do $$
declare
  v_org constant uuid := '0070482f-c2d5-4766-b20a-0549a7984e94';
  v_go  constant uuid := 'abdd1c44-0d04-44a1-aaa1-1c708e34f4dc';
  v_mg  constant uuid := '456737d3-45ff-48c5-b08d-23744c83d502';
  v_ids constant uuid[] := array[
    '63ffcf5f-9e26-4b77-a563-4c14ff4c2709',
    '69b7210e-7eda-46e1-b250-7ebb560008ec',
    'bf28da28-d39e-44f3-b90e-a179a534f2f7',
    'b2018f78-43f9-45fd-8db4-f4c243f47bc0',
    'abec3c73-ef02-4d68-adb1-716250f7caa1'
  ]::uuid[];
  n int;
  v_valor numeric;
begin
  update public.comercial_realizado_ledger_entries e
     set territorio_id = v_go,
         responsavel = (select ar.responsavel
                          from public.comercial_atribuicao_responsavel ar
                         where ar.organization_id = e.organization_id
                           and ar.territorio_id = v_go
                           and ar.linha_negocio_id = e.linha_negocio_id
                           and ar.data_inicio <= e.entry_date
                           and (ar.data_fim is null or ar.data_fim >= e.entry_date)
                         limit 1)
   where e.organization_id = v_org
     and e.id = any(v_ids)
     and e.territorio_id = v_mg;
  get diagnostics n = row_count;

  select sum(valor) into v_valor
    from public.comercial_realizado_ledger_entries where id = any(v_ids);

  if n <> 5 or v_valor <> 385113.44 then
    raise exception 'Esperado 5 linhas e R$ 385.113,44; obtido % linhas e R$ %. Nada foi gravado.', n, v_valor;
  end if;
end $$;
