-- Extrator da carga do Balanco Patrimonial (saldo acumulado no fechamento do mes) no Protheus (protheus_producao).
-- Copia fiel da consulta 'Balancete' do Base Carga BP.xlsm; os parametros da planilha viram placeholders:
--   {{DATA_ATE}}          yyyymmdd, ultimo dia do mes carregado
--   {{INICIO_MES}}        yyyymmdd, primeiro dia do mes carregado
--   {{FIM_MES_ANTERIOR}}  yyyymmdd, ultimo dia do mes anterior (limite da CQ0)
--   {{CONTA_DE}} / {{CONTA_ATE}} faixa de contas (planilha: 1 ate 2zzzzzzzzzzzzzzzz)
WITH PlanoBase AS
(
    SELECT
        RTRIM(CT1_CONTA)  AS CONTA,
        RTRIM(CT1_DESC01) AS NOME_CONTA,
        RTRIM(CT1_CTASUP) AS CONTA_SUPERIOR
    FROM CT1010
    WHERE D_E_L_E_T_ = ''
      AND RTRIM(CT1_CONTA) <> ''
),

PlanoTipo AS
(
    SELECT
        P.CONTA,
        P.NOME_CONTA,
        P.CONTA_SUPERIOR,

        CASE
            WHEN EXISTS
            (
                SELECT 1
                FROM PlanoBase F
                WHERE F.CONTA_SUPERIOR = P.CONTA
            )
            THEN 'SINTETICA'
            ELSE 'ANALITICA'
        END AS TIPO_CONTA

    FROM PlanoBase P
),

