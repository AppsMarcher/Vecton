const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID: uuid } = require('node:crypto');
const { PGlite } = require(process.env.PLANNING_PGLITE_TEST_LIB || '../artifacts/bp-test-deps/node_modules/@electric-sql/pglite');

// Parte 1 da migration 311 (tudo antes do marcador): funcao da data corrente + visao da carteira vigente.
const SQL = fs.readFileSync('supabase/311_carteira_vigente.sql', 'utf8');
const MARCADOR = '-- @@ PARTE 2';
assert.ok(SQL.includes(MARCADOR), 'a migration 311 precisa do marcador de parte 2');
const PARTE_1 = SQL.split(MARCADOR)[0].replace(/^\s*begin;\s*/im, '');

(async () => {
  const db = new PGlite();
  try {
    const orgA = uuid(), orgB = uuid();
    await db.exec(`create role authenticated; create role anon;
      create table public.comercial_realizado_ledger_entries(
        id uuid primary key default gen_random_uuid(), organization_id uuid, batch_id uuid, batch_row_id uuid,
        reference_year integer, reference_month integer, entry_date date, origem text, produto_id uuid, cliente_id uuid,
        territorio_id uuid, linha_negocio_id uuid, coordenacao_id uuid, responsavel text, cod_produto text, cod_cliente text,
        quantidade numeric, valor numeric, mb_pct numeric, source_type text, created_by uuid, updated_by uuid,
        created_at timestamptz default now(), updated_at timestamptz default now(), cod_vendedor text,
        campanha_atribuicao_id uuid, campanha_status text, documento text, serie_documento text, rl numeric, mp numeric);`);
    await db.exec(PARTE_1);

    const add = (org, ano, mes, origem, data, valor) => db.query(
      `insert into public.comercial_realizado_ledger_entries(organization_id, reference_year, reference_month, origem, entry_date, valor)
       values ($1,$2,$3,$4,$5,$6)`, [org, ano, mes, origem, data, valor]);
    const fixaHoje = (ym) => db.exec(`create or replace function public.comercial_cart_ym_corrente() returns integer language sql stable as $$select ${ym}$$;`);
    const ver = async (org) => (await db.query(
      `select origem, reference_year ano, reference_month mes, valor::int valor from public.comercial_realizado_ledger_vigente where organization_id=$1 order by origem, ano, mes, valor`, [org])).rows;

    // Fixture: FAT em março e outubro; CART antigo de setembro (foto velha) e CART de outubro com entregas de março, outubro e novembro.
    await add(orgA, 2026, 3, 'FAT', '2026-03-10', 100);
    await add(orgA, 2026, 10, 'FAT', '2026-10-05', 200);
    await add(orgA, 2026, 9, 'CART', '2026-09-25', 7);
    await add(orgA, 2026, 10, 'CART', '2026-03-20', 11);
    await add(orgA, 2026, 10, 'CART', '2026-10-30', 13);
    await add(orgA, 2026, 10, 'CART', '2026-11-15', 17);
    await add(orgB, 2026, 10, 'CART', '2026-10-02', 99);

    // 1. FAT passa como esta; CART so do lote vigente, reclassificado pelo mes da data de entrega.
    await fixaHoje(202610);
    assert.deepEqual(await ver(orgA), [
      { origem: 'CART', ano: 2026, mes: 3, valor: 11 },
      { origem: 'CART', ano: 2026, mes: 10, valor: 13 },
      { origem: 'CART', ano: 2026, mes: 11, valor: 17 },
      { origem: 'FAT', ano: 2026, mes: 3, valor: 100 },
      { origem: 'FAT', ano: 2026, mes: 10, valor: 200 }
    ], 'vigente: FAT intacto, CART so de outubro por mes de entrega, setembro ignorado');

    // 2. Organizacoes isoladas.
    assert.deepEqual(await ver(orgB), [{ origem: 'CART', ano: 2026, mes: 10, valor: 99 }], 'outra organizacao tem a propria foto');

    // 3. Lote futuro (carga manual antecipada de novembro) nao vence o mes corrente.
    await add(orgA, 2026, 11, 'CART', '2026-11-20', 1000);
    assert.equal((await ver(orgA)).filter((r) => r.valor === 1000).length, 0, 'lote de novembro e posterior ao mes corrente: ignorado');

    // 4. Virada de mes sem lote novo: vale o mais recente que nao seja posterior.
    await fixaHoje(202611);
    assert.equal((await ver(orgA)).filter((r) => r.valor === 1000).length, 1, 'em novembro o lote de novembro passa a valer');
    assert.equal((await ver(orgA)).filter((r) => r.valor === 11).length, 0, 'e a foto de outubro deixa de valer');
    await fixaHoje(202610);

    // 5. Carteira de ano anterior fica so no ano de origem.
    await add(orgA, 2026, 12, 'CART', '2026-12-05', 3);
    await fixaHoje(202701);
    await add(orgA, 2027, 1, 'CART', '2026-12-05', 5);
    const virada = (await ver(orgA)).filter((r) => r.origem === 'CART');
    assert.deepEqual(virada, [{ origem: 'CART', ano: 2026, mes: 12, valor: 5 }], 'janeiro/2027: o item previsto para dez/2026 aparece em 2026, nao em 2027');

    // 6. Sem nenhuma carteira: so FAT, sem erro.
    const orgC = uuid();
    await add(orgC, 2026, 10, 'FAT', '2026-10-01', 50);
    assert.deepEqual(await ver(orgC), [{ origem: 'FAT', ano: 2026, mes: 10, valor: 50 }], 'sem carteira devolve so o faturamento');

    // 7. A visao respeita o RLS de quem consulta e fica fechada para anon.
    const op = (await db.query(`select reloptions from pg_class where relname='comercial_realizado_ledger_vigente'`)).rows[0].reloptions;
    assert.ok(op.includes('security_invoker=true'), 'visao precisa de security_invoker');
    const anon = (await db.query(`select has_table_privilege('anon','public.comercial_realizado_ledger_vigente','select') p`)).rows[0].p;
    assert.equal(anon, false, 'anon nao pode ler');

    console.log('carteiraVigente.sql.test: ok (7 grupos)');
  } finally {
    await db.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
