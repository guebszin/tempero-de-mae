// ===== Simulação do ambiente Google Apps Script =====
(function(){
// relógio controlável do servidor (window.__agora = milissegundos)
const DataReal = Date;
Object.defineProperty(window,'__agora',{get(){const b=Number(localStorage.getItem('agora_falso'))||0; if(!b) return 0; return b+(DataReal.now()-Number(localStorage.getItem('agora_real')));},set(v){localStorage.setItem('agora_falso',String(v));localStorage.setItem('agora_real',String(DataReal.now()));}});
class DataFalsa extends DataReal {
  constructor(...a){ if(a.length===0){ super(window.__agora || DataReal.now()); } else { super(...a); } }
  static now(){ return window.__agora || DataReal.now(); }
}
window.Date = DataFalsa;

// SHA-256 síncrono
function sha256(bytes){
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const l=bytes.length; const withPad=((l+9+63)>>6)<<6; const m=new Uint8Array(withPad);
  m.set(bytes); m[l]=0x80; const bits=l*8; const dv=new DataView(m.buffer);
  dv.setUint32(withPad-4,bits>>>0); dv.setUint32(withPad-8,Math.floor(bits/4294967296));
  const w=new Uint32Array(64);
  for(let i=0;i<withPad;i+=64){
    for(let t=0;t<16;t++) w[t]=dv.getUint32(i+t*4);
    for(let t=16;t<64;t++){const a=w[t-15],b=w[t-2];
      const s0=((a>>>7)|(a<<25))^((a>>>18)|(a<<14))^(a>>>3);
      const s1=((b>>>17)|(b<<15))^((b>>>19)|(b<<13))^(b>>>10);
      w[t]=(w[t-16]+s0+w[t-7]+s1)>>>0;}
    let [a,b,c,d,e,f,g,h]=H;
    for(let t=0;t<64;t++){
      const S1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7));
      const ch=(e&f)^(~e&g); const t1=(h+S1+ch+K[t]+w[t])>>>0;
      const S0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10));
      const mj=(a&b)^(a&c)^(b&c); const t2=(S0+mj)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
    H=[(H[0]+a)>>>0,(H[1]+b)>>>0,(H[2]+c)>>>0,(H[3]+d)>>>0,(H[4]+e)>>>0,(H[5]+f)>>>0,(H[6]+g)>>>0,(H[7]+h)>>>0];
  }
  const out=[]; H.forEach(x=>{out.push(x>>>24&255,x>>>16&255,x>>>8&255,x&255)}); return out;
}
const enc=new TextEncoder();
const toBytes=v=> typeof v==='string'? Array.from(enc.encode(v)) : v.map(b=>(b+256)%256);
const signed=a=>a.map(b=>b>127?b-256:b);
function b64(bytesOrStr){ const b=typeof bytesOrStr==='string'?Array.from(enc.encode(bytesOrStr)):bytesOrStr.map(x=>(x+256)%256); let s=''; b.forEach(x=>s+=String.fromCharCode(x)); return btoa(s);}
window.Utilities={
  DigestAlgorithm:{SHA_256:'SHA_256'}, Charset:{UTF_8:'UTF_8'},
  computeDigest:(alg,v)=>signed(sha256(toBytes(v))),
  base64Encode:b64,
  base64EncodeWebSafe:x=>b64(x).replace(/\+/g,'-').replace(/\//g,'_'),
  getUuid:()=>crypto.randomUUID(),
  formatDate:(d,tz,fmt)=>{ if(fmt==='HH:mm'){ return new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).format(d); } return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(d); }
};
window.Session={getScriptTimeZone:()=> 'America/Sao_Paulo'};
window.Logger={log:(...a)=>console.log('[Logger]',...a)};
const cache=new Map();
window.__leiturasPlanilha=0;
window.CacheService={getScriptCache:()=>({get:k=>localStorage.getItem('c_'+k),put:(k,v)=>localStorage.setItem('c_'+k,v),remove:k=>localStorage.removeItem('c_'+k),
  getAll:ks=>{const o={};ks.forEach(k=>{const v=localStorage.getItem('c_'+k);if(v!==null)o[k]=v;});return o;},
  putAll:(o)=>Object.keys(o).forEach(k=>localStorage.setItem('c_'+k,o[k])),
  removeAll:ks=>ks.forEach(k=>localStorage.removeItem('c_'+k))})};
window.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}}),getUserLock:()=>({waitLock(){},releaseLock(){}})};
window.PropertiesService={getScriptProperties:()=>({getProperty:k=>localStorage.getItem('p_'+k),setProperty:(k,v)=>localStorage.setItem('p_'+k,v),deleteProperty:k=>localStorage.removeItem('p_'+k),
  getProperties:()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('p_'))o[k.slice(2)]=localStorage.getItem(k);}return o;}})};
