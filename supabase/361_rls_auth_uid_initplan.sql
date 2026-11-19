begin;

-- Performance das políticas RLS: auth.uid() (e auth.jwt/role/email, current_setting) dentro de uma
-- política é reavaliado a CADA LINHA lida. Embrulhado em (select ...), o Postgres calcula uma vez por
-- consulta (initplan). O significado da política não muda, só o plano de execução.
-- O bloco lê a definição atual de cada política do schema public e reescreve só o que ainda não estiver
-- embrulhado; rodar de novo não altera nada (idempotente). Cobre as 26 políticas que o alerta
-- "auth_rls_initplan" do Supabase apontou (user_profiles, mensagens, relatórios, notificações etc.).
do $$
declare
  r record;
  v_qual text;
  v_check text;
  v_sql text;
  v_n integer := 0;
  c_pat constant text := '(?<!select )(auth\.(uid|jwt|role|email)\(\)|current_setting\([^)]*\))';
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    v_qual  := regexp_replace(r.qual, c_pat, '(select \1)', 'gi');
    v_check := regexp_replace(r.with_check, c_pat, '(select \1)', 'gi');

    if v_qual is distinct from r.qual or v_check is distinct from r.with_check then
      v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
      if v_qual is distinct from r.qual then
        v_sql := v_sql || ' using (' || v_qual || ')';
      end if;
      if v_check is distinct from r.with_check then
        v_sql := v_sql || ' with check (' || v_check || ')';
      end if;
      execute v_sql;
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice 'politicas reescritas: %', v_n;
end
$$;

commit;
