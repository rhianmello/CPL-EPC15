(()=>{'use strict';const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const cfg=window.EPC15_SUPABASE_CONFIG||{};const client=(cfg.url&&cfg.publishableKey&&window.supabase)?window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}}):null;let deliveryNames=[],all=[],visible=[],playlist=[],current=0,storyMode=false,timer=null;const status=t=>$('status').textContent=t;
function ytId(url){try{const u=new URL(url);if(u.hostname==='youtu.be')return u.pathname.slice(1);if(['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)){if(u.pathname==='/watch')return u.searchParams.get('v');const m=u.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)/);return m?.[1]}}catch{}return null}
function player(v,story){clearInterval(timer);$('progress').style.width='0';const id=ytId(v.video_url);const st=story?Number(v.story_start||0):0;const dur=story?Number(v.story_duration||30):0;const box=$('player');box.replaceChildren();if(id){const f=document.createElement('iframe');f.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(id)+'?autoplay=1&start='+st+(story?'&end='+(st+dur):'')+'&rel=0';f.allow='autoplay;fullscreen;encrypted-media;picture-in-picture';f.allowFullscreen=true;box.append(f);if(story){const start=Date.now();timer=setInterval(()=>{const elapsed=(Date.now()-start)/1000;$('progress').style.width=Math.min(100,100*elapsed/dur)+'%';if(elapsed>=dur){next()}},150)}}else{const el=document.createElement('video');el.controls=true;el.autoplay=true;el.playsInline=true;el.src=v.video_url;if(story){el.addEventListener('loadedmetadata',()=>{el.currentTime=Math.min(st,Math.max(0,el.duration-1))});el.addEventListener('timeupdate',()=>{let elapsed=el.currentTime-st;$('progress').style.width=Math.max(0,Math.min(100,100*elapsed/dur))+'%';if(elapsed>=dur)next()})}else el.addEventListener('ended',()=>{});box.append(el);el.play().catch(()=>{})} }
function show(i,story=true){if(!playlist.length)return;current=(i+playlist.length)%playlist.length;storyMode=story;const v=playlist[current];$('viewer').classList.add('active');$('video-title').textContent=v.title;$('video-detail').textContent='Semana '+v.week_no+' · '+v.unit_name+(v.filmed_on?' · '+v.filmed_on:'');$('prev-story').style.display=story?'':'none';$('next-story').style.display=story?'':'none';$('full-video').style.display=story?'':'none';player(v,story)}
function next(){if(storyMode){if(current+1>=playlist.length){close();return;}show(current+1,true)}}function close(){clearInterval(timer);$('viewer').classList.remove('active');$('player').replaceChildren()}
function option(id,values,prefix){const sel=$(id),prev=sel.value;sel.innerHTML='<option value="">Todas</option>'+values.map(x=>'<option value="'+esc(x)+'">'+esc(prefix?prefix(x):x)+'</option>').join('');sel.value=values.map(String).includes(prev)?prev:''}
function filters(){const weeks=[...new Set(all.map(x=>Number(x.week_no)))].sort((a,b)=>b-a);const units=[...new Set([...deliveryNames,...all.map(x=>x.unit_name)])].sort((a,b)=>a.localeCompare(b));option('week',weeks,x=>'S-'+x);option('unit',units);const input=$('form-unit');if(input){const previous=input.value;input.innerHTML='<option value="">Selecione a entrega</option>'+units.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');input.value=units.includes(previous)?previous:'';}render()}
const thumbCache=new Map();
function thumbnail(v){
 const url=v.video_url||'';
 if(thumbCache.has(url))return thumbCache.get(url);
 const id=ytId(url);
 if(id){const result=Promise.resolve('https://img.youtube.com/vi/'+encodeURIComponent(id)+'/hqdefault.jpg');thumbCache.set(url,result);return result}
 const promise=new Promise(resolve=>{
  const video=document.createElement('video');video.crossOrigin='anonymous';video.preload='auto';video.muted=true;video.playsInline=true;
  let finished=false;const timeout=setTimeout(()=>finish(''),9000);
  function finish(value){if(finished)return;finished=true;clearTimeout(timeout);video.pause();video.removeAttribute('src');video.load();resolve(value)}
  video.addEventListener('loadedmetadata',()=>{const target=Math.min(Math.max(Number(v.story_start)||1,0.5),Math.max(0,(video.duration||2)-0.2));try{video.currentTime=target}catch{finish('')}},{once:true});
  video.addEventListener('seeked',()=>{try{const canvas=document.createElement('canvas');const scale=Math.min(1,640/(video.videoWidth||640));canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);finish(canvas.toDataURL('image/jpeg',0.78))}catch{finish('')}},{once:true});
  video.addEventListener('error',()=>finish(''),{once:true});video.src=url;video.load();
 });thumbCache.set(url,promise);return promise;
}
function applyThumb(node,v){
 const img=document.createElement('img');img.alt='Capa do vídeo: '+v.title;img.loading='lazy';
 thumbnail(v).then(url=>{if(!node.isConnected)return;if(!url)return;img.src=url;img.onerror=()=>img.remove();node.prepend(img)}).catch(()=>{});
}
function render(){
 visible=all.filter(v=>(!$('week').value||Number(v.week_no)===Number($('week').value))&&(!$('unit').value||v.unit_name===$('unit').value));
 const groups=new Map(),by=$('group').value;
 visible.forEach(v=>{const k=by==='week'?'S-'+v.week_no:v.unit_name;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(v)});
 $('stories').replaceChildren();
 if(!groups.size)$('stories').innerHTML='<div class="empty">Ainda não há vídeos cadastrados para este filtro.</div>';
 for(const [name,items] of groups){
  const b=document.createElement('button');b.type='button';b.className='story';
  b.innerHTML='<span class="story-circle"><span class="play-overlay">▶</span></span><strong>'+esc(name)+'</strong><small>'+items.length+' vídeo(s)</small>';
  applyThumb(b.querySelector('.story-circle'),items[0]);b.addEventListener('click',()=>{playlist=items;show(0,true)});$('stories').append(b);
 }
 $('videos').replaceChildren();
 if(!visible.length)$('videos').innerHTML='<div class="empty">Biblioteca vazia. Cadastre a primeira filmagem.</div>';
 for(const v of visible){
  const item=document.createElement('article');item.className='item';
  item.innerHTML='<div class="thumb" role="button" tabindex="0" aria-label="Assistir '+esc(v.title)+'"><span class="play-overlay">▶</span></div><h3>'+esc(v.title)+'</h3><p class="meta">S-'+Number(v.week_no)+' · '+esc(v.unit_name)+(v.filmed_on?' · '+esc(v.filmed_on):'')+'</p><button>Assistir vídeo completo →</button>';
  const play=()=>{playlist=[v];show(0,false)};
  const target=item.querySelector('.thumb');applyThumb(target,v);
  item.querySelector('button').onclick=play;target.onclick=play;target.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();play()}};
  $('videos').append(item);
 }
}
async function load(){if(client){const deliveries=await client.rpc('drone_list_deliveries');if(!deliveries.error)deliveryNames=(deliveries.data||[]).map(x=>x.unit_name).filter(Boolean);}if(!client){status('Supabase indisponível.');return;}const {data,error}=await client.rpc('drone_list_videos');if(error){status('Falha ao consultar os vídeos: '+error.message);return;}all=Array.isArray(data)?data:[];filters();status(all.length+' filmagem(ns) no catálogo.')}
$('group').onchange=render;$('week').onchange=render;$('unit').onchange=render;$('close-viewer').onclick=close;$('viewer').addEventListener('click',e=>{if(e.target===$('viewer'))close()});$('prev-story').onclick=()=>show(current-1,true);$('next-story').onclick=next;$('full-video').onclick=()=>show(current,false);$('open-add').onclick=()=>{const params=new URLSearchParams(location.search);const unit=params.get('unit');const week=params.get('week');if(unit&&$('form-unit'))$('form-unit').value=unit;if(week&&$('form-week'))$('form-week').value=week;$('adder').classList.add('active')};$('close-add').onclick=()=>$('adder').classList.remove('active');document.addEventListener('keydown',e=>{if(e.key==='Escape'){close();$('adder').classList.remove('active')}});
async function sendDroneFile(form,media){const progress=$('upload-progress');progress.style.display='block';progress.removeAttribute('value');const response=await fetch(cfg.url+'/functions/v1/drone-sign-upload',{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.publishableKey},body:JSON.stringify({username:form.get('username'),password:form.get('password'),filename:media.name,size:media.size})});const ticket=await response.json();if(!response.ok)throw Error(ticket.error||'Falha de autorização');$('save-status').textContent='Enviando vídeo...';const result=await client.storage.from('epc15-drone-videos').uploadToSignedUrl(ticket.path,ticket.token,media,{contentType:'video/mp4'});if(result.error)throw result.error;progress.value=100;return ticket.publicUrl;}
$('form').onsubmit=async e=>{e.preventDefault();if(!client)return;const f=new FormData(e.currentTarget);$('save-status').textContent='Salvando...';let url=String(f.get('url')||'');const media=f.get('file');try{if(media&&media.size){if(!/\.mp4$/i.test(media.name)||media.size>52428800)throw Error('MP4 deve ter até 50 MB');url=await sendDroneFile(f,media);}if(!url)throw Error('Selecione um MP4 ou informe a URL');}catch(err){$('save-status').textContent=err.message;return;}const {error}=await client.rpc('drone_add_video',{p_username:f.get('username'),p_password:f.get('password'),p_title:f.get('title'),p_unit_name:f.get('unit'),p_week_no:Number(f.get('week')),p_video_url:url,p_filmed_on:f.get('date')||null,p_story_start:Number(f.get('start')),p_story_duration:Number(f.get('duration'))});if(error){$('save-status').textContent=error.message;return;}$('save-status').textContent='Filmagem cadastrada.';$('form').reset();await load();setTimeout(()=>{$('adder').classList.remove('active')},650)};
load().then(()=>{const p=new URLSearchParams(location.search);const unit=p.get('unit');const week=p.get('week');if(unit){$('unit').value=unit;$('form-unit').value=unit;}if(week){$('week').value=week;$('form-week').value=week;}render();if(p.get('import')==='1')$('open-add').click();});})();