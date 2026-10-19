-- Fórmulas passam a usar a sequência: <1> + <2>.
-- Aplicar antes do frontend desta alteração. Preserva referências existentes.
begin;
lock table public.planning_form_lines in access exclusive mode;
-- Reconstrói cada expressão uma única vez, evitando colisões como A -> 2 -> 3.
update public.planning_form_lines l set formula_text=(
  select string_agg(case when t.part[1] ~ '^<[A-Za-z0-9_]+>$' then
    coalesce((select '<'||d.seq::text||'>' from public.planning_form_lines d
      where d.form_id=l.form_id and d.formula_name=substring(t.part[1] from 2 for length(t.part[1])-2)),t.part[1])
    else t.part[1] end,'' order by t.ordinality)
  from regexp_matches(l.formula_text,'(<[A-Za-z0-9_]+>|[^<]+|<)','g') with ordinality t(part,ordinality)
) where l.origin='formula';
-- A referência interna permanece apenas por compatibilidade com as RPCs da 278.
alter table public.planning_form_lines drop constraint planning_form_lines_form_id_formula_name_key;
update public.planning_form_lines set formula_name=case when origin='label' then null else seq::text end;
alter table public.planning_form_lines add constraint planning_form_lines_form_id_formula_name_key unique(form_id,formula_name);
-- Invalida grades e rascunhos abertos com a estrutura anterior.
update public.planning_forms set revision=revision+1;
create or replace function public.planning_line_sequence_reference()
returns trigger language plpgsql set search_path=public as $$
begin
  new.formula_name:=case when new.origin='label' then null else new.seq::text end;
  return new;
end;
$$;
revoke all on function public.planning_line_sequence_reference() from public;
create trigger planning_line_sequence_reference before insert or update on public.planning_form_lines
for each row execute function public.planning_line_sequence_reference();
do $$ declare f record; begin
  for f in select id from public.planning_forms loop
    perform public.planning_validate_form(f.id);
  end loop;
end $$;
commit;
