const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.PLANNING_PGLITE_TEST_LIB || '../artifacts/bp-test-deps/node_modules/@electric-sql/pglite');

// Parte 2 da migration 311: troca, nas funcoes vivas do painel, a regra antiga de carteira pela visao vigente.
const SQL = fs.readFileSync('supabase/311_carteira_vigente.sql', 'utf8');
const PARTE_2 = ('-- ' + SQL.split('-- @@ PARTE 2')[1]).replace(/commit;\s*$/im, '');

// O SQL Editor do Supabase roda cada comando separado: a parte 2 nao pode depender de tabela temporaria
// criada em um comando e lida em outro (foi o erro "relation _patch_carteira does not exist" em 26/10/2026).
assert.ok(!/temporary\s+table/i.test(PARTE_2), 'a parte 2 nao pode usar tabela temporaria');
assert.ok(!/create\s+(temp|table)/i.test(PARTE_2), 'a parte 2 deve ser um unico bloco DO, sem criar objetos auxiliares');

const crlf = (s) => s.replace(/\n/g, '\r\n');
const ANTIGO_FROM = 'from public.comercial_realizado_ledger_entries le';
const REF = '(select public.comercial_cart_ref_month(p_org, p_year, p_month, p_period))';
const SUBQUERY_FAT_CART = `from (select x.* from public.comercial_fat_cart x where x.origem = 'FAT' or x.reference_month = ${REF}) le`;
const CLAUSULA_GEO = `
      and ((p_revenue_scope in ('nf','nf_cart') and le.origem = 'FAT')
        or (p_revenue_scope in ('cart','nf_cart') and le.origem = 'CART'
          and le.reference_month = case
            when le.reference_year = p_year and le.reference_month between v_lo and v_hi
              then ${REF}
            when le.reference_year = v_prev_year and le.reference_month between v_prev_lo and v_prev_hi
              then (case when p_period = 'mes' then v_prev_lo
                    else (select public.comercial_cart_ref_month(p_org, v_prev_year, p_month, p_period)) end)
            else (select public.comercial_cart_ref_month(p_org, p_year - 1, p_month, p_period))
          end))
      and ((le.reference_year = p_year and le.reference_month between v_lo and v_hi)
        or (le.reference_year = p_year - 1 and le.reference_month between v_lo and v_hi))
      and (p_seller = 'all' or end))`;

// Funcoes de mentira com as mesmas assinaturas e os mesmos trechos (dentro de um comentario de bloco, so para
// exercitar a troca de texto e o CREATE OR REPLACE; a sintaxe real foi conferida contra as definicoes vivas).
const FUNCOES = [
  ['comercial_painel_vendas', 'p_org uuid, p_year integer, p_month integer, p_period text, p_scenario uuid', SUBQUERY_FAT_CART],
  ['comercial_painel_tipos', 'p_org uuid, p_year integer, p_month integer, p_period text, p_scenario uuid', SUBQUERY_FAT_CART],
  ['comercial_painel_pecas_vendedor', 'p_org uuid, p_year integer, p_month integer, p_period text',
    `${ANTIGO_FROM}\n and (le.origem = 'FAT' or (le.reference_year = p_year and le.reference_month = ${REF}))`],
  ['comercial_painel_detalhe', 'p_org uuid, p_year integer, p_month integer, p_period text, a text[], b text[], c text, d text, e text, f text',
    `${ANTIGO_FROM}\n and (le.origem = 'FAT' or le.reference_month = ${REF})`],
  ['comercial_pecas_geo_performance', 'p_org uuid, p_year integer, p_month integer, p_period text, a text, b text, c text, d uuid, e text, f text',
    `${ANTIGO_FROM}\n${CLAUSULA_GEO}`],
  ['comercial_pecas_geo_evolucao_mensal', 'p_org uuid, p_year integer, p_month integer, p_period text, a text, b text, d uuid, e text, f text', ANTIGO_FROM]
];

(async () => {
  const db = new PGlite();
  try {
    for (const [nome, args, trecho] of FUNCOES) {
      await db.exec(crlf(`create or replace function public.${nome}(${args}) returns void language plpgsql as $f$
begin
  /* ${trecho} */
  null;
end;
$f$;`));
    }
    const def = async (nome) => (await db.query(`select replace(pg_get_functiondef(p.oid), E'\\r', '') d from pg_proc p where p.proname = $1`, [nome])).rows[0].d;

    await db.exec(PARTE_2);

    for (const [nome] of FUNCOES) {
      const d = await def(nome);
      assert.ok(d.includes('comercial_realizado_ledger_vigente'), `${nome}: deve usar a visao vigente`);
      assert.ok(!d.includes('comercial_cart_ref_month'), `${nome}: nao pode sobrar a regra antiga`);
    }
    assert.ok((await def('comercial_pecas_geo_performance')).includes("le.origem = 'CART' and le.reference_year = p_year and le.reference_month between v_lo and v_hi))"),
      'geo: a carteira so vale na janela atual (sem comparacao com periodo anterior)');
    assert.ok((await def('comercial_pecas_geo_performance')).includes('and ((le.reference_year = p_year and le.reference_month between v_lo and v_hi)'),
      'geo: o restante da clausula nao pode ser engolido pela troca');
    assert.ok((await def('comercial_painel_pecas_vendedor')).includes("and (le.origem = 'FAT' or le.reference_year = p_year)"),
      'pecas por vendedor: carteira so do ano escolhido');

    // Reaplicar (SQL Editor rodando o arquivo duas vezes) nao pode falhar nem mudar nada.
    const antes = await def('comercial_painel_vendas');
    await db.exec(PARTE_2);
    assert.equal(await def('comercial_painel_vendas'), antes, 'reaplicar e idempotente');

    // Funcao ausente: a migration deve parar com mensagem clara (a transacao do SQL Editor desfaz tudo).
    await db.exec('drop function public.comercial_painel_tipos(uuid, integer, integer, text, uuid)');
    await assert.rejects(() => db.exec(PARTE_2), /nao encontrada/, 'funcao ausente deve abortar com mensagem clara');

    console.log('carteiraVigentePainel.sql.test: ok');
  } finally {
    await db.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
