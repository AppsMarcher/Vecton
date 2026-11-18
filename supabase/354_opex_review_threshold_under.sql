begin;

-- Amplia a direção da sinaleira: 'under' = só sinaliza real abaixo da meta (além de 'over' e 'both').
alter table public.opex_variance_thresholds drop constraint if exists opex_variance_thresholds_direction_check;
alter table public.opex_variance_thresholds
  add constraint opex_variance_thresholds_direction_check check (direction in ('over', 'under', 'both'));

create or replace function public.opex_save_thresholds(p_org uuid, p_values jsonb, p_expected_version integer)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare t public.opex_variance_thresholds; ym numeric; yp numeric; rm numeric; rp numeric; dir text;
begin
  if auth.uid() is null or not public.opex_is_admin(p_org) then raise exception 'Somente administradores alteram os parâmetros' using errcode = '42501'; end if;
  ym := (p_values ->> 'yellowMoney')::numeric; yp := (p_values ->> 'yellowPct')::numeric;
  rm := (p_values ->> 'redMoney')::numeric; rp := (p_values ->> 'redPct')::numeric;
  dir := coalesce(p_values ->> 'direction', 'over');
  if ym is null or yp is null or rm is null or rp is null or least(ym, yp, rm, rp) <= 0 or rm < ym or rp < yp
     or dir not in ('over', 'under', 'both') then
    raise exception 'Limites inválidos' using errcode = '22023';
  end if;
  select * into t from public.opex_variance_thresholds where organization_id = p_org for update;
  if not found then
    if coalesce(p_expected_version, 0) <> 0 then raise exception 'Versão desatualizada' using errcode = '40001'; end if;
    insert into public.opex_variance_thresholds (organization_id, yellow_money, yellow_pct, red_money, red_pct, direction, version, updated_by)
    values (p_org, ym, yp, rm, rp, dir, 1, auth.uid());
  else
    if p_expected_version is distinct from t.version then raise exception 'Versão desatualizada' using errcode = '40001'; end if;
    update public.opex_variance_thresholds set yellow_money = ym, yellow_pct = yp, red_money = rm, red_pct = rp, direction = dir,
      version = t.version + 1, updated_by = auth.uid(), updated_at = now() where organization_id = p_org;
  end if;
  return public.opex_get_thresholds(p_org);
end;
$$;

revoke all on function public.opex_save_thresholds(uuid, jsonb, integer) from public, anon;
grant execute on function public.opex_save_thresholds(uuid, jsonb, integer) to authenticated;

commit;
