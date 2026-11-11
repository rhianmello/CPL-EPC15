
const $=id=>document.getElementById(id);
const inputs=[...document.querySelectorAll('input:not([type=file]),select:not(#sheet),textarea')];
const fmt=(n,d=1)=>Number.isFinite(n)?n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const n=(id,fallback=0)=>{const v=$(id).value.trim();return v===''?NaN:Number(v)};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=> 'RG-'+Date.now().toString(36).toUpperCase();
let studyId=uid(),view='side',dirty=false,three=null;
const keys=inputs.map(el=>el.id);
function data(){return Object.fromEntries(keys.map(id=>[id,$(id).value]))}
function apply(d){for(const id of keys)if(Object.hasOwn(d,id))$(id).value=String(d[id]);update()}
function sample(){return {operation:'Içamento ilustrativo — U-8224',unit:'U-8224',revision:'0',contract:'',author:'',notes:'',maker:'',model:'',serial:'',boom:'32',angle:'62',cable:'4',slew:'0',pivot:'3.5',outrigger:'total',counterweight:'',loadtype:'pilar',weight:'7.5',riggingweight:'.2',width:'2.5',loadheight:'6',depth:'1.5',cog:'',loadchart:'',ground:'',weather:'',obstacles:'',targetradius:'14',targetazimuth:'45'}}
function calc(){
const L=n('boom'),a=n('angle')*Math.PI/180,p=n('pivot'),c=n('cable'),h=n('loadheight'),w=n('width'),depth=n('depth'),wt=n('weight'),rig=n('riggingweight');
const tipX=L*Math.cos(a),tipY=p+L*Math.sin(a),hookY=tipY-c,baseY=hookY-h;
const issues=[];
for(const [id,title,lo,hi] of [['boom','Lança',.1,200],['angle','Ângulo',0,90],['pivot','Pino',0,20],['cable','Cabo',.1,200],['loadheight','Altura da carga',.1,80],['width','Largura da carga',.1,80],['depth','Profundidade',.1,80],['weight','Massa',.001,1000],['riggingweight','Massa dos acessórios',0,1000]]){
const v=n(id);if(!Number.isFinite(v)||v<lo||v>hi)issues.push(title+' inválido(a)')}
if(Number.isFinite(baseY)&&baseY<0)issues.push('Carga intersecta o solo (altura negativa)');
if(Number.isFinite(hookY)&&hookY>tipY)issues.push('Gancho acima da ponta da lança');
if($('outrigger').value==='recolhido')issues.push('Patolas recolhidas; configuração incompatível com este estudo ilustrativo');
if(tipX< w/2)issues.push('Carga pode interferir na região do equipamento');
return {L,a,p,c,h,w,depth,wt,rig,tipX,tipY,hookY,baseY,issues,valid:issues.length===0};
}
function checks(g){
const check=[
['Tabela de capacidade oficial por raio e configuração',Boolean($('loadchart').value.trim()),'Documento citado; valores e autenticidade ainda exigem conferência por engenheiro'],
['Capacidade admissível e massa total suspensa',false,'Sem leitura validada da tabela de carga'],
['Contrapesos e configuração do equipamento',Boolean($('counterweight').value.trim()),'Configuração informada; sem validação'],
['Reações nas patolas, sapatas e pressão no solo',false,'Sem reações do fabricante e dimensionamento dos apoios'],
['Condições do terreno e resistência de suporte',Boolean($('ground').value.trim()),'Informação cadastrada; sem laudo validado'],
['Centro de gravidade, pontos de pega e lingas',Boolean($('cog').value.trim()),'Informação cadastrada; sem cálculo validado'],
['Interferências e distâncias de segurança',Boolean($('obstacles').value.trim()),'Levantamento informado; sem verificação'],
['Vento e condições ambientais',Boolean($('weather').value.trim()),'Informação cadastrada; sem validação'],
['Aprovação e responsabilidade técnica',false,'Responsável habilitado e documentos não verificados']];
$('checks').innerHTML=check.map(([label,filled,note])=>'<li>'+esc(label)+' — '+(filled?'documentação informada, verificação pendente':'pendente')+'</li>').join('');
return check.map(([label,filled,note])=>({label,status:filled?'Informado — não validado':'Pendente',note}));
}
const svghead='<defs><pattern id="gp" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" stroke="#e3eaf0" fill="none"/></pattern><marker id="arr" markerWidth="8" markerHeight="8" refX="4" refY="3" orient="auto-start-reverse"><path d="M0 0L6 3L0 6Z" fill="#206da3"/></marker></defs><rect width="1200" height="800" fill="white"/><rect x="32" y="35" width="1136" height="690" fill="url(#gp)"/>';
const line=(x1,y1,x2,y2,color='#294c62',width=2,dash='')=>'<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+color+'" stroke-width="'+width+'" '+(dash?'stroke-dasharray="'+dash+'"':'')+'/>';
const txt=(x,y,t,size=15,anchor='start',color='#233e55')=>'<text x="'+x+'" y="'+y+'" fill="'+color+'" font-size="'+size+'" font-family="Arial,sans-serif" font-weight="600" text-anchor="'+anchor+'">'+esc(t)+'</text>';
const rect=(x,y,w,h,fill,stroke='#294c62',r=3)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+r+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="2"/>';
function loadShape(x,y,w,h,type,caption){
const square=rect(x-w/2,y,w,h,'#9dcde0','#235a7e');
let shape=square;
if(type==='tubo'||type==='tanque')shape='<ellipse cx="'+x+'" cy="'+(y+h/2)+'" rx="'+w/2+'" ry="'+h/2+'" fill="#9dcde0" stroke="#235a7e" stroke-width="3"/>'+line(x-w*.33,y+h*.22,x+w*.33,y+h*.78,'#427b96');
if(type==='estrutura')shape=rect(x-w/2,y,w,h,'#d7edf5')+line(x-w/2,y,x+w/2,y+h,'#276188',4)+line(x+w/2,y,x-w/2,y+h,'#276188',4);
if(type==='pilar'||type==='viga'||type==='laje')shape=square+line(x-w/2+4,y+8,x+w/2-4,y+8,'#477e9b')+line(x-w/2+4,y+h-8,x+w/2-4,y+h-8,'#477e9b');
return shape+txt(x,y+Math.max(22,Math.min(h/2,48)),caption,Math.min(17,Math.max(10,w/6)),'middle');
}
function dimensions(x1,y1,x2,y2,label,offset=0){
return '<g stroke="#2075a8" stroke-width="1.5" fill="none">'+line(x1,y1,x2,y2,'#2075a8',1.5)+
'<path d="M'+(x1-5)+' '+(y1-5)+'l10 10M'+(x2-5)+' '+(y2-5)+'l10 10" stroke="#2075a8"/></g>'+txt((x1+x2)/2+offset,(y1+y2)/2-8,label,14,'middle','#17618d');
}
function side(g){
const maxX=Math.max(25,g.tipX+g.w/2+9),minX=-14;
const maxY=Math.max(16,g.tipY+6),minY=Math.min(-2,g.baseY-2);
const sc=Math.min(970/(maxX-minX),610/(maxY-minY));
const X=x=>125+(x-minX)*sc,Y=y=>660-(y-minY)*sc;
const bx=X(0),by=Y(g.p),tx=X(g.tipX),ty=Y(g.tipY),hy=Y(g.hookY),ly=Y(g.baseY+g.h),ground=Y(0);
const ow=Math.min(320,g.w*sc),oh=Math.min(340,g.h*sc),lx=tx,loadTop=hy,loadBottom=loadTop+oh;
let s=svghead+line(40,ground,1155,ground,'#637482',3)+txt(50,ground-9,'NÍVEL DO SOLO ±0,00',13);
s+='<g>'+rect(bx-160,by+12,220,35,'#e6b937')+rect(bx-158,by-26,65,43,'#edc74c')+rect(bx-143,by-20,37,24,'#cbe5ec')+rect(bx-35,by-22,105,39,'#d6a929');
for(let i=0;i<4;i++)s+='<circle cx="'+(bx-132+i*52)+'" cy="'+(by+51)+'" r="19" fill="#283b49" stroke="#536979" stroke-width="5"/><circle cx="'+(bx-132+i*52)+'" cy="'+(by+51)+'" r="8" fill="#b7cbd4"/>';
s+=line(bx-175,by+30,bx-175,ground-6,'#576879',7)+rect(bx-204,ground-8,58,8,'#536576');
s+=line(bx+90,by+30,bx+90,ground-6,'#576879',7)+rect(bx+59,ground-8,62,8,'#536576');
s+=rect(bx-86,by-48,42,34,'#e6bc29')+rect(bx-84,by-40,27,20,'#a6d6e8')+rect(bx+18,by-44,70,26,'#e9b72b');
s+='<circle cx="'+bx+'" cy="'+by+'" r="12" fill="#f4d14b" stroke="#243b49" stroke-width="4"/>';
s+=line(bx+25,by+26,bx+(tx-bx)*.40,by+(ty-by)*.40,'#aab6c1',9);s+='</g>';
for(let k=0;k<4;k++){let start=k/4,end=(k+1)/4;const x1=bx+(tx-bx)*start,y1=by+(ty-by)*start,x2=bx+(tx-bx)*end,y2=by+(ty-by)*end;s+=line(x1,y1,x2,y2,'#304858',Math.max(10,30-4*k))+line(x1,y1,x2,y2,['#dca622','#e9bc32','#f4d04b','#ffe089'][k],Math.max(6,24-4*k));}
s+='<circle cx="'+tx+'" cy="'+ty+'" r="11" fill="#f9ce35" stroke="#344b5e" stroke-width="3"/>';
s+=line(tx,ty,tx,hy,'#344c5d',3)+rect(tx-11,hy-9,22,15,'#687c89')+'<path d="M'+tx+' '+hy+'q 17 7 1 19q-11 4-12-7" fill="none" stroke="#334c5f" stroke-width="4"/>';
s+=loadShape(lx,loadTop,ow,oh,$('loadtype').value,fmt(g.wt)+' t');
s+=dimensions(bx,ground+25,tx,ground+25,'Raio '+fmt(g.tipX)+' m');
s+=dimensions(1120,ground,1120,ty,'Altura da ponta '+fmt(g.tipY)+' m',-85);
s+=dimensions(1050,ground,1050,hy,'Gancho '+fmt(g.hookY)+' m',-70);
s+=dimensions(980,ground,980,loadBottom,'Base '+fmt(g.baseY)+' m',-50);
s+=txt((bx+tx)/2-25,(by+ty)/2-30,'Lança '+fmt(g.L)+' m',16,'middle');
s+=txt(bx+68,by-12,fmt(g.a*180/Math.PI,0)+'°',17);
s+=txt(56,65,'VISTA LATERAL | GEOMETRIA EM METROS',17);
if(g.issues.length)s+=txt(50,700,'ATENÇÃO: '+g.issues.join('; ').slice(0,115),14,'start','#ac351e');
return s;
}
function top(g){
const spread=$('outrigger').value==='total'?7:$('outrigger').value==='parcial'?4:1.5;
const r=Math.max(18,g.tipX+7,Math.abs(n('targetradius'))+7);
const sc=Math.min(820/(2*r),610/(2*r)),cx=600,cy=380;
const P=(x,y)=>[cx+x*sc,cy-y*sc];
const theta=n('slew')*Math.PI/180,tip=P(g.tipX*Math.cos(theta),g.tipX*Math.sin(theta));
const tar=n('targetradius'),tA=n('targetazimuth')*Math.PI/180,dest=P(tar*Math.cos(tA),tar*Math.sin(tA));
let s=svghead;
for(let rad=Math.ceil(r/5)*5;rad>0;rad-=5){s+='<circle cx="'+cx+'" cy="'+cy+'" r="'+rad*sc+'" fill="none" stroke="#b4cadb" stroke-dasharray="7 5"/>'+txt(cx+rad*sc+4,cy-5,rad+' m',12)}
s+=rect(cx-3.7*sc,cy-1.25*sc,7.4*sc,2.5*sc,'#e9bc36')+rect(cx-2*sc,cy-spread*sc/2,4*sc,spread*sc,'none','#64788a');
for(const dx of [-2.8,2.8])for(const dy of [-spread/2,spread/2])s+=rect(cx+dx*sc-5,cy+dy*sc-5,10,10,'#526d7f');
s+=line(cx,cy,tip[0],tip[1],'#b88719',Math.max(6,sc*.8))+'<circle cx="'+tip[0]+'" cy="'+tip[1]+'" r="7" fill="#266889"/>';
s+=line(cx,cy,dest[0],dest[1],'#488f73',2,'8 5')+'<circle cx="'+dest[0]+'" cy="'+dest[1]+'" r="9" fill="none" stroke="#16885d" stroke-width="3"/>';
s+=txt(tip[0]+10,tip[1]-8,'PONTO DE IÇAMENTO',14)+txt(dest[0]+10,dest[1]-8,'DESTINO',14);
s+=txt(55,65,'VISTA SUPERIOR · ALCANCE GEOMÉTRICO (NÃO É CAPACIDADE)',17);
s+=txt(55,93,'Patolamento: '+$('outrigger').selectedOptions[0].text+' · Giro '+fmt(n('slew'),0)+'° · Raio '+fmt(g.tipX)+' m',13);
s+=txt(55,750,'Círculos representam distâncias geométricas e NÃO limites de operação.',14);
return s;
}
function iso(g){
const sc=Math.min(19,610/Math.max(g.L,30)),ox=420,oy=540;
const project=(x,y,z)=>[ox+(x-y)*.85*sc,oy+(x+y)*.36*sc-z*sc];
const p=project(0,0,g.p),t=project(g.tipX*Math.cos(n('slew')*Math.PI/180),g.tipX*Math.sin(n('slew')*Math.PI/180),g.tipY);
let s=svghead+txt(55,65,'VISTA ISOMÉTRICA · PROJEÇÃO ESQUEMÁTICA',17);
const a=project(-4,-2,0),b=project(4,-2,0),c=project(4,2,0),d=project(-4,2,0);
s+='<polygon points="'+[a,b,c,d].map(q=>q.join(',')).join(' ')+'" fill="#e5b730" stroke="#45586a" stroke-width="3"/>';
for(const y of [-3,3])for(const x of [-3.5,3.5]){const q=project(x,y,0);s+=line(q[0],q[1],q[0],q[1]-25,'#536879',5)+rect(q[0]-17,q[1]-2,34,8,'#647a89')}
s+=line(p[0],p[1],t[0],t[1],'#364b5e',21)+line(p[0],p[1],t[0],t[1],'#f0c738',15);
const hook=project(g.tipX*Math.cos(n('slew')*Math.PI/180),g.tipX*Math.sin(n('slew')*Math.PI/180),g.hookY);
s+=line(t[0],t[1],hook[0],hook[1],'#34495c',3);
s+=loadShape(hook[0],hook[1],Math.min(120,g.w*sc),Math.min(200,g.h*sc),$('loadtype').value,fmt(g.wt)+' t');
s+=txt(55,100,'Representação 2.5D ilustrativa; não contém validação dimensional do fabricante.',14);
return s;
}
function update(){
const g=calc(); $('boomv').textContent=fmt(g.L)+' m';$('anglev').textContent=fmt(g.a*180/Math.PI,0)+'°';
for(const [id,v,suffix] of [['resradius',g.tipX,' m'],['restip',g.tipY,' m'],['reshook',g.hookY,' m'],['resground',g.baseY,' m'],['resweight',g.wt+g.rig,' t']])$(id).textContent=fmt(v,2)+suffix;
$('resgeometry').textContent=g.valid?'Coerente*':g.issues.length+' alerta(s)';
$('resgeometry').style.color=g.valid?'#b3ebc7':'#ffae9c';
$('footrev').textContent=$('revision').value;$('studyid').textContent=studyId;
const allChecks=checks(g);
if(view!=='three'){
$('drawing').style.display='block';$('threehost').style.display='none';
$('drawing').innerHTML=(view==='side'?side(g):view==='top'?top(g):iso(g));
}else{$('drawing').style.display='none';$('threehost').style.display='block';render3D(g)}
const rows=[['Identificador',studyId],['Operação',$('operation').value],['Contrato',$('contract').value||'Não informado'],['Unidade',$('unit').value],['Revisão',$('revision').value],['Fabricante / modelo',[$('maker').value,$('model').value].filter(Boolean).join(' / ')||'Não informado'],['Série',$('serial').value||'Não informada'],['Lança',fmt(g.L)+' m'],['Ângulo',fmt(g.a*180/Math.PI)+'°'],['Raio',fmt(g.tipX)+' m'],['Altura da ponta',fmt(g.tipY)+' m'],['Altura do gancho',fmt(g.hookY)+' m'],['Folga da carga',fmt(g.baseY)+' m'],['Carga',$('loadtype').selectedOptions[0].text],['Dimensões',fmt(g.w)+' × '+fmt(g.h)+' × '+fmt(g.depth)+' m'],['Massa total informada',fmt(g.wt+g.rig)+' t'],['Patolamento',$('outrigger').selectedOptions[0].text],['Tabela oficial',$('loadchart').value||'NÃO FORNECIDA'],['Centro de gravidade',$('cog').value||'Pendente'],['Solo',$('ground').value||'Pendente'],['Vento',$('weather').value||'Pendente'],['Interferências',$('obstacles').value||'Pendente'],['Observações',$('notes').value||'—']];
$('reportDetails').innerHTML='<table>'+rows.map(([k,v])=>'<tr><th>'+esc(k)+'</th><td>'+esc(v)+'</td></tr>').join('')+'</table>';
$('reportChecks').innerHTML='<p><strong>CAPACIDADE NÃO VERIFICADA — PROIBIDA CLASSIFICAÇÃO COMO APROVADA.</strong></p><table>'+allChecks.map(x=>'<tr><th>'+esc(x.label)+'</th><td>'+esc(x.status)+' — '+esc(x.note)+'</td></tr>').join('')+'</table><p>Inconsistências geométricas: '+esc(g.issues.join('; ')||'Nenhuma detectada na modelagem simplificada')+'</p>';
return g;
}
let lastSaved={};
function notify(msg){$('toast').textContent=msg}
function store(){const d={schema:'cpl-rigging-v1',id:studyId,savedAt:new Date().toISOString(),data:data()};localStorage.setItem('cpl.rigging.current',JSON.stringify(d));const history=JSON.parse(localStorage.getItem('cpl.rigging.history')||'[]');history.push(d);localStorage.setItem('cpl.rigging.history',JSON.stringify(history.slice(-50)));notify('Estudo salvo localmente com uma revisão histórica.');return d}
$('save').onclick=store;
$('revisions').onclick=()=>{
let history=[];try{history=JSON.parse(localStorage.getItem('cpl.rigging.history')||'[]')}catch{}
if(!history.length){notify('Nenhuma revisão histórica salva neste navegador.');return}
const options=history.slice(-15).reverse();
const lines=options.map((item,i)=> (i+1)+' — '+(item.data?.operation||'Estudo')+' | Rev. '+(item.data?.revision||'0')+' | '+new Date(item.savedAt).toLocaleString('pt-BR'));
const chosen=prompt('Revisões locais (mais recente primeiro). Informe o número para reabrir:\n'+lines.join('\n'));
if(chosen===null)return;const index=Number(chosen)-1;
if(!Number.isInteger(index)||index<0||index>=options.length){notify('Número de revisão inválido.');return}
const item=options[index];studyId=item.id||uid();apply(item.data);notify('Revisão histórica reaberta para edição. Salve para registrar outra versão.')
};
$('export').onclick=()=>{const d=store();const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=studyId+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1500)};
$('import').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>1000000)throw Error('Arquivo muito grande');const d=JSON.parse(await f.text());if(d.schema!=='cpl-rigging-v1'||!d.data||typeof d.data!=='object')throw Error('Formato inválido');store();studyId=String(d.id||uid()).slice(0,80);apply(d.data);notify('Estudo importado. Salve para registrar uma nova revisão.')}catch(err){notify('Erro na importação: '+err.message)}e.target.value=''};
$('new').onclick=()=>{if(!confirm('Criar novo estudo? O anterior será salvo no histórico local.'))return;store();studyId=uid();apply(sample());notify('Novo estudo iniciado')};
$('pdf').onclick=()=>{
 const g=update(),old=view;
 const report=$('report'),existing=$('printCroquis');if(existing)existing.remove();
 const pages=document.createElement('div');pages.id='printCroquis';
 for(const [title,art] of [['Croqui — vista lateral',side(g)],['Croqui — vista superior',top(g)],['Croqui — vista isométrica ilustrativa',iso(g)]]){
  const section=document.createElement('section');section.className='print-croqui';
  section.innerHTML='<h2>'+title+'</h2><p>ESTUDO PRELIMINAR — NÃO APROVADO PARA EXECUÇÃO</p><svg viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-height:160mm">'+art+'</svg>';
  pages.appendChild(section)
 }
 report.appendChild(pages);
 const size=$('sheet').value;
 const prior=$('dynamicPage');if(prior)prior.remove();
 const style=document.createElement('style');style.id='dynamicPage';style.textContent='@page{size:'+size+' landscape;margin:12mm} .print-croqui{break-before:page;break-inside:avoid}';document.head.appendChild(style);
 document.body.dataset.sheet=size;setView('side');window.print();setView(old)
};
$('sheet').onchange=()=>document.body.dataset.sheet=$('sheet').value;
function setView(v){view=v;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));$('sceneTitle').textContent={'side':'CROQUI TÉCNICO · VISTA LATERAL','top':'CROQUI TÉCNICO · VISTA SUPERIOR','iso':'CROQUI TÉCNICO · VISTA ISOMÉTRICA','three':'MODELO 3D ILUSTRATIVO · NÃO VALIDADO'}[v];update()}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('resetview').onclick=()=>{if(three){three.az=.65;three.el=.45;three.distance=95}update()};
inputs.forEach(el=>el.addEventListener('input',()=>{dirty=true;update()}));
try{const prev=JSON.parse(localStorage.getItem('cpl.rigging.current')||'null');if(prev?.schema==='cpl-rigging-v1'){studyId=prev.id;apply(prev.data)}else update()}catch{update()}
async function render3D(g){
const host=$('threehost');
if(!three){
 try{
 const T=await import('https://esm.sh/three@0.164.1');
 const renderer=new T.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));host.appendChild(renderer.domElement);
 const scene=new T.Scene();scene.background=new T.Color(0xe7eff6);scene.add(new T.HemisphereLight(0xffffff,0x778899,2));
 const light=new T.DirectionalLight(0xffffff,2);light.position.set(20,60,30);scene.add(light);
 const camera=new T.PerspectiveCamera(45,1,.1,1000);
 const group=new T.Group();scene.add(group);
 const grid=new T.GridHelper(120,24,0x8fa4b3,0xc4d2dc);scene.add(grid);
 three={T,renderer,scene,camera,group,az:.65,el:.45,distance:95,drag:false,x:0,y:0};
 renderer.domElement.addEventListener('pointerdown',e=>{three.drag=true;three.x=e.clientX;three.y=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)});
 renderer.domElement.addEventListener('pointerup',()=>three.drag=false);
 renderer.domElement.addEventListener('pointermove',e=>{if(!three.drag)return;three.az+=(e.clientX-three.x)*.007;three.el=Math.min(1.45,Math.max(.04,three.el+(e.clientY-three.y)*.007));three.x=e.clientX;three.y=e.clientY;draw3D()});
 renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();three.distance=Math.min(260,Math.max(20,three.distance*(e.deltaY>0?1.1:.9)));draw3D()},{passive:false});
 }catch{host.innerHTML='<div style="padding:35px;color:#5d3340">3D indisponível: biblioteca externa não carregada. As vistas 2D continuam operacionais.</div>';return}
}
if(view!=='three')return;
const {T,group}=three;while(group.children.length){const obj=group.children[0];group.remove(obj);obj.traverse?.(x=>{x.geometry?.dispose();if(x.material){(Array.isArray(x.material)?x.material:[x.material]).forEach(m=>m.dispose())}})}
const box=(x,y,z,w,h,d,color)=>{const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,metalness:.25,roughness:.6}));mesh.position.set(x,y,z);group.add(mesh);return mesh};
box(0,1.2,0,9,1.9,3.1,0xe6b52e);box(-2.9,2.6,0,2.3,2.1,2.5,0xf2c645);box(1,2.6,0,3.4,1.5,2.4,0xd8a42b);
for(const x of [-3,0,3])for(const z of [-1.7,1.7]){const wheel=new T.Mesh(new T.CylinderGeometry(.85,.85,.55,20),new T.MeshStandardMaterial({color:0x293743}));wheel.rotation.x=Math.PI/2;wheel.position.set(x,.85,z);group.add(wheel)}
const spread=$('outrigger').value==='total'?6:$('outrigger').value==='parcial'?4:1.5;
for(const x of [-3.3,3.3])for(const z of [-spread,spread]){box(x,.25,z,1,.35,1,0x627587);box(x,1.2,z,.25,2,.25,0x778c99);box(x,2,z/2,.4,.35,Math.abs(z),0x8799a7)}
const turntable=new T.Group();turntable.rotation.y=-n('slew')*Math.PI/180;group.add(turntable);
const upper=new T.Mesh(new T.BoxGeometry(4,1.2,2.7),new T.MeshStandardMaterial({color:0xe5b838}));upper.position.set(1,3.5,0);turntable.add(upper);
const pivot=new T.Vector3(0,g.p,0),tip=new T.Vector3(g.tipX,g.tipY,0);
for(let k=0;k<4;k++){const a=pivot.clone().lerp(tip,k/4),b=pivot.clone().lerp(tip,(k+1)/4),dir=b.clone().sub(a);const mesh=new T.Mesh(new T.BoxGeometry(dir.length()+.2,.9-k*.13,1.2-k*.16),new T.MeshStandardMaterial({color:[0xe0ad25,0xedbe34,0xf4cd4b,0xffde6e][k]}));mesh.position.copy(a.add(b).multiplyScalar(.5));mesh.rotation.z=g.a;turntable.add(mesh)}
const cableLength=Math.max(.1,g.c);const rope=new T.Mesh(new T.CylinderGeometry(.045,.045,cableLength,8),new T.MeshStandardMaterial({color:0x3a4b58}));rope.position.set(g.tipX,g.tipY-cableLength/2,0);turntable.add(rope);
const hook=new T.Mesh(new T.TorusGeometry(.3,.09,8,16,Math.PI*1.5),new T.MeshStandardMaterial({color:0x34475a}));hook.position.set(g.tipX,g.hookY,0);turntable.add(hook);
const load=new T.Mesh(new T.BoxGeometry(g.w,g.h,g.depth),new T.MeshStandardMaterial({color:0x86c1dc,transparent:true,opacity:.85}));load.position.set(g.tipX,g.hookY-g.h/2,0);turntable.add(load);
draw3D();
}
function draw3D(){if(!three||view!=='three')return;const z=three,host=$('threehost'),w=host.clientWidth,h=host.clientHeight;z.renderer.setSize(w,h,false);z.camera.aspect=w/h;z.camera.position.set(Math.cos(z.el)*Math.cos(z.az)*z.distance,Math.sin(z.el)*z.distance,Math.cos(z.el)*Math.sin(z.az)*z.distance);z.camera.lookAt(12,17,0);z.camera.updateProjectionMatrix();z.renderer.render(z.scene,z.camera)}
window.addEventListener('resize',draw3D);
