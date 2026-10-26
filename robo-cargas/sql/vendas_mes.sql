-- Extrator da carga de vendas (FAT + CART) no Protheus (protheus_producao, SQL Server).
-- Copia fiel da consulta 'Vecton' do Painel_Vecton.xlsm; os parametros da planilha viram placeholders:
--   {{DATA_INI}} / {{DATA_FIM}}  yyyymmdd (primeiro e ultimo dia do mes; so o FAT usa)
--   marcador CART_FILTRO (no WHERE da carteira): vazio = carteira completa (mes corrente); condicao falsa = sem carteira (meses fechados)
--   {{CFOPS_SAIDA}} / {{CFOPS_DEVOL}}  lista SQL, ex.: '5101', '5102'
WITH CLIENTES AS
(
    SELECT
        A1_COD,
        A1_LOJA,
        MAX(LTRIM(RTRIM(ISNULL(A1_MUN, '')))) AS Cidade,
        MAX(LTRIM(RTRIM(ISNULL(A1_EST, '')))) AS UF

    FROM SA1010 WITH (NOLOCK)

    WHERE D_E_L_E_T_ = ''

    GROUP BY
        A1_COD,
        A1_LOJA
),

FAT_BASE AS
(
    /* FATURAMENTO — VENDAS */
    SELECT
        CAST('FAT' AS VARCHAR(10)) AS origem,

        CASE
            WHEN PRODUTO.B1_CONTREC = '001'
                THEN CAST(N'Acessórios' AS NVARCHAR(30))

            WHEN PRODUTO.B1_CONTREC = '002'
                THEN CAST(N'Máquinas' AS NVARCHAR(30))

            WHEN PRODUTO.B1_CONTREC = '003'
                THEN CAST(N'Peças' AS NVARCHAR(30))

            WHEN PRODUTO.B1_CONTREC = '004'
                THEN CAST(N'Transgrain' AS NVARCHAR(30))

            ELSE CAST(N'' AS NVARCHAR(30))
        END AS tipo,

        CASE
            WHEN LEN(LTRIM(RTRIM(ISNULL(D2.D2_EMISSAO, '')))) = 8
             AND ISDATE(D2.D2_EMISSAO) = 1
                THEN CONVERT(date, D2.D2_EMISSAO, 112)
            ELSE NULL
        END AS data,

        LTRIM(RTRIM(ISNULL(D2.D2_DOC, ''))) AS documento,

        LTRIM(RTRIM(ISNULL(D2.D2_COD, ''))) AS cod_produto,
        LTRIM(RTRIM(ISNULL(D2.D2_CLIENTE, ''))) AS cod_cliente,
        LTRIM(RTRIM(ISNULL(D2.D2_LOJA, ''))) AS loja_cliente,

        CAST('' AS VARCHAR(100)) AS territorio,

        ISNULL(D2.D2_QUANT, 0) AS quantidade,
        ISNULL(D2.D2_VALBRUT, 0) AS valor,

        ISNULL(VENDEDOR_NF.cod_vendedor, '') AS cod_vendedor,

        (
              ISNULL(D2.D2_VALBRUT, 0)
            - ISNULL(D2.D2_VALIPI, 0)
            - ISNULL(D2.D2_VALICM, 0)
            - ISNULL(D2.D2_VALIMP6, 0)
            - ISNULL(D2.D2_VALIMP5, 0)
        ) AS receita_liquida,

        (
              ISNULL(D2.D2_CP0101, 0)
            + ISNULL(D2.D2_CP0401, 0)
        ) AS mp

    FROM SD2010 D2 WITH (NOLOCK)

    OUTER APPLY
    (
        SELECT TOP 1
            LTRIM(
                RTRIM(
                    ISNULL(B1.B1_CONTREC, '')
                )
            ) AS B1_CONTREC

        FROM SB1010 B1 WITH (NOLOCK)

        WHERE B1.D_E_L_E_T_ = ''
          AND B1.B1_COD = D2.D2_COD

        ORDER BY
            CASE
                WHEN B1.B1_FILIAL = D2.D2_FILIAL
                    THEN 0
                ELSE 1
            END,
            B1.R_E_C_N_O_ DESC
    ) PRODUTO

    OUTER APPLY
    (
        SELECT TOP 1
            LTRIM(
                RTRIM(
                    ISNULL(F2.F2_VEND1, '')
                )
            ) AS cod_vendedor

        FROM SF2010 F2 WITH (NOLOCK)

        WHERE F2.D_E_L_E_T_ = ''
          AND F2.F2_FILIAL = D2.D2_FILIAL
          AND F2.F2_DOC = D2.D2_DOC
          AND F2.F2_SERIE = D2.D2_SERIE
          AND F2.F2_CLIENTE = D2.D2_CLIENTE
          AND F2.F2_LOJA = D2.D2_LOJA

        ORDER BY
            F2.R_E_C_N_O_ DESC
    ) VENDEDOR_NF

    WHERE D2.D_E_L_E_T_ = ''
      AND D2.D2_EMISSAO >= '{{DATA_INI}}'
      AND D2.D2_EMISSAO <= '{{DATA_FIM}}'
      AND LTRIM(RTRIM(D2.D2_CF)) IN ({{CFOPS_SAIDA}})
      AND LTRIM(RTRIM(D2.D2_COD)) <> '102326'

      AND NOT EXISTS
      (
          SELECT 1

          FROM SB1010 B1X WITH (NOLOCK)

          WHERE B1X.D_E_L_E_T_ = ''
            AND B1X.B1_COD = D2.D2_COD
            AND LTRIM(RTRIM(ISNULL(B1X.B1_CONTREC, ''))) = '005'
      )

    UNION ALL

    /* FATURAMENTO — DEVOLUÇÕES */
    SELECT
        CAST('FAT' AS VARCHAR(10)) AS origem,

        CASE
            WHEN PRODUTO.B1_CONTREC = '001'
                THEN CAST(N'Acessórios' AS NVARCHAR(30))

            WHEN PRODUTO.B1_CONTREC = '002'
                THEN CAST(N'Máquinas' AS NVARCHAR(30))

            WHEN PRODUTO.B1_CONTREC = '003'
                THEN CAST(N'Peças' AS NVARCHAR(30))

            WHEN PRODUTO.B1_CONTREC = '004'
                THEN CAST(N'Transgrain' AS NVARCHAR(30))

            ELSE CAST(N'' AS NVARCHAR(30))
        END AS tipo,

        CASE
            WHEN LEN(LTRIM(RTRIM(ISNULL(D1.D1_DTDIGIT, '')))) = 8
             AND ISDATE(D1.D1_DTDIGIT) = 1
                THEN CONVERT(date, D1.D1_DTDIGIT, 112)
            ELSE NULL
        END AS data,

        LTRIM(RTRIM(ISNULL(D1.D1_DOC, ''))) AS documento,

        LTRIM(RTRIM(ISNULL(D1.D1_COD, ''))) AS cod_produto,
        LTRIM(RTRIM(ISNULL(D1.D1_FORNECE, ''))) AS cod_cliente,
        LTRIM(RTRIM(ISNULL(D1.D1_LOJA, ''))) AS loja_cliente,

        CAST('' AS VARCHAR(100)) AS territorio,

        ISNULL(D1.D1_QUANT, 0) * -1 AS quantidade,

        (
              ISNULL(D1.D1_TOTAL, 0)
            - ISNULL(D1.D1_VALDESC, 0)
            + ISNULL(D1.D1_VALFRE, 0)
            + ISNULL(D1.D1_SEGURO, 0)
            + ISNULL(D1.D1_DESPESA, 0)
            + ISNULL(D1.D1_VALIPI, 0)
        ) * -1 AS valor,

        ISNULL(VENDEDOR_ORIGEM.cod_vendedor, '') AS cod_vendedor,

        (
              (
                    ISNULL(D1.D1_TOTAL, 0)
                  - ISNULL(D1.D1_VALDESC, 0)
                  + ISNULL(D1.D1_VALFRE, 0)
                  + ISNULL(D1.D1_SEGURO, 0)
                  + ISNULL(D1.D1_DESPESA, 0)
                  + ISNULL(D1.D1_VALIPI, 0)
              ) * -1

            - (ISNULL(D1.D1_VALIPI, 0) * -1)
            - (ISNULL(D1.D1_VALICM, 0) * -1)
            - (ISNULL(D1.D1_VALIMP6, 0) * -1)
            - (ISNULL(D1.D1_VALIMP5, 0) * -1)
        ) AS receita_liquida,

        (
              ISNULL(D1.D1_CP0101, 0)
            + ISNULL(D1.D1_CP0401, 0)
        ) * -1 AS mp

    FROM SD1010 D1 WITH (NOLOCK)

    OUTER APPLY
    (
        SELECT TOP 1
            LTRIM(
                RTRIM(
                    ISNULL(B1.B1_CONTREC, '')
                )
            ) AS B1_CONTREC

        FROM SB1010 B1 WITH (NOLOCK)

        WHERE B1.D_E_L_E_T_ = ''
          AND B1.B1_COD = D1.D1_COD

        ORDER BY
            CASE
                WHEN B1.B1_FILIAL = D1.D1_FILIAL
                    THEN 0
                ELSE 1
            END,
            B1.R_E_C_N_O_ DESC
    ) PRODUTO

    OUTER APPLY
    (
        SELECT TOP 1
            LTRIM(
                RTRIM(
                    ISNULL(F2.F2_VEND1, '')
                )
            ) AS cod_vendedor

        FROM SF2010 F2 WITH (NOLOCK)

        WHERE F2.D_E_L_E_T_ = ''
          AND F2.F2_FILIAL = D1.D1_FILIAL
          AND F2.F2_DOC = D1.D1_NFORI

          AND
          (
                LTRIM(
                    RTRIM(
                        ISNULL(D1.D1_SERIORI, '')
                    )
                ) = ''

                OR F2.F2_SERIE = D1.D1_SERIORI
          )

        ORDER BY
            CASE
                WHEN F2.F2_SERIE = D1.D1_SERIORI
                    THEN 0
                ELSE 1
            END,

            CASE
                WHEN F2.F2_CLIENTE = D1.D1_FORNECE
                 AND F2.F2_LOJA = D1.D1_LOJA
                    THEN 0
                ELSE 1
            END,

            F2.R_E_C_N_O_ DESC
    ) VENDEDOR_ORIGEM

    WHERE D1.D_E_L_E_T_ = ''
      AND D1.D1_DTDIGIT >= '{{DATA_INI}}'
      AND D1.D1_DTDIGIT <= '{{DATA_FIM}}'
      AND LTRIM(RTRIM(D1.D1_CF)) IN ({{CFOPS_DEVOL}})
      AND LTRIM(RTRIM(D1.D1_COD)) <> '102326'

      AND NOT EXISTS
      (
          SELECT 1

          FROM SB1010 B1X WITH (NOLOCK)

          WHERE B1X.D_E_L_E_T_ = ''
            AND B1X.B1_COD = D1.D1_COD
            AND LTRIM(RTRIM(ISNULL(B1X.B1_CONTREC, ''))) = '005'
      )
),

