# Versão 30: cores da logo (dourado/terra) e nova tela de login em dois lados
import asyncio, os
from playwright.async_api import async_playwright
erros=[]
os.makedirs('v30', exist_ok=True)
def ok(c,t):
    print(('OK   ' if c else 'FALHA ')+t)
    if not c: erros.append('FALHA '+t)
def lum(rgb):
    def f(x):
        x/=255; return x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4
    r,g,b=rgb; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def contraste(a,b):
    a,b=lum(a),lum(b); return (max(a,b)+.05)/(min(a,b)+.05)
COR="([s,p])=>{const e=document.querySelector(s); const c=getComputedStyle(e)[p].match(/\\d+(\\.\\d+)?/g).slice(0,3).map(Number); return c;}"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo', locale='pt-BR')
        pg=await ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        await pg.goto('http://localhost:8765/index.html'); await pg.evaluate("localStorage.clear()")
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])'); await pg.wait_for_timeout(1500)

        # Cor principal = dourado da logo
        prim=await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--verde').trim()")
        ok(prim=='#8a5a1f', 'cor principal dourada (%s)'%prim)
        suc=await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--sucesso').trim()")
        ok(suc=='#2b7a47', 'sucesso continua verde (%s)'%suc)

        # Layout em dois lados
        r=await pg.evaluate("""(()=>{const m=document.querySelector('.painel-marca').getBoundingClientRect(), f=document.querySelector('#telaLogin .login-card').getBoundingClientRect();
            return {lado: m.right<=f.left+1, mesmaAltura: Math.abs(m.height-f.height)<2, logo: !!document.querySelector('.painel-marca .logo-entrada img').naturalWidth};})()""")
        ok(r['lado'] and r['mesmaAltura'], 'marca e formulário lado a lado no computador')
        ok(r['logo'], 'logo carregada no lado da marca')
        ok(await pg.is_visible('.painel-marca #versiculoDia'), 'versículo no lado da marca')
        ok(await pg.evaluate("document.querySelectorAll('#telaLogin .campo-icone svg').length")==2, 'ícones nos campos de usuário e senha')
        r=await pg.evaluate("[...document.querySelectorAll('#telaLogin .campo-com-icone')].map(c=>{const i=c.querySelector('.campo-icone').getBoundingClientRect(), e=c.querySelector('input'); return parseFloat(getComputedStyle(e).paddingLeft) >= (i.right - e.getBoundingClientRect().left) + 4;})")
        ok(all(r), 'texto digitado não fica embaixo do ícone')

        # Contrastes
        btn=await pg.evaluate(COR, ['#telaLogin .botao-entrar','color'])
        ok(contraste(btn,[138,90,31])>=4.5, 'texto do botão Entrar legível (%.1f)'%contraste(btn,[138,90,31]))
        tx=await pg.evaluate(COR, ['.painel-marca .versiculo-dia blockquote','color'])
        ok(contraste(tx,[59,40,23])>=7, 'versículo legível no fundo marrom (%.1f)'%contraste(tx,[59,40,23]))
        await pg.screenshot(path='v30/01_login.png')

        # Foco no campo destaca o ícone
        await pg.click('#loginEmail'); await pg.wait_for_timeout(250)
        cor=await pg.evaluate(COR, ['#telaLogin .campo-com-icone .campo-icone','color'])
        ok(cor==[138,90,31], 'ícone fica dourado ao focar o campo')

        # Erro de login aparece no novo painel
        await pg.fill('#loginEmail','ninguem'); await pg.fill('#loginSenha','errada1')
        await pg.click('#telaLogin .botao-entrar'); await pg.wait_for_selector('#erroLogin:not([hidden])')
        ok(await pg.is_visible('#erroLogin'), 'mensagem de erro aparece')
        await pg.screenshot(path='v30/02_login_erro.png')

        # Escuro
        await pg.evaluate("document.documentElement.dataset.tema='escuro'"); await pg.wait_for_timeout(500)
        prim=await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--verde').trim()")
        ok(prim=='#d4a24c', 'dourado claro no tema escuro')
        await pg.screenshot(path='v30/03_login_escuro.png')
        await pg.evaluate("delete document.documentElement.dataset.tema")

        # Celular: marca em cima, formulário embaixo, sem rolagem lateral
        await pg.set_viewport_size({'width':390,'height':844}); await pg.wait_for_timeout(500)
        r=await pg.evaluate("""(()=>{const m=document.querySelector('.painel-marca').getBoundingClientRect(), f=document.querySelector('#telaLogin .login-card').getBoundingClientRect();
            return [m.bottom<=f.top+1, document.documentElement.scrollWidth<=innerWidth];})()""")
        ok(all(r), 'celular: marca acima do formulário e sem rolagem lateral')
        await pg.screenshot(path='v30/04_login_celular.png', full_page=True)

        # Entrar e ver o painel com as cores novas
        await pg.set_viewport_size({'width':1440,'height':900})
        await pg.fill('#loginEmail','admin@rest.com'); await pg.fill('#loginSenha','senhaadmin12345')
        await pg.click('#telaLogin .botao-entrar'); await pg.wait_for_selector('#app:not([hidden])'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path='v30/05_inicio.png')
        await pg.evaluate("irPara('cobrancas')"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path='v30/06_cobrancas.png')
        await pg.evaluate("document.documentElement.dataset.tema='escuro'"); await pg.evaluate("irPara('inicio-admin')"); await pg.wait_for_timeout(1200)
        await pg.screenshot(path='v30/07_inicio_escuro.png')
        await b.close()
    print('ERROS:', erros if erros else 'nenhum')
asyncio.run(main())
