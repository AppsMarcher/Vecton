const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID: uuid } = require('node:crypto');
const { PGlite } = require(process.env.PLANNING_PGLITE_TEST_LIB || '../artifacts/bp-test-deps/node_modules/@electric-sql/pglite');

const SCRIPT = fs.readFileSync('supabase/limpeza_fotos_antigas_carteira_20261026.sql', 'utf8');
const BACKUP = 'public._bkp_ledger_cart_fotos_antigas_20261026';

(async () => {
  const db = new PGlite();
  try {
    const org = uuid();
    const novo = async () => {
      await db.exec(`drop table if exists ${BACKUP}; drop table if exists public.comercial_realizado_ledger_entries;
        create table public.comercial_realizado_ledger_entries(id uuid primary key default gen_random_uuid(), organization_id uuid, reference_year integer, reference_month integer, origem text, entry_date date, valor numeric);
        create or replace function public.comercial_cart_ym_corrente() returns integer language sql stable as $$select 202610$$;`);
      const add = (ano, mes, origem, n) => db.query(
        `insert into public.comercial_realizado_ledger_entries(organization_id, reference_year, reference_month, origem, entry_date, valor)
         select $1,$2,$3,$4, make_date($2,$3,1), 10 from generate_series(1,$5)`, [org, ano, mes, origem, n]);
      await add(2026, 3, 'FAT', 4);
      await add(2026, 8, 'CART', 2);   // foto antiga
      await add(2026, 9, 'CART', 1);   // foto antiga
      await add(2026, 10, 'CART', 2);  // foto vigente
      await add(2026, 10, 'FAT', 3);
    };
    const contagem = async () => (await db.query(`select origem, reference_month mes, count(*)::int n from public.comercial_realizado_ledger_entries group by 1,2 order by 1,2`)).rows;
    const roda = (texto) => db.exec(texto);
    const com = (n) => SCRIPT.replace(/v_esperado\s+constant\s+integer\s*:=\s*\d+;/, `v_esperado constant integer := ${n};`);
    assert.ok(/v_esperado\s+constant\s+integer\s*:=\s*29;/.test(SCRIPT), 'o script de producao espera 29 linhas (agosto 20 + setembro 9)');

    // 1. Apaga so as fotos antigas de carteira; guarda copia; FAT e foto vigente intactos.
    await novo();
    await roda(com(3));
    assert.deepEqual(await contagem(), [
      { origem: 'CART', mes: 10, n: 2 }, { origem: 'FAT', mes: 3, n: 4 }, { origem: 'FAT', mes: 10, n: 3 }
    ], 'ficam a foto vigente e todo o FAT');
    assert.equal((await db.query(`select count(*)::int n from ${BACKUP}`)).rows[0].n, 3, 'backup com as 3 linhas apagadas');

    // 2. Backup existente nao e sobrescrito: rodar de novo falha e nao apaga mais nada.
    await assert.rejects(() => roda(com(3)), /already exists|existe/i, 'segunda execucao nao pode sobrescrever o backup');
    assert.equal((await db.query(`select count(*)::int n from ${BACKUP}`)).rows[0].n, 3);

    // 3. Trava de contagem: se o numero de linhas nao for o esperado, aborta sem apagar nem criar backup.
    await novo();
    await assert.rejects(() => roda(com(29)), /esperado 29/i, 'contagem diferente aborta');
    assert.equal((await contagem()).length, 5, 'nada foi apagado');
    assert.equal((await db.query(`select to_regclass('${BACKUP}') as t`)).rows[0].t, null, 'backup nao ficou pela metade');

    // 4. Antes da 1a carga do mes novo, a foto vigente e a do mes anterior: nao pode ser apagada.
    await novo();
    await db.exec(`create or replace function public.comercial_cart_ym_corrente() returns integer language sql stable as $$select 202611$$;`);
    await roda(com(3));
    assert.equal((await contagem()).filter((r) => r.origem === 'CART').map((r) => r.mes).join(','), '10', 'em novembro sem carga, outubro continua sendo a foto vigente');

    console.log('carteiraLimpezaFotos.sql.test: ok');
  } finally {
    await db.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
