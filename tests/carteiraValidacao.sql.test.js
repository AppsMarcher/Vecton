const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID: uuid } = require('node:crypto');
const { PGlite } = require(process.env.PLANNING_PGLITE_TEST_LIB || '../artifacts/bp-test-deps/node_modules/@electric-sql/pglite');

const MIGRATION = fs.readFileSync('supabase/312_carteira_validacao_data.sql', 'utf8');

// Versao reduzida da funcao real, com o MESMO trecho de data (e fim de linha CRLF, como no banco).
const FUNCAO = `
create or replace function public.validate_comercial_realizado_import_row()
returns trigger language plpgsql as $function$
declare
  batch_rec   public.comercial_realizado_import_batches%rowtype;
  error_list  jsonb := '[]'::jsonb;
  norm_origem text;
begin
  select * into batch_rec from public.comercial_realizado_import_batches where id = new.batch_id;
  norm_origem := upper(nullif(btrim(new.origem), ''));
  new.origem := norm_origem;

  -- Data / competencia
  if new.entry_date is null then
    error_list := error_list || jsonb_build_array('Data obrigatoria');
  elsif extract(year from new.entry_date)::integer <> batch_rec.reference_year
     or extract(month from new.entry_date)::integer <> batch_rec.reference_month then
    error_list := error_list || jsonb_build_array('Data fora da competencia do lote');
  end if;

  new.validation_errors := error_list;
  new.validation_status := case when jsonb_array_length(error_list) > 0 then 'error' else 'valid' end;
  return new;
end;
$function$;`.replace(/\n/g, '\r\n');

(async () => {
  const db = new PGlite();
  try {
    const batch = uuid();
    await db.exec(`
      create table public.comercial_realizado_import_batches(id uuid primary key, reference_year integer, reference_month integer);
      create table public.comercial_realizado_import_rows(id uuid primary key default gen_random_uuid(), batch_id uuid, origem text, entry_date date, validation_errors jsonb, validation_status text);
      insert into public.comercial_realizado_import_batches values ('${batch}', 2026, 10);`);
    await db.exec(FUNCAO);
    await db.exec(`create trigger trg_validate before insert on public.comercial_realizado_import_rows for each row execute function public.validate_comercial_realizado_import_row();`);

    const insere = async (origem, data) => (await db.query(
      `insert into public.comercial_realizado_import_rows(batch_id, origem, entry_date) values ($1,$2,$3) returning validation_status, validation_errors`,
      [batch, origem, data])).rows[0];

    // Antes da migration: carteira de marco no lote de outubro e reprovada (o motivo da migration).
    const antes = await insere('CART', '2026-03-20');
    assert.equal(antes.validation_status, 'error');

    await db.exec(MIGRATION.replace(/^\s*begin;/im, '').replace(/commit;\s*$/im, ''));

    // CART: qualquer data e aceita.
    assert.equal((await insere('CART', '2026-03-20')).validation_status, 'valid', 'CART atrasada passa');
    assert.equal((await insere('cart', '2026-11-15')).validation_status, 'valid', 'CART futura passa (origem em minusculo tambem)');
    // FAT continua exigindo a data dentro do mes do lote.
    const fatFora = await insere('FAT', '2026-03-20');
    assert.equal(fatFora.validation_status, 'error', 'FAT fora do mes continua reprovado');
    assert.deepEqual(fatFora.validation_errors, ['Data fora da competencia do lote']);
    assert.equal((await insere('FAT', '2026-10-20')).validation_status, 'valid', 'FAT dentro do mes passa');
    // Data vazia continua obrigatoria para todos.
    assert.deepEqual((await insere('CART', null)).validation_errors, ['Data obrigatoria'], 'CART sem data continua reprovada');

    // Idempotente: rodar de novo nao quebra nem duplica a regra.
    await db.exec(MIGRATION.replace(/^\s*begin;/im, '').replace(/commit;\s*$/im, ''));
    assert.equal((await insere('CART', '2026-03-21')).validation_status, 'valid');

    console.log('carteiraValidacao.sql.test: ok');
  } finally {
    await db.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
