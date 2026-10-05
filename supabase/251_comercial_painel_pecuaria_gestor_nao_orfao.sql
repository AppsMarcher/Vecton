begin;

-- 251: territorios da coordenacao Pecuaria nunca sao "orfaos" no Painel de Vendas.
--
-- Orfao = responsavel == gestor da coordenacao de roteamento (soma direto no
-- gestor, sem card proprio). Na coordenacao Pecuaria, o gestor (hoje Andre) E
-- quem responde pela Pecuaria de todos os territorios roteados pra ela
-- (AM/AC/RN/AP/PE/CE/RJ/PB/ES...). Ao trocar Paulo por Andre na atribuicao, o
-- responsavel passou a ser igual ao gestor -> TODOS viraram orfaos e o card do
-- detalhamento da Pecuaria sumiu (zerado, so com o titulo). Nessa coordenacao o
-- card por territorio e o proprio detalhamento, entao nao se aplica a regra.
--
-- Patch por string-replace na funcao viva (padrao da 250) para nao sobrescrever
-- patches anteriores (072). Idempotente.

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_old text := 'and lower(btrim(co.gestor)) <> ''a definir'') as orfao';
  v_new text := 'and lower(btrim(co.gestor)) <> ''a definir''
      and not (co.nome = ''Pecuária'' and ln.nome = ''Pecuária'')) as orfao';
begin
  v_signature := to_regprocedure('public.comercial_painel_vendas(uuid,integer,integer,text,uuid)');
  if v_signature is null then raise exception 'comercial_painel_vendas não encontrada'; end if;
  v_definition := pg_get_functiondef(v_signature);
  if position(v_new in v_definition) = 0 then
    if position(v_old in v_definition) = 0 then
      raise exception 'Estrutura inesperada em comercial_painel_vendas';
    end if;
    v_definition := replace(v_definition, v_old, v_new);
    execute v_definition;
  end if;
end $$;

commit;