FAT AS
(
    SELECT
        origem,
        tipo,
        data,
        documento,
        cod_produto,
        cod_cliente,
        loja_cliente,
        territorio,
        quantidade,
        valor,
        cod_vendedor,

        receita_liquida AS rl,
        mp AS mp

    FROM FAT_BASE
),

CART_BASE AS
(
    /* CARTEIRA DE PEDIDOS */
    SELECT
        CAST('CART' AS VARCHAR(10)) AS origem,

        CASE
            WHEN B1.B1_CONTREC = '001'
                THEN CAST(N'Acessórios' AS NVARCHAR(30))

            WHEN B1.B1_CONTREC = '002'
                THEN CAST(N'Máquinas' AS NVARCHAR(30))

            WHEN B1.B1_CONTREC = '003'
                THEN CAST(N'Peças' AS NVARCHAR(30))

            WHEN B1.B1_CONTREC = '004'
                THEN CAST(N'Transgrain' AS NVARCHAR(30))

            ELSE CAST(N'' AS NVARCHAR(30))
        END AS tipo,

        CASE
            WHEN LEN(LTRIM(RTRIM(ISNULL(C6.C6_ENTREG, '')))) = 8
             AND ISDATE(C6.C6_ENTREG) = 1
                THEN CONVERT(date, C6.C6_ENTREG, 112)
            ELSE NULL
        END AS data,

        LTRIM(RTRIM(ISNULL(C5.C5_NUM, ''))) AS documento,

        LTRIM(RTRIM(ISNULL(C6.C6_PRODUTO, ''))) AS cod_produto,
        LTRIM(RTRIM(ISNULL(C5.C5_CLIENTE, ''))) AS cod_cliente,
        LTRIM(RTRIM(ISNULL(C5.C5_LOJACLI, ''))) AS loja_cliente,

        CAST('' AS VARCHAR(100)) AS territorio,

        ISNULL(C6.C6_QTDVEN, 0) AS quantidade,
        ISNULL(C6.C6_VALOR, 0) AS valor,

        LTRIM(
            RTRIM(
                ISNULL(C5.C5_VEND1, '')
            )
        ) AS cod_vendedor,

        LTRIM(
            RTRIM(
                ISNULL(A1.A1_EST, '')
            )
        ) AS uf_cliente,

        LTRIM(
            RTRIM(
                ISNULL(B1.B1_CONTREC, '')
            )
        ) AS b1_contrec,

        ISNULL(TIPI.YD_PER_IPI, 0) AS aliquota_ipi,

        HIST.MPUnitario

    FROM SC5010 C5 WITH (NOLOCK)

    INNER JOIN SC6010 C6 WITH (NOLOCK)
        ON C6.C6_FILIAL = C5.C5_FILIAL
       AND C6.C6_NUM = C5.C5_NUM
       AND C6.D_E_L_E_T_ = ''

    LEFT JOIN SA1010 A1 WITH (NOLOCK)
        ON A1.A1_COD = C5.C5_CLIENTE
       AND A1.A1_LOJA = C5.C5_LOJACLI
       AND A1.D_E_L_E_T_ = ''

    OUTER APPLY
    (
        SELECT TOP 1
            LTRIM(
                RTRIM(
                    ISNULL(B1X.B1_CONTREC, '')
                )
            ) AS B1_CONTREC,

            LTRIM(
                RTRIM(
                    ISNULL(B1X.B1_POSIPI, '')
                )
            ) AS B1_POSIPI

        FROM SB1010 B1X WITH (NOLOCK)

        WHERE B1X.D_E_L_E_T_ = ''
          AND B1X.B1_COD = C6.C6_PRODUTO

        ORDER BY
            CASE
                WHEN B1X.B1_FILIAL = C6.C6_FILIAL
                    THEN 0
                ELSE 1
            END,
            B1X.R_E_C_N_O_ DESC
    ) B1

    OUTER APPLY
    (
        SELECT TOP 1
            F4X.F4_CF

        FROM SF4010 F4X WITH (NOLOCK)

        WHERE F4X.F4_CODIGO = C6.C6_TES
          AND F4X.D_E_L_E_T_ = ''

        ORDER BY
            CASE
                WHEN F4X.F4_FILIAL = C6.C6_FILIAL
                    THEN 0
                ELSE 1
            END,
            F4X.F4_FILIAL
    ) F4

    OUTER APPLY
    (
        SELECT TOP 1
            YD.YD_PER_IPI

        FROM SYD010 YD WITH (NOLOCK)

        WHERE YD.D_E_L_E_T_ = ''

          AND LTRIM(RTRIM(YD.YD_TEC)) =
              LTRIM(
                  RTRIM(
                      ISNULL(B1.B1_POSIPI, '')
                  )
              )

        ORDER BY
            CASE
                WHEN YD.YD_FILIAL = C6.C6_FILIAL
                    THEN 0
                ELSE 1
            END,
            YD.YD_FILIAL,
            YD.R_E_C_N_O_ DESC
    ) TIPI

    OUTER APPLY
    (
        SELECT TOP 1
            (
                  ISNULL(D2H.D2_CP0101, 0)
                + ISNULL(D2H.D2_CP0401, 0)
            ) / NULLIF(D2H.D2_QUANT, 0) AS MPUnitario

        FROM SD2010 D2H WITH (NOLOCK)

        WHERE D2H.D_E_L_E_T_ = ''

          AND LTRIM(RTRIM(D2H.D2_COD)) =
              LTRIM(RTRIM(C6.C6_PRODUTO))

          AND ISNULL(D2H.D2_QUANT, 0) > 0

          AND LTRIM(RTRIM(D2H.D2_CF)) IN ({{CFOPS_SAIDA}})

          AND
          (
                ISNULL(D2H.D2_CP0101, 0)
              + ISNULL(D2H.D2_CP0401, 0)
          ) > 0

        ORDER BY
            D2H.D2_EMISSAO DESC,
            D2H.R_E_C_N_O_ DESC
    ) HIST

    WHERE C5.D_E_L_E_T_ = ''
      AND C5.C5_ORCAMEN = 'P'
      AND C5.C5_TIPO = 'N'

      AND LTRIM(RTRIM(ISNULL(C6.C6_NOTA, ''))) = ''
      AND LTRIM(RTRIM(ISNULL(C5.C5_NOTA, ''))) = ''

      /* Carteira completa: todo item aberto, qualquer data de entrega.
         O marcador abaixo fica vazio no mes corrente e desliga a carteira nos demais meses.
         Itens sem data de entrega valida entram com data nula e o robo os separa (e conta). */
      {{CART_FILTRO}}

      AND LTRIM(RTRIM(ISNULL(F4.F4_CF, ''))) IN ({{CFOPS_SAIDA}})

      AND LTRIM(RTRIM(ISNULL(C6.C6_PRODUTO, ''))) <> '102326'

      AND LTRIM(RTRIM(ISNULL(B1.B1_CONTREC, ''))) <> '005'
),

