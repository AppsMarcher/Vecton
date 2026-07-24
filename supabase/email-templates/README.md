# Templates de e-mail do VectonPlan

Modelos HTML prontos para colar no painel do Supabase em `Authentication > Emails`.

## Arquivos

- `confirm-signup.html`: confirmação de cadastro.
- `invite-user.html`: convite enviado pelo fluxo `inviteUserByEmail`.
- `reset-password.html`: redefinição de senha.

## Assuntos sugeridos

- `Confirm sign up`: `Confirme seu e-mail no VectonPlan`
- `Invite user`: `Seu acesso ao VectonPlan foi liberado`
- `Reset password`: `Redefina sua senha do VectonPlan`

## Observações

- Os templates usam `{{ .ConfirmationURL }}`, que é o link esperado pelo fluxo atual do app.
- O front-end já trata os tipos `signup`, `invite` e `recovery` em `src/modules/auth/authSession.js`.
- Se quisermos, o próximo passo pode ser criar também versões para `Magic Link` e `Change Email Address`.
