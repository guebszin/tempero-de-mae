# Versão 31: tema escuro azul-noite com dourado
import asyncio, os
from playwright.async_api import async_playwright
erros=[]
os.makedirs('v31', exist_ok=True)
def ok(c,t):
    print(('OK   ' if c else 'FALHA ')+t)
    if not c: erros.append('FALHA '+t)
def lum(rgb):
    def f(x):
        x/=255; return x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4
    r,g,b=rgb; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def contraste(a,b):
    a,b=lum(a),lum(b); return (max(a,b)+.05)/(min(a,b)+.05)
COR="([s,p])=>getComputedStyle(document.querySelector(s))[p].match(/\\d+(\\.\\d+)?/g).slice(0,3).map(Number)"
VAR="(n)=>getComputedStyle(document.documentElement).getPropertyValue(n).trim()"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo', locale='pt-BR', color_scheme='dark')
        pg=await ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        await pg.goto('http://localhost:8765/index.html'); await pg.evaluate("localStorage.clear()")
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])'); await pg.wait_for_timeout(1500)
        ok(await pg.evaluate("document.documentElement.dataset.tema")=='escuro', 'aparelho no escuro abre no tema escuro')
        ok(await pg.evaluate(VAR,'--fundo')=='#0f1320', 'fundo azul-noite')
        ok(await pg.evaluate(VAR,'--verde')=='#d4a24c', 'destaque continua dourado')
        ok(await pg.evaluate(VAR,'--marca-fundo-1')=='#1c2440', 'lado da marca do login em azul-noite')
        btn=await pg.evaluate(COR,['#telaLogin .botao-entrar','color'])
        ok(contraste(btn,[212,162,76])>=4.5, 'texto do botão Entrar legível (%.1f)'%contraste(btn,[212,162,76]))
        await pg.screenshot(path='v31/01_login_escuro.png')

        # Claro não mudou
        await pg.evaluate("document.documentElement.dataset.tema='claro'")
        ok(await pg.evaluate(VAR,'--fundo')=='#f7f3ec' and await pg.evaluate(VAR,'--marca-fundo-1')=='#3b2817', 'tema claro igual ao da v30')
        await pg.evaluate("document.documentElement.dataset.tema='escuro'")

        await pg.fill('#loginEmail','admin@rest.com'); await pg.fill('#loginSenha','senhaadmin12345')
        await pg.click('#telaLogin .botao-entrar'); await pg.wait_for_selector('#app:not([hidden])'); await pg.wait_for_timeout(1500)
        await pg.evaluate("document.documentElement.dataset.tema='escuro'"); await pg.wait_for_timeout(300)
        tx=await pg.evaluate(COR,['.view:not([hidden]) h2','color']); fundo=await pg.evaluate(COR,['body','backgroundColor'])
        ok(contraste(tx,fundo)>=7, 'títulos legíveis no fundo azul (%.1f)'%contraste(tx,fundo))
        sup=[23,29,46]
        for v,minimo in [('--texto-suave',4.5),('--azul',4.5),('--sucesso',4.5),('--amarelo',4.5),('--vermelho',4.5)]:
            h=(await pg.evaluate(VAR,v)).lstrip('#'); c=[int(h[i:i+2],16) for i in (0,2,4)]
            ok(contraste(c,sup)>=minimo, '%s legível nos cartões (%.1f)'%(v,contraste(c,sup)))
        await pg.screenshot(path='v31/02_inicio_escuro.png')
        await pg.evaluate("irPara('cardapios')"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path='v31/03_cardapios_escuro.png')
        await pg.set_viewport_size({'width':390,'height':844}); await pg.evaluate("irPara('inicio-admin')"); await pg.wait_for_timeout(1200)
        await pg.screenshot(path='v31/04_inicio_celular_escuro.png')
        await b.close()
    print('ERROS:', erros if erros else 'nenhum')
asyncio.run(main())
