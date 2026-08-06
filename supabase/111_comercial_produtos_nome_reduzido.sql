begin;

-- Novo campo "Nome reduzido" no cadastro de Produtos. Nullable no banco de
-- propósito: obrigatoriedade (só para Tipo = Máquinas) é regra de UI, aplicada
-- no modal de cadastro (comercialCadastroModule.js), não constraint de banco —
-- os produtos já cadastrados ficam sem valor até serem preenchidos via carga.
alter table public.comercial_produtos
  add column if not exists nome_reduzido text;

commit;
