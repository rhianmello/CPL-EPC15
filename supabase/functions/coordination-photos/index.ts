
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function adminKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    const parsed = JSON.parse(raw);
    return parsed.default || Object.values(parsed)[0];
  }
  throw new Error("Chave administrativa indisponível.");
}

function publishableKey() {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (raw) {
    const parsed = JSON.parse(raw);
    return parsed.default || Object.values(parsed)[0];
  }
  throw new Error("Chave pública indisponível.");
}

function normalize(value:string) {
  return String(value||"").trim().toLocaleLowerCase("pt-BR");
}

function safeExt(file: File) {
  const map: Record<string,string> = {
    "image/jpeg":"jpg","image/png":"png","image/webp":"webp",
    "image/gif":"gif","image/heic":"heic","image/heif":"heif"
  };
  return map[file.type] || "jpg";
}

async function verifyBi(anon:any, username:string, password:string) {
  const { data, error } = await anon.rpc("verify_bi_access", {
    p_username: username, p_password: password
  });
  if (error || data !== true) throw new Error("Acesso negado.");
}

async function weekInfo(anon:any, username:string, password:string, weekNo:number) {
  const { data, error } = await anon.rpc("list_coordination_weeks", {
    p_username: username, p_password: password
  });
  if (error) throw new Error(error.message || "Falha ao validar a semana.");
  const week=(data||[]).find((w:any)=>Number(w.week_no)===Number(weekNo));
  if(!week) throw new Error("Semana EPC-15 inválida.");
  return week;
}

async function verifyMaster(anon:any, username:string, password:string, master:string, weekNo:number) {
  const { data, error } = await anon.rpc("verify_coordination_master", {
    p_username: username, p_password: password,
    p_master_password: master, p_week_no: weekNo
  });
  if (error) throw new Error(error.message || "Falha ao validar senha master.");
  const result=typeof data==="string"?JSON.parse(data):data;
  if(!result?.ok) throw new Error(result?.locked ? "Semana encerrada." : "Senha master incorreta.");
}