window.ScriptApp={getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/EXEMPLO/exec'})};
// planilha
function conv(v){ if(v instanceof Date) return new Date(v.getTime()); if(typeof v==='string'){ if(v.startsWith("'")) return v.slice(1); if(/^-?\d+(\.\d+)?$/.test(v.trim())&&v.trim()!=='') return Number(v);} return v; }
function Sheet(nome,cab,livro){ this.nome=nome; this.rows=[cab.slice()]; this.livro=livro||'abas'; }
function salvarDe(sheet){ salvarLivro(sheet.livro); }
Sheet.prototype.getName=function(){return this.nome;};
Sheet.prototype.getDataRange=function(){const s=this;return{getValues:()=>(window.__leiturasPlanilha++,0)||s.rows.filter((r,i)=>i===0||i<ultimaComDados(s)).map(r=>r.map(c=>c instanceof Date?new Date(c):c))}};
function ultimaComDados(s){let n=s.rows.length;while(n>1&&!(s.rows[n-1]||[]).some(c=>c!==''&&c!==undefined&&c!==null))n--;return n;}
Sheet.prototype.getLastRow=function(){return ultimaComDados(this);};
Sheet.prototype.getLastColumn=function(){return Math.max(0,...this.rows.map(r=>r.length));};
Sheet.prototype.setFrozenRows=function(){};
Sheet.prototype.clearContents=function(){this.rows=[];salvarDe(this);return this;};
Sheet.prototype.clear=Sheet.prototype.clearContents;
Sheet.prototype.deleteRows=function(ini,n){this.rows.splice(ini-1,n);salvarDe(this);};
Sheet.prototype.deleteRow=function(r){this.deleteRows(r,1);};
Sheet.prototype.appendRow=function(r){const n=ultimaComDados(this);this.rows.splice(n,this.rows.length-n);this.rows.push(r.map(conv));salvarDe(this);};
Sheet.prototype.getRange=function(row,col,nr,nc){const s=this;nr=nr||1;nc=nc||1;
  const ensure=()=>{while(s.rows.length<row+nr-1)s.rows.push([]);};
  const faixa={getValues:()=>{const o=[];for(let i=0;i<nr;i++){const r=s.rows[row-1+i]||[];const l=[];for(let j=0;j<nc;j++){const c=r[col-1+j];l.push(c instanceof Date?new Date(c):(c===undefined?'':c));}o.push(l);}return o;},
    createTextFinder:(texto)=>({matchEntireCell(){return this;},findAll(){const out=[];for(let i=0;i<nr;i++){const r=s.rows[row-1+i]||[];for(let j=0;j<nc;j++){if(String(r[col-1+j])===String(texto))out.push({getRow:()=>row+i});}}return out;}}),
    getDisplayValues:()=>{const o=[];for(let i=0;i<nr;i++){const r=s.rows[row-1+i]||[];const l=[];for(let j=0;j<nc;j++)l.push(String(r[col-1+j]??''));o.push(l);}return o;},
    setValue:v=>{ensure();s.rows[row-1][col-1]=conv(v);salvarDe(s);return faixa;},
    clearContent:()=>{for(let i=0;i<nr;i++){const r=s.rows[row-1+i];if(!r)continue;for(let j=0;j<nc;j++)r[col-1+j]='';}salvarDe(s);return faixa;},
    setFontWeight(){return faixa;},
    setValues:vals=>{ensure();vals.forEach((l,i)=>l.forEach((v,j)=>{s.rows[row-1+i]=s.rows[row-1+i]||[];s.rows[row-1+i][col-1+j]=conv(v);}));salvarDe(s);return faixa;}};
  return faixa;};
const livros={abas:{}};
const abas=livros.abas;
function salvarLivro(nome){const o={};const l=livros[nome];Object.keys(l).forEach(n=>o[n]=l[n].rows.map(r=>r.map(c=>c instanceof Date?{__d:c.getTime()}:c)));localStorage.setItem(nome,JSON.stringify(o));}
function salvar(){salvarLivro('abas');}
function carregarLivro(nome){const t=localStorage.getItem(nome);if(!t)return false;const o=JSON.parse(t);const l=livros[nome]=livros[nome]||{};Object.keys(l).forEach(k=>delete l[k]);Object.keys(o).forEach(n=>{const sh=new Sheet(n,[],nome);sh.rows=o[n].map(r=>r.map(c=>c&&c.__d!==undefined?new Date(c.__d):c));l[n]=sh;});return true;}
window.__carregarAbas=function(){const ok=carregarLivro('abas');Object.keys(localStorage).filter(k=>k.startsWith('abas_')).forEach(carregarLivro);return ok;};
window.__abas=abas;
window.__livros=livros;
window.__criarAbas=function(estrutura){Object.keys(estrutura).forEach(n=>abas[n]=new Sheet(n,estrutura[n],'abas'));};
function planilha(nome){const l=livros[nome];return{
  getId:()=>nome==='abas'?'REAL':nome.slice(5),
  getSheetByName:n=>l[n]||null,
  getSheets:()=>Object.values(l),
  deleteSheet:sh=>{delete l[sh.nome];salvarLivro(nome);},
  insertSheet:n=>{l[n]=new Sheet(n,[],nome);l[n].rows=[];window.__abasCriadas=(window.__abasCriadas||[]).concat(n);salvarLivro(nome);return l[n];},
  getSpreadsheetTimeZone:()=> 'America/Sao_Paulo',
  setSpreadsheetTimeZone:()=>{}};}
window.SpreadsheetApp={flush:()=>{},
  openById:id=>{ if(livros['abas_'+id]) return planilha('abas_'+id); if(localStorage.getItem('abas_'+id)){carregarLivro('abas_'+id);return planilha('abas_'+id);} if(String(id).startsWith('TESTE')) throw new Error('Arquivo não encontrado'); return planilha('abas'); },
  create:nome=>{const id='TESTE'+Math.random().toString(36).slice(2,8);livros['abas_'+id]={Sheet1:new Sheet('Sheet1',[],'abas_'+id)};window.__criadas=(window.__criadas||0)+1;salvarLivro('abas_'+id);return planilha('abas_'+id);}};
window.HtmlService={};
})();
