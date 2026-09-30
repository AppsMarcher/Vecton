begin;

-- 250: reaplica na comercial_painel_vendas o patch da 072 (nome ATUAL do
-- vendedor da atribuicao em vez do texto gravado no ledger).
--
-- A 249 foi gerada a partir do corpo da 058 e sobrescreveu, sem querer, o patch
-- que a 072 aplica por string-replace na funcao viva. Efeito: o card voltava a
-- exibir o responsavel gravado na carga ("A definir") mesmo depois de a
-- atribuicao ser renomeada. Este bloco e o mesmo da 072 e e idempotente.

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_old text := 'coalesce(fat.responsavel, cart.responsavel, meta.responsavel, y1.responsavel, y2.responsavel, y3.responsavel, atrib.responsavel, sl.responsavel)';
  v_new text := 'public.comercial_current_seller_name_for_assignment(p_org, k.territorio_id, k.linha_negocio_id, make_date(p_year, v_hi, 1), coalesce(fat.responsavel, cart.responsavel, meta.responsavel, y1.responsavel, y2.responsavel, y3.responsavel, atrib.responsavel, sl.responsavel))';
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