async function signedRows(admin:any, rows:any[]) {
  const out=[];
  for(const row of rows||[]) {
    const { data, error } = await admin.storage
      .from("epc15-coordination-photos")
      .createSignedUrl(row.storage_path, 60*60*12);
    if(error) throw error;
    out.push({...row,signed_url:data?.signedUrl||null});
  }
  return out;
}

Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=createClient(url,publishableKey(),{auth:{persistSession:false,autoRefreshToken:false}});
    const admin=createClient(url,adminKey(),{auth:{persistSession:false,autoRefreshToken:false}});

    if(req.method==="POST" && (req.headers.get("content-type")||"").includes("application/json")) {
      const body=await req.json();
      const action=String(body.action||"");
      const username=String(body.username||"");
      const password=String(body.password||"");
      const weekNo=Number(body.week_no);
      if(!Number.isFinite(weekNo)) throw new Error("Semana inválida.");

      if(action==="list"){
        const unitKey=normalize(String(body.unit_key||""));
        const phaseKey=normalize(String(body.phase_key||""));
        if(!unitKey) throw new Error("Unidade não informada.");
        if(!phaseKey) throw new Error("Fase não informada.");
        const {data,error}=await admin.from("coordination_stage_photos").select("*")
          .eq("week_no",weekNo)
          .eq("unit_key",unitKey)
          .eq("phase_key",phaseKey)
          .order("sort_order",{ascending:true})
          .order("created_at",{ascending:true});
        if(error) throw error;
        return json({photos:await signedRows(admin,data||[])});
      }

      if(action==="caption"){
        const master=String(body.master_password||"");
        const photoId=String(body.photo_id||"");
        const caption=String(body.caption||"").trim().slice(0,500);
        if(master){
          const {data,error}=await anon.rpc("verify_coordination_master_public",{
            p_master_password:master,p_week_no:weekNo
          });
          if(error) throw new Error(error.message || "Falha ao validar senha master.");
          const result=typeof data==="string"?JSON.parse(data):data;
          if(!result?.ok) throw new Error("Senha master incorreta.");
        }else{
          await verifyBi(anon,username,password);
          await verifyMaster(anon,username,password,master,weekNo);
        }
        const {data,error}=await admin.from("coordination_stage_photos")
          .update({caption,updated_at:new Date().toISOString()})
          .eq("id",photoId).eq("week_no",weekNo)
          .select("*").single();
        if(error) throw error;
        return json({photo:data});
      }

      throw new Error("Ação inválida.");
    }

    if(req.method==="POST") {
      const form=await req.formData();
      const action=String(form.get("action")||"upload");
      const username=String(form.get("username")||"");
      const password=String(form.get("password")||"");
      const master=String(form.get("master_password")||"");
      const weekNo=Number(form.get("week_no"));
      const unitName=String(form.get("unit_name")||"").trim();
      const unitKey=normalize(String(form.get("unit_key")||unitName));
      const phaseName=String(form.get("phase_name")||"").trim();
      const phaseKey=normalize(String(form.get("phase_key")||phaseName));
      const file=form.get("file");

      let week:any;
      if(master){
        const {data,error}=await anon.rpc("verify_coordination_master_public",{
          p_master_password:master,p_week_no:weekNo
        });
        if(error) throw new Error(error.message || "Falha ao validar senha master.");
        const result=typeof data==="string"?JSON.parse(data):data;
        if(!result?.ok) throw new Error("Senha master incorreta.");
        week={week_no:weekNo,is_locked:Boolean(result.locked)};
      }else{
        await verifyBi(anon,username,password);
        week=await weekInfo(anon,username,password,weekNo);
        if(week.is_locked) throw new Error("Semana encerrada: informe a senha master para editar.");
      }
      if(!unitName || !unitKey) throw new Error("Unidade não identificada.");
      if(!phaseName || !phaseKey) throw new Error("Fase não identificada.");
      if(!(file instanceof File)||!String(file.type||"").startsWith("image/")) throw new Error("Selecione uma imagem válida.");
      if(file.size>10*1024*1024) throw new Error("Cada foto deve ter no máximo 10 MB.");

      if(action==="replace"){
        const photoId=String(form.get("photo_id")||"");
        const {data:existing,error:findError}=await admin.from("coordination_stage_photos")
          .select("*").eq("id",photoId).eq("week_no",weekNo).single();
        if(findError||!existing) throw new Error("Foto não encontrada.");
        const bytes=new Uint8Array(await file.arrayBuffer());
        const {error:storageError}=await admin.storage.from("epc15-coordination-photos")
          .update(existing.storage_path,bytes,{contentType:file.type,upsert:true});
        if(storageError) throw storageError;
        const {data:updated,error:updateError}=await admin.from("coordination_stage_photos")
          .update({
            unit_name:unitName,unit_key:unitKey,
            phase_name:phaseName,phase_key:phaseKey,
            stage_key:unitKey+'|'+phaseKey,stage_label:phaseName,stage_path:unitName+' › '+phaseName,
            source_index:null,mime_type:file.type,file_size:file.size,updated_at:new Date().toISOString()
          }).eq("id",photoId).select("*").single();
        if(updateError) throw updateError;
        return json({photo:updated});
      }

      const path=`week-${weekNo}/unit-${encodeURIComponent(unitKey).replace(/%/g,"_")}/phase-${encodeURIComponent(phaseKey).replace(/%/g,"_")}/${crypto.randomUUID()}.${safeExt(file)}`;
      const bytes=new Uint8Array(await file.arrayBuffer());
      const {error:uploadError}=await admin.storage.from("epc15-coordination-photos")
        .upload(path,bytes,{contentType:file.type,upsert:false});
      if(uploadError) throw uploadError;

      const {data:maxRows}=await admin.from("coordination_stage_photos").select("sort_order")
        .eq("week_no",weekNo).eq("unit_key",unitKey).eq("phase_key",phaseKey).order("sort_order",{ascending:false}).limit(1);
      const sortOrder=(maxRows?.[0]?.sort_order??-1)+1;
      const {data:inserted,error:insertError}=await admin.from("coordination_stage_photos")
        .insert({
          week_no:weekNo,source_index:null,
          stage_key:unitKey+'|'+phaseKey,stage_label:phaseName,stage_path:unitName+' › '+phaseName,
          unit_name:unitName,unit_key:unitKey,
          phase_name:phaseName,phase_key:phaseKey,
          storage_path:path,mime_type:file.type,file_size:file.size,
          sort_order:sortOrder,uploaded_by:username.trim()
        }).select("*").single();
      if(insertError){
        await admin.storage.from("epc15-coordination-photos").remove([path]);
        throw insertError;
      }
      return json({photo:inserted});
    }

    if(req.method==="DELETE"){
      const body=await req.json();
      const username=String(body.username||"");
      const password=String(body.password||"");
      const master=String(body.master_password||"");
      const weekNo=Number(body.week_no);
      const photoId=String(body.photo_id||"");
      if(master){
        const {data,error}=await anon.rpc("verify_coordination_master_public",{
          p_master_password:master,p_week_no:weekNo
        });
        if(error) throw new Error(error.message || "Falha ao validar senha master.");
        const result=typeof data==="string"?JSON.parse(data):data;
        if(!result?.ok) throw new Error("Senha master incorreta.");
      }else{
        await verifyBi(anon,username,password);
        await verifyMaster(anon,username,password,master,weekNo);
      }
      const {data:existing,error:findError}=await admin.from("coordination_stage_photos")
        .select("*").eq("id",photoId).eq("week_no",weekNo).single();
      if(findError||!existing) throw new Error("Foto não encontrada.");
      const {error:storageError}=await admin.storage.from("epc15-coordination-photos").remove([existing.storage_path]);
      if(storageError) throw storageError;
      const {error:deleteError}=await admin.from("coordination_stage_photos").delete().eq("id",photoId);
      if(deleteError) throw deleteError;
      return json({ok:true});
    }

    return json({error:"Método não permitido."},405);
  } catch(error){
    return json({error:error instanceof Error?error.message:String(error)},400);
  }
});
