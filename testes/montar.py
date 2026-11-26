import re,os,json
import sys
v3=sys.argv[1] if len(sys.argv)>1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'apps-script')
def ler(n): return open(os.path.join(v3,n),encoding='utf-8').read()
idx=ler('Index.html')
idx=re.sub(r"<\?!= incluir\('(\w+)'\); \?>", lambda m: ler(m.group(1)+'.html'), idx)
assert '<?' not in idx
shim = """<script>
window.google={script:{url:{getLocation:function(cb){var p={};new URLSearchParams(location.search).forEach(function(v,k){p[k]=v;});setTimeout(function(){cb({parameter:p,parameters:{},hash:''});},10);}},history:{replace:function(){window.__historicoLimpo=true;}},run:(function(){
  function criar(sucesso,falha){
    return new Proxy({},{get:function(_,nome){
      if(nome==='withSuccessHandler') return function(f){return criar(f,falha);};
      if(nome==='withFailureHandler') return function(f){return criar(sucesso,f);};
      return function(){ var args=JSON.parse(JSON.stringify(Array.prototype.slice.call(arguments)));
        window.__chamadas=(window.__chamadas||[]);window.__chamadas.push(nome); setTimeout(function(){ var srv=document.getElementById('servidor').contentWindow;
          try{ srv.__novaExecucao&&srv.__novaExecucao(); var r=srv[nome].apply(null,args); r=r===undefined?undefined:JSON.parse(JSON.stringify(r)); sucesso&&sucesso(r);}catch(e){ console.warn('ERRO SERVIDOR',nome,e.message); falha&&falha({message:e.message}); }
        },120); };
    }});
  }
  return criar(null,null);
})()}};
</script>
<iframe id="servidor" src="servidor.html" style="display:none"></iframe>
"""
idx=idx.replace('<body>','<body>'+shim,1)
# esperar iframe carregar antes de iniciar
idx=idx.replace("document.addEventListener('DOMContentLoaded', iniciar);","window.addEventListener('load', iniciar);")
open('index.html','w',encoding='utf-8').write(idx)
COMPAT=open('compat.js').read() if os.environ.get('SEM_COMPAT')!='1' else ''
# Todos os .gs da pasta (Config primeiro; os demais em ordem alfabética)
arquivos_gs=sorted(n for n in os.listdir(v3) if n.endswith('.gs'))
arquivos_gs.sort(key=lambda n: (n!='Config.gs', n))
gs=''.join(ler(n)+'\n' for n in arquivos_gs)
srv="<html><body><script src='mock_gas.js'></script><script>\n"+gs+"\n"+COMPAT+"\nwindow.__novaExecucao=function(){try{__carregarAbas();memoriaExecucao_={};versaoDadosAtual_=null;planilhaAberta_=null;emGravacao_=false;try{bancoTesteAtivo_=false;}catch(e){}}catch(e){}};\nif(!__carregarAbas()){__criarAbas(ESTRUTURA); criarPrimeiroAdministrador('Maria Souza','admin@rest.com','senhaadmin12345');}\n</script></body></html>"
open('servidor.html','w',encoding='utf-8').write(srv)
print('ok')
