-- Renomeia os territorios GO_MG NORTE -> GO e GO_MG SUL -> MG.
-- Preserva os IDs: ledger, atribuicoes e municipios apontam por territorio_id,
-- entao nada precisa ser reprocessado. Vendas por cod_vendedor (000274 e 000590)
-- continuam intactas, inclusive fora do territorio.
-- Rodar JUNTO com o deploy do front (reportsComercialPainelModule.js) e do robo
-- (robo-cargas/src/territorio.js): ambos casam o territorio pelo nome.

do $$
declare
  v_org constant uuid := '0070482f-c2d5-4766-b20a-0549a7984e94';
  v_norte constant uuid := 'abdd1c44-0d04-44a1-aaa1-1c708e34f4dc';
  v_sul constant uuid := '456737d3-45ff-48c5-b08d-23744c83d502';
begin
  if exists (select 1 from public.comercial_territorios
             where organization_id = v_org and nome in ('GO', 'MG')) then
    raise exception 'Territorio GO ou MG ja existe; renomeacao abortada';
  end if;

  update public.comercial_territorios set nome = 'GO'
   where id = v_norte and organization_id = v_org and nome = 'GO_MG NORTE';
  if not found then raise exception 'GO_MG NORTE nao encontrado com o ID esperado'; end if;

  update public.comercial_territorios set nome = 'MG'
   where id = v_sul and organization_id = v_org and nome = 'GO_MG SUL';
  if not found then raise exception 'GO_MG SUL nao encontrado com o ID esperado'; end if;
end $$;
