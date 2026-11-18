begin;

-- 1) Retorna linhas do ledger comercial de QUALQUER organização, sem conferir quem chama
--    (SECURITY DEFINER). O app, o robô de cargas e as Edge Functions não a chamam.
revoke execute on function public.comercial_campanhas_pendencias(uuid, integer, integer)
  from public, anon, authenticated;

-- 2) Auxiliares do módulo Estratégico, usadas só por outras funções SECURITY DEFINER
--    (strategic_can_view_a3, strategic_can_edit_a3, strategic_get_a3_detail), que rodam como o dono.
revoke execute on function public.strategic_a3_management(uuid) from public, anon, authenticated;
revoke execute on function public.strategic_a3_root_id(uuid) from public, anon, authenticated;
revoke execute on function public.strategic_kpi_target_accumulated(uuid, integer, integer, uuid)
  from public, anon, authenticated;

-- 3) Usadas em políticas RLS / storage de quem está logado: o papel authenticated continua,
--    só sai o acesso anônimo.
revoke execute on function public.is_rps_admin(uuid) from public, anon;
revoke execute on function public.rps_attachment_period_unlocked(text) from public, anon;

commit;
