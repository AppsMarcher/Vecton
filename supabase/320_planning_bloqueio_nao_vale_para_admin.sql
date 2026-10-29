-- Bloqueio do cenário (status 'locked' ou lock_at vencido) vale só para usuários comuns:
-- administradores continuam editando formulários, linhas, CAPEX e FAT para poder
-- manter o cenário enquanto os usuários ficam impedidos de lançar.
-- A alteração do próprio bloqueio (ação 'lock') já era exclusiva de administrador.
--
-- As cinco funções são reescritas a partir da definição vigente no banco (pg_get_functiondef),
-- trocando só a condição do bloqueio; assim os corpos longos não são duplicados aqui.
begin;

do $$
declare
  fn text;
  def text;
  novo text;
  alvo constant text := '(s.status=''locked'' or s.lock_at<=clock_timestamp()) and not public.planning_is_admin(p_org)';
begin
  foreach fn in array array[
    'public.planning_write_before_fat(uuid,text,uuid,jsonb)',
    'public.planning_capex_write(uuid,text,uuid,jsonb)',
    'public.planning_capex_destination_save(uuid,uuid,jsonb)',
    'public.planning_reorder_lines(uuid,uuid,uuid,uuid[])',
    'public.planning_fat_write(uuid,text,uuid,jsonb)'
  ] loop
    def := pg_get_functiondef(fn::regprocedure);
    novo := replace(def, 's.status=''locked'' or s.lock_at<=clock_timestamp()', alvo);
    novo := replace(novo, 's.status = ''locked'' or s.lock_at <= clock_timestamp()', alvo);
    if novo = def then raise exception 'Condição de bloqueio não encontrada em %', fn; end if;
    execute novo;
  end loop;
end $$;

commit;
