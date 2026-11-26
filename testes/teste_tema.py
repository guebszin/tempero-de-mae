import asyncio, os
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
os.makedirs('v15', exist_ok=True)
def ok(c,t):
    print(('OK   ' if c else 'FALHA ')+t)
    if not c: erros.append(t)
TEMA="document.documentElement.getAttribute('data-tema')"
FUNDO="getComputedStyle(document.body).backgroundColor"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        # aparelho em modo escuro, preferência automática
        ctx=await b.new_context(viewport={'width':1440,'height':900}, color_scheme='dark')
        pg=await ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        await pg.goto('http://localhost:8765/index.html'); await pg.evaluate("localStorage.clear(); sessionStorage.clear()")
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        ok(await pg.evaluate(TEMA)=='escuro', 'automático segue aparelho escuro')
        ok(await pg.evaluate(FUNDO)=='rgb(15, 19, 32)', 'fundo escuro (azul-noite, v31): '+await pg.evaluate(FUNDO))
        ok(await pg.locator('#telaLogin .seletor-tema button.ativo[data-tema=auto]').count()==1, 'login mostra Auto marcado')
        await pg.screenshot(path='v15/t1_login_escuro.png')
        await pg.click('#telaLogin .seletor-tema button[data-tema=claro]')
        ok(await pg.evaluate(TEMA)=='claro' and await pg.evaluate("localStorage.getItem('tema')")=='claro', 'escolher Claro aplica e guarda')
        await pg.click('#telaLogin .seletor-tema button[data-tema=escuro]')
        # entra
        await pg.fill('#loginEmail','admin@rest.com'); await pg.fill('#loginSenha','senhaadmin12345'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#app:not([hidden])')
        ok(await pg.locator('#sidebar .seletor-tema button.ativo[data-tema=escuro]').count()==1, 'menu lateral mostra Escuro marcado')
        await pg.screenshot(path='v15/t2_inicio_escuro.png')
        await pg.click('#menuLateral [data-tela=empresas]'); await pg.wait_for_timeout(300)
        await pg.click('#botaoNovaEmpresa'); await pg.wait_for_selector('#modalCorpo form'); await pg.wait_for_timeout(500)
        await pg.screenshot(path='v15/t3_modal_escuro.png')
        await pg.click('#modalCorpo [data-cancelar]'); await pg.wait_for_timeout(300)
        await pg.evaluate("avisar('Empresa salva com sucesso.','sucesso')"); await pg.wait_for_timeout(200)
        await pg.screenshot(path='v15/t4_empresas_toast.png')
        for tela in ['precos','funcionarios','cardapio','pedidos','cobrancas','relatorios','configuracoes']:
            if await pg.locator('#menuLateral [data-tela=%s]'%tela).count():
                await pg.click('#menuLateral [data-tela=%s]'%tela); await pg.wait_for_timeout(500)
                await pg.screenshot(path='v15/t5_%s.png'%tela)
        # recarregar mantém
        await pg.reload(); await pg.wait_for_selector('#app:not([hidden])')
        ok(await pg.evaluate(TEMA)=='escuro', 'tema mantido depois de recarregar')
        # menu da conta (topo)
        await pg.click('#sidebar .seletor-tema button[data-tema=claro]')
        ok(await pg.evaluate(TEMA)=='claro', 'voltar para claro pelo menu lateral')
        ok(await pg.evaluate(FUNDO)=='rgb(247, 243, 236)', 'fundo claro (creme, v30): '+await pg.evaluate(FUNDO))
        await pg.screenshot(path='v15/t6_inicio_claro.png')
        # impressão continua clara
        await pg.click('#sidebar .seletor-tema button[data-tema=escuro]')
        await pg.emulate_media(media='print')
        ok(await pg.evaluate(FUNDO)=='rgb(255, 255, 255)', 'impressão sai com fundo branco no modo escuro')
        await pg.emulate_media(media='screen')
        # auto acompanha troca do aparelho
        await pg.click('#sidebar .seletor-tema button[data-tema=auto]')
        await pg.emulate_media(color_scheme='light'); await pg.wait_for_timeout(100)
        ok(await pg.evaluate(TEMA)=='claro', 'automático muda junto quando o aparelho fica claro')
        await pg.emulate_media(color_scheme='dark'); await pg.wait_for_timeout(100)
        ok(await pg.evaluate(TEMA)=='escuro', 'automático muda junto quando o aparelho fica escuro')
        # celular
        m=await b.new_context(viewport={'width':390,'height':844}, color_scheme='dark', is_mobile=True, has_touch=True)
        pm=await m.new_page(); pm.on('pageerror', lambda e: erros.append('PAGEERROR m '+str(e)))
        await pm.goto('http://localhost:8765/index.html'); await pm.wait_for_selector('#telaLogin:not([hidden])')
        await pm.screenshot(path='v15/t7_m_login.png')
        await pm.fill('#loginEmail','admin@rest.com'); await pm.fill('#loginSenha','senhaadmin12345'); await pm.click('#formLogin button[type=submit]')
        await pm.wait_for_selector('#app:not([hidden])'); await pm.wait_for_timeout(300)
        await pm.screenshot(path='v15/t8_m_inicio.png')
        await pm.click('#botaoConta'); await pm.wait_for_timeout(200)
        ok(await pm.locator('#menuConta .seletor-tema').is_visible(), 'seletor no menu da conta (celular)')
        await pm.click('#menuConta .seletor-tema button[data-tema=claro]')
        ok(await pm.evaluate(TEMA)=='claro' and await pm.locator('#menuConta').is_visible(), 'troca no celular e menu continua aberto')
        await pm.click('#menuConta .seletor-tema button[data-tema=escuro]')
        await pm.screenshot(path='v15/t9_m_menu.png')
        await b.close()
    print('ERROS:',erros if erros else 'nenhum')
    if erros: raise SystemExit(1)
asyncio.run(main())
