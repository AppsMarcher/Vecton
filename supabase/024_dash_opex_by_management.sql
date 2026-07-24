begin;

-- Agregação server-side do OPEX por gestão para o donut do dashboard.
-- Evita transferir o ano inteiro de lançamentos do realizado só pra somar ~10
-- valores no cliente (gargalo de volume). O Postgres soma e devolve uma linha
-- por gestão. Respeita o acesso: p_management restringe à gestão do usuário
-- (Gestor/Analista); null = todas (Admin).
create or replace function public.dash_opex_by_management(
  p_org         uuid,
  p_year        integer,
  p_month_from  integer,
  p_month_to    integer,
  p_accounts    text[],
  p_management  text default null
)
returns table(management text, total numeric)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(cc.cost_center_management), ''), 'Outros') as management,
         sum(le.amount)::numeric as total
  from public.actuals_ledger_entries le
  left join public.cost_centers cc on cc.id = le.cost_center_id
  where public.is_org_member(p_org)
    and le.organization_id = p_org
    and le.reference_year = p_year
    and le.reference_month between p_month_from and p_month_to
    and le.account_number = any(p_accounts)
    and (p_management is null
         or btrim(cc.cost_center_management) = btrim(p_management))
  group by 1
$$;

grant execute on function public.dash_opex_by_management(uuid, integer, integer, integer, text[], text) to authenticated;

commit;
