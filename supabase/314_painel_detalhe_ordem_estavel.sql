-- 314: ordem estavel em comercial_painel_detalhe.
-- O drill-down do Painel de Vendas passou a buscar o detalhe em paginas de 1.000
-- linhas (o PostgREST corta cada resposta em max-rows e o excel/popover vinham
-- truncados). Paginar exige ordem deterministica: "order by valor desc" sozinho
-- empata (varias NFs com o mesmo valor) e linhas se repetiriam/sumiriam entre
-- paginas. Acrescenta o id como desempate, preservando o resto da funcao
-- (inclusive o patch da carteira vigente da 311).

do $do$
declare
  v_signature regprocedure := to_regprocedure('public.comercial_painel_detalhe(uuid,integer,integer,text,text[],text[],text,text,text,text)');
  v_def text;
begin
  if v_signature is null then raise exception 'comercial_painel_detalhe nao encontrada'; end if;
  v_def := replace(pg_get_functiondef(v_signature), E'\r', '');
  if position('le.valor desc nulls last, le.id' in v_def) = 0 then   -- idempotente
    if position('order by le.valor desc nulls last' in v_def) = 0 then
      raise exception 'Estrutura inesperada em comercial_painel_detalhe';
    end if;
    execute replace(v_def, 'order by le.valor desc nulls last', 'order by le.valor desc nulls last, le.id');
  end if;
end $do$;
