# Carga única de vendas realizadas — 2023 a 2026 (novo layout FAT/RL/MP)

Origem: `O:\Controladoria\Gerencial\Vecton\02 - CARGA PAINEL DE VENDAS\3 - CARGAS ENVIADAS\2023 a 2026.xlsx` (Planilha1, 14.758 linhas, 2023-01 a 2026-09).
Substitui o realizado dos 45 meses presentes no arquivo. **2026-10 e 2026-11 não estão no arquivo e não são tocados.**

> **Executada em 13/10/2026** (passos 0 a 6 concluídos; ledger jan/2023–set/2026 = 14.758 linhas, igual ao arquivo). Os arquivos `02_dados_*.sql` (dados brutos de vendas, ~1,6 MB) não foram versionados; são gerados a partir do Excel de origem.

## Ordem de execução (SQL Editor do Supabase, projeto Vecton)

| Passo | Arquivo | O que faz |
|---|---|---|
| 0 | `00_backup.sql` | Copia ledger e lotes atuais para `_bkp_*` (único jeito de voltar atrás) |
| 1 | `01_cria_staging.sql` | Cria `stg_carga_vendas_2023_2026` (RLS ligado, sem acesso via API) |
| 2 | `02_dados_2023.sql` … `02_dados_2026.sql` | Insere as linhas brutas do Excel (4 arquivos, ~350–480 KB). Cada um mostra a contagem esperada no final |
| 3 | `03_correcoes_e_preflight.sql` | Aplica as correções (abaixo) e roda checagens: **todas devem dar 0** (a 1ª linha deve mostrar 14758) |
| 4 | `04_aplica_2023.sql` … `04_aplica_2026.sql` | Aplica ano a ano, mês a mês, pelo mesmo caminho da tela de carga. **Uma transação por arquivo**: se qualquer linha reprovar na validação do sistema, nada daquele ano é alterado e o erro lista as linhas |
| 5 | `05_conferencia.sql` | Compara ledger × arquivo por mês (linhas, FAT, RL, MP). Todas as linhas devem ter `ok = true` |
| 6 | `06_limpeza.sql` | Remove o staging (backups ficam até você decidir) |

Se um `04_aplica_*` estourar o tempo do editor, edite `v_mes_ini`/`v_mes_fim` no topo (ex.: 1–6 e depois 7–12) e rode de novo.

## Pré-requisito
Migration `253_comercial_realizado_rl_mp.sql` já aplicada (confirmado: colunas `rl`/`mp` existem).

## Correções aplicadas no passo 3 (arquivo → valor do ledger atual)
- **19 linhas com território `NAO ENCONTRADO`** (falha de PROCV no Excel) → recebem o território que já está no ledger. Linhas do Excel: 5536, 6189, 6190, 8803, 8914, 9149, 9329, 9701, 9702, 9926, 9927, 9928, 10218, 10240, 10284, 11300, 14074, 14075, 14076 (a coluna `obs` do staging registra cada correção).
- **4 linhas com FAT, RL e MP vazios** (devoluções/vendas de máquinas em fev/2026 e jul/2026) → FAT do ledger atual (-89.132,28; -44.232,00; 167.042,15; -172.317,17). RL e MP ficam nulos nessas linhas.

- **1 linha com tipo divergente** (linha 2177, 30/06/2026, produto `03003215`, cliente 005887): o Excel diz Acessórios, mas o cadastro e o ledger atual dizem Peças → tipo ajustado para Peças.

- **4.581 linhas de Peças com vendedor diferente de 000633** (4.580 + a linha 2177 após o ajuste de tipo; 000546: 1.755, 000547: 2.590, demais: 236) → `000633`, por decisão: Peças é 100% Jenifer.
- **1 linha com vendedor `00597`** (5 dígitos) → `000599`.

Recomendado corrigir também no Excel de origem.

## Pontos de atenção (decididos)
1. **Peças → 000633**: decidido, aplicado no passo 3. Os vendedores `000546` e `000547` ainda aparecem em poucas linhas de Acessórios/Transgrain e serão criados como "Vendedor historico" (junto com outros códigos históricos de Máquinas/Acessórios/Transgrain que não estão no cadastro de vendedores).
2. **CART (carteira) de 2026-07 a 2026-09 é substituída pelo arquivo** (decidido): ledger atual jul 70, ago 119, set 14; arquivo jul 0, ago 20, set 9.
3. **Vendedor `00597`** (1 linha, 10/07/2023, RS SUL): corrigido para `000599` no passo 3.
4. **MB acima de 100%**: 306 linhas positivas têm MP > RL (359 com MP/RL > 95%), quase todas Peças. Máx. MP/RL = 527×. Cabe em `mb_pct`, mas revise a origem do MP antes de criar relatórios de MB. 5 linhas têm RL = 0 (MB nula) e 14 linhas (fev/2026 e jul/2026) têm FAT mas RL/MP vazios.
5. **Notificações**: o passo 4 desliga o trigger `trg_notify_batch_applied` na transação e o religa no final.
6. **Audit**: as tabelas de auditoria recebem uma linha por linha inserida/removida (dezenas de milhares).

## Validação feita antes de entregar
- Estrutura: 14.758 linhas, 12 colunas, sem origem/tipo/data inválidos, sem duplicidade de chave além de 31 linhas idênticas que já existem no ledger (mesmas contagens por mês de 2023–2025).
- Cadastro: 664 clientes e 109 produtos de Máquinas/Acessórios/Transgrain conferidos contra o banco: 0 clientes ausentes; 1 divergência de tipo (produto `03003215`, corrigida no passo 3).
- Atribuição de responsável/coordenação: todos os 29 territórios têm atribuição vigente desde 2023-01-01 para Grão e Pecuária.
- **Não foi possível testar a execução no banco** (teste com rollback foi bloqueado). A validação final é a do passo 4, que é atômica por ano.
