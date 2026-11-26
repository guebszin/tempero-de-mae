# Versão 29: logo do restaurante (login, primeiro acesso, menu lateral e impressões)
import asyncio, os, json, datetime
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
ADM="const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token; w.__novaExecucao();"
os.makedirs('v29', exist_ok=True)
def ok(c,t):
    print(('OK   ' if c else 'FALHA ')+t)
    if not c: erros.append('FALHA '+t)
async def carregada(pg,sel):
    return await pg.evaluate("(s)=>{const i=document.querySelector(s); return !!i && i.complete && i.naturalWidth>0 && i.getBoundingClientRect().width>0}", sel)
async def entrar(pg,u,s):
    await pg.fill('#loginEmail',u); await pg.fill('#loginSenha',s); await pg.click('#formLogin button[type=submit]')
    await pg.wait_for_selector('#app:not([hidden])'); await pg.wait_for_timeout(1200)

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo', locale='pt-BR')
        pg=await ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        pg.on('console', lambda m: erros.append(m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.evaluate("localStorage.clear()")
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])'); await pg.wait_for_timeout(1500)

        ok(await carregada(pg,'#telaLogin .logo-entrada img'), 'logo completa no login')
        ok(await pg.get_attribute('#telaLogin .logo-entrada img','alt')=='Tempero de Mãe', 'logo com texto alternativo')
        larg=await pg.evaluate("document.querySelector('#telaLogin .logo-entrada img').getBoundingClientRect().width")
        ok(150<=larg<=200, 'tamanho da logo no login (%d px)'%larg)
        await pg.screenshot(path='v29/01_login.png')
        ok(await pg.evaluate("document.querySelectorAll('#telaConvite .logo-entrada img[data-logo=completo]').length")==1, 'logo também no primeiro acesso')

        await pg.set_viewport_size({'width':390,'height':844}); await pg.wait_for_timeout(500)
        await pg.screenshot(path='v29/02_login_celular.png')
        await pg.set_viewport_size({'width':1440,'height':900})
        await pg.evaluate("document.documentElement.setAttribute('data-tema','escuro')"); await pg.wait_for_timeout(500)
        await pg.screenshot(path='v29/03_login_escuro.png')
        await pg.evaluate("document.documentElement.setAttribute('data-tema','claro')")

        await pg.evaluate(chamar(ADM+"""
          const e=w.criarEmpresa(tk,{nome:'Alfa',email:'alfa@x.com',senha:'abc123',cnpj:'',endereco:'Rua A'});
          w.__novaExecucao(); w.salvarPreco(tk,{empresa_id:e.empresa_id,valor_unitario:'20,00',data_inicio:'2026-01-01'}); return 1;"""))
        await entrar(pg,'admin@rest.com','senhaadmin12345')
        ok(await carregada(pg,'.sidebar .marca-simbolo'), 'símbolo no menu lateral')
        await pg.screenshot(path='v29/04_menu.png')

        # Impressão: relatório de consumo com a logo no cabeçalho
        await pg.evaluate("window.print=function(){}")
        await pg.evaluate("irPara('relatorios')")
        await pg.wait_for_function("!!relatorio.dados", timeout=15000)
        await pg.evaluate("imprimirRelatorio(relatorio.dados)"); await pg.wait_for_timeout(400)
        n=await pg.evaluate("document.querySelectorAll('#areaImpressao .imp-cabecalho .imp-logo').length")
        ok(n==1, 'logo no cabeçalho da impressão (%d)'%n)
        await pg.emulate_media(media='print'); await pg.wait_for_timeout(400)
        ok(await carregada(pg,'#areaImpressao .imp-logo'), 'logo aparece no PDF/impressão')
        await pg.screenshot(path='v29/05_impressao.png')
        await pg.emulate_media(media='screen')
        await b.close()
    print('ERROS:', erros if erros else 'nenhum')
asyncio.run(main())
