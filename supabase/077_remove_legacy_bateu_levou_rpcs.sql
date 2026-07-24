begin;

-- O card fixo comercialBateuLevou e o modulo de frontend ja foram removidos
-- (catalogo limpo em 074_remove_legacy_bateu_levou_catalog.sql). As duas RPCs
-- legadas ficaram orfas desde entao — nada no app as chama mais, seguindo o
-- mesmo padrao aplicado ao Final de Ano em
-- 076_remove_legacy_final_de_ano_catalog.sql.
drop function if exists public.comercial_bateu_levou(uuid, integer, integer, uuid);
drop function if exists public.comercial_bateu_levou_extrato(uuid, integer, integer, text);

commit;
