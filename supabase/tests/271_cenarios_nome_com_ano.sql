-- Verificação da migration 271. Somente leitura.

-- A) PRÉ-CHECAGEM (rodar ANTES de aplicar a 271):
--    nomes que ficariam duplicados após acrescentar o ano. Esperado: 0 linhas.
select organization_id, novo_nome, count(*) as qtd
  from (
    select organization_id,
           case when name ~ (reference_year::text || '$')
                then name
                else name || ' ' || reference_year
           end as novo_nome
      from public.forecast_scenarios
  ) t
 group by organization_id, novo_nome
having count(*) > 1;

-- B) Situação atual: cenários e estrelas por organização (para conferência visual).
select organization_id, id, name, reference_year, cutoff_month, is_default
  from public.forecast_scenarios
 order by organization_id, reference_year, sort_order;

-- C) PÓS-APLICAÇÃO (rodar DEPOIS da 271). Cada consulta deve retornar 0.
-- C1) cenários cujo nome não termina com o ano
select count(*) as sem_ano_no_nome
  from public.forecast_scenarios
 where name !~ (reference_year::text || '$');

-- C2) nomes repetidos na mesma organização
select count(*) as nomes_duplicados
  from (
    select organization_id, name
      from public.forecast_scenarios
     group by organization_id, name
    having count(*) > 1
  ) t;

-- C3) organizações com mais de uma estrela
select count(*) as orgs_com_mais_de_uma_estrela
  from (
    select organization_id
      from public.forecast_scenarios
     where is_default
     group by organization_id
    having count(*) > 1
  ) t;

-- C4) o índice antigo (uma estrela por ano) não pode mais existir; o novo deve existir (esperado: 1)
select count(*) as indice_antigo_ainda_existe
  from pg_indexes
 where indexname = 'uq_forecast_scenarios_default_per_year';

select count(*) as indice_novo_existe
  from pg_indexes
 where indexname = 'uq_forecast_scenarios_default_per_org';
