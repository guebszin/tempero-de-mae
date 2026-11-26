import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg=await (await b.new_context(viewport={'width':1360,'height':860}, timezone_id='America/Sao_Paulo')).new_page()
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        r=await pg.evaluate("""(function(){
          const w=document.getElementById('servidor').contentWindow; const out={};
          const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token;
          (w.__novaExecucao(),w.criarEmpresa)(tk,{nome:'Alfa',email:'a@x.com',senha:'123456789012'});
          w.__leiturasPlanilha=0;
          (w.__novaExecucao(),w.listarEmpresas(tk)); out.leituras_1a=w.__leiturasPlanilha;
          (w.__novaExecucao(),w.listarEmpresas(tk)); out.leituras_2a_cache=w.__leiturasPlanilha;
          // gravação pelo sistema aparece na hora
          (w.__novaExecucao(),w.criarEmpresa)(tk,{nome:'Beta',email:'b@x.com',senha:'123456789012'});
          out.apos_gravacao=(w.__novaExecucao(),w.listarEmpresas(tk)).map(e=>e.nome_empresa);
          // edição manual na planilha: só aparece depois de limparCache (ou 5 min)
          w.__abas.EMPRESAS.rows[1][1]='Alfa EDITADA A MAO';
          out.manual_antes=(w.__novaExecucao(),w.listarEmpresas(tk)).map(e=>e.nome_empresa);
          w.__novaExecucao();w.limparCache();
          out.manual_depois=(w.__novaExecucao(),w.listarEmpresas(tk)).map(e=>e.nome_empresa);
          // empresa grava funcionário; restaurante vê na hora
          const te=(function(){ const u=w.__abas.USUARIOS.rows.find(r=>r[3]==='b@x.com'); return null; })();
          return out;})()""")
        for k,v in r.items(): print(k,':',v)
        # login: telas iniciais sem idas extras
        await pg.evaluate("window.__chamadas=[]")
        await pg.fill('#loginEmail','admin@rest.com'); await pg.fill('#loginSenha','senhaadmin12345'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#indicadoresAdmin .indicador')
        for t in ['empresas','precos','inicio-admin']:
            await pg.click(f'#menuLateral [data-tela={t}]'); await pg.wait_for_timeout(400)
        print('chamadas desde o login (login + 3 telas):', await pg.evaluate("window.__chamadas"))
        await b.close()
asyncio.run(main())
