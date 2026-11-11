
const $=id=>document.getElementById(id);
const inputs=[...document.querySelectorAll('input:not([type=file]),select:not(#sheet),textarea')];
const fmt=(n,d=1)=>Number.isFinite(n)?n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const n=(id,fallback=0)=>{const v=$(id).value.trim();return v===''?NaN:Number(v)};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=> 'RG-'+Date.now().toString(36).toUpperCase();
let studyId=uid(),view='side',dirty=false,three=null,showSafetyVisual=true,sceneObjects=[],selectedObject=null,editorMode='insert';
const keys=inputs.map(el=>el.id);
function data(){return Object.fromEntries(keys.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]))}
function apply(d){for(const id of keys)if(Object.hasOwn(d,id)){if($(id).type==='checkbox')$(id).checked=d[id]===true||d[id]==='true';else $(id).value=String(d[id])}update()}
function sample(){return {craneType:'mobile',isolationRadius:'12',isolationType:'barrier',safetyLead:'',safetyNotes:'',sIsolation:false,sBarrier:false,sLoadControl:false,sLevel:false,sPersonnel:false,sIdentity:false,sAccessories:false,sWind:false,sSignals:false,sPower:false,sEmergency:false,operation:'Içamento ilustrativo — U-8224',unit:'U-8224',revision:'0',contract:'',author:'',notes:'',maker:'',model:'',serial:'',boom:'32',angle:'62',cable:'4',slew:'0',pivot:'3.5',outrigger:'total',counterweight:'',loadtype:'pilar',weight:'7.5',riggingweight:'.2',width:'2.5',loadheight:'6',depth:'1.5',cog:'',loadchart:'',ground:'',weather:'',obstacles:'',targetradius:'14',targetazimuth:'45'}}
const equipment=()=>$('craneType').value;
const nonLifting=()=>['standardTruck','flatbed'].includes(equipment());
function calc(){
const L=n('boom'),a=n('angle')*Math.PI/180,p=n('pivot'),c=n('cable'),h=n('loadheight'),w=n('width'),depth=n('depth'),wt=n('weight'),rig=n('riggingweight');
const tipX=L*Math.cos(a),tipY=p+L*Math.sin(a),hookY=tipY-c,baseY=hookY-h;
const issues=[];
if(nonLifting())issues.push('Este veículo não possui equipamento de içamento integrado');
if(equipment()==='knuckle')issues.push('Articulação do guindauto ilustrativa: geometria e tabela oficiais do fabricante necessárias');
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
['Aprovação e responsabilidade técnica',false,'Responsável habilitado e documentos não verificados'],...safetyItems.map(([id,label])=>[label,$(id).checked,'Declaração do usuário; exige comprovação e verificação em campo'])];
$('checks').innerHTML=check.map(([label,filled,note])=>'<li>'+esc(label)+' — '+(filled?'documentação informada, verificação pendente':'pendente')+'</li>').join('');
return check.map(([label,filled,note])=>({label,status:filled?'Informado — não validado':'Pendente',note}));
}
const safetyItems=[
['sIsolation','Área de içamento isolada e sinalizada'],['sBarrier','Barreiras e acesso controlado'],['sLoadControl','Controle da carga'],['sLevel','Nivelamento e estabilidade do piso'],['sPersonnel','Pessoal autorizado'],['sIdentity','Identificação e comunicação'],['sAccessories','Certificação de acessórios'],['sWind','Condições climáticas'],['sSignals','Sinaleiro e comunicação'],['sPower','Interferências elétricas'],['sEmergency','Plano de emergência']
];
function safetyDrawing(mode){
if(!showSafetyVisual)return '';
const t=$('isolationType').value;
const r=Number($('isolationRadius').value);
let out='<g id="safetyLayer" pointer-events="none">';
if(mode==='top'){
 const cx=600,cy=380,rad=Math.max(85,Math.min(285,Number.isFinite(r)?r*12:145));
 out+='<circle cx="'+cx+'" cy="'+cy+'" r="'+rad+'" stroke="#e77e20" fill="#f59d2320" stroke-width="4" stroke-dasharray="12 8"/>';
 for(let i=0;i<12;i++){const a=i*Math.PI/6,x=cx+rad*Math.cos(a),y=cy+rad*Math.sin(a);if(t==='mixed')out+=coneSvg(x,y,1);if(t==='barrier'||t==='mixed')out+=barrierSvg(x,y,.45);if(t==='tape'||t==='mixed')out+=tapeSvg(x,y)}
 out+=txt(55,700,'ISOLAMENTO ILUSTRATIVO — '+fmt(r)+' m informados; verificar perímetro real.',15);
}else{
 const y=690;
 if(t==='barrier'||t==='mixed'){
 for(let x=130;x<1100;x+=170)out+=barrierSvg(x,y,1);
 }
 if(t==='tape'||t==='mixed'){
 for(let x=130;x<1100;x+=170)out+=tapeSvg(x,y);
 }
 if(t==='mixed')for(let x=100;x<1140;x+=140)out+=coneSvg(x,y+20,1.15);
 out+=txt(55,750,'Cones e barreiras esquemáticos — localização e quantidade sujeitas à avaliação de campo.',14);
}
return out+'</g>';
}
function coneSvg(x,y,k=1){
return '<g transform="translate('+x+' '+y+') scale('+k+')"><rect x="-17" y="-3" width="34" height="6" rx="2" fill="#303f49"/><path d="M-11 -3L-3 -40H3L11 -3Z" fill="#f17919" stroke="#a7440d" stroke-width="2"/><path d="M-7 -18H7L5 -24H-5Z" fill="white"/></g>'
}
function barrierSvg(x,y,k=1){
return '<g transform="translate('+x+' '+y+') scale('+k+')"><path d="M-58 0V-45M58 0V-45" stroke="#586b76" stroke-width="7"/><rect x="-66" y="-52" width="132" height="22" fill="#f6b73f" stroke="#ae6b1b"/><path d="M-53 -52L-30 -30M-15 -52L8 -30M23 -52L46 -30" stroke="#343b40" stroke-width="10"/></g>'
}
function tapeSvg(x,y){
return '<g transform="translate('+x+' '+y+')"><path d="M-70 0V-65M70 0V-65" stroke="#6f7f89" stroke-width="4"/><path d="M-70 -60H70" stroke="#edb139" stroke-width="12"/><path d="M-50 -66l12 12m23-12l12 12m23-12l12 12" stroke="#333f49" stroke-width="9"/></g>'
}
function validScene(value){
if(!Array.isArray(value))return [];
const allowed=new Set(['cone','barrier','tape','building','laboratory','house','shop','office','block','road','sidewalk','restricted']);
return value.slice(0,300).filter(o=>o&&allowed.has(o.type)&&[o.x,o.z,o.rot].every(v=>typeof v==='number'&&Number.isFinite(v))).map(o=>({id:String(o.id||uid()).slice(0,70),type:o.type,x:Math.max(-400,Math.min(400,o.x)),z:Math.max(-400,Math.min(400,o.z)),rot:o.rot}));
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
if(nonLifting()){
const truckY=ground-58,base=bx-110;
s+=rect(base-125,truckY,285,32,'#d4b038')+rect(base-125,truckY-68,90,69,'#e4bd3a')+rect(base-112,truckY-58,58,35,'#b0d9e7');
s+=rect(base-20,truckY-38,160,39,equipment()==='flatbed'?'#a4aeb6':'#c9b087');
for(let i=0;i<4;i++)s+='<circle cx="'+(base-90+i*75)+'" cy="'+(ground-12)+'" r="19" fill="#2e3f4e" stroke="#6d7b86" stroke-width="4"/>';
s+=txt(55,65,equipment()==='flatbed'?'CAMINHÃO PRANCHA · SEM ELEVAÇÃO':'CAMINHÃO PADRÃO · SEM ELEVAÇÃO',18);
s+=txt(55,100,'Nenhum guindaste instalado: parâmetros de içamento não se aplicam.',15);
return s;
}
if(equipment()==='knuckle'){
const cabinX=bx-140,cabinY=ground-105;
s+=rect(cabinX-80,cabinY,88,78,'#e4b932')+rect(cabinX-69,cabinY+8,57,36,'#acd4e5')+rect(cabinX+8,cabinY+48,250,35,'#e3b42c');
for(let i=0;i<4;i++)s+='<circle cx="'+(cabinX-40+i*76)+'" cy="'+(ground-15)+'" r="19" fill="#293a49" stroke="#607383" stroke-width="4"/>';
for(const x of [cabinX+23,cabinX+240])s+=line(x,cabinY+75,x,ground-5,'#617889',7)+rect(x-27,ground-9,54,9,'#667987');
const elbowX=bx+(tx-bx)*.29,elbowY=by+(ty-by)*.51;
s+=line(bx,by,elbowX,elbowY,'#344c5e',22)+line(bx,by,elbowX,elbowY,'#e9bc33',16);
s+=line(elbowX,elbowY,tx,ty,'#314858',18)+line(elbowX,elbowY,tx,ty,'#f1ce52',12);
s+='<circle cx="'+elbowX+'" cy="'+elbowY+'" r="12" fill="#b88c22" stroke="#344c5e" stroke-width="3"/>';
s+=line(tx,ty,tx,hy,'#344c5d',3)+rect(tx-10,hy-6,20,15,'#667987');
s+=loadShape(tx,hy,ow,oh,$('loadtype').value,fmt(g.wt)+' t');
s+=txt(55,65,'CAMINHÃO MUNCK · BRAÇO ARTICULADO ILUSTRATIVO',17);
s+=txt(55,95,'A posição intermediária da articulação NÃO é cinemática validada.',14);
s+=dimensions(bx,ground+25,tx,ground+25,'Raio geométrico '+fmt(g.tipX)+' m');
s+=txt(55,745,'Capacidade, articulações e hidráulica dependem do modelo e tabela oficial.',14);
return s;
}
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
s+=txt(56,65,(equipment()==='truckCrane'?'CAMINHÃO-GUINDASTE TELESCÓPICO':'GUINDASTE TELESCÓPICO MÓVEL')+' | GEOMETRIA ILUSTRATIVA',17);
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
if(!nonLifting())s+=line(cx,cy,tip[0],tip[1],'#b88719',Math.max(6,sc*.8))+'<circle cx="'+tip[0]+'" cy="'+tip[1]+'" r="7" fill="#266889"/>';
s+=line(cx,cy,dest[0],dest[1],'#488f73',2,'8 5')+'<circle cx="'+dest[0]+'" cy="'+dest[1]+'" r="9" fill="none" stroke="#16885d" stroke-width="3"/>';
s+=txt(tip[0]+10,tip[1]-8,'PONTO DE IÇAMENTO',14)+txt(dest[0]+10,dest[1]-8,'DESTINO',14);
s+=txt(55,65,'VISTA SUPERIOR · '+$('craneType').selectedOptions[0].text.toUpperCase(),17);
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
if(!nonLifting()){s+=line(p[0],p[1],t[0],t[1],'#364b5e',21)+line(p[0],p[1],t[0],t[1],'#f0c738',15);}
const hook=project(g.tipX*Math.cos(n('slew')*Math.PI/180),g.tipX*Math.sin(n('slew')*Math.PI/180),g.hookY);
if(!nonLifting())s+=line(t[0],t[1],hook[0],hook[1],'#34495c',3);
if(!nonLifting())s+=loadShape(hook[0],hook[1],Math.min(120,g.w*sc),Math.min(200,g.h*sc),$('loadtype').value,fmt(g.wt)+' t');
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
$('drawing').innerHTML=(view==='side'?side(g):view==='top'?top(g):iso(g))+safetyDrawing(view);
}else{$('drawing').style.display='none';$('threehost').style.display='block';render3D(g)}
const rows=[['Identificador',studyId],['Operação',$('operation').value],['Contrato',$('contract').value||'Não informado'],['Unidade',$('unit').value],['Revisão',$('revision').value],['Tipo de equipamento',$('craneType').selectedOptions[0].text],['Fabricante / modelo',[$('maker').value,$('model').value].filter(Boolean).join(' / ')||'Não informado'],['Série',$('serial').value||'Não informada'],['Lança',fmt(g.L)+' m'],['Ângulo',fmt(g.a*180/Math.PI)+'°'],['Raio',fmt(g.tipX)+' m'],['Altura da ponta',fmt(g.tipY)+' m'],['Altura do gancho',fmt(g.hookY)+' m'],['Folga da carga',fmt(g.baseY)+' m'],['Carga',$('loadtype').selectedOptions[0].text],['Dimensões',fmt(g.w)+' × '+fmt(g.h)+' × '+fmt(g.depth)+' m'],['Massa total informada',fmt(g.wt+g.rig)+' t'],['Patolamento',$('outrigger').selectedOptions[0].text],['Tabela oficial',$('loadchart').value||'NÃO FORNECIDA'],['Centro de gravidade',$('cog').value||'Pendente'],['Solo',$('ground').value||'Pendente'],['Vento',$('weather').value||'Pendente'],['Interferências',$('obstacles').value||'Pendente'],['Observações',$('notes').value||'—'],['Responsável pela segurança',$('safetyLead').value||'Não informado'],['Isolamento informado',fmt(n('isolationRadius'))+' m — '+$('isolationType').selectedOptions[0].text],['Medidas adicionais de segurança',$('safetyNotes').value||'—']];
$('reportDetails').innerHTML='<table>'+rows.map(([k,v])=>'<tr><th>'+esc(k)+'</th><td>'+esc(v)+'</td></tr>').join('')+'</table>';
$('reportChecks').innerHTML='<p><strong>CAPACIDADE NÃO VERIFICADA — PROIBIDA CLASSIFICAÇÃO COMO APROVADA.</strong></p><table>'+allChecks.map(x=>'<tr><th>'+esc(x.label)+'</th><td>'+esc(x.status)+' — '+esc(x.note)+'</td></tr>').join('')+'</table><p>Inconsistências geométricas: '+esc(g.issues.join('; ')||'Nenhuma detectada na modelagem simplificada')+'</p>';
return g;
}
let lastSaved={};
function notify(msg){$('toast').textContent=msg}
function store(){const d={schema:'cpl-rigging-v1',id:studyId,savedAt:new Date().toISOString(),data:data(),sceneObjects:JSON.parse(JSON.stringify(sceneObjects)),showSafetyVisual};localStorage.setItem('cpl.rigging.current',JSON.stringify(d));const history=JSON.parse(localStorage.getItem('cpl.rigging.history')||'[]');history.push(d);localStorage.setItem('cpl.rigging.history',JSON.stringify(history.slice(-50)));notify('Estudo salvo localmente com uma revisão histórica.');return d}
$('save').onclick=store;
$('revisions').onclick=()=>{
let history=[];try{history=JSON.parse(localStorage.getItem('cpl.rigging.history')||'[]')}catch{}
if(!history.length){notify('Nenhuma revisão histórica salva neste navegador.');return}
const options=history.slice(-15).reverse();
const lines=options.map((item,i)=> (i+1)+' — '+(item.data?.operation||'Estudo')+' | Rev. '+(item.data?.revision||'0')+' | '+new Date(item.savedAt).toLocaleString('pt-BR'));
const chosen=prompt('Revisões locais (mais recente primeiro). Informe o número para reabrir:\n'+lines.join('\n'));
if(chosen===null)return;const index=Number(chosen)-1;
if(!Number.isInteger(index)||index<0||index>=options.length){notify('Número de revisão inválido.');return}
const item=options[index];studyId=item.id||uid();sceneObjects=validScene(item.sceneObjects);selectedObject=null;showSafetyVisual=item.showSafetyVisual!==false;syncSafetyButton();apply(item.data);notify('Revisão histórica reaberta para edição. Salve para registrar outra versão.')
};
$('export').onclick=()=>{const d=store();const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=studyId+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1500)};
$('import').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>1000000)throw Error('Arquivo muito grande');const d=JSON.parse(await f.text());if(d.schema!=='cpl-rigging-v1'||!d.data||typeof d.data!=='object')throw Error('Formato inválido');store();studyId=String(d.id||uid()).slice(0,80);sceneObjects=validScene(d.sceneObjects);showSafetyVisual=d.showSafetyVisual!==false;syncSafetyButton();apply(d.data);notify('Estudo importado. Salve para registrar uma nova revisão.')}catch(err){notify('Erro na importação: '+err.message)}e.target.value=''};
$('new').onclick=()=>{if(!confirm('Criar novo estudo? O anterior será salvo no histórico local.'))return;store();studyId=uid();sceneObjects=[];selectedObject=null;apply(sample());notify('Novo estudo iniciado')};
$('pdf').onclick=()=>{
 const g=update(),old=view;
 const report=$('report'),existing=$('printCroquis');if(existing)existing.remove();
 const pages=document.createElement('div');pages.id='printCroquis';
 for(const [title,art] of [['Croqui — vista lateral',side(g)+safetyDrawing('side')],['Croqui — vista superior',top(g)+safetyDrawing('top')],['Croqui — vista isométrica ilustrativa',iso(g)+safetyDrawing('iso')]]){
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
function setView(v){view=v;$('editor3d').hidden=v!=='three';document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));$('sceneTitle').textContent={'side':'CROQUI TÉCNICO · VISTA LATERAL','top':'CROQUI TÉCNICO · VISTA SUPERIOR','iso':'CROQUI TÉCNICO · VISTA ISOMÉTRICA','three':'MODELO 3D ILUSTRATIVO · NÃO VALIDADO'}[v];update()}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
function syncSafetyButton(){$('safetyVisual').classList.toggle('active',showSafetyVisual);$('safetyVisual').setAttribute('aria-pressed',String(showSafetyVisual));$('safetyVisual').textContent=showSafetyVisual?'🚧 Cones e barreiras: visíveis':'🚧 Cones e barreiras: ocultos'}
$('safetyVisual').onclick=()=>{showSafetyVisual=!showSafetyVisual;syncSafetyButton();update()};
$('resetview').onclick=()=>{if(three){three.az=.65;three.el=.45;three.distance=95;three.target.set(12,17,0)}update()};
inputs.forEach(el=>el.addEventListener('input',()=>{dirty=true;update()}));
try{const prev=JSON.parse(localStorage.getItem('cpl.rigging.current')||'null');if(prev?.schema==='cpl-rigging-v1'){studyId=prev.id;sceneObjects=validScene(prev.sceneObjects);showSafetyVisual=prev.showSafetyVisual!==false;syncSafetyButton();apply(prev.data)}else update()}catch{update()}

