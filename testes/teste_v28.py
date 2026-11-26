# Versão 28: assinatura "Feito por Luis Guilherme Wermelinger" no login e no Início
import asyncio, os
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
ADM="const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token; w.__novaExecucao();"
os.makedirs('v28', exist_ok=True)
TEXTO='Feito por Luis Guilherme Wermelinger'
def ok(c,t):
    print(('OK   ' if c else 'FALHA ')+t)
    if not c: erros.append('FALHA '+t)
async def entrar(pg,u,s):
    await pg.fill('#loginEmail',u); await pg.fill('#loginSenha',s); await pg.click('#formLogin button[type=submit]')
    await pg.wait_for_selector('#app:not([hidden])'); await pg.wait_for_timeout(1200)
async def sair(pg):
    await pg.evaluate("sair()"); await pg.wait_for_selector('#telaLogin:not([hidden])'); await pg.wait_for_timeout(400)
async def visivel(pg,sel):
    return await pg.evaluate("""(s)=>{const e=document.querySelector(s); if(!e) return false; const r=e.getBoundingClientRect();
      if(!r.width||!r.height) return false; const x=r.left+r.width/2, y=r.top+r.height/2; const t=document.elementFromPoint(x,y);
      return !!t && (e===t||e.contains(t));}""", sel)

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo', locale='pt-BR')
        pg=await ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        await pg.goto('http://localhost:8765/index.html'); await pg.evaluate("localStorage.clear()")
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])'); await pg.wait_for_timeout(1500)
        await pg.evaluate(chamar(ADM+"w.criarEmpresa(tk,{nome:'Alfa',email:'alfa@x.com',senha:'abc123',cnpj:'',endereco:'Rua A'}); return 1;"))

        ok((await pg.inner_text('#telaLogin .assinatura')).strip()==TEXTO, 'assinatura no login')
        ok(await visivel(pg,'#telaLogin .assinatura'), 'assinatura do login visível (não coberta)')
        await pg.screenshot(path='v28/01_login.png')

        await entrar(pg,'admin@rest.com','senhaadmin12345')
        sel='[data-view="inicio-admin"] .assinatura'
        ok((await pg.inner_text(sel)).strip()==TEXTO, 'assinatura no Início do restaurante')
        await pg.evaluate("document.querySelector('%s').scrollIntoView({block:'end'})"%sel); await pg.wait_for_timeout(300)
        ok(await visivel(pg,sel), 'visível no fim do Início (restaurante)')
        await pg.screenshot(path='v28/02_inicio_restaurante.png', full_page=True)
        ok(not await pg.is_visible('[data-view="pedidos"] .assinatura'), 'não aparece nas outras telas')
        await sair(pg)

        await entrar(pg,'alfa@x.com','abc123')
        sel='[data-view="inicio-empresa"] .assinatura'
        ok((await pg.inner_text(sel)).strip()==TEXTO, 'assinatura no Início da empresa')
        await pg.screenshot(path='v28/03_inicio_empresa.png', full_page=True)

        # Celular: não fica atrás da barra de baixo
        await pg.set_viewport_size({'width':390,'height':844}); await pg.wait_for_timeout(400)
        await pg.evaluate("window.scrollTo(0, document.body.scrollHeight)"); await pg.wait_for_timeout(500)
        ok(await visivel(pg,sel), 'no celular a assinatura não fica atrás da barra de baixo')
        await pg.screenshot(path='v28/04_inicio_celular.png')
        await sair(pg)
        await pg.wait_for_timeout(1500)
        ok(await visivel(pg,'#telaLogin .assinatura'), 'login no celular mostra a assinatura')
        await pg.screenshot(path='v28/05_login_celular.png')

        # Tema escuro
        await pg.set_viewport_size({'width':1440,'height':900})
        await pg.evaluate("document.documentElement.dataset.tema='escuro'"); await pg.wait_for_timeout(600)
        await pg.screenshot(path='v28/06_login_escuro.png')
        await b.close()
    print('ERROS:', erros if erros else 'nenhum')
asyncio.run(main())
