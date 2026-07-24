-- Diagnostico (nao e migration): inspeciona o lote pequeno (12 linhas,
-- modo "complete", aplicado hoje 2026-07-23) pra confirmar se ele cobre o
-- mes de Junho/2026 — se cobrir, ele apagou o que o lote de 646 linhas
-- (21/07, modo "additional") tinha carregado pra Maquinas naquele mes,
-- porque "complete" apaga TODOS os lancamentos do(s) mes(es) presentes no
-- arquivo antes de inserir so as linhas desse arquivo.
select
  r.reference_month, r.cod_produto, r.territorio, r.quantidade, r.valor,
  r.validation_status
from public.comercial_planejado_import_rows r
where r.batch_id = 'd3e59323-63b1-4bbc-8611-3c4c22715fb5'
order by r.reference_month, r.cod_produto;
