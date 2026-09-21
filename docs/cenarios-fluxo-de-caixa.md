# Cenários do Fluxo de Caixa

Aplicar `supabase/222_fc_scenarios.sql` após 221 para habilitar salvamento.
A migração foi testada localmente; não foi aplicada automaticamente ao banco do ambiente.

No FC detalhado, contas analíticas e máquinas vendidas são editáveis somente
nos meses Fcst/Bud. Valores monetários aceitam formato brasileiro, inclusive
centavos (até quatro casas), preservados nos cálculos. Real, subtotais, saldos e
total anual não são editáveis. As quantidades não geram receitas automaticamente.

As alterações recalculam subtotal, geração e saldos seguintes e aparecem no
dashboard ao voltar. Para persistir, informe um nome e clique Salvar novo cenário.
Cada salvamento cria uma cópia independente. O seletor permite reabrir cenários
ou retornar à carga oficial. Desfazer alterações restaura a base selecionada.
Salve antes de sair ou mudar o ano: alterações pendentes são locais à tela.

Aplicar também `supabase/223_fc_shared_scenarios.sql`. Cenários criados por admin
ou super admin (inclusive perfil adicional) são compartilhados com os usuários
da mesma empresa que têm acesso ao FC. Demais perfis com acesso criam cenários
pessoais. A visibilidade é definida pelo servidor no salvamento. A migração
classifica cenários existentes conforme o perfil atual do autor. O seletor mostra
Compartilhado ou Pessoal. Salvar uma cópia usa a visibilidade do novo autor.
Cada cenário guarda seu retrato de contas, classificação e valores, sem cópia
do arquivo Excel. Ele continua disponível se a carga oficial for substituída.
A RPC valida os 12 meses, contas, números e quantidades e compara os valores
Real com a base no servidor. Não altera as tabelas da carga oficial.

Validação: testes SQL de proteção de Real, isolamento por usuário e preservação
após exclusão da base; teste de navegador de edição, salvamento e reabertura.

## Exclusão

Aplicar `225_fc_delete_scenario.sql`. No FC detalhado, selecione um cenário e use
Excluir cenário, confirmando a ação. Usuários excluem seus próprios cenários;
admin/super admin, inclusive perfis adicionais, também excluem compartilhados.
A exclusão exige acesso ao FC e respeita a empresa. Carga oficial não é alvo.
Ao concluir, a tela volta à carga oficial. Cancelar preserva o cenário.
