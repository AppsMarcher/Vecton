// Bootstrap PGlite compartilhado pelos testes SQL do módulo de OPEX (análises e planos de ação).
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID: uuid } = require('node:crypto');
const { PGlite } = require(process.env.PLANNING_PGLITE_TEST_LIB || '../../artifacts/bp-test-deps/node_modules/@electric-sql/pglite');
const root = path.join(__dirname, '../..');
const sql = name => fs.readFileSync(path.join(root, 'supabase', name), 'utf8');

async function createOpexDb(migrations = ['346_opex_review_schema.sql'], { prelude = '' } = {}) {
  const db = new PGlite();
  const ids = { org: uuid(), org2: uuid(), admin: uuid(), manager: uuid(), manager2: uuid(), outsider: uuid(), analyst: uuid(), exec: uuid(), exec2: uuid(), inactive: uuid(),
    cc1: uuid(), cc2: uuid(), cc3: uuid() };
  await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table organizations(id uuid primary key);
    create table user_profiles(organization_id uuid,user_id uuid,full_name text,email text,access_role text,additional_access_roles text[] default '{}',
      management text,created_at timestamptz default clock_timestamp(),notifications_cleared_at timestamptz,extra_managements text[] default '{}',extra_cc_ids uuid[] default '{}',is_active boolean default true);
    create function is_org_member(o uuid) returns boolean language sql stable security definer as $$select exists(select 1 from user_profiles where organization_id=o and user_id=auth.uid() and is_active)$$;
    create table cost_centers(id uuid primary key,organization_id uuid,cost_center_number text,cost_center_name text,cost_center_management text,active boolean default true);
    create table forecast_scenarios(id uuid primary key,organization_id uuid,name text,reference_year integer,cutoff_month integer default 0,is_default boolean default false);
    create table forecast_ledger_entries(id uuid primary key default gen_random_uuid(),organization_id uuid,scenario_id uuid,reference_year integer,reference_month integer,account_number text,cost_center_id uuid,cost_center_number text,amount numeric(18,2) default 0);
    create table actuals_ledger_entries(id uuid primary key default gen_random_uuid(),organization_id uuid,reference_year integer,reference_month integer,account_number text,cost_center_id uuid,cost_center_number text,amount numeric(18,2),updated_at timestamptz default now());
create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,metadata jsonb);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
    insert into organizations values('${ids.org}'),('${ids.org2}');
    insert into cost_centers values('${ids.cc1}','${ids.org}','1001','CC Um','Controladoria'),('${ids.cc2}','${ids.org}','1002','CC Dois','Industrial'),('${ids.cc3}','${ids.org2}','2001','Outra Org','Controladoria');
    insert into user_profiles(organization_id,user_id,full_name,email,access_role,management) values
      ('${ids.org}','${ids.admin}','Admin','admin@x.com','admin',null),
      ('${ids.org}','${ids.manager}','Gestor Controladoria','m1@x.com','manager','Controladoria'),
      ('${ids.org}','${ids.manager2}','Gestor Industrial','m2@x.com','manager','Industrial'),
      ('${ids.org}','${ids.outsider}','Gestor Sem Escopo','m3@x.com','manager','Marketing'),
      ('${ids.org}','${ids.analyst}','Analista','a@x.com','analyst','Controladoria'),
      ('${ids.org}','${ids.exec}','Executor Sem CC','e@x.com','analyst',null),
      ('${ids.org}','${ids.exec2}','Executor Dois','e2@x.com','analyst',null),
      ('${ids.org2}','${ids.inactive}','Outra Org','o@x.com','admin',null);
    update user_profiles set is_active=false where user_id='${ids.inactive}';
    select set_config('test.user','${ids.admin}',false);`);
  await db.exec(sql('285_forecast_ledger_leitura_por_escopo.sql'));
  if (prelude) await db.exec(prelude);
  for (const file of migrations) await db.exec(sql(file));
  await db.exec('grant usage on schema public,auth,storage to authenticated; grant select, insert on storage.objects to authenticated;');
  const as = async user => db.exec(`reset role;select set_config('test.user','${user}',false);set role authenticated;`);
  const asSuper = async () => db.exec(`reset role;select set_config('test.user','',false);`);
  const fails = async (promise, code) => {
    try { await promise; } catch (error) { return code ? (error.code === code || String(error.message).includes(code) ? error : Promise.reject(new Error(`esperava ${code}, veio ${error.code}: ${error.message}`))) : error; }
    throw new Error('esperava falha, mas a operação passou');
  };
  return { db, ids, as, asSuper, fails, uuid, sql };
}
// Tabelas mínimas da Central de Notificações (092/110/157/093) para os testes do módulo.
const NOTIFICATIONS_PRELUDE = `
  create table notification_event_types(kind text primary key,label text,description text,target_report_id text,sort_order int,trigger_mode text default 'event',target_mode text default 'broadcast');
  create table notification_settings(organization_id uuid,kind text,in_app boolean not null default true,email boolean not null default false,email_recipients text[] not null default '{}',is_active boolean not null default true,primary key(organization_id,kind));
  create table notifications(id uuid primary key default gen_random_uuid(),organization_id uuid,kind text,title text,body text default '',ref_year int,ref_month int,target_report_id text,actor_user_id uuid,created_at timestamptz default now(),target_user_id uuid);
  create table notification_reads(notification_id uuid,user_id uuid,read_at timestamptz default now(),primary key(notification_id,user_id));
  create table notification_email_outbox(id uuid primary key default gen_random_uuid(),notification_id uuid,organization_id uuid,recipients text[],subject text,body_text text,status text default 'pending',attempts int default 0,last_error text,created_at timestamptz default now(),sent_at timestamptz,link_path text);
`;
module.exports = { createOpexDb, uuid, NOTIFICATIONS_PRELUDE };
