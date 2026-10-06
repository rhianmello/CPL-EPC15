// Offline PostgreSQL integration tests. No Supabase URL/key or network calls.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
let runtime;
try { runtime=require.resolve('@electric-sql/pglite'); }
catch { runtime=path.resolve(process.env.PGLITE_MODULE_DIR||path.join(__dirname,'../../fleet-tools/node_modules/@electric-sql/pglite'),'dist/index.cjs'); }
const {PGlite}=require(runtime);
const {pgcrypto}=require(path.join(path.dirname(runtime),'contrib/pgcrypto.cjs'));
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261006194038_fleet_assets_and_append_only_history.sql'),'utf8');
const reviewMetadataMigration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261006224819_fleet_draft_human_review_metadata.sql'),'utf8');
const fixturePassword='offline-only-fixture-password';
const uuid=()=>require('node:crypto').randomUUID();

test('fleet SQL integration: auth, append history, audit, conflicts and atomic imports',async t=>{
  const db=new PGlite({extensions:{pgcrypto}});
  await db.waitReady;
  t.after(()=>db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema extensions;
    create extension pgcrypto with schema extensions;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.coordination_master(id integer primary key,password_hash text,updated_at timestamptz default now());
    create function public.coordination_master_ok(p_master_password text) returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.coordination_master m where m.id=1 and m.password_hash=extensions.crypt(p_master_password,m.password_hash)) $$;
    revoke all on function public.coordination_master_ok(text) from public,anon,authenticated;
    create table public.existing_dashboard_sentinel(id integer primary key,payload jsonb);
    insert into public.existing_dashboard_sentinel values(1,'{"unchanged":true}');
    -- Match Supabase postgres: CREATEROLE, without SUPERUSER. Preexisting
    -- master objects belong to the migrator; unrelated schemas stay private.
    create role fleet_test_migrator createrole nosuperuser inherit;
    grant create on database postgres to fleet_test_migrator;
    grant usage,create on schema public to fleet_test_migrator;
    grant usage on schema auth to fleet_test_migrator;
    grant usage on schema extensions to fleet_test_migrator with grant option;
    grant execute on function extensions.digest(text,text),extensions.gen_random_bytes(integer) to fleet_test_migrator with grant option;
    alter table public.coordination_master owner to fleet_test_migrator;
    alter function public.coordination_master_ok(text) owner to fleet_test_migrator;
  `);
  await db.query("insert into public.coordination_master values(1,extensions.crypt($1,extensions.gen_salt('bf')),now())",[fixturePassword]);
  const previousMaster=(await db.query('select * from public.coordination_master')).rows[0];
  await db.exec('set role fleet_test_migrator');
  await db.exec(migration);
  const endpointMetadataSql="select pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,p.proacl::text acl from pg_proc p where p.oid='fleet_private.publish_import(text,uuid,text,jsonb)'::regprocedure";
  const beforePatch=(await db.query(endpointMetadataSql)).rows[0];
  await db.exec(reviewMetadataMigration);
  assert.deepEqual((await db.query(endpointMetadataSql)).rows[0],beforePatch);
  await db.exec(reviewMetadataMigration); // Already patched: safe no-op.
  assert.deepEqual((await db.query(endpointMetadataSql)).rows[0],beforePatch);
  await db.exec('reset role');
  const sql=async(q,params=[])=>db.query(q,params);
  const rpc=async(name,args=[])=>{
    const r=await sql(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as data`,args);
    return r.rows[0].data;
  };
  const admin=async(fn)=>{await db.exec('reset role');try{return await fn();}finally{await db.exec('set role anon');}};
  const expectCode=async(fn,code)=>assert.rejects(fn,e=>{assert.equal(e.code,code);return true;});
  const getAsset=async(id)=>(await rpc('fleet_asset_detail_public',[id])).asset;
  await db.exec('set role anon');
  let session,asset,p1,p2,importResult,rows,batch;

  await t.test('additive migration preserves existing data and master verifier',async()=>{
    assert.deepEqual(await admin(async()=> (await sql('select * from public.coordination_master')).rows[0]),previousMaster);
    assert.deepEqual(await admin(async()=> (await sql('select payload from public.existing_dashboard_sentinel')).rows[0].payload),{unchanged:true});
    assert.equal((await rpc('fleet_list_assets_public')).total,0);
    const schemas=await admin(async()=> (await sql("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='fleet_private' and c.relkind='r' and c.relrowsecurity")).rows[0].n);
    assert.equal(schemas,10);
  });
  await t.test('master password checked in backend and unsupported actors rejected',async()=>{
    await expectCode(()=>rpc('fleet_open_edit_session',['incorrect','Tester']),'42501');
    await assert.rejects(()=>rpc('fleet_open_edit_session',[fixturePassword,'  ']),/responsável/);
    session=await rpc('fleet_open_edit_session',[fixturePassword,'Operador de teste']);
    assert.match(session.token,/^[a-f0-9]{64}$/);
    assert.ok(new Date(session.expires_at)>new Date());
    const stored=await admin(async()=> (await sql('select * from fleet_private.fleet_edit_sessions')).rows[0]);
    assert.notEqual(stored.token_hash,session.token);
    assert.equal(stored.actor_user_id,null);
    assert.ok(new Date(stored.expires_at)-new Date(stored.issued_at)<=900001);
  });
  await t.test('direct tables and unsafe private helpers denied to anon',async()=>{
    for(const table of ['fleet_assets','fleet_ptrans','fleet_inspections','fleet_maintenance','fleet_documents','fleet_movements','fleet_audit_log','fleet_import_batches','fleet_edit_sessions','fleet_import_drafts']) {
      await expectCode(()=>sql(`select * from fleet_private.${table}`),'42501');
    }
    await expectCode(()=>sql('select fleet_private.require_session($1)',[session.token]),'42501');
    await expectCode(()=>sql('select fleet_private.request_user_id()'),'42501');
    await expectCode(()=>sql("insert into fleet_private.fleet_assets(modelo) values('bypass')"),'42501');
    await expectCode(()=>rpc('fleet_save_asset',['0'.repeat(64),{modelo:'bypass'},null]),'42501');
  });
  await t.test('definer role has no login/bypass and cannot read unrelated dashboard/master tables',async()=>{
    const role=await admin(async()=> (await sql("select rolcanlogin,rolsuper,rolcreaterole,rolbypassrls from pg_roles where rolname='cpl_fleet_executor'")).rows[0]);
    assert.deepEqual(role,{rolcanlogin:false,rolsuper:false,rolcreaterole:false,rolbypassrls:false});
    await admin(async()=>{
      await db.exec('set role cpl_fleet_executor');
      await expectCode(()=>sql('select * from public.existing_dashboard_sentinel'),'42501');
      await expectCode(()=>sql('select password_hash from public.coordination_master'),'42501');
      await expectCode(()=>sql('select auth.uid()'),'42501');
      assert.equal((await sql('select fleet_private.request_user_id() uid')).rows[0].uid,null);
      assert.equal((await sql('select public.coordination_master_ok($1) ok',[fixturePassword])).rows[0].ok,true);
      await db.exec('reset role');
    });
  });
  await t.test('create/update asset: unconfirmed facts null, immutable identity, per-field audit',async()=>{
    asset=await rpc('fleet_save_asset',[session.token,{placa_identificador:'TEST-1',modelo:'Escavadeira',responsavel_cpl:'Alan',observacao_atual:'Inicial'},null]);
    assert.equal(asset.ativo_no_contrato,null);
    assert.equal(asset.data_entrada,null);
    assert.equal(asset.status_operacional,null);
    const old=asset.updated_at;
    asset=await rpc('fleet_save_asset',[session.token,{id:asset.id,responsavel_cpl:'Bruno',observacao_atual:'Revisada'},old]);
    assert.equal(asset.responsavel_cpl,'Bruno');
    const detail=await rpc('fleet_asset_detail_public',[asset.id]);
    const change=detail.audit.find(a=>a.field_name==='responsavel_cpl');
    assert.equal(change.old_value,'Alan');assert.equal(change.new_value,'Bruno');
    assert.equal(change.actor,'Operador de teste');assert.equal(change.authenticated_as,'master');assert.equal(change.origin,'manual');
    await expectCode(()=>rpc('fleet_save_asset',[session.token,{id:asset.id,modelo:'conflict'},old]),'40001');
    await expectCode(()=>rpc('fleet_save_asset',[session.token,{id:asset.id,modelo:'missing version'},null]),'40001');
    await assert.rejects(()=>rpc('fleet_save_asset',[session.token,{id:asset.id,created_at:'1999-01-01'},asset.updated_at]),/Campo não permitido/);
  });
  await t.test('PTRAN versions append: current state changes while pending history survives',async()=>{
    p1=await rpc('fleet_add_record',[session.token,'ptrans',asset.id,{numero_ptran:'206000',status:'Pendente'},asset.updated_at]);
    asset=await getAsset(asset.id);
    p2=await rpc('fleet_add_record',[session.token,'ptrans',asset.id,{supersedes_id:p1.id,status:'Pronto'},asset.updated_at]);
    assert.equal(p2.numero_ptran,'206000');
    const detail=await rpc('fleet_asset_detail_public',[asset.id]);
    assert.equal(detail.ptrans.length,2);
    assert.equal(detail.ptrans.find(p=>p.id===p1.id).status,'Pendente');
    assert.equal(detail.ptrans.find(p=>p.id===p1.id).is_current,false);
    const current=(await rpc('fleet_list_assets_public')).assets.find(a=>a.id===asset.id).ptrans;
    assert.equal(current.length,1);assert.equal(current[0].status,'Pronto');
    assert.ok(detail.audit.some(a=>a.action==='version'&&a.field_name==='status'&&a.old_value==='Pendente'&&a.new_value==='Pronto'));
    asset=detail.asset;
    await expectCode(()=>rpc('fleet_add_record',[session.token,'ptrans',asset.id,{supersedes_id:p1.id,status:'Outra'},asset.updated_at]),'40001');
  });
  await t.test('cross-asset version linking and invalid kind/fields blocked',async()=>{
    const other=await rpc('fleet_save_asset',[session.token,{modelo:'Outro'},null]);
    await assert.rejects(()=>rpc('fleet_add_record',[session.token,'ptrans',other.id,{supersedes_id:p2.id,status:'Pronto'},other.updated_at]),/não pertence/);
    await assert.rejects(()=>rpc('fleet_add_record',[session.token,'DROP TABLE',asset.id,{},asset.updated_at]),/Tipo de registro/);
    await assert.rejects(()=>rpc('fleet_add_record',[session.token,'documents',asset.id,{created_at:'1999-01-01'},asset.updated_at]),/Campo não permitido/);
    await assert.rejects(()=>rpc('fleet_add_record',[session.token,'documents',asset.id,{arquivo_url:'javascript:alert(1)'},asset.updated_at]),/HTTPS/);
  });
  await t.test('repeat inspections/documents show latest per type and preserve every entry',async()=>{
    for(const date of ['2026-09-01','2026-10-01']) {
      asset=await getAsset(asset.id);
      await rpc('fleet_add_record',[session.token,'inspections',asset.id,{tipo_inspecao:'Segurança',data_inspecao:date,validade:date},asset.updated_at]);
      asset=await getAsset(asset.id);
      await rpc('fleet_add_record',[session.token,'documents',asset.id,{tipo_documento:'CRLV',emissao:date,validade:date},asset.updated_at]);
    }
    const detail=await rpc('fleet_asset_detail_public',[asset.id]);
    assert.equal(detail.inspections.length,2);assert.equal(detail.documents.length,2);
    const current=(await rpc('fleet_list_assets_public')).assets.find(a=>a.id===asset.id);
    assert.equal(current.inspections.length,1);assert.equal(current.inspections[0].data_inspecao,'2026-10-01');
    assert.equal(current.documents.length,1);assert.equal(current.documents[0].emissao,'2026-10-01');
  });
  await t.test('movement updates contract/responsibility atomically and never deletes asset',async()=>{
    asset=await getAsset(asset.id);
    await rpc('fleet_add_record',[session.token,'movements',asset.id,{tipo_movimento:'entrada',data:'2026-10-06'},asset.updated_at]);
    asset=await getAsset(asset.id);assert.equal(asset.ativo_no_contrato,true);
    await rpc('fleet_add_record',[session.token,'movements',asset.id,{tipo_movimento:'troca de responsável',responsavel_novo:'Carlos'},asset.updated_at]);
    asset=await getAsset(asset.id);assert.equal(asset.responsavel_cpl,'Carlos');
    await rpc('fleet_add_record',[session.token,'movements',asset.id,{tipo_movimento:'saída',data:'2026-10-06T19:00:00.000Z'},asset.updated_at]);
    asset=await getAsset(asset.id);assert.equal(asset.ativo_no_contrato,false);
    assert.equal(asset.data_saida,'2026-10-06');
    const detail=await rpc('fleet_asset_detail_public',[asset.id]);
    assert.equal(detail.movements.length,3);
    assert.equal(detail.movements.find(m=>m.responsavel_novo==='Carlos').responsavel_anterior,'Bruno');
    assert.ok(detail.audit.some(a=>a.field_name==='ativo_no_contrato'&&a.old_value===true&&a.new_value===false));
    await rpc('fleet_add_record',[session.token,'movements',asset.id,{tipo_movimento:'entrada',data:'2026-10-07'},asset.updated_at]);
    asset=await getAsset(asset.id);assert.equal(asset.ativo_no_contrato,true);assert.equal(asset.status_operacional,null);
  });
  await t.test('append-only trigger blocks privileged rewrite/delete of history/audit/assets',async()=>{
    await expectCode(()=>admin(()=>sql('update fleet_private.fleet_ptrans set status=$1 where id=$2',['silenced',p1.id])),'42501');
    await expectCode(()=>admin(()=>sql('delete from fleet_private.fleet_audit_log where asset_id=$1',[asset.id])),'42501');
    await expectCode(()=>admin(()=>sql('delete from fleet_private.fleet_assets where id=$1',[asset.id])),'42501');
    await expectCode(()=>admin(()=>sql('update fleet_private.fleet_assets set id=$1 where id=$2',[uuid(),asset.id])),'42501');
  });
  await t.test('import duplicates require review on BOTH rows and roll back entire batch',async()=>{
    const bad=uuid();const before=(await rpc('fleet_list_assets_public')).total;
    const duplicated=[{row_number:3,raw:{PLACA:'DUP'},asset:{modelo:'A',placa_identificador:'DUP'},ptran:{numero_ptran:'DUP-N'},decision:'new',reviewed:true},{row_number:4,raw:{PLACA:'DUP'},asset:{modelo:'B',placa_identificador:'DUP'},ptran:{numero_ptran:'DUP-N'},decision:'new',reviewed:false}];
    await assert.rejects(()=>rpc('fleet_publish_import',[session.token,bad,'duplicate.xlsx',duplicated]),/repetida dentro do lote/);
    assert.equal((await rpc('fleet_list_assets_public')).total,before);
    assert.equal(await admin(async()=> (await sql('select count(*)::int n from fleet_private.fleet_import_batches where id=$1',[bad])).rows[0].n),0);
    duplicated[1].reviewed=true;
    const result=await rpc('fleet_publish_import',[session.token,bad,'duplicate.xlsx',duplicated]);
    assert.equal(result.inserted,2);assert.equal(result.ptran_inserted,2);
    assert.equal((await rpc('fleet_list_assets_public')).assets.filter(a=>a.placa_identificador==='DUP').length,2);
  });
  await t.test('reviewed import preserves raw unknown status and nullable missing facts',async()=>{
    batch=uuid();rows=[{row_number:12,raw:{STATUS:'DANIEL','DATA RECEBIMENTO':'0199-12-13',PLACA:'SERIAL-1'},asset:{modelo:'Bomba de concreto',placa_identificador:'SERIAL-1',responsavel_cpl:'Daniel'},ptran:{status:'DANIEL',data_recebimento:null,numero_ptran:null},decision:'new',reviewed:true},{row_number:13,raw:{STATUS:'CANCELAR'},asset:{modelo:'Ignorada'},ptran:null,decision:'ignore',reviewed:true}];
    importResult=await rpc('fleet_publish_import',[session.token,batch,'source.xlsx',rows]);
    assert.equal(importResult.inserted,1);assert.equal(importResult.ptran_inserted,1);assert.equal(importResult.ignored,1);
    const item=(await rpc('fleet_list_assets_public')).assets.find(a=>a.placa_identificador==='SERIAL-1');
    assert.equal(item.ptrans[0].status,'DANIEL');assert.equal(item.ptrans[0].data_recebimento,null);
    assert.equal(item.raw_import.source['DATA RECEBIMENTO'],'0199-12-13');
    assert.equal(item.ativo_no_contrato,null);assert.equal(item.categoria,null);
    const audit=(await rpc('fleet_asset_detail_public',[item.id])).audit;
    assert.ok(audit.every(a=>a.origin==='excel_import'&&a.import_batch_id===batch));
  });
  await t.test('normalized identifiers and ISC duplicates require explicit review',async()=>{
    const before=(await rpc('fleet_list_assets_public')).total;
    for(const conflicting of [
      [{row_number:1,raw:{},asset:{modelo:'A',placa_identificador:'EQP0001'},ptran:null,decision:'new',reviewed:false},{row_number:2,raw:{},asset:{modelo:'B',placa_identificador:'EQP 0001'},ptran:null,decision:'new',reviewed:false}],
      [{row_number:1,raw:{},asset:{modelo:'A',placa_identificador:'ISC-A'},ptran:{numero_isc:'ISC9000001'},decision:'new',reviewed:false},{row_number:2,raw:{},asset:{modelo:'B',placa_identificador:'ISC-B'},ptran:{numero_isc:'ISC 9000001'},decision:'new',reviewed:false}]
    ]) {
      await assert.rejects(()=>rpc('fleet_publish_import',[session.token,uuid(),'conflicts.xlsx',conflicting]),/repetid[oa]/);
      assert.equal((await rpc('fleet_list_assets_public')).total,before);
    }
    const first=[{row_number:1,raw:{},asset:{modelo:'A',placa_identificador:'EXIST 123'},ptran:{numero_isc:'ISC901'},decision:'new',reviewed:true}];
    await rpc('fleet_publish_import',[session.token,uuid(),'existing.xlsx',first]);
    await assert.rejects(()=>rpc('fleet_publish_import',[session.token,uuid(),'conflict-db.xlsx',[{row_number:2,raw:{},asset:{modelo:'B',placa_identificador:'EXIST123'},ptran:null,decision:'new',reviewed:false}]]),/Identificação repetida/);
    await assert.rejects(()=>rpc('fleet_publish_import',[session.token,uuid(),'conflict-db-isc.xlsx',[{row_number:2,raw:{},asset:{modelo:'B',placa_identificador:'EXIST999'},ptran:{numero_isc:'ISC 901'},decision:'new',reviewed:false}]]),/ISC repetido/);
  });
  await t.test('source error flags require human review and remain in audit',async()=>{
    const sourceRows=[{row_number:8,raw:{issues:[{severity:'error',type:'status',message:'Desconhecido'}]},asset:{modelo:'Review required'},ptran:{status:'UNKNOWN'},decision:'new',reviewed:false}];
    await assert.rejects(()=>rpc('fleet_publish_import',[session.token,uuid(),'needs-review.xlsx',sourceRows]),/revisão humana/);
    sourceRows[0].reviewed=true;
    const published=await rpc('fleet_publish_import',[session.token,uuid(),'reviewed.xlsx',sourceRows]);assert.equal(published.inserted,1);
    const item=(await rpc('fleet_list_assets_public')).assets.find(a=>a.modelo==='Review required');
    assert.equal(item.raw_import.source.issues[0].severity,'error');
  });
  await t.test('absent PTRAN numbers do not silently merge different/absent ISCs',async()=>{
    let item=await rpc('fleet_save_asset',[session.token,{modelo:'ISC history'},null]);
    const prior=await rpc('fleet_add_record',[session.token,'ptrans',item.id,{status:'Pendente',numero_isc:'ISC-A'},item.updated_at]);
    item=await getAsset(item.id);
    await rpc('fleet_publish_import',[session.token,uuid(),'isc-change.xlsx',[{row_number:1,raw:{},asset_id:item.id,expected_updated_at:item.updated_at,asset:{},ptran:{status:'Pronto',numero_isc:'ISC-B'},decision:'update',reviewed:true}]]);
    let detail=await rpc('fleet_asset_detail_public',[item.id]);assert.equal(detail.ptrans.length,2);assert.ok(detail.ptrans.find(p=>p.id===prior.id).is_current);
    item=detail.asset;
    await rpc('fleet_publish_import',[session.token,uuid(),'no-identifiers.xlsx',[{row_number:1,raw:{},asset_id:item.id,expected_updated_at:item.updated_at,asset:{},ptran:{status:'Pronto'},decision:'update',reviewed:true}]]);
    detail=await rpc('fleet_asset_detail_public',[item.id]);assert.equal(detail.ptrans.length,3);assert.ok(detail.ptrans.every(p=>p.is_current));
    item=detail.asset;
    await rpc('fleet_publish_import',[session.token,uuid(),'same-isc.xlsx',[{row_number:1,raw:{},asset_id:item.id,expected_updated_at:item.updated_at,asset:{},ptran:{status:'Aprovado',numero_isc:'ISC-B'},decision:'update',reviewed:true}]]);
    detail=await rpc('fleet_asset_detail_public',[item.id]);assert.equal(detail.ptrans.length,4);assert.equal(detail.ptrans.filter(p=>p.numero_isc==='ISC-B'&&p.is_current).length,1);
  });
  await t.test('import retry is idempotent; reused batch with changed content rejected',async()=>{
    const before=(await rpc('fleet_list_assets_public')).total;
    assert.deepEqual(await rpc('fleet_publish_import',[session.token,batch,'source.xlsx',rows]),importResult);
    assert.equal((await rpc('fleet_list_assets_public')).total,before);
    const changed=structuredClone(rows);changed[0].asset.modelo='Changed';
    await expectCode(()=>rpc('fleet_publish_import',[session.token,batch,'source.xlsx',changed]),'40001');
  });
  await t.test('blank import fields cannot erase known values; status versions retained',async()=>{
    const item=(await rpc('fleet_list_assets_public')).assets.find(a=>a.placa_identificador==='SERIAL-1');
    const updateRows=[{row_number:12,raw:{STATUS:'Pronto',RESPONSAVEL:''},asset_id:item.id,expected_updated_at:item.updated_at,asset:{modelo:'',responsavel_cpl:null},ptran:{status:'Pronto',numero_ptran:null},decision:'update',reviewed:true}];
    const summary=await rpc('fleet_publish_import',[session.token,uuid(),'next.xlsx',updateRows]);
    assert.equal(summary.updated,1);assert.equal(summary.ptran_inserted,1);
    const detail=await rpc('fleet_asset_detail_public',[item.id]);
    assert.equal(detail.asset.modelo,'Bomba de concreto');assert.equal(detail.asset.responsavel_cpl,'Daniel');
    assert.equal(detail.ptrans.length,2);assert.ok(detail.ptrans.some(p=>p.status==='DANIEL'));
    assert.ok(detail.ptrans.some(p=>p.status==='Pronto'&&p.is_current));
    assert.ok((await rpc('fleet_list_assets_public')).assets.some(a=>a.id===asset.id));
  });
  await t.test('stale import and invalid later row roll back earlier new rows/audit/batch',async()=>{
    const before=(await rpc('fleet_list_assets_public')).total;
    const failed=uuid();
    const badRows=[{row_number:1,raw:{},asset:{modelo:'Should roll back'},ptran:null,decision:'new',reviewed:true},{row_number:2,raw:{},asset_id:asset.id,expected_updated_at:'2000-01-01T00:00:00Z',asset:{modelo:'stale'},ptran:null,decision:'update',reviewed:true}];
    await expectCode(()=>rpc('fleet_publish_import',[session.token,failed,'bad.xlsx',badRows]),'40001');
    assert.equal((await rpc('fleet_list_assets_public')).total,before);
    const counts=await admin(async()=> (await sql('select (select count(*) from fleet_private.fleet_import_batches where id=$1)::int b,(select count(*) from fleet_private.fleet_audit_log where import_batch_id=$1)::int a',[failed])).rows[0]);
    assert.deepEqual(counts,{b:0,a:0});
  });
  await t.test('search/pagination/history works and never discloses edit capability',async()=>{
    const found=await rpc('fleet_list_assets_public',['206000',0,1]);assert.equal(found.total,1);assert.equal(found.assets.length,1);
    const empty=await rpc('fleet_list_assets_public',['no such model',0,250]);assert.equal(empty.total,0);
    const history=await rpc('fleet_history_public',[{asset_id:asset.id,actor:'Operador',origem:'manual'},0,2]);
    assert.ok(history.total>2);assert.equal(history.events.length,2);
    const contents=JSON.stringify([await rpc('fleet_list_assets_public'),await rpc('fleet_asset_detail_public',[asset.id]),history]);
    assert.ok(!contents.includes(session.token));assert.ok(!contents.includes('token_hash'));assert.ok(!contents.includes('password_hash'));
    await assert.rejects(()=>rpc('fleet_list_assets_public',['',0,501]),/Paginação/);
    await assert.rejects(()=>rpc('fleet_list_assets_public',['',0,null]),/Paginação/);
    await assert.rejects(()=>rpc('fleet_list_assets_public',['',null,50]),/Paginação/);
    await assert.rejects(()=>rpc('fleet_history_public',[{},0,null]),/Paginação/);
    await assert.rejects(()=>rpc('fleet_history_public',[{},null,50]),/Paginação/);
  });
  await t.test('authenticated role has no direct writes and user-bound capability cannot cross identity',async()=>{
    await db.exec('reset role; set role authenticated');
    await expectCode(()=>sql("update fleet_private.fleet_assets set modelo='bypass'"),'42501');
    await expectCode(()=>sql('select * from fleet_private.fleet_edit_sessions'),'42501');
    const uid=uuid();await sql("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
    const bound=await rpc('fleet_open_edit_session',[fixturePassword,'Auth operator']);
    await sql("select set_config('request.jwt.claim.sub',$1,false)",[uuid()]);
    await expectCode(()=>rpc('fleet_save_asset',[bound.token,{modelo:'Cross user'},null]),'42501');
    await sql("select set_config('request.jwt.claim.sub','',false)");
    await db.exec('reset role; set role anon');
  });
  await t.test('private pending draft: gated raw, immutable original and atomic reviewed publication',async()=>{
    const draftId=uuid();
    const sourceRows=[{row_number:31,raw:{cells:['draft_secret'],headers:['Source'],original_status:'UNKNOWN',issues:[{severity:'error',message:'Review required'}]},asset:{modelo:'Draft test'},ptran:{numero_ptran:'draft-31',status:'UNKNOWN'},issues:[{severity:'error',message:'Review required'}],reviewed:false}];
    const before=(await rpc('fleet_list_assets_public')).total;
    await admin(()=>sql('insert into fleet_private.fleet_import_drafts(id,file_name,row_count,source_rows,source_metadata) values($1,$2,1,$3,$4)',[draftId,'pending.xlsx',sourceRows,{sha256:'fixture-source-hash',sheet:'Planilha1'}]));
    const list=await rpc('fleet_list_assets_public');
    assert.equal(list.total,before);assert.deepEqual(list.pending_import,{id:draftId,file_name:'pending.xlsx',row_count:1});
    assert.ok(!JSON.stringify(list).includes('draft_secret'));
    await expectCode(()=>rpc('fleet_pending_import',['0'.repeat(64),draftId]),'42501');
    const pending=await rpc('fleet_pending_import',[session.token,draftId]);
    assert.deepEqual(pending.parsed.rows,sourceRows);assert.equal(pending.parsed.issues.length,1);
    await expectCode(()=>admin(()=>sql("update fleet_private.fleet_import_drafts set source_rows='[]' where id=$1",[draftId])),'42501');
    await expectCode(()=>admin(()=>sql('delete from fleet_private.fleet_import_drafts where id=$1',[draftId])),'42501');
    const row={row_number:31,raw:{...sourceRows[0].raw,human_corrections:{status:'Pronto',responsavel:'Revisor',data_recebimento:'2026-10-06',provisoria:false}},asset:{modelo:'Draft test',responsavel_cpl:'Revisor'},ptran:{numero_ptran:'draft-31',status:'Pronto',responsavel:'Revisor',data_recebimento:'2026-10-06',provisoria:false},decision:'new',reviewed:true};
    const tampered=structuredClone(row);tampered.raw.cells=['changed original'];
    await assert.rejects(()=>rpc('fleet_publish_import',[session.token,draftId,'pending.xlsx',[tampered]]),/fonte original/);
    const unreviewed=structuredClone(row);unreviewed.reviewed=false;unreviewed.raw.issues=[];
    await assert.rejects(()=>rpc('fleet_publish_import',[session.token,draftId,'pending.xlsx',[unreviewed]]),/fonte pendente exige revisão/);
    assert.equal((await rpc('fleet_list_assets_public')).total,before);
    const result=await rpc('fleet_publish_import',[session.token,draftId,'pending.xlsx',[row]]);
    assert.equal(result.inserted,1);assert.equal(result.ptran_inserted,1);
    assert.equal((await rpc('fleet_list_assets_public')).pending_import,null);
    const stored=await admin(async()=> (await sql('select * from fleet_private.fleet_import_drafts where id=$1',[draftId])).rows[0]);
    assert.equal(stored.published_batch_id,draftId);assert.deepEqual(stored.source_rows,sourceRows);
    const published=(await rpc('fleet_list_assets_public')).assets.find(a=>a.import_batch_id===draftId);
    assert.equal(published.raw_import.source.original_status,'UNKNOWN');
    assert.deepEqual(published.raw_import.source.cells,['draft_secret']);
    assert.deepEqual(published.raw_import.source.human_corrections,row.raw.human_corrections);
    assert.equal(published.ptrans[0].status,'Pronto');assert.equal(published.ptrans[0].responsavel,'Revisor');
    assert.equal(published.ptrans[0].data_recebimento,'2026-10-06');assert.equal(published.ptrans[0].provisoria,false);
    assert.deepEqual(await rpc('fleet_publish_import',[session.token,draftId,'pending.xlsx',[row]]),result);
    await assert.rejects(()=>rpc('fleet_pending_import',[session.token,draftId]),/já foi publicada/);
    // Every staged source row must be acknowledged, even a clean row ignored
    // by the reviewer; native file imports keep their narrower error gates.
    const cleanDraft=uuid();const cleanSource=[{row_number:44,raw:{cells:['clean'],issues:[]},asset:{modelo:'Clean source'},ptran:null,issues:[]}];
    await admin(()=>sql('insert into fleet_private.fleet_import_drafts(id,file_name,row_count,source_rows) values($1,$2,1,$3)',[cleanDraft,'clean.xlsx',cleanSource]));
    const ignored={row_number:44,raw:cleanSource[0].raw,asset:cleanSource[0].asset,ptran:null,decision:'ignore',reviewed:false};
    await assert.rejects(()=>rpc('fleet_publish_import',[session.token,cleanDraft,'clean.xlsx',[ignored]]),/inclusive quando ignorada/);
    ignored.reviewed=true;
    assert.equal((await rpc('fleet_publish_import',[session.token,cleanDraft,'clean.xlsx',[ignored]])).ignored,1);
  });
  await t.test('expired/revoked sessions cannot write or publish import',async()=>{
    const expired=await rpc('fleet_open_edit_session',[fixturePassword,'Expired operator']);
    await admin(()=>sql("update fleet_private.fleet_edit_sessions set expires_at=clock_timestamp()-interval '1 second' where token_hash=encode(extensions.digest($1,'sha256'),'hex')",[expired.token]));
    await expectCode(()=>rpc('fleet_save_asset',[expired.token,{modelo:'Expired'},null]),'42501');
    await expectCode(()=>rpc('fleet_publish_import',[expired.token,uuid(),'expired.xlsx',rows]),'42501');
    await rpc('fleet_close_edit_session',[session.token]);
    asset=await getAsset(asset.id);
    await expectCode(()=>rpc('fleet_add_record',[session.token,'ptrans',asset.id,{status:'Bypass revoked'},asset.updated_at]),'42501');
  });
  await t.test('capability expiring while a write waits rolls back asset/import entirely',async()=>{
    await admin(()=>db.exec(`
      create function public.fleet_test_delay() returns trigger language plpgsql as $$ begin
        if new.modelo='expire_during_write' then perform pg_sleep(1); end if; return new;
      end $$;
      create trigger fleet_test_delay before insert on fleet_private.fleet_assets for each row execute function public.fleet_test_delay();
    `));
    const delayed=await rpc('fleet_open_edit_session',[fixturePassword,'Delayed operator']);
    const armExpiry=()=>admin(()=>sql("update fleet_private.fleet_edit_sessions set expires_at=clock_timestamp()+interval '700 milliseconds' where token_hash=encode(extensions.digest($1,'sha256'),'hex')",[delayed.token]));
    const before=(await rpc('fleet_list_assets_public')).total;
    await armExpiry();
    await expectCode(()=>rpc('fleet_save_asset',[delayed.token,{modelo:'expire_during_write'},null]),'42501');
    assert.equal((await rpc('fleet_list_assets_public')).total,before);
    const failedBatch=uuid();
    await armExpiry();
    await expectCode(()=>rpc('fleet_publish_import',[delayed.token,failedBatch,'delayed.xlsx',[{row_number:1,raw:{},asset:{modelo:'expire_during_write'},ptran:null,decision:'new',reviewed:true}]]),'42501');
    assert.equal((await rpc('fleet_list_assets_public')).total,before);
    assert.equal(await admin(async()=> (await sql('select count(*)::int n from fleet_private.fleet_import_batches where id=$1',[failedBatch])).rows[0].n),0);
  });
  if(process.env.FROTA_SOURCE_JSON) await t.test('optional real workbook dry-run: import parser → PostgreSQL → public RPC',async()=>{
    // This local test preserves every row as a separate asset. reviewed=true is
    // a TEST FIXTURE, not a decision/authorization to import production data.
    const source=JSON.parse(fs.readFileSync(process.env.FROTA_SOURCE_JSON,'utf8'));
    const importer=require('../js/frota-import.js');
    const matrix=source.rows.map(r=>Object.keys(r.cells).sort().map(key=>r.cells[key].value));
    const parsed=importer.fromRows(matrix);
    const comparison=importer.compare(parsed,[]);
    assert.equal(comparison.rows.length,source.summary.total_records||source.records.length);
    const reviewed=comparison.rows.map(r=>({row_number:r.row_number,raw:structuredClone(r.raw),asset_id:r.asset_id,expected_updated_at:r.expected_updated_at,asset:structuredClone(r.asset),ptran:structuredClone(r.ptran),decision:r.decision,reviewed:true}));
    const statusRow=reviewed.find(r=>comparison.rows.find(p=>p.row_number===r.row_number).issues.some(i=>i.type==='status'));
    const dateRow=reviewed.find(r=>comparison.rows.find(p=>p.row_number===r.row_number).issues.some(i=>i.type==='data'));
    const responsibleRow=reviewed.find(r=>!r.asset.responsavel_cpl);
    assert.ok(statusRow&&dateRow&&responsibleRow);
    for(const [row,field,value] of [[statusRow,'status','Pendente'],[dateRow,'data_recebimento','2026-10-06'],[responsibleRow,'responsavel','Revisor do ensaio local']]) {
      row.raw.human_corrections={...(row.raw.human_corrections||{}),[field]:value};
      row.ptran[field]=value;
      if(field==='responsavel')row.asset.responsavel_cpl=value;
    }
    const local=await rpc('fleet_open_edit_session',[fixturePassword,'Dry run local — nenhuma produção']);
    const before=(await rpc('fleet_list_assets_public')).total;
    const localBatch=uuid();
    await admin(()=>sql('insert into fleet_private.fleet_import_drafts(id,file_name,row_count,source_rows,source_metadata) values($1,$2,$3,$4,$5)',[localBatch,source.source.filename,parsed.rows.length,parsed.rows,{sha256:source.source.sha256_before,sheet:source.source.sheet}]));
    assert.equal((await rpc('fleet_list_assets_public')).total,before);
    assert.equal((await rpc('fleet_pending_import',[local.token,localBatch])).row_count,parsed.rows.length);
    const result=await rpc('fleet_publish_import',[local.token,localBatch,source.source.filename,reviewed]);
    assert.equal(result.inserted,comparison.rows.length);
    assert.equal(result.ptran_inserted,comparison.rows.length);
    assert.equal((await rpc('fleet_list_assets_public')).total,before+comparison.rows.length);
    assert.deepEqual(await rpc('fleet_publish_import',[local.token,localBatch,source.source.filename,reviewed]),result);
    const imported=(await rpc('fleet_list_assets_public')).assets.filter(a=>a.import_batch_id===localBatch);
    assert.equal(imported.length,comparison.rows.length);
    assert.ok(imported.every(a=>a.ativo_no_contrato===null&&a.status_operacional===null&&a.data_entrada===null));
    for(const row of reviewed) {
      const item=imported.find(a=>a.raw_import.row_number===row.row_number);
      assert.deepEqual(item.raw_import.source,row.raw);
      assert.equal(item.ptrans[0].status,row.ptran.status);
    }
    const draft=await admin(async()=> (await sql('select source_rows from fleet_private.fleet_import_drafts where id=$1',[localBatch])).rows[0]);
    assert.deepEqual(draft.source_rows,parsed.rows);
    assert.ok(!draft.source_rows.some(r=>r.raw.human_corrections));
    assert.equal(imported.find(a=>a.raw_import.row_number===dateRow.row_number).ptrans[0].data_recebimento,'2026-10-06');
    assert.equal(imported.find(a=>a.raw_import.row_number===responsibleRow.row_number).responsavel_cpl,'Revisor do ensaio local');
    await rpc('fleet_close_edit_session',[local.token]);
  });
});
