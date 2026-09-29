begin;

-- Preferência de tema (dark/clear) por usuário. Até aqui vivia só no
-- localStorage do navegador — quem usa o Vecton instalado como app, com o
-- navegador limpando dados ao fechar, perdia a escolha a cada abertura. Agora
-- o localStorage vira cache e esta coluna é a fonte de verdade. NULL = nunca
-- escolheu (o app cai no padrão dark). A policy "users can manage own profile"
-- já permite o usuário atualizar a própria linha.
alter table public.user_profiles
  add column if not exists appearance text;

alter table public.user_profiles
  drop constraint if exists user_profiles_appearance_check;
alter table public.user_profiles
  add constraint user_profiles_appearance_check
  check (appearance is null or appearance in ('dark', 'clear'));

commit;
