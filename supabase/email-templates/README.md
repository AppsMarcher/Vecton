# Templates de e-mail do VectonPlan

Modelos HTML prontos para colar no painel do Supabase em `Authentication > Emails`.

Usam o **layout padrão dos e-mails do Vecton** (claro corporativo, logo Vecton Planning e mascote Marcher, imagens em `https://vecton.marcher.com.br/assets/email/`, arquivos em `assets/email/`). O mesmo layout é replicado nas Edge Functions que enviam e-mail (`send-notification-emails`, `send-report-email`, `invite-user`, `resend-invite`, `forgot-password`, `resend-password`); ao mudar um, mude todos. Depois de alterar um modelo, cole-o de novo no painel do Supabase, e depois de alterar uma função, publique-a. Veja a seção "Layout padrão dos e-mails" do README principal.

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
