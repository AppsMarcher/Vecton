begin;

-- Impede que a arvore do DRE fique dessincronizada do cadastro de contas
-- (o bug da conta 42109006 e ~89 outras: no "Analitica" existia na arvore
-- mas nunca tinha sido criado em public.accounts). Qualquer no folha ativo
-- agora precisa apontar (account_id) para uma conta real, da mesma
-- organizacao, com account_number identico ao node_code.
create or replace function public.enforce_dre_node_account_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acc public.accounts%rowtype;
begin
  if new.node_class = 'Analitica' and new.active then
    if new.account_id is null then
      raise exception 'No analitico "%": account_id obrigatorio (crie/vincule a conta correspondente antes de salvar)', new.node_code;
    end if;

    select * into acc from public.accounts where id = new.account_id;

    if not found then
      raise exception 'No analitico "%": account_id aponta para uma conta inexistente', new.node_code;
    end if;

    if acc.organization_id <> new.organization_id then
      raise exception 'No analitico "%": a conta vinculada pertence a outra organizacao', new.node_code;
    end if;

    if acc.account_number <> new.node_code then
      raise exception 'No analitico "%": a conta vinculada (numero %) nao corresponde ao codigo do no', new.node_code, acc.account_number;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_dre_node_account_link on public.dre_plan_nodes;
create trigger trg_enforce_dre_node_account_link
before insert or update on public.dre_plan_nodes
for each row
execute function public.enforce_dre_node_account_link();

commit;
