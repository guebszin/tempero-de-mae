# Versão 32: tutorial de boas-vindas (v33: sem o personagem)
import asyncio, os, json
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
ADM="const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token; w.__novaExecucao();"
os.makedirs('v32', exist_ok=True)
def ok(c,t):
    print(('OK   ' if c else 'FALHA ')+t)
    if not c: erros.append('FALHA '+t)
async def entrar(pg,u,s):
    await pg.fill('#loginEmail',u); await pg.fill('#loginSenha',s)
    if await pg.is_checked('#loginLembrar'): await pg.click('#loginLembrar')
    await pg.click('#telaLogin .botao-entrar'); await pg.wait_for_selector('#app:not([hidden])'); await pg.wait_for_timeout(400)
async def tutorial_aberto(pg): return await pg.evaluate("!!document.querySelector('.tutorial:not(.saindo)')")
async def passo(pg): return await pg.text_content('.tutorial-passo')
async def proximo(pg): await pg.click('.tutorial-proximo'); await pg.wait_for_timeout(700)
def visto(uid_js): return chamar("const u="+uid_js+"; return !!w.PropertiesService.getScriptProperties().getProperty(w.chaveTutorial_(u.usuario_id));")
ADMIN_UID="w.lerUsuarios_().lista.find(u=>u.email==='admin@rest.com')"
async def sobrepoe(pg, sel_alvo):
    return await pg.evaluate("""(s)=>{const h=document.querySelector('.tutorial-holofote').getBoundingClientRect();
      const a=[...document.querySelectorAll(s)].map(e=>e.getBoundingClientRect()).find(r=>r.width>0&&r.left>=0&&r.left<innerWidth);
      if(!a) return false; return h.left<=a.left+1 && h.right>=a.right-1 && h.top<=a.top+1 && h.bottom>=a.bottom-1;}""", sel_alvo)

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo', locale='pt-BR')
        await ctx.add_init_script("window.__semTutorial=false")
        pg=await ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        await pg.goto('http://localhost:8765/index.html'); await pg.evaluate("localStorage.clear()")
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])'); await pg.wait_for_timeout(800)
        await pg.evaluate(chamar(ADM+"w.criarEmpresa(tk,{nome:'Alfa Ltda',email:'alfa@x.com',senha:'abc123',cnpj:'',endereco:'Rua A'}); return 1;"))
        ok(not await pg.evaluate(visto(ADMIN_UID)), 'restaurante ainda não viu o tutorial')

        # ===== Restaurante: abre sozinho no primeiro acesso =====
        await entrar(pg,'admin@rest.com','senhaadmin12345')
        await pg.wait_for_selector('.tutorial', timeout=5000); await pg.wait_for_timeout(700)
        ok(await tutorial_aberto(pg), 'tutorial abre sozinho no primeiro acesso')
        total=int((await passo(pg)).split(' de ')[1])
        ok((await passo(pg)).startswith('Passo 1 de') and total>=8, 'mostra o passo 1 (%s)'%await passo(pg))
        ok(await pg.evaluate("!document.querySelector('.tutorial-personagem, .tutorial img')"), 'sem personagem (removido na v33)')
        ok(await pg.is_hidden('.tutorial-voltar') and (await pg.inner_text('.tutorial-proximo'))=='Vamos lá', 'primeiro passo: sem "Voltar", botão "Vamos lá"')
        ok(not await pg.evaluate("document.querySelector('.tutorial-holofote').classList.contains('com-alvo')"), 'boas-vindas sem destaque no menu')
        await pg.screenshot(path='v32/01_boas_vindas.png')

        await proximo(pg)
        ok('Empresas' in await pg.inner_text('#tutorialTitulo'), 'passo 2: Empresas')
        ok(await pg.evaluate("estado.telaAtual")=='empresas', 'leva até a tela de Empresas')
        ok(await sobrepoe(pg,'#menuLateral [data-tela="empresas"]') or await sobrepoe(pg,'[data-tela="empresas"]'), 'holofote em cima do item "Empresas" do menu')
        await pg.screenshot(path='v32/02_empresas.png')

        # Voltar e teclado
        await pg.click('.tutorial-voltar'); await pg.wait_for_timeout(500)
        ok((await passo(pg)).startswith('Passo 1'), 'Voltar volta um passo')
        await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(500)
        await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(600)
        ok('Preços' in await pg.inner_text('#tutorialTitulo'), 'seta para a direita avança')

        # Clique fora não mexe na tela de trás
        tela=await pg.evaluate("estado.telaAtual")
        await pg.mouse.click(700,300); await pg.wait_for_timeout(300)
        ok(await tutorial_aberto(pg) and await pg.evaluate("estado.telaAtual")==tela, 'clique fora não fecha nem mexe na tela')

        # Até o fim
        for _ in range(total):
            if (await pg.inner_text('.tutorial-proximo'))=='Começar a usar': break
            t=await pg.inner_text('#tutorialTitulo')
            if t=='Cardápios': await pg.screenshot(path='v32/03_cardapios.png')
            await proximo(pg)
        ok((await pg.inner_text('#tutorialTitulo'))=='Tudo pronto!' and await pg.is_hidden('.tutorial-pular'), 'último passo "Tudo pronto!"')
        await pg.screenshot(path='v32/04_final.png')
        await pg.click('.tutorial-proximo'); await pg.wait_for_timeout(1000)
        ok(not await tutorial_aberto(pg), 'fecha no "Começar a usar"')
        ok(await pg.evaluate("estado.telaAtual")=='inicio-admin', 'volta para o Início')
        ok(await pg.evaluate(visto(ADMIN_UID)), 'servidor guardou que o restaurante já viu')

        # Não abre de novo ao entrar outra vez
        await pg.evaluate("sair()"); await pg.wait_for_selector('#telaLogin:not([hidden])')
        await entrar(pg,'admin@rest.com','senhaadmin12345'); await pg.wait_for_timeout(1600)
        ok(not await tutorial_aberto(pg), 'no segundo acesso não abre sozinho')

        # Rever tutorial pelo menu da conta
        await pg.click('#botaoConta'); await pg.wait_for_timeout(200)
        await pg.click('#menuConta [data-acao="tutorial"]'); await pg.wait_for_timeout(600)
        ok(await tutorial_aberto(pg) and (await passo(pg)).startswith('Passo 1'), '"Rever tutorial" abre do começo')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)
        ok(not await tutorial_aberto(pg), 'Esc fecha')

        # ===== Modo teste: restaurante não vê; "Ver como empresa" mostra o da empresa =====
        await pg.click('#botaoConta'); await pg.wait_for_timeout(200)
        await pg.click('#menuConta [data-acao=modo-teste]')
        await pg.wait_for_selector('#confirmacaoFundo:not([hidden])'); await pg.click('#confirmacaoOk')
        await pg.wait_for_selector('#faixaTeste:not([hidden])', timeout=30000); await pg.wait_for_timeout(1800)
        ok(not await tutorial_aberto(pg), 'modo teste do restaurante não abre o tutorial')
        await pg.click('#botaoVerComoEmpresa'); await pg.wait_for_selector('.opcao-simular', timeout=10000)
        await pg.click('.opcao-simular:has-text("Construtora Horizonte")')
        await pg.wait_for_function("estado.usuario && estado.usuario.perfil==='empresa'", timeout=30000)
        await pg.wait_for_selector('.tutorial', timeout=5000); await pg.wait_for_timeout(700)
        ok(await tutorial_aberto(pg) and 'Seja bem-vindo' in await pg.inner_text('#tutorialTitulo'), '"Ver como empresa" mostra o tutorial da empresa (bom para apresentar)')
        await pg.screenshot(path='v32/05_empresa_simulada.png')
        await pg.click('.tutorial-pular'); await pg.wait_for_timeout(800)
        ok(not await tutorial_aberto(pg), '"Pular tutorial" fecha')
        n=await pg.evaluate(chamar("return Object.keys(w.PropertiesService.getScriptProperties().getProperties()).filter(k=>k.indexOf('teste_tutorial_visto_')===0).length;"))
        ok(n>=1, 'marca do teste fica com o prefixo do teste')
        await pg.click('#faixaTeste [data-acao=sair-teste]')
        await pg.wait_for_selector('#confirmacaoFundo:not([hidden])'); await pg.click('#confirmacaoOk')
        await pg.wait_for_function("estado.usuario && estado.usuario.perfil==='admin' && !estado.usuario.modo_teste", timeout=30000); await pg.wait_for_timeout(1200)
        n=await pg.evaluate(chamar("return Object.keys(w.PropertiesService.getScriptProperties().getProperties()).filter(k=>k.indexOf('teste_tutorial_visto_')===0).length;"))
        ok(n==0, 'ao sair do teste as marcas do teste são apagadas')
        ok(not await tutorial_aberto(pg), 'voltar ao sistema real não abre o tutorial')
        await pg.evaluate("sair()"); await pg.wait_for_selector('#telaLogin:not([hidden])')

        # ===== Empresa real, no celular =====
        await pg.set_viewport_size({'width':390,'height':844}); await pg.wait_for_timeout(300)
        await entrar(pg,'alfa@x.com','abc123')
        await pg.wait_for_selector('.tutorial', timeout=5000); await pg.wait_for_timeout(700)
        ok(await tutorial_aberto(pg), 'empresa: tutorial no primeiro acesso')
        titulos=[]
        for _ in range(10):
            titulos.append(await pg.inner_text('#tutorialTitulo'))
            if (await pg.inner_text('.tutorial-proximo'))=='Começar a usar': break
            await proximo(pg)
            if titulos[-1]=='Olá! Seja bem-vindo!':
                await pg.screenshot(path='v32/06_celular_inicio.png')
        ok('Pedido de hoje' in titulos and 'Empresas' not in titulos, 'passos da empresa (%s)'%', '.join(titulos))
        # volta ao passo do pedido para conferir o holofote na barra de baixo
        await pg.click('.tutorial-voltar'); await pg.wait_for_timeout(500)
        while 'Pedido de hoje' not in await pg.inner_text('#tutorialTitulo'):
            await pg.click('.tutorial-voltar'); await pg.wait_for_timeout(500)
        ok(await sobrepoe(pg,'#barraInferior [data-tela="pedidos-empresa"]'), 'celular: holofote no item da barra de baixo')
        r=await pg.evaluate("(()=>{const c=document.querySelector('.tutorial-caixa').getBoundingClientRect(), b=document.getElementById('barraInferior').getBoundingClientRect(); return [c.bottom<=b.top+1, c.left>=0, c.right<=innerWidth];})()")
        ok(all(r), 'celular: janela acima da barra e dentro da tela')
        await pg.screenshot(path='v32/07_celular_pedido.png')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)

        # Tema escuro
        await pg.set_viewport_size({'width':1440,'height':900})
        await pg.evaluate("document.documentElement.dataset.tema='escuro'")
        await pg.evaluate("abrirTutorial()"); await pg.wait_for_timeout(700)
        await pg.screenshot(path='v32/08_escuro.png')
        await b.close()
    print('ERROS:', erros if erros else 'nenhum')
asyncio.run(main())
