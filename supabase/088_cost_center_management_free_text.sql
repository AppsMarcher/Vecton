begin;

-- A gestao de um centro de custo passa a ser validada pelo cadastro
-- (public.managements, tela Parametros > Gestoes) em vez de uma lista fixa.
--
-- Contexto: 001 criou cost_centers com um check inline das 10 gestoes que
-- existiam na epoca, e 017 adicionou um segundo check com o mesmo conteudo e
-- nome proprio. Enquanto qualquer um dos dois existir, criar uma gestao nova
-- na tela de Gestoes e vincula-la a um CC falha no INSERT/UPDATE com 23514,
-- mesmo com o dropdown do editor de CC ja oferecendo a opcao.
--
-- Nao ha FK para managements de proposito: cost_center_management guarda o
-- NOME (o app renomeia em cascata a partir da tela de Gestoes) e excluir uma
-- gestao nao pode bloquear nem apagar o CC — o comportamento atual, de o CC
-- ficar sem gestao e cair em "Sem area" nos relatorios, e mantido.

do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'cost_centers'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%cost_center_management%'
  loop
    execute format('alter table public.cost_centers drop constraint %I', con.conname);
    raise notice 'cost_centers: check removido -> %', con.conname;
  end loop;
end $$;

commit;
