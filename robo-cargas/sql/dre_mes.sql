-- Extrator da carga de DRE (razao contabil) no Protheus (protheus_producao, SQL Server).
-- Copia fiel da consulta 'Razao_DRE' do Razao_Contabil [carga dados].xlsm; os parametros da planilha viram placeholders:
--   {{DATA_INI}} / {{DATA_FIM}}  yyyymmdd (primeiro e ultimo dia do mes)
--   {{CONTA_DE}} / {{CONTA_ATE}} faixa de contas (planilha: 3 ate 4zzzzzzzzzzzzzzzz)
SELECT
    RTRIM(CT2_DEBITO) AS CONTA,
    CT2_DATA AS DATA,

    RTRIM(CT2_LOTE)
        + '/' + RTRIM(CT2_SBLOTE)
        + '/' + RTRIM(CT2_DOC)
        + '/' + RTRIM(CT2_LINHA)
        AS [LOTE/SUB/DOC/LINHA],

    RTRIM(CT2_HIST) AS HISTORICO,

    RTRIM(CT2_FILORI) AS [FILIAL DE ORIGEM],

    RTRIM(CT2_CCD) AS [C CUSTO],

    CT2_VALOR AS VALOR

FROM CT2010

WHERE D_E_L_E_T_ = ''

  AND CT2_DC IN ('1','3')

  AND RTRIM(CT2_DEBITO) <> ''

  AND CT2_DATA
      BETWEEN '{{DATA_INI}}' AND '{{DATA_FIM}}'

  AND CT2_MOEDLC = '01'

  AND CT2_TPSALD = '1'

  AND RTRIM(CT2_DEBITO)
      BETWEEN '{{CONTA_DE}}' AND '{{CONTA_ATE}}'


UNION ALL


SELECT
    RTRIM(CT2_CREDIT) AS CONTA,
    CT2_DATA AS DATA,

    RTRIM(CT2_LOTE)
        + '/' + RTRIM(CT2_SBLOTE)
        + '/' + RTRIM(CT2_DOC)
        + '/' + RTRIM(CT2_LINHA)
        AS [LOTE/SUB/DOC/LINHA],

    RTRIM(CT2_HIST) AS HISTORICO,

    RTRIM(CT2_FILORI) AS [FILIAL DE ORIGEM],

    RTRIM(CT2_CCC) AS [C CUSTO],

    CT2_VALOR * -1 AS VALOR

FROM CT2010

WHERE D_E_L_E_T_ = ''

  AND CT2_DC IN ('2','3')

  AND RTRIM(CT2_CREDIT) <> ''

  AND CT2_DATA
      BETWEEN '{{DATA_INI}}' AND '{{DATA_FIM}}'

  AND CT2_MOEDLC = '01'

  AND CT2_TPSALD = '1'

  AND RTRIM(CT2_CREDIT)
      BETWEEN '{{CONTA_DE}}' AND '{{CONTA_ATE}}'

ORDER BY
    CONTA,
    DATA,
    [LOTE/SUB/DOC/LINHA]