const objectMap={cone:'Cone',barrier:'Barreira',tape:'Fita zebrada',building:'Prédio',laboratory:'Laboratório',house:'Casa',shop:'Loja',office:'Sala administrativa',block:'Bloco',road:'Rua',sidewalk:'Calçada',restricted:'Área restrita'};
function newSceneObject(type,x,z,rot=0){return {id:uid()+'-'+Math.random().toString(36).slice(2,6),type,x,z,rot}}
function editorSelectMode(mode){editorMode=mode;$('objectAdd').classList.toggle('active',mode==='insert');$('objectSelect').classList.toggle('active',mode==='select');notify(mode==='insert'?'Clique no chão para inserir '+$('objectType').selectedOptions[0].text+'.':'Clique em um objeto para selecionar e arrastar.');}
$('objectAdd').onclick=()=>editorSelectMode('insert');
$('objectSelect').onclick=()=>editorSelectMode('select');
$('objectRotate').onclick=()=>{const obj=sceneObjects.find(o=>o.id===selectedObject);if(!obj){notify('Selecione um objeto para rotacionar.');return}obj.rot+=Math.PI/12;update();};
$('objectDuplicate').onclick=()=>{const obj=sceneObjects.find(o=>o.id===selectedObject);if(!obj){notify('Selecione um objeto para duplicar.');return}const next=newSceneObject(obj.type,obj.x+2,obj.z+2,obj.rot);sceneObjects.push(next);selectedObject=next.id;update();};
$('objectDelete').onclick=()=>{if(!selectedObject){notify('Selecione um objeto para excluir.');return}sceneObjects=sceneObjects.filter(o=>o.id!==selectedObject);selectedObject=null;update();};
$('objectClear').onclick=()=>{if(!sceneObjects.length)return;if(!confirm('Remover os objetos adicionados ao cenário deste estudo?'))return;sceneObjects=[];selectedObject=null;update();};
$('objectType').onchange=()=>editorSelectMode('insert');
function addModelObjects(){
if(!three)return;
const {T,group}=three;
const material=(color)=>new T.MeshStandardMaterial({color,roughness:.8,metalness:.05});
const cube=(parent,x,y,z,w,h,d,color)=>{const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material(color));mesh.position.set(x,y,z);parent.add(mesh);return mesh};
const cone=(parent,x,z)=>{
const m=new T.Mesh(new T.ConeGeometry(.35,1.15,12),material(0xed6e1e));m.position.set(x,.6,z);parent.add(m);
cube(parent,x,.05,z,.8,.1,.8,0x333d48);
cube(parent,x,.42,z,.46,.16,.46,0xffffff);
};
const barrier=(parent,x,z)=>{
cube(parent,x,.85,z,2.8,1.05,.18,0xe9ac29);for(let i=-1;i<=1;i++)cube(parent,x+i*.83,.9,z+.12,.27,.9,.1,0x333d43);
for(const dx of [-1.23,1.23])cube(parent,x+dx,.55,z,.13,1.1,.2,0x506a78);
};
const tape=(parent,x,z)=>{for(const dx of [-1.3,1.3])cube(parent,x+dx,.55,z,.13,1.1,.13,0x647988);cube(parent,x,.86,z,2.6,.16,.1,0xf7b32d)};
const building=(parent,o)=>{
const dims={building:[12,15,9,0x9daebb],laboratory:[14,6,10,0xe3e9ed],house:[8,5,8,0xdbbf9f],shop:[10,5,8,0xc7b7a5],office:[12,6,8,0xaebecb],block:[5,5,5,0x9dabb4]};
const [w,h,d,color]=dims[o.type];cube(parent,0,h/2,0,w,h,d,color);
for(let side of [-1,1])for(let k=-1;k<=1;k++)cube(parent,k*w/3,Math.max(2,h*.65),side*(d/2+.06),1.5,1.3,.1,0x5e97b9);
cube(parent,0,1.5,d/2+.1,1.9,3,.14,0x4d718c);
};
const restrictions=$('isolationType').value;
if(showSafetyVisual&&!nonLifting()){
const rad=Math.max(4,Math.min(100,n('isolationRadius')||12));
for(let i=0;i<12;i++){const a=i*Math.PI/6,x=rad*Math.cos(a),z=rad*Math.sin(a);
const auto=new T.Group();auto.position.set(x,0,z);auto.rotation.y=-a;group.add(auto);
if(restrictions==='mixed')cone(auto,0,0);
if(restrictions==='barrier'||restrictions==='mixed')barrier(auto,0,0);
if(restrictions==='tape'||restrictions==='mixed')tape(auto,0,0);
}
}
for(const o of sceneObjects){
const parent=new T.Group();parent.position.set(o.x,0,o.z);parent.rotation.y=o.rot;parent.userData.sceneId=o.id;group.add(parent);
if(o.type==='cone')cone(parent,0,0);
else if(o.type==='barrier')barrier(parent,0,0);
else if(o.type==='tape')tape(parent,0,0);
else if(['road','sidewalk','restricted'].includes(o.type)){
cube(parent,0,.035,0,o.type==='road'?18:12,.07,o.type==='road'?5:4,o.type==='road'?0x4a5159:o.type==='sidewalk'?0xabb8c2:0xf3b3a1);
if(o.type==='road')for(let k=-2;k<=2;k++)cube(parent,k*3,.08,0,1.4,.02,.13,0xf5e6af);
}else building(parent,o);
if(o.id===selectedObject){const bb=new T.Box3().setFromObject(parent),size=new T.Vector3();bb.getSize(size);const selected=new T.BoxHelper(parent,0x087fc1);selected.userData.decorative=true;group.add(selected)}
}
}
function getGroundPoint(e){if(!three)return null;const {T,camera,renderer}=three;const rc=new T.Raycaster(),rect=renderer.domElement.getBoundingClientRect();rc.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-((e.clientY-rect.top)/rect.height*2-1)),camera);const point=new T.Vector3();return rc.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),0),point)?point:null}
function hitObject(e){const z=three;if(!z)return null;const {T,camera,renderer,group}=z,rect=renderer.domElement.getBoundingClientRect(),rc=new T.Raycaster();
rc.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-((e.clientY-rect.top)/rect.height*2-1)),camera);
const hits=rc.intersectObjects(group.children,true);
for(const hit of hits){let item=hit.object;while(item&&item!==group){if(item.userData.sceneId)return item.userData.sceneId;item=item.parent}}
return null}

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
 three={T,renderer,scene,camera,group,az:.65,el:.45,distance:95,drag:false,x:0,y:0,target:new T.Vector3(12,17,0),pointerAction:null};

 renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
 renderer.domElement.addEventListener('pointerdown',e=>{
   const z=three;z.x=e.clientX;z.y=e.clientY;z.drag=true;z.pointerAction=e.button===1||e.button===2?'pan':'orbit';
   if(e.button===0&&editorMode==='select'){selectedObject=hitObject(e);z.pointerAction=selectedObject?'move':'orbit';update();}
   if(e.button===0&&editorMode==='insert'){
     const p=getGroundPoint(e);if(p){const item=newSceneObject($('objectType').value,Math.round(p.x*10)/10,Math.round(p.z*10)/10);sceneObjects.push(item);selectedObject=item.id;update();notify(objectMap[item.type]+' inserido. Salve o estudo para preservar o cenário.');}
     z.pointerAction='insert';
   }
   renderer.domElement.setPointerCapture(e.pointerId);
 });
 renderer.domElement.addEventListener('pointerup',()=>{if(three){three.drag=false;three.pointerAction=null}});
 renderer.domElement.addEventListener('pointercancel',()=>{if(three){three.drag=false;three.pointerAction=null}});
 renderer.domElement.addEventListener('pointermove',e=>{
   const z=three;if(!z?.drag)return;const dx=e.clientX-z.x,dy=e.clientY-z.y;z.x=e.clientX;z.y=e.clientY;
   if(z.pointerAction==='move'){const p=getGroundPoint(e),item=sceneObjects.find(o=>o.id===selectedObject);if(p&&item){item.x=p.x;item.z=p.z;update()}return}
   if(z.pointerAction==='pan'){const right=new T.Vector3().setFromMatrixColumn(z.camera.matrix,0);const up=new T.Vector3().setFromMatrixColumn(z.camera.matrix,1);const speed=z.distance*.0016;z.target.addScaledVector(right,-dx*speed).addScaledVector(up,dy*speed);draw3D();return}
   if(z.pointerAction==='orbit'){z.az+=dx*.007;z.el=Math.min(1.45,Math.max(.04,z.el+dy*.007));draw3D()}
 });
 renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();three.distance=Math.min(260,Math.max(12,three.distance*(e.deltaY>0?1.1:.9)));draw3D()},{passive:false});
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
if(!nonLifting()){const upper=new T.Mesh(new T.BoxGeometry(4,1.2,2.7),new T.MeshStandardMaterial({color:0xe5b838}));upper.position.set(1,3.5,0);turntable.add(upper)}
if(nonLifting()){box(1.4,3.0,0,5.5,equipment()==='flatbed'?.25:1.4,2.6,equipment()==='flatbed'?0x879aab:0xc2b08a)}
const pivot=new T.Vector3(0,g.p,0),tip=new T.Vector3(g.tipX,g.tipY,0);
for(let k=0;k<(nonLifting()?0:4);k++){let a=pivot.clone().lerp(tip,k/4),b=pivot.clone().lerp(tip,(k+1)/4);if(equipment()==='knuckle'){const elbow=pivot.clone().lerp(tip,.45);elbow.y+=g.L*.15;a=k<2?pivot.clone().lerp(elbow,k/2):elbow.clone().lerp(tip,(k-2)/2);b=k<2?pivot.clone().lerp(elbow,(k+1)/2):elbow.clone().lerp(tip,(k-1)/2)}const dir=b.clone().sub(a);const mesh=new T.Mesh(new T.BoxGeometry(dir.length()+.2,.9-k*.13,1.2-k*.16),new T.MeshStandardMaterial({color:[0xe0ad25,0xedbe34,0xf4cd4b,0xffde6e][k]}));mesh.position.copy(a.add(b).multiplyScalar(.5));mesh.rotation.z=Math.atan2(dir.y,dir.x);turntable.add(mesh)}
const cableLength=Math.max(.1,g.c);const rope=new T.Mesh(new T.CylinderGeometry(.045,.045,cableLength,8),new T.MeshStandardMaterial({color:0x3a4b58}));rope.position.set(g.tipX,g.tipY-cableLength/2,0);if(!nonLifting())turntable.add(rope);
const hook=new T.Mesh(new T.TorusGeometry(.3,.09,8,16,Math.PI*1.5),new T.MeshStandardMaterial({color:0x34475a}));hook.position.set(g.tipX,g.hookY,0);if(!nonLifting())turntable.add(hook);
const load=new T.Mesh(new T.BoxGeometry(g.w,g.h,g.depth),new T.MeshStandardMaterial({color:0x86c1dc,transparent:true,opacity:.85}));load.position.set(g.tipX,g.hookY-g.h/2,0);if(!nonLifting())turntable.add(load);
addModelObjects();
if(equipment()==='knuckle')notify('3D do guindauto é esquemático: cinemática articulada específica ainda pendente.');
draw3D();
}
function draw3D(){if(!three||view!=='three')return;const z=three,host=$('threehost'),w=host.clientWidth,h=host.clientHeight;z.renderer.setSize(w,h,false);z.camera.aspect=w/h;z.camera.position.set(Math.cos(z.el)*Math.cos(z.az)*z.distance,Math.sin(z.el)*z.distance,Math.cos(z.el)*Math.sin(z.az)*z.distance);z.camera.position.add(z.target);z.camera.lookAt(z.target);z.camera.updateProjectionMatrix();z.renderer.render(z.scene,z.camera)}
window.addEventListener('resize',draw3D);
