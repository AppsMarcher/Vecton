begin;

-- ============================================================================
-- 236: RPS Comercial — comentário por anexo, não mais um só campo de texto
-- por bloco (rps_comercial_entries.semana_anterior_texto/planejamento_
-- atual_texto/comentarios_texto). Pedido do usuário: cada anexo (foto/
-- arquivo) tem seu próprio comentário, exibido abaixo dele no visualizador
-- de anexos (rps-attachment-carousel) — inclusive no modo apresentação.
--
-- Os 3 campos de texto do bloco em rps_comercial_entries continuam
-- existindo (não são removidos, dado já gravado): a UI (rpsComercialModule.js)
-- passa a mostrá-los só quando o bloco não tem nenhum anexo (nota livre pra
-- quem não tem imagem pra comentar).
-- ============================================================================

alter table public.rps_comercial_attachments
  add column if not exists comment_text text;

commit;
