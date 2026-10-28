-- Territorio dos municipios de GO e MG passa a seguir a UF do municipio:
--   UF GO -> territorio GO; UF MG -> territorio MG; DF (Brasilia) continua em GO.
-- Antes (heranca de GO_MG NORTE/SUL, divisao por regiao):
--   183 municipios de MG estavam em GO e 24 municipios de GO estavam em MG.
-- Mexe so no mapa comercial_regioes_municipio (vale para as proximas cargas do robo).
-- NAO reprocessa o razao (comercial_realizado_ledger_entries): lancamentos ja gravados
-- mantem o territorio_id de quando foram carregados. Vendas dos vendedores 000274 e
-- 000590 seguem fixadas por codigo (robo-cargas/src/territorio.js).

do $$
declare
  v_org constant uuid := '0070482f-c2d5-4766-b20a-0549a7984e94';
  v_go  constant uuid := 'abdd1c44-0d04-44a1-aaa1-1c708e34f4dc';
  v_mg  constant uuid := '456737d3-45ff-48c5-b08d-23744c83d502';
  n_mg_para_mg int;
  n_go_para_go int;
begin
  if not exists (select 1 from public.comercial_territorios where id = v_go and organization_id = v_org and nome = 'GO')
     or not exists (select 1 from public.comercial_territorios where id = v_mg and organization_id = v_org and nome = 'MG') then
    raise exception 'Territorios GO/MG nao encontrados com os IDs esperados; aplique a 313 antes';
  end if;

  update public.comercial_regioes_municipio
     set territorio_id = v_mg
   where organization_id = v_org and territorio_id = v_go and uf = 'MG';
  get diagnostics n_mg_para_mg = row_count;

  update public.comercial_regioes_municipio
     set territorio_id = v_go
   where organization_id = v_org and territorio_id = v_mg and uf = 'GO';
  get diagnostics n_go_para_go = row_count;

  if n_mg_para_mg <> 183 or n_go_para_go <> 24 then
    raise exception 'Contagens inesperadas (MG->MG %, GO->GO %); esperado 183 e 24. Nada foi gravado.', n_mg_para_mg, n_go_para_go;
  end if;
end $$;
