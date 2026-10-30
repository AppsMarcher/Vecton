-- FAT: a leitura passa a informar se a pessoa enxerga o todo ("whole").
-- Enxerga o todo quem e admin, quem tem a coordenacao MARCHER liberada ou quem tem TODAS as coordenacoes da Atribuicao vigente liberadas
-- (leitura ou escrita). A tela usa isso para abrir o formulario em Marcher; as demais pessoas abrem em Coordenacao ou Regiao.
-- A funcao de leitura da 322 vira planning_fat_read_base (sem acesso direto); a nova planning_fat_read so acrescenta a chave.
begin;

do $$begin
 if not exists(select 1 from pg_proc where proname='planning_fat_read_base' and pronamespace='public'::regnamespace) then
   alter function public.planning_fat_read(uuid,uuid,date) rename to planning_fat_read_base;
 end if;
end $$;
revoke all on function public.planning_fat_read_base(uuid,uuid,date) from public,anon,authenticated;

create or replace function public.planning_fat_read(p_org uuid,p_form uuid,p_asof date default current_date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare r jsonb;whole boolean;
begin
 r:=public.planning_fat_read_base(p_org,p_form,p_asof);
 whole:=public.planning_is_admin(p_org)
   or exists(select 1 from public.planning_fat_coord_access a where a.form_id=p_form and a.user_id=auth.uid() and a.coord_key='MARCHER')
   or (exists(select 1 from public.planning_fat_coord_scope(p_org))
       and not exists(select 1 from public.planning_fat_coord_scope(p_org) s
         where not exists(select 1 from public.planning_fat_coord_access a where a.form_id=p_form and a.user_id=auth.uid() and a.coord_key=s.coord_key)));
 return r||jsonb_build_object('whole',coalesce(whole,false));
end $$;
revoke all on function public.planning_fat_read(uuid,uuid,date) from public,anon;
grant execute on function public.planning_fat_read(uuid,uuid,date) to authenticated;

commit;
