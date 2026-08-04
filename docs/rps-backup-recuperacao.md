# Backup e recuperação da RPS Gestão

## Escopo

- Botão **Backup** visível somente para `admin` e `super_admin`.
- A central sempre opera sobre o mês aberto no cabeçalho da RPS.
- Backup automático: segunda-feira, 18:45 (`America/Sao_Paulo`).
- Retenção: seis meses.
- O job semanal protege o mês corrente e períodos históricos alterados nos últimos oito dias.
- Um admin também pode criar um backup verificado manualmente.

## Garantias

Cada backup possui:

- cópia transacional do `payload` mensal e da respectiva `version`;
- SHA-256 do snapshot JSON;
- bucket privado separado para anexos;
- manifesto com caminho original, tamanho, MIME e SHA-256 de cada arquivo;
- verificação por download após a cópia;
- status `ready` somente depois da conferência integral.

Durante backup e restauração, o período fica em `rps_maintenance_locks`. O trigger do banco e as policies do Storage rejeitam gravações de usuários enquanto o lock estiver válido.

Antes de uma restauração, a Edge Function cria um backup `pre_restore` do estado atual. Os arquivos escolhidos são validados em staging antes de substituir o prefixo ativo. Se qualquer etapa falhar, o estado anterior é reaplicado e a ocorrência fica registrada em `rps_restore_operations`.

## Ordem de aplicação

1. Execute `supabase/104_rps_resilient_backups.sql` no SQL Editor.
2. Publique as funções:

   ```bash
   supabase functions deploy rps-backup-manager --project-ref jwjnvxshtdekzcprmsyl
   supabase functions deploy rps-backup-worker --project-ref jwjnvxshtdekzcprmsyl --no-verify-jwt
   ```

3. Gere um segredo longo e configure-o na função:

   ```bash
   supabase secrets set RPS_BACKUP_CRON_SECRET="SEGREDO_GERADO" --project-ref jwjnvxshtdekzcprmsyl
   ```

4. Grave URL e o mesmo segredo no Vault, substituindo os valores:

   ```sql
   select vault.create_secret(
     'https://jwjnvxshtdekzcprmsyl.supabase.co',
     'rps_backup_project_url'
   );

   select vault.create_secret(
     'SEGREDO_GERADO',
     'rps_backup_cron_secret'
   );
   ```

5. Execute `supabase/105_rps_weekly_backup_schedule.sql`.

## Validação pós-instalação

1. Entre como admin, abra a RPS e confirme a presença do botão **Backup** antes de **Atualizar**.
2. Clique em **Criar backup agora**.
3. Confirme que a execução aparece como íntegra, com hash e quantidade de anexos.
4. Confira o bucket privado `rps-attachments-backup`.
5. Execute a consulta:

   ```sql
   select id, organization_id, ano, mes, kind, status, captured_at,
          verified_file_count, verified_bytes, retention_until, error_message
   from public.rps_backup_runs
   order by captured_at desc;
   ```

6. Para testar o cron sem esperar segunda-feira:

   ```sql
   select public.invoke_rps_weekly_backup();
   ```

7. Consulte a resposta assíncrona do `pg_net` e os logs da função `rps-backup-worker`.

## Recuperação operacional

- `succeeded`: banco e anexos restaurados e verificados.
- `rolled_back`: a restauração falhou, mas o backup preventivo recompôs o estado anterior.
- `rollback_failed`: intervenção manual obrigatória; não remova o backup `pre_restore` nem o lock antes de analisar os logs.
- Locks expiram em duas horas para evitar bloqueio permanente se uma função for interrompida. Antes de remover manualmente um lock, confirme que não existe execução ativa.

Backups expirados têm os objetos, manifesto e snapshot removidos, mas o registro do run é preservado com status `expired` para manter a auditoria.