PlanoFormatado AS
(
    SELECT
        CONTA,
        NOME_CONTA,
        CONTA_SUPERIOR,
        TIPO_CONTA,

        CASE
            WHEN CONTA LIKE '%.%' THEN CONTA

            WHEN LEN(CONTA) = 1 THEN
                CONTA

            WHEN LEN(CONTA) = 2 THEN
                SUBSTRING(CONTA,1,1) + '.' +
                SUBSTRING(CONTA,2,1)

            WHEN LEN(CONTA) = 3 THEN
                SUBSTRING(CONTA,1,1) + '.' +
                SUBSTRING(CONTA,2,1) + '.' +
                SUBSTRING(CONTA,3,1)

            WHEN LEN(CONTA) = 4 THEN
                SUBSTRING(CONTA,1,1) + '.' +
                SUBSTRING(CONTA,2,1) + '.' +
                SUBSTRING(CONTA,3,1) + '.' +
                SUBSTRING(CONTA,4,1)

            WHEN LEN(CONTA) = 5 THEN
                SUBSTRING(CONTA,1,1) + '.' +
                SUBSTRING(CONTA,2,1) + '.' +
                SUBSTRING(CONTA,3,1) + '.' +
                SUBSTRING(CONTA,4,2)

            WHEN LEN(CONTA) = 6 THEN
                SUBSTRING(CONTA,1,1) + '.' +
                SUBSTRING(CONTA,2,1) + '.' +
                SUBSTRING(CONTA,3,1) + '.' +
                SUBSTRING(CONTA,4,2) + '.' +
                SUBSTRING(CONTA,6,1)

            WHEN LEN(CONTA) = 7 THEN
                SUBSTRING(CONTA,1,1) + '.' +
                SUBSTRING(CONTA,2,1) + '.' +
                SUBSTRING(CONTA,3,1) + '.' +
                SUBSTRING(CONTA,4,2) + '.' +
                SUBSTRING(CONTA,6,2)

            WHEN LEN(CONTA) = 8 THEN
                SUBSTRING(CONTA,1,1) + '.' +
                SUBSTRING(CONTA,2,1) + '.' +
                SUBSTRING(CONTA,3,1) + '.' +
                SUBSTRING(CONTA,4,2) + '.' +
                SUBSTRING(CONTA,6,3)

            WHEN LEN(CONTA) = 9 THEN
                SUBSTRING(CONTA,1,1) + '.' +
                SUBSTRING(CONTA,2,1) + '.' +
                SUBSTRING(CONTA,3,1) + '.' +
                SUBSTRING(CONTA,4,2) + '.' +
                SUBSTRING(CONTA,6,4)

            WHEN LEN(CONTA) = 10 THEN
                SUBSTRING(CONTA,1,1) + '.' +
                SUBSTRING(CONTA,2,1) + '.' +
                SUBSTRING(CONTA,3,1) + '.' +
                SUBSTRING(CONTA,4,2) + '.' +
                SUBSTRING(CONTA,6,5)

            WHEN LEN(CONTA) = 11 THEN
                SUBSTRING(CONTA,1,1) + '.' +
                SUBSTRING(CONTA,2,1) + '.' +
                SUBSTRING(CONTA,3,1) + '.' +
                SUBSTRING(CONTA,4,2) + '.' +
                SUBSTRING(CONTA,6,5) + '.' +
                SUBSTRING(CONTA,11,1)

            WHEN LEN(CONTA) = 12 THEN
                SUBSTRING(CONTA,1,1) + '.' +
                SUBSTRING(CONTA,2,1) + '.' +
                SUBSTRING(CONTA,3,1) + '.' +
                SUBSTRING(CONTA,4,2) + '.' +
                SUBSTRING(CONTA,6,5) + '.' +
                SUBSTRING(CONTA,11,2)

            WHEN LEN(CONTA) = 13 THEN
                SUBSTRING(CONTA,1,1) + '.' +
                SUBSTRING(CONTA,2,1) + '.' +
                SUBSTRING(CONTA,3,1) + '.' +
                SUBSTRING(CONTA,4,2) + '.' +
                SUBSTRING(CONTA,6,5) + '.' +
                SUBSTRING(CONTA,11,3)

            WHEN LEN(CONTA) = 14 THEN
                SUBSTRING(CONTA,1,1) + '.' +
                SUBSTRING(CONTA,2,1) + '.' +
                SUBSTRING(CONTA,3,1) + '.' +
                SUBSTRING(CONTA,4,2) + '.' +
                SUBSTRING(CONTA,6,5) + '.' +
                SUBSTRING(CONTA,11,3) + '.' +
                SUBSTRING(CONTA,14,1)

            WHEN LEN(CONTA) = 15 THEN
                SUBSTRING(CONTA,1,1) + '.' +
                SUBSTRING(CONTA,2,1) + '.' +
                SUBSTRING(CONTA,3,1) + '.' +
                SUBSTRING(CONTA,4,2) + '.' +
                SUBSTRING(CONTA,6,5) + '.' +
                SUBSTRING(CONTA,11,3) + '.' +
                SUBSTRING(CONTA,14,2)

            WHEN LEN(CONTA) = 16 THEN
                SUBSTRING(CONTA,1,1) + '.' +
                SUBSTRING(CONTA,2,1) + '.' +
                SUBSTRING(CONTA,3,1) + '.' +
                SUBSTRING(CONTA,4,2) + '.' +
                SUBSTRING(CONTA,6,5) + '.' +
                SUBSTRING(CONTA,11,3) + '.' +
                SUBSTRING(CONTA,14,3)

            ELSE CONTA
        END AS CONTA_FORMATADA

    FROM PlanoTipo
),

/*
==============================================================
HIERARQUIA
==============================================================
Liga cada conta analitica a ela propria e a todas as
contas sinteticas superiores.
==============================================================
*/

Hierarquia AS
(
    SELECT
        CONTA AS CONTA_MOVIMENTO,
        CONTA AS CONTA_BALANCETE
    FROM PlanoBase

    UNION ALL

    SELECT
        H.CONTA_MOVIMENTO,
        P.CONTA_SUPERIOR AS CONTA_BALANCETE

    FROM Hierarquia H

    INNER JOIN PlanoBase P
        ON P.CONTA = H.CONTA_BALANCETE

    WHERE RTRIM(P.CONTA_SUPERIOR) <> ''
),

/*
==============================================================
SALDO HISTORICO - CQ0
==============================================================

A CQ0 fornece o saldo oficial acumulado do Protheus
ate o fechamento do mes imediatamente anterior ao
mes da Data Ate.

Exemplo:

Data Ate = 31/07/2026
CQ0 utilizada ate 30/06/2026

==============================================================
*/

