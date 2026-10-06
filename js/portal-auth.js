(function () {
  const cfg=window.EPC15_SUPABASE_CONFIG||{};
  const STORAGE_KEY='epc15_portal_session_v1';
  let client=null;
  let validated=false;
  let validating=null;

  function ready(){
    return Boolean(cfg.enabled&&cfg.url&&cfg.publishableKey&&window.supabase?.createClient);
  }

  function getClient(){
    if(!ready()) return null;
    if(!client){
      client=window.supabase.createClient(cfg.url,cfg.publishableKey,{
        auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
      });
    }
    return client;
  }

  function readSession(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw) return null;
      const data=JSON.parse(raw);
      if(!data?.token) return null;
      return data;
    }catch(_){
      return null;
    }
  }

  function writeSession(data){
    localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
  }

  function clearSession(){
    localStorage.removeItem(STORAGE_KEY);
    validated=false;
  }

  function hasStoredSession(){
    return Boolean(readSession()?.token);
  }

  function isValidated(){
    return validated===true&&hasStoredSession();
  }

  async function login(username,password){
    const supabase=getClient();
    if(!supabase) throw new Error('Supabase não configurado.');
    const {data,error}=await supabase.rpc('portal_login',{
      p_username:String(username||'').trim(),
      p_password:String(password||'')
    });
    if(error) throw new Error(error.message||'Falha ao validar acesso.');
    const result=typeof data==='string'?JSON.parse(data):data;
    if(!result?.ok||!result?.token){
      clearSession();
      return false;
    }
    writeSession({
      token:result.token,
      username:result.username||String(username||'').trim(),
      expires_at:result.expires_at||null
    });
    validated=true;
    return true;
  }

  async function validate(){
    if(validated&&hasStoredSession()) return true;
    if(validating) return validating;
    const session=readSession();
    if(!session?.token){
      validated=false;
      return false;
    }
    const supabase=getClient();
    if(!supabase){
      validated=false;
      return false;
    }
    validating=(async()=>{
      try{
        const {data,error}=await supabase.rpc('portal_session_valid',{p_token:session.token});
        if(error) throw error;
        const result=typeof data==='string'?JSON.parse(data):data;
        if(!result?.ok){
          clearSession();
          return false;
        }
        writeSession({...session,username:result.username||session.username,expires_at:result.expires_at||session.expires_at});
        validated=true;
        return true;
      }catch(error){
        console.error('Falha ao validar sessão do portal',error);
        validated=false;
        return false;
      }finally{
        validating=null;
      }
    })();
    return validating;
  }

  async function logout(){
    const session=readSession();
    clearSession();
    const supabase=getClient();
    if(!supabase||!session?.token) return true;
    try{
      await supabase.rpc('portal_logout',{p_token:session.token});
    }catch(error){
      console.warn('Falha ao encerrar sessão remota do portal',error);
    }
    return true;
  }

  window.PortalAuth={
    ready,
    login,
    validate,
    logout,
    hasStoredSession,
    isValidated,
    readSession,
    storageKey:STORAGE_KEY
  };
}());
