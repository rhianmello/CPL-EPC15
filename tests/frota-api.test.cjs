const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'../js/frota-api.js'),'utf8');
function harness(responses = {}) {
  const calls = [], events = []; let scheduled = null;
  const window = {EPC15_SUPABASE_CONFIG:{enabled:true,url:'https://test.invalid',publishableKey:'public-test-key'},supabase:{createClient:(url,key,options)=>{
    assert.equal(options.auth.persistSession,false);
    return {rpc:async(name,args)=>{calls.push({name,args});return responses[name] || {data:{},error:null};}};
  }},dispatchEvent:e=>events.push(e.type),addEventListener:()=>{}};
  vm.runInNewContext(source,{window,Date,JSON,String,Boolean,Error,CustomEvent:class {constructor(type){this.type=type;}},setTimeout:fn=>{scheduled=fn;return 1;},clearTimeout:()=>{},fetch:()=>Promise.resolve()});
  return {api:window.FleetAPI,calls,events,expire:()=>scheduled()};
}
test('read-only by default and no write RPC without a capability',async()=>{
  const {api,calls}=harness();
  assert.equal(api.isEditing(),false);
  assert.throws(()=>api.saveAsset({modelo:'Teste'}),/expirou/);
  await api.listAssets();
  assert.deepEqual(calls.map(c=>c.name),['fleet_list_assets_public']);
});
test('master only opens session; writes carry capability and expiry clears it',async()=>{
  const {api,calls,expire}=harness({fleet_open_edit_session:{data:{token:'capability-test',expires_at:new Date(Date.now()+900000).toISOString()}}});
  const result=await api.unlock('fixture-only-password','Operador teste');
  assert.equal(result.token,undefined);
  await api.saveAsset({modelo:'Teste'},'2026-10-06T12:00:00Z');
  assert.equal(calls[1].args.p_token,'capability-test');
  assert.equal(calls[1].args.p_master_password,undefined);
  expire();
  assert.equal(api.isEditing(),false);
});
test('backend authorization failure revokes frontend editing state',async()=>{
  const {api}=harness({fleet_open_edit_session:{data:{token:'capability-test',expires_at:new Date(Date.now()+900000).toISOString()}},fleet_save_asset:{error:{code:'42501',message:'Sessão inválida'}}});
  await api.unlock('fixture-only-password','Operador teste');
  await assert.rejects(api.saveAsset({}),/Sessão inválida/);
  assert.equal(api.isEditing(),false);
});
test('lock revokes the server session and missing migration has clear error',async()=>{
  const {api,calls}=harness({fleet_open_edit_session:{data:{token:'capability-test',expires_at:new Date(Date.now()+900000).toISOString()}},fleet_list_assets_public:{error:{code:'PGRST202'}}});
  await api.unlock('fixture-only-password','Operador teste'); await api.lock();
  assert.equal(api.isEditing(),false);
  assert.equal(calls.at(-1).name,'fleet_close_edit_session');
  await assert.rejects(api.listAssets(),/migration/);
});
test('the staged initial source can only be requested during an edit session',async()=>{
  const {api,calls}=harness({fleet_open_edit_session:{data:{token:'capability-test',expires_at:new Date(Date.now()+900000).toISOString()}}});
  assert.throws(()=>api.pendingImport('draft-test'),/expirou/);
  assert.equal(calls.length,0);
  await api.unlock('fixture-only-password','Operador teste');
  await api.pendingImport('draft-test');
  assert.equal(calls.at(-1).name,'fleet_pending_import');
  assert.equal(calls.at(-1).args.p_draft_id,'draft-test');
  assert.equal(calls.at(-1).args.p_token,'capability-test');
});
