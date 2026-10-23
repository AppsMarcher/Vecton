begin;

-- 308: carga semi-automatica do Balanco Patrimonial (robo "Protheus -> Vecton").
--
--   1. carga_automatica_pedido ganha reference_year/reference_month: o card do BP deixa escolher o mes
--      fechado a carregar; o robo carrega exatamente esse mes. Pedidos das outras cargas seguem sem mes.
--   2. carga_automatica_config: linha do job 'bp'. Sem horarios (so roda sob demanda, pelo "Carregar agora"),
--      mas ligada para tambem poder ser executada pela linha de comando (node src/index.js bp --mes=AAAA-MM).
--
-- O robo grava o fechamento pelas mesmas funcoes da tela (bp_save_draft + bp_apply_draft), que exigem o usuario
-- do robo com perfil Administrador (can_manage_bp_plan).

alter table public.carga_automatica_pedido add column if not exists reference_year  integer;
alter table public.carga_automatica_pedido add column if not exists reference_month integer;

alter table public.carga_automatica_pedido drop constraint if exists carga_automatica_pedido_referencia_check;
alter table public.carga_automatica_pedido add constraint carga_automatica_pedido_referencia_check check (
  (reference_year is null and reference_month is null)
  or (reference_year between 2000 and 2200 and reference_month between 1 and 12)
);

insert into public.carga_automatica_config (organization_id, job, descricao, enabled, meses_atras, meses_frente, horarios, params)
select o.id, 'bp', 'Balanco Patrimonial - saldo acumulado no fechamento do mes (CQ0 + CT2) - sob demanda', true, 0, 0,
       '{}'::text[],
       jsonb_build_object(
         'conta_de', '1',
         'conta_ate', '2zzzzzzzzzzzzzzzz',
         'queda_max_pct', 30,
         'diretorio_saida', 'C:\robo-cargas\logs'
       )
from public.organizations o
where o.name = 'Marcher Brasil'
on conflict (organization_id, job) do nothing;

notify pgrst, 'reload schema';
commit;
