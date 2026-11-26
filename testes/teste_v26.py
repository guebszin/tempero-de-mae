# Versão 26: "Ver como empresa" no modo teste e versículo do dia na tela inicial
import asyncio, os, json
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
ADM="const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token; w.__novaExecucao();"
os.makedirs('v26', exist_ok=True)
def ok(c,t):
    print(('OK   ' if c else 'FALHA ')+t)
    if not c: erros.append('FALHA '+t)
def tenta(js): return "try{"+js+";return 'sem erro'}catch(e){return e.message}"
async def entrar(pg,u,s):
    await pg.fill('#loginEmail',u); await pg.fill('#loginSenha',s)
    await pg.evaluate("(function(c){if(c&&c.checked)c.click();})(document.querySelector('#formLogin input[type=checkbox]'))")
    await pg.click('#formLogin button[type=submit]')
    await pg.wait_for_selector('#app:not([hidden]), #erroLogin:not([hidden])'); await pg.wait_for_timeout(700)
async def visao(pg): return await pg.evaluate("[...document.querySelectorAll('.view')].filter(v=>!v.hidden).map(v=>v.dataset.view)[0]")

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo', locale='pt-BR')
        pg=await ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        pg.on('console', lambda m: erros.append(m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.evaluate("localStorage.clear()")
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')

        await pg.evaluate(chamar(ADM+"""
          const e=w.criarEmpresa(tk,{nome:'Empresa Real SA',email:'real@x.com',senha:'abc123',cnpj:'',endereco:'Rua A'});
          return 1;"""))

        # ===== Versículo do dia na tela inicial =====
        login_txt=await pg.inner_text('#versiculoTexto')
        await entrar(pg,'admin@rest.com','senhaadmin12345')
        await pg.wait_for_timeout(800)
        v='[data-view="inicio-admin"] [data-versiculo-inicio]'
        ok(await pg.is_visible(v), 'versículo aparece no Início do restaurante')
        ok(await pg.inner_text(v+' blockquote')==login_txt, 'mesmo versículo da tela de entrada')
        ok(len(await pg.inner_text(v+' figcaption'))>3, 'com a referência')
        await pg.screenshot(path='v26/01_inicio_restaurante.png')
        ok(not await pg.is_visible('#botaoVerComoEmpresa'), '"Ver como empresa" não aparece fora do modo teste')
        r=await pg.evaluate("apiSessao('verComoEmpresa','x').then(()=>'sem erro',e=>e.message)")
        ok('modo teste' in r, 'servidor recusa ver como empresa fora do teste (%s)'%r)

        # Celular: versículo abaixo da saudação
        await pg.set_viewport_size({'width':390,'height':844}); await pg.wait_for_timeout(400)
        await pg.screenshot(path='v26/02_inicio_celular.png')
        larg=await pg.evaluate("document.querySelector('%s').getBoundingClientRect().width"%v)
        ok(larg>300, 'no celular o versículo ocupa a largura (%d px)'%larg)
        await pg.set_viewport_size({'width':1440,'height':900}); await pg.wait_for_timeout(300)

        # ===== Entrar no modo teste =====
        await pg.click('#botaoConta'); await pg.wait_for_timeout(200)
        await pg.click('#menuConta [data-acao=modo-teste]')
        await pg.wait_for_selector('#confirmacaoFundo:not([hidden])'); await pg.click('#confirmacaoOk')
        await pg.wait_for_selector('#faixaTeste:not([hidden])', timeout=30000); await pg.wait_for_timeout(1200)
        ok(await pg.is_visible('#botaoVerComoEmpresa'), 'faixa do teste tem "Ver como empresa"')
        ok(not await pg.is_visible('#botaoVoltarRestaurante'), '"Voltar ao restaurante" escondido na visão do restaurante')
        token_adm=await pg.evaluate("estado.token")

        # Estando em Cardápios, abre a escolha de empresa
        await pg.evaluate("irPara('cardapios')"); await pg.wait_for_timeout(1500)
        await pg.click('#botaoVerComoEmpresa')
        await pg.wait_for_selector('.opcao-simular', timeout=10000); await pg.wait_for_timeout(300)
        nomes=await pg.evaluate("[...document.querySelectorAll('.opcao-simular strong')].map(e=>e.textContent)")
        ok('Construtora Horizonte' in nomes and 'Academia Corpo em Forma' not in nomes and 'Empresa Real SA' not in nomes,
           'lista só empresas fictícias ativas (%s)'%nomes)
        await pg.screenshot(path='v26/03_escolher_empresa.png')

        await pg.click('.opcao-simular:has-text("Construtora Horizonte")')
        await pg.wait_for_function("estado.usuario && estado.usuario.perfil==='empresa'", timeout=30000); await pg.wait_for_timeout(1500)
        u=await pg.evaluate("estado.usuario")
        ok(u['nome_empresa']=='Construtora Horizonte' and u['modo_teste'] and u['simulacao'] is True, 'sessão da empresa no modo teste (simulação)')
        ok(await visao(pg)=='inicio-empresa', 'empresa começa no Início')
        ok('vendo como Construtora Horizonte' in await pg.inner_text('#faixaTesteTitulo'), 'faixa diz qual empresa')
        ok(await pg.is_visible('#botaoVoltarRestaurante') and not await pg.is_visible('#botaoVerComoEmpresa'), 'botões da faixa trocados')
        ok(await pg.is_visible('[data-view="inicio-empresa"] [data-versiculo-inicio]'), 'versículo no Início da empresa')
        menu=await pg.evaluate("[...document.querySelectorAll('#menuLateral [data-tela]')].map(e=>e.dataset.tela)")
        ok('pedidos-empresa' in menu and 'empresas' not in menu and 'dashboard' not in menu, 'menu é o da empresa (%s)'%menu)
        ok(await pg.inner_text('#sidebarNome')=='Construtora Horizonte', 'nome da empresa na lateral')
        await pg.screenshot(path='v26/04_vendo_como_empresa.png')

        # Telas da empresa funcionam com os dados fictícios
        await pg.evaluate("irPara('funcionarios-empresa')"); await pg.wait_for_timeout(2000)
        linhas=await pg.evaluate("document.querySelectorAll('[data-view=\"funcionarios-empresa\"] .lista-linha').length")
        ok(linhas>=5, 'funcionários da empresa fictícia aparecem (%d)'%linhas)
        await pg.evaluate("irPara('pedidos-empresa')"); await pg.wait_for_timeout(2000)
        await pg.screenshot(path='v26/05_pedido_empresa.png', full_page=True)

        # Segurança: a sessão simulada não acessa funções do restaurante
        tk_emp=await pg.evaluate("estado.token")
        r=await pg.evaluate(chamar("return (function(){"+tenta("w.listarEmpresasParaSimular(%s)"%json.dumps(tk_emp))+"})();"))
        ok(r!='sem erro', 'empresa simulada não lista empresas (%s)'%r)
        r=await pg.evaluate(chamar("return (function(){"+tenta("w.obterResumoAdmin(%s)"%json.dumps(tk_emp))+"})();"))
        ok(r!='sem erro', 'empresa simulada não abre dados do restaurante (%s)'%r)

        # Recarregar a página continua vendo como empresa
        await pg.reload(); await pg.wait_for_selector('#app:not([hidden])', timeout=30000); await pg.wait_for_timeout(1500)
        ok(await pg.evaluate("estado.usuario.simulacao===true && estado.usuario.perfil==='empresa'"), 'após recarregar continua vendo como empresa')
        ok('vendo como' in await pg.inner_text('#faixaTesteTitulo'), 'faixa continua após recarregar')

        # "Sair" volta para o restaurante (sem apagar o teste)
        await pg.click('#botaoConta'); await pg.wait_for_timeout(200)
        await pg.click('#menuConta [data-acao=sair]')
        await pg.wait_for_function("estado.usuario && estado.usuario.perfil==='admin'", timeout=30000); await pg.wait_for_timeout(1500)
        ok(await pg.evaluate("estado.token")==token_adm, 'voltou com a sessão do restaurante de teste')
        ok(await pg.evaluate("estado.usuario.modo_teste===true"), 'continua no modo teste')
        ok(not await pg.is_visible('#botaoVoltarRestaurante') and await pg.is_visible('#botaoVerComoEmpresa'), 'faixa volta ao normal')
        r=await pg.evaluate(chamar("return (function(){"+tenta("w.validarSessao(%s)"%json.dumps(tk_emp))+"})();"))
        ok('expirada' in r.lower(), 'sessão da empresa simulada encerrada (%s)'%r)
        n=await pg.evaluate(chamar("const t=%s; w.validarSessao(t); w.__novaExecucao(); return w.listarEmpresasParaSimular(t).length;"%json.dumps(token_adm)))
        ok(n==6, 'dados do teste continuam (%d empresas ativas)'%n)
        await pg.screenshot(path='v26/06_de_volta.png')

        # Ver como outra empresa e sair do modo teste direto de lá
        await pg.click('#botaoVerComoEmpresa'); await pg.wait_for_selector('.opcao-simular', timeout=10000)
        await pg.click('.opcao-simular:has-text("Clínica Vida Plena")')
        await pg.wait_for_function("estado.usuario && estado.usuario.perfil==='empresa'", timeout=30000); await pg.wait_for_timeout(1200)
        ok(await pg.evaluate("estado.usuario.nome_empresa")=='Clínica Vida Plena', 'troca para outra empresa')
        await pg.click('#faixaTeste [data-acao=sair-teste]')
        await pg.wait_for_selector('#confirmacaoFundo:not([hidden])'); await pg.click('#confirmacaoOk')
        await pg.wait_for_function("estado.usuario && estado.usuario.perfil==='admin' && !estado.usuario.modo_teste", timeout=30000); await pg.wait_for_timeout(1200)
        ok(await pg.is_hidden('#faixaTeste'), 'saiu do modo teste direto da visão da empresa')
        r=await pg.evaluate(chamar("return (function(){"+tenta("w.validarSessao(%s)"%json.dumps(token_adm))+"})();"))
        ok('expirada' in r.lower(), 'sessão de teste do restaurante também encerrada')
        nomes=await pg.evaluate("apiSessao('listarEmpresas').then(l=>(l.empresas||l).map(e=>e.nome_empresa)).catch(e=>e.message)")
        ok('Empresa Real SA' in json.dumps(nomes, ensure_ascii=False), 'de volta aos dados reais')

        await b.close()
    print('ERROS:', erros if erros else 'nenhum')

asyncio.run(main())
