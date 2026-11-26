import asyncio
from playwright.async_api import async_playwright
erros=[]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg=await (await b.new_context(viewport={'width':1360,'height':860}, timezone_id='America/Sao_Paulo')).new_page()
        pg.on('pageerror', lambda e: erros.append(str(e)))
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        await pg.fill('#loginEmail','admin@rest.com'); await pg.fill('#loginSenha','senhaadmin12345'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#app:not([hidden])')
        srv="document.getElementById('servidor').contentWindow"
        f='#modalCorpo form '
        for nome,email in [('Ótica São José','a@a.com'),('Empresa Com Pedido','b@b.com')]:
            await pg.click('#menuLateral [data-tela=empresas]'); await pg.wait_for_timeout(400)
            await pg.click('#botaoNovaEmpresa'); await pg.wait_for_selector(f)
            await pg.fill(f+'[name=nome]',nome); await pg.fill(f+'[name=email]',email)
            await pg.click(f+'[data-enviar]'); await pg.wait_for_selector('#modalCorpo .credenciais'); await pg.click('#modalCorpo [data-cancelar]')
        await pg.wait_for_timeout(500)
        # dados extras: preço e funcionários direto na planilha simulada; pedido para a segunda
        await pg.evaluate("""(function(w){
          const e=w.__abas.EMPRESAS.rows; const id1=e[1][0], id2=e[2][0];
          w.__abas.PRECOS.appendRow(['PRE-1',id1,'Normal',18,new Date(),'','ATIVO']);
          w.__abas.FUNCIONARIOS.appendRow(['FUN-1',id1,'Ana','1','','','NAO','ATIVO']);
          w.__abas.FUNCIONARIOS.appendRow(['FUN-2',id2,'Bia','2','','','NAO','ATIVO']);
          w.__abas.FUNCIONARIOS.appendRow(['FUN-3',id1,'Caio','3','','','NAO','ATIVO']);
          w.__abas.PEDIDOS.appendRow(['PED-1',id2,new Date(),new Date(),'u','ENTREGUE','',100]);
        })("""+srv+")")
        await pg.click('#menuLateral [data-tela=inicio-admin]'); await pg.wait_for_timeout(300)
        await pg.click('#menuLateral [data-tela=empresas]'); await pg.wait_for_selector('#listaEmpresas .lista-linha')
        print('botão excluir em ativa?', await pg.locator('#listaEmpresas button:has-text("Excluir")').count())
        for nome in ['Ótica','Empresa Com Pedido']:
            await pg.click(f'#listaEmpresas .lista-linha:has-text("{nome}") button:has-text("Inativar")'); await pg.click('#confirmacaoOk'); await pg.wait_for_timeout(700)
        await pg.select_option('#filtroStatusEmpresas','INATIVO'); await pg.wait_for_timeout(200)
        # excluir a com pedido
        await pg.click('#listaEmpresas .lista-linha:has-text("Com Pedido") button:has-text("Excluir")'); await pg.wait_for_selector(f+'.resumo-exclusao')
        print('com histórico (proprietário): mostra resumo')
        await pg.click(f+'[data-cancelar]'); await pg.wait_for_timeout(400)
        # excluir a ótica
        await pg.click('#listaEmpresas .lista-linha:has-text("Ótica") button:has-text("Excluir")'); await pg.wait_for_selector(f+'[data-resumo] .nota')
        await pg.fill(f+'[name=confirmacao]','otica sao')
        print('botão desabilitado com nome errado:', await pg.is_disabled(f+'[data-enviar]'))
        await pg.fill(f+'[name=confirmacao]','otica  são josé')
        print('botão liberado com nome certo:', await pg.is_enabled(f+'[data-enviar]'))
        await pg.screenshot(path='30_excluir.png')
        await pg.click(f+'[data-enviar]'); await pg.wait_for_timeout(1000)
        print('modal fechado:', not await pg.is_visible('#modalFundo'))
        r=await pg.evaluate("(function(w){const a=w.__abas;return {emp:a.EMPRESAS.rows.map(r=>r[1]),usu:a.USUARIOS.rows.map(r=>r[3]),fun:a.FUNCIONARIOS.rows.map(r=>r[2]),pre:a.PRECOS.rows.length,log:a.LOGS.rows.slice(-1)[0][4]}})("+srv+")")
        print(r)
        await b.close()
asyncio.run(main()); print('erros página:', erros)