CART_TRIBUTOS AS
(
    SELECT
        CART_BASE.*,

        CASE
            WHEN CART_BASE.uf_cliente = 'EX'
                THEN 0

            WHEN CART_BASE.b1_contrec = '003'
                THEN
                    CART_BASE.valor
                    * (
                        ISNULL(CART_BASE.aliquota_ipi, 0)
                        / 100
                    )

            ELSE 0
        END AS ipi,

        CASE
            WHEN CART_BASE.uf_cliente = 'EX'
                THEN 0
            ELSE CART_BASE.valor * 0.0575
        END AS icms,

        CASE
            WHEN CART_BASE.uf_cliente = 'EX'
                THEN 0
            ELSE CART_BASE.valor * 0.0165
        END AS pis,

        CASE
            WHEN CART_BASE.uf_cliente = 'EX'
                THEN 0
            ELSE CART_BASE.valor * 0.0760
        END AS cofins

    FROM CART_BASE
),

CART_RECEITA AS
(
    SELECT
        CART_TRIBUTOS.*,

        (
              CART_TRIBUTOS.valor
            - ROUND(CART_TRIBUTOS.ipi, 2)
            - ROUND(CART_TRIBUTOS.icms, 2)
            - ROUND(CART_TRIBUTOS.pis, 2)
            - ROUND(CART_TRIBUTOS.cofins, 2)
        ) AS receita_liquida

    FROM CART_TRIBUTOS
),

