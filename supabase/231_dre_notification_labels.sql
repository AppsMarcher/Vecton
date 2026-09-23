BEGIN;

-- Deixa explícito que "Realizado"/"Planejado" aqui são do DRE, no mesmo
-- padrão já usado por headcount_batch_applied (228) e fc_batch_applied (227).
-- notify_batch_applied() (228) lê o label direto de notification_event_types
-- pra esses dois kinds, sem hardcode -- só o UPDATE abaixo já basta.

UPDATE public.notification_event_types
SET label = 'Carga de DRE (realizado) aplicada'
WHERE kind = 'actuals_batch_applied';

UPDATE public.notification_event_types
SET label = 'Carga de DRE (planejado) aplicada'
WHERE kind = 'budget_batch_applied';

COMMIT;
