begin;

-- 312: a validacao de linha do lote deixa de exigir "data dentro do mes do lote" para a CARTEIRA (origem CART).
--
-- Motivo (311): o robo passa a gravar, no lote do mes corrente, toda a carteira aberta; cada linha leva a data de
-- entrega prevista (marco, setembro, novembro...). A regra "Data fora da competencia do lote" reprovaria essas linhas.
-- O FAT continua exigindo a data dentro do mes do lote. Data vazia continua obrigatoria para todos.
-- Efeito colateral aceito: a carga manual de carteira tambem deixa de exigir a data dentro do mes.
--
-- Aplicada por regexp na definicao viva da funcao (tolerante a fim de linha CRLF). Idempotente.
-- Ordem: 311 -> 312 -> carga do robo.

do $do$
declare
  v_signature regprocedure := to_regprocedure('public.validate_comercial_realizado_import_row()');
  v_def text;
  v_antigo constant text := $q$elsif extract\(year from new\.entry_date\)::integer <> batch_rec\.reference_year\s+or extract\(month from new\.entry_date\)::integer <> batch_rec\.reference_month then$q$;
  v_novo constant text := $q$elsif norm_origem is distinct from 'CART' and (extract(year from new.entry_date)::integer <> batch_rec.reference_year or extract(month from new.entry_date)::integer <> batch_rec.reference_month) then   -- 312: CART dispensa a competencia$q$;
begin
  if v_signature is null then raise exception 'validate_comercial_realizado_import_row nao encontrada'; end if;
  v_def := replace(pg_get_functiondef(v_signature), E'\r', '');
  if position('312: CART dispensa a competencia' in v_def) = 0 then
    if v_def !~ v_antigo then raise exception 'Estrutura inesperada em validate_comercial_realizado_import_row'; end if;
    v_def := regexp_replace(v_def, v_antigo, v_novo);
    execute v_def;
  end if;
end $do$;

commit;