CART AS
(
    SELECT
        origem,
        tipo,
        data,
        documento,
        cod_produto,
        cod_cliente,
        loja_cliente,
        territorio,
        quantidade,
        valor,
        cod_vendedor,

        receita_liquida AS rl,
        quantidade * ISNULL(MPUnitario, 0) AS mp

    FROM CART_RECEITA
),

CONSOLIDADO AS
(
    SELECT
        origem,
        tipo,
        data,
        documento,
        cod_produto,
        cod_cliente,
        loja_cliente,
        territorio,
        quantidade,
        valor,
        rl,
        mp,
        cod_vendedor

    FROM FAT

    UNION ALL

    SELECT
        origem,
        tipo,
        data,
        documento,
        cod_produto,
        cod_cliente,
        loja_cliente,
        territorio,
        quantidade,
        valor,
        rl,
        mp,
        cod_vendedor

    FROM CART
)

SELECT
    CONSOLIDADO.origem AS [origem],
    CONSOLIDADO.tipo AS [tipo],
    CONSOLIDADO.data AS [data],
    CONSOLIDADO.documento AS [documento],
    CONSOLIDADO.cod_produto AS [cod_produto],
    CONSOLIDADO.cod_cliente AS [cod_cliente],

    LTRIM(
        RTRIM(
            ISNULL(CONSOLIDADO.cod_vendedor, '')
        )
    ) AS [cod_vendedor],

    CONSOLIDADO.territorio AS [territorio],
    CONSOLIDADO.quantidade AS [qtd],
    ROUND(CONSOLIDADO.valor, 2) AS [valor],
    ROUND(CONSOLIDADO.rl, 2) AS [RL],
    ROUND(CONSOLIDADO.mp, 2) AS [MP],

    CAST('' AS VARCHAR(1)) AS [-----],

    ISNULL(CLIENTES.Cidade, '') AS [Cidade],
    ISNULL(CLIENTES.UF, '') AS [UF],

    CASE
        WHEN LTRIM(RTRIM(ISNULL(CONSOLIDADO.cod_vendedor, '')))
             IN ('000274', '000590')
            THEN LTRIM(RTRIM(CONSOLIDADO.cod_vendedor))
        ELSE ''
    END AS [vend]

FROM CONSOLIDADO

LEFT JOIN CLIENTES
    ON CLIENTES.A1_COD = CONSOLIDADO.cod_cliente
   AND CLIENTES.A1_LOJA = CONSOLIDADO.loja_cliente

ORDER BY
    CONSOLIDADO.data,
    CONSOLIDADO.origem,
    CONSOLIDADO.cod_cliente,
    CONSOLIDADO.cod_produto
