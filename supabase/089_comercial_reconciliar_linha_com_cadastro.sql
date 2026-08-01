begin;

-- 089: reconcilia a LINHA DE NEGOCIO gravada nas cargas comerciais com o TIPO
-- ATUAL do cadastro de produto (realizado + planejado).
--
-- PROBLEMA
-- O box lateral do Painel de Vendas (RPC comercial_painel_tipos, 044) agrupa por
-- pr.tipo_id -- resolve o tipo NA HORA DA CONSULTA, entao reflete a edicao do
-- cadastro na mesma hora. Ja o card de coordenacao (RPC comercial_painel_vendas,
-- 058) e a tabela de Pecas (RPC comercial_painel_pecas_vendedor, 087) leem
-- linha_negocio_id / coordenacao_id / responsavel GRAVADOS no ledger, derivados
-- uma unica vez na validacao da carga (049 no realizado, 045 no planejado).
-- Trocar o tipo de um produto no cadastro (ex.: Pecas -> Acessorios) NAO
-- reescreve o ledger, entao o box muda e o card/tabela ficam no numero antigo.
--
-- SOLUCAO
-- Nao mexe no ledger na mao. Reprocessa a STAGING (import_rows) das linhas
-- divergentes: a trigger BEFORE de validacao re-deriva linha/coordenacao/
-- responsavel a partir do cadastro atual, e a trigger AFTER
-- (after_comercial_*_import_row_change) faz o upsert no ledger dos lotes que ja
-- estao 'applied'. Resultado: staging, ledger e auditoria ficam consistentes
-- entre si, com trilha completa em comercial_*_row_audit / _ledger_audit.
--   * realizado: seta tipo_informado = tipo do cadastro (a 049 tornou o tipo da
--     planilha a fonte de verdade do roteamento, e ha um check de coerencia que
--     travaria a linha se ele continuasse divergindo do cadastro).
--   * planejado: nao tem coluna de tipo -- a linha e derivada direto do cadastro,
--     entao basta um UPDATE no-op para disparar a re-derivacao.
--
-- E RE-EXECUTAVEL: se nada divergir, atualiza 0 linhas.
--
-- EFEITO ESPERADO no caso que motivou esta migration (1 produto reclassificado
-- de Pecas para Acessorios): as linhas saem de linha_negocio='Peças'
-- (coordenacao Pecas / titular nacional) para linha_negocio='Outros' com
-- coordenacao e responsavel NULOS -- por desenho (040/045), Transgrain e
-- Acessorios entram "so valor, sem gestao". Elas somem do card de Pecas e da
-- tabela de Pecas e passam a aparecer somente no box lateral, na linha
-- Acessorios. Card e box passam a bater.
--
-- SEGURANCA
-- Tudo numa transacao unica. Se alguma linha reprocessada nao passar na
-- validacao atual, a trigger levanta excecao ('Lotes aplicados nao aceitam
-- linhas invalidas') e NADA e aplicado -- o banco fica como estava. Os dois
-- motivos mais provaveis (quantidade ausente ao sair de Pecas) sao checados
-- antes, com mensagem clara.
--
-- OBSERVACOES
-- - Rodando pelo SQL editor, auth.uid() e nulo: as linhas de ledger tocadas
--   ficam com updated_by nulo. Nao afeta numero, so a autoria do registro.
-- - Uma nova carga do MESMO arquivo original (com o tipo antigo na coluna
--   `tipo`) volta a travar na validacao com "Tipo informado (X) diverge do
--   cadastro do produto (Y)" -- comportamento correto da 049: a planilha
--   precisa ser corrigida junto com o cadastro.
-- - LIMITE CONHECIDO: a deteccao compara o produto REFERENCIADO pela linha
--   (produto_id). Linha de Pecas cujo codigo nao existia no cadastro na hora da
--   carga aponta para o generico PECAS-DIVERSAS (049); se esse codigo for
--   cadastrado depois com outro tipo, esta migration nao a enxerga -- esse caso
--   e "produto novo", nao reclassificacao, e se resolve recarregando o lote.

-- ---------------------------------------------------------------------------
-- Alvos: linhas validas cuja linha_negocio gravada nao bate com o cadastro
-- ---------------------------------------------------------------------------

create temporary table _recon_089_realizado on commit drop as
select
  r.id                as row_id,
  b.reference_year    as ano,
  b.reference_month   as mes,
  b.status            as batch_status,
  r.cod_produto,
  t.nome              as tipo_cadastro,
  ln.nome             as linha_gravada,
  r.origem,
  r.quantidade,
  r.valor,
  case
    when t.nome = 'Peças' then 'Peças'
    when t.nome = 'Máquinas' and c.nome = 'Grãos' then 'Grão'
    when t.nome = 'Máquinas' and c.nome = 'Pecuária' then 'Pecuária'
    when t.nome in ('Transgrain', 'Acessórios') then 'Outros'
  end                 as linha_cadastro
from public.comercial_realizado_import_rows r
join public.comercial_realizado_import_batches b on b.id = r.batch_id
join public.comercial_produtos p on p.id = r.produto_id
join public.comercial_tipos t on t.id = p.tipo_id
left join public.comercial_culturas c on c.id = p.cultura_id
left join public.comercial_linhas_negocio ln on ln.id = r.linha_negocio_id
where r.validation_status = 'valid';

delete from _recon_089_realizado
where linha_cadastro is null                       -- Maquinas sem cultura: erro de cadastro, nao reclassificacao
   or linha_cadastro is not distinct from linha_gravada;

create temporary table _recon_089_planejado on commit drop as
select
  r.id                as row_id,
  b.reference_year    as ano,
  coalesce(r.reference_month, b.reference_month) as mes,
  b.status            as batch_status,
  b.scenario_id,
  r.cod_produto,
  t.nome              as tipo_cadastro,
  ln.nome             as linha_gravada,
  r.quantidade,
  r.valor,
  case
    when t.nome = 'Peças' then 'Peças'
    when t.nome = 'Máquinas' and c.nome = 'Grãos' then 'Grão'
    when t.nome = 'Máquinas' and c.nome = 'Pecuária' then 'Pecuária'
    when t.nome in ('Transgrain', 'Acessórios') then 'Outros'
  end                 as linha_cadastro
from public.comercial_planejado_import_rows r
join public.comercial_planejado_import_batches b on b.id = r.batch_id
join public.comercial_produtos p on p.id = r.produto_id
join public.comercial_tipos t on t.id = p.tipo_id
left join public.comercial_culturas c on c.id = p.cultura_id
left join public.comercial_linhas_negocio ln on ln.id = r.linha_negocio_id
where r.validation_status = 'valid';

delete from _recon_089_planejado
where linha_cadastro is null
   or linha_cadastro is not distinct from linha_gravada;

-- ---------------------------------------------------------------------------
-- Pre-checagens (falham cedo, com mensagem legivel, sem alterar nada)
-- ---------------------------------------------------------------------------

do $$
declare
  v_bad integer;
begin
  -- Realizado: quantidade so e opcional em Pecas (049). Linha saindo de Pecas
  -- sem quantidade viraria erro de validacao e abortaria tudo la na frente.
  select count(*) into v_bad
  from _recon_089_realizado
  where linha_cadastro <> 'Peças' and quantidade is null;

  if v_bad > 0 then
    raise exception
      'Reconciliacao abortada: % linha(s) de REALIZADO sairiam de Pecas sem quantidade preenchida (quantidade so e opcional em Pecas). Preencha a quantidade na tela de Carga de Vendas antes de rodar esta migration.', v_bad;
  end if;

  -- Planejado: quantidade so e opcional em "Outros" (045).
  select count(*) into v_bad
  from _recon_089_planejado
  where linha_cadastro <> 'Outros' and quantidade is null;

  if v_bad > 0 then
    raise exception
      'Reconciliacao abortada: % linha(s) de PLANEJADO passariam a exigir quantidade (so "Outros" aceita meta sem quantidade). Preencha a quantidade na tela de Carga de Planejado antes de rodar esta migration.', v_bad;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reprocessamento
-- ---------------------------------------------------------------------------

-- Realizado: o tipo informado passa a ser o do cadastro; a trigger BEFORE
-- re-deriva linha/coordenacao/responsavel e a AFTER sincroniza o ledger.
update public.comercial_realizado_import_rows r
   set tipo_informado = a.tipo_cadastro
  from _recon_089_realizado a
 where r.id = a.row_id;

-- Planejado: sem coluna de tipo -- UPDATE no-op so para disparar a trigger de
-- validacao, que re-deriva tudo a partir do cadastro atual.
update public.comercial_planejado_import_rows r
   set cod_produto = r.cod_produto
  from _recon_089_planejado a
 where r.id = a.row_id;

-- ---------------------------------------------------------------------------
-- Relatorio do que foi reprocessado (ultimo resultado exibido pelo SQL editor)
-- ---------------------------------------------------------------------------

select
  'realizado'    as fonte,
  ano,
  mes,
  batch_status,
  cod_produto,
  tipo_cadastro  as tipo_no_cadastro,
  linha_gravada  as linha_antiga,
  linha_cadastro as linha_nova,
  count(*)       as linhas,
  sum(valor)     as valor_total
from _recon_089_realizado
group by 1,2,3,4,5,6,7,8
union all
select
  'planejado',
  ano,
  mes,
  batch_status,
  cod_produto,
  tipo_cadastro,
  linha_gravada,
  linha_cadastro,
  count(*),
  sum(valor)
from _recon_089_planejado
group by 1,2,3,4,5,6,7,8
order by valor_total desc;

commit;
