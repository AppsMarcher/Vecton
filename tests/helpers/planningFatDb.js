// Banco de teste (PGlite) do formulário FAT: o mesmo esquema do Planejamento (migrations 026 a 295)
// mais as tabelas comerciais mínimas que o FAT lê e as migrations 316 em diante que existirem.
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PLANNING_PGLITE_TEST_LIB || '@electric-sql/pglite');
const uuid = () => require('node:crypto').randomUUID();
const mig = f => fs.readFileSync(path.join(__dirname, '../../supabase', f), 'utf8').split(String.fromCharCode(13)).join('');

async function createDb() {
  const db = new PGlite();
  const ids = { org: uuid(), org2: uuid(), admin: uuid(), writer: uuid(), reader: uuid(), outsider: uuid(), foreign: uuid(), cc: uuid(), cc2: uuid(), acc: uuid() };
  const { org, org2, admin, writer, reader, outsider, foreign, cc, cc2, acc } = ids;
  await db.exec(`create role authenticated; create role anon; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table organizations(id uuid primary key);
    create table user_profiles(organization_id uuid,user_id uuid,full_name text,access_role text,additional_access_roles text[] default '{}',is_active boolean default true,management text,extra_managements text[] default '{}',extra_cc_ids uuid[] default '{}',appearance text,phone text,department text,email text,profile_label text,unique(organization_id,user_id));
    create function is_org_member(o uuid) returns boolean language sql stable security definer as $$select exists(select 1 from user_profiles where organization_id=o and user_id=auth.uid() and is_active)$$;
    create function is_org_editor(o uuid) returns boolean language sql stable security definer as $$select exists(select 1 from user_profiles where organization_id=o and user_id=auth.uid() and access_role='admin')$$;
    create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
    create table cost_centers(id uuid primary key,organization_id uuid,cost_center_number text,cost_center_name text,cost_center_management text,active boolean default true);
    create table accounts(id uuid primary key,organization_id uuid,account_number text,account_name text,active boolean default true);
    create table dre_plan_nodes(id uuid primary key default gen_random_uuid(),organization_id uuid,account_id uuid,node_class text,active boolean default true);
    create table actuals_ledger_entries(organization_id uuid,reference_year int,reference_month int,account_number text,cost_center_id uuid,cost_center_number text,amount numeric(18,2));
    insert into organizations values('${org}'),('${org2}');
    insert into auth.users values('${admin}'),('${writer}'),('${reader}'),('${outsider}'),('${foreign}');
    insert into user_profiles(organization_id,user_id,access_role,management) values('${org}','${admin}','admin',null),('${org}','${writer}','manager','TI'),('${org}','${reader}','analyst','TI'),('${org}','${outsider}','analyst','TI'),('${org2}','${foreign}','admin',null);
    insert into cost_centers values('${cc}','${org}','101','TI','TI',true),('${cc2}','${org}','201','Industrial','Industrial',true);
    insert into accounts values('${acc}','${org}','42201','Serviços',true);
    insert into dre_plan_nodes(organization_id,account_id,node_class) values('${org}','${acc}','Analitica');
    select set_config('test.user','${admin}',false);`);
  const base = ['026_create_forecast_scenarios.sql', '056_create_forecast_monthly_account_totals.sql', '057_forecast_scenario_favorite.sql', '271_cenarios_nome_com_ano_estrela_global.sql', '278_planning_participativo.sql', '281_guard_user_profiles.sql', '282_planning_regras_integracao_estrela.sql', '283_planning_save_entries_em_lote.sql', '284_planning_renumera_formulas.sql'];
  for (const name of base) { if (name.startsWith('282')) await db.exec('alter table forecast_scenarios add column if not exists icon text;'); await db.exec(mig(name)); }
  await db.exec('grant usage on schema public,auth to authenticated; grant select,insert,update,delete on forecast_scenarios,forecast_ledger_entries,user_profiles to authenticated;');
  await db.exec(mig('279_planning_formula_sequencia.sql')); await db.exec(mig('280_planning_scenario_icon.sql'));
  await db.exec("alter table cost_centers add column cost_center_type text; update cost_centers set cost_center_type='ADM';");
  for (const name of ['287_planning_reordenar_linhas.sql', '290_planning_capex.sql', '291_planning_capex_destinations.sql', '293_planning_integrated_stamp.sql', '294_planning_ledger_user.sql', '295_planning_integrate_all.sql']) await db.exec(mig(name));
  // Cadastros e razão comerciais (mínimo que o FAT lê; os nomes de coluna são os reais)
  await db.exec(`create table comercial_territorios(id uuid primary key,organization_id uuid,nome text);
    create table comercial_linhas_negocio(id uuid primary key,organization_id uuid,nome text);
    create table comercial_coordenacoes(id uuid primary key,organization_id uuid,nome text);
    create table comercial_atribuicao_responsavel(id uuid primary key default gen_random_uuid(),organization_id uuid,territorio_id uuid,linha_negocio_id uuid,coordenacao_id uuid,responsavel text,data_inicio date,data_fim date);
    create table comercial_tipos(id uuid primary key,organization_id uuid,nome text);
    create table comercial_culturas(id uuid primary key,organization_id uuid,nome text);
    create table comercial_produtos(id uuid primary key,organization_id uuid,codigo text,descricao text,nome_reduzido text,tipo_id uuid,cultura_id uuid);
    create table comercial_realizado_ledger_entries(id uuid primary key default gen_random_uuid(),organization_id uuid,origem text,reference_year int,reference_month int,produto_id uuid,territorio_id uuid,linha_negocio_id uuid,coordenacao_id uuid,quantidade numeric,valor numeric,rl numeric,mp numeric);`);
  for (const f of ['041_create_comercial_planejado_imports.sql', '042_comercial_planejado_multi_mes.sql']) await db.exec(mig(f));
  const k = {};
  for (const [t, names] of Object.entries({ territorio: ['BA', 'EX', 'SP'], linha: ['Grão', 'Pecuária', 'Outros', 'Peças'], coord: ['Norte', 'Pecuária', 'Exportação', 'Peças', 'Sul'], tipo: ['Máquinas', 'Transgrain', 'Acessórios', 'Peças'], cultura: ['Grãos', 'Pecuária'] }))
    for (const n of names) { k[t + ':' + n] = uuid(); const tab = { territorio: 'comercial_territorios', linha: 'comercial_linhas_negocio', coord: 'comercial_coordenacoes', tipo: 'comercial_tipos', cultura: 'comercial_culturas' }[t]; await db.query(`insert into ${tab} values($1,$2,$3)`, [k[t + ':' + n], org, n]); }
  const att = (terr, linha, coord, resp) => db.query("insert into comercial_atribuicao_responsavel(organization_id,territorio_id,linha_negocio_id,coordenacao_id,responsavel,data_inicio) values($1,$2,$3,$4,$5,'2023-01-01')", [org, terr && k['territorio:' + terr], k['linha:' + linha], k['coord:' + coord], resp]);
  await att('BA', 'Grão', 'Norte', 'PENINHA'); await att('BA', 'Outros', 'Norte', 'PENINHA'); await att('BA', 'Pecuária', 'Pecuária', 'A definir');
  await att('EX', 'Grão', 'Exportação', 'Pablo'); await att('EX', 'Outros', 'Exportação', 'Pablo'); await att('EX', 'Pecuária', 'Exportação', 'Pablo');
  await att('SP', 'Grão', 'Sul', 'A definir'); await att('SP', 'Outros', 'Sul', 'A definir'); await att('SP', 'Pecuária', 'Pecuária', 'A definir'); await att(null, 'Peças', 'Peças', 'JENIFER VIANA');
  const prod = {};
  const addProd = async (key, codigo, tipo, cultura, nomeReduzido) => { prod[key] = uuid(); await db.query('insert into comercial_produtos values($1,$2,$3,$4,$5,$6,$7)', [prod[key], org, codigo, key, nomeReduzido, k['tipo:' + tipo], cultura && k['cultura:' + cultura]]); };
  await addProd('ING100a', '0100001', 'Máquinas', 'Grãos', 'INGRAIN100'); await addProd('ING100b', '0100002', 'Máquinas', 'Grãos', 'INGRAIN100');
  await addProd('ING90', '0900001', 'Máquinas', 'Pecuária', 'INGRAIN90'); await addProd('CARGO14', '0140001', 'Máquinas', 'Grãos', 'CARGOGRAIN 14000');
  await addProd('T170', '04003306', 'Transgrain', 'Grãos', null); await addProd('T215', '08203065', 'Transgrain', 'Grãos', null); await addProd('TIN65', '09003310', 'Transgrain', 'Pecuária', null);
  await addProd('TIN90a', '09103075', 'Transgrain', 'Pecuária', null); await addProd('TIN90b', '09103100', 'Transgrain', 'Pecuária', null);
  await addProd('SKATE', '0500001', 'Acessórios', null, null); await addProd('SELADORA', '0100000', 'Acessórios', null, null); await addProd('ENROL', '08103263', 'Acessórios', null, null);
  await addProd('PEC1', '105132', 'Peças', null, null); await addProd('PEC2', '08001426', 'Peças', null, null);
  const codes = Object.fromEntries((await db.query('select descricao, codigo from comercial_produtos')).rows.map(r => [r.descricao, r.codigo]));
  const territoryName = id => Object.entries(k).find(([key, v]) => key.startsWith('territorio:') && v === id)?.[0].split(':')[1] ?? null;
  // Carga de vendas planejadas de verdade: lote + linhas (validadas pelos triggers) + aplicar. rows: { month, prod, terr (id), qty, valor, mb }
  const planned = async (rows, { scenario, year = 2027, mode = 'additional' }) => {
    const batch = uuid();
    await db.query("insert into comercial_planejado_import_batches(id,organization_id,scenario_id,reference_year,reference_month,load_mode,source_type,status) values($1,$2,$3,$4,1,$5,'manual','draft')", [batch, org, scenario, year, mode]);
    let n = 0;
    for (const r of rows) await db.query('insert into comercial_planejado_import_rows(batch_id,row_number,reference_month,cod_produto,cod_territorio,quantidade,valor,mb_pct) values($1,$2,$3,$4,$5,$6,$7,$8)', [batch, ++n, r.month, codes[r.prod], r.terr ? territoryName(r.terr) : null, r.qty ?? null, r.valor ?? null, r.mb ?? null]);
    const bad = (await db.query("select validation_errors from comercial_planejado_import_rows where batch_id=$1 and validation_status='error'", [batch])).rows;
    if (bad.length) throw new Error('linha da carga inválida: ' + JSON.stringify(bad));
    await db.query('select apply_comercial_planejado_import_batch($1)', [batch]);
    return batch;
  };
  const as = async who => { await db.exec(`reset role;select set_config('test.user','${who}',false);set role authenticated;`); };
  const write = async (action, scenario, payload = {}, organization = org) => (await db.query('select planning_write($1,$2,$3,$4::jsonb) value', [organization, action, scenario, JSON.stringify(payload)])).rows[0].value;
  const ctx = async (scenario = null, organization = org) => (await db.query('select planning_context($1,$2) value', [organization, scenario])).rows[0].value;
  const sale = (o) => db.query('insert into comercial_realizado_ledger_entries(organization_id,origem,reference_year,reference_month,produto_id,territorio_id,linha_negocio_id,coordenacao_id,quantidade,valor,rl,mp) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [org, o.origem || 'FAT', o.year, o.month, prod[o.prod], o.terr ? k['territorio:' + o.terr] : null, k['linha:' + o.linha], k['coord:' + o.coord], o.qty, o.fat, o.rl ?? o.fat * 0.9, o.mp]);
  return { db, ids, k, prod, as, write, ctx, sale, planned, mig, exists: f => fs.existsSync(path.join(__dirname, '../../supabase', f)),
    loadFat: async () => { await db.exec('reset role'); for (const f of ['316_planning_fat_schema.sql', '317_planning_fat_premises.sql', '318_planning_fat_engine.sql', '319_planning_fat_integration.sql', '320_planning_bloqueio_nao_vale_para_admin.sql', '321_planning_fat_renomear_formulario.sql', '322_planning_fat_acesso_por_coordenacao.sql', '323_planning_fat_volumes_da_carga_planejado.sql', '324_planning_fat_grupo_acessorios.sql', '326_planejado_volume_e_cenario.sql', '327_planejado_recalcula_com_cenario.sql', '329_planejado_corrige_valor_vazio.sql', '328_planejado_acompanha_fat.sql', '330_planning_fat_read_whole.sql']) if (fs.existsSync(path.join(__dirname, '../../supabase', f))) await db.exec(mig(f)); } };
}
module.exports = { createDb, uuid };