SaldoCQ0 AS
(
    SELECT
        RTRIM(CQ0_CONTA) AS CONTA,

        SUM(
            ISNULL(CQ0_DEBITO,0)
            -
            ISNULL(CQ0_CREDIT,0)
        ) AS SALDO

    FROM CQ0010

    WHERE D_E_L_E_T_ = ''

      AND CQ0_DATA <= '{{FIM_MES_ANTERIOR}}'

      AND CQ0_MOEDA = '01'

      AND CQ0_TPSALD = '1'

      AND RTRIM(CQ0_CONTA) <> ''

    GROUP BY
        RTRIM(CQ0_CONTA)
),

/*
==============================================================
MOVIMENTO DO MES DA DATA ATE - CT2
==============================================================

Somente o mes corrente precisa ser reconstruido pela CT2.

Exemplo:

Data Ate = 31/07/2026

CT2:
01/07/2026 ate 31/07/2026

==============================================================
*/

MovimentoMes AS
(
    /*
    DEBITOS
    */

    SELECT
        RTRIM(CT2_DEBITO) AS CONTA,
        SUM(CT2_VALOR) AS SALDO

    FROM CT2010

    WHERE D_E_L_E_T_ = ''

      AND CT2_DC IN ('1','3')

      AND RTRIM(CT2_DEBITO) <> ''

      AND CT2_DATA >= '{{INICIO_MES}}'

      AND CT2_DATA <= '{{DATA_ATE}}'

      AND CT2_MOEDLC = '01'

      AND CT2_TPSALD = '1'

    GROUP BY
        RTRIM(CT2_DEBITO)

    UNION ALL

    /*
    CREDITOS
    */

    SELECT
        RTRIM(CT2_CREDIT) AS CONTA,
        SUM(CT2_VALOR * -1) AS SALDO

    FROM CT2010

    WHERE D_E_L_E_T_ = ''

      AND CT2_DC IN ('2','3')

      AND RTRIM(CT2_CREDIT) <> ''

      AND CT2_DATA >= '{{INICIO_MES}}'

      AND CT2_DATA <= '{{DATA_ATE}}'

      AND CT2_MOEDLC = '01'

      AND CT2_TPSALD = '1'

    GROUP BY
        RTRIM(CT2_CREDIT)
),

MovimentoMesAgrupado AS
(
    SELECT
        CONTA,
        SUM(SALDO) AS SALDO

    FROM MovimentoMes

    GROUP BY
        CONTA
),

/*
==============================================================
SALDO FINAL DAS CONTAS
==============================================================
*/

SaldoFinalAnalitico AS
(
    SELECT
        P.CONTA,

        ISNULL(CQ.SALDO,0)
        +
        ISNULL(M.SALDO,0) AS SALDO

    FROM PlanoBase P

    LEFT JOIN SaldoCQ0 CQ
        ON CQ.CONTA = P.CONTA

    LEFT JOIN MovimentoMesAgrupado M
        ON M.CONTA = P.CONTA
),

/*
==============================================================
CONSOLIDACAO DAS CONTAS SINTETICAS
==============================================================
*/

Balancete AS
(
    SELECT
        H.CONTA_BALANCETE AS CONTA,

        SUM(
            S.SALDO
        ) AS SALDO

    FROM Hierarquia H

    INNER JOIN SaldoFinalAnalitico S
        ON S.CONTA = H.CONTA_MOVIMENTO

    GROUP BY
        H.CONTA_BALANCETE
)

/*
==============================================================
RESULTADO
==============================================================
*/

SELECT
    P.CONTA_FORMATADA AS CONTA,

    P.NOME_CONTA AS [NOME DA CONTA],

    CAST(
        ROUND(
            ISNULL(B.SALDO,0),
            2
        )
        AS DECIMAL(18,2)
    ) AS SALDO,

    P.TIPO_CONTA

FROM PlanoFormatado P

LEFT JOIN Balancete B
    ON B.CONTA = P.CONTA

WHERE
    P.CONTA BETWEEN '{{CONTA_DE}}' AND '{{CONTA_ATE}}'

    AND ROUND(
        ISNULL(B.SALDO,0),
        2
    ) <> 0

ORDER BY
    P.CONTA

OPTION (MAXRECURSION 100)
