import asyncio, datetime, os, json
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
ADM="const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token; w.__novaExecucao();"
os.makedirs('v21', exist_ok=True)
def ok(c,t):
    print(('OK   ' if c else 'FALHA ')+t)
    if not c: erros.append('FALHA '+t)
def tenta(js): return "try{"+js+";return 'sem erro'}catch(e){return e.message}"
async def entrar(pg,u,s,lembrar=False):
    await pg.fill('#loginEmail',u); await pg.fill('#loginSenha',s)
    if not lembrar: await pg.evaluate("(function(c){if(c&&c.checked)c.click();})(document.querySelector('#formLogin input[type=checkbox]'))")
    await pg.click('#formLogin button[type=submit]')
    await pg.wait_for_selector('#app:not([hidden]), #erroLogin:not([hidden])'); await pg.wait_for_timeout(600)
async def ir(pg,tela):
    seletor='#menuLateral [data-tela=%s]'%tela
    try:
        await pg.wait_for_selector(seletor, state='visible', timeout=20000)
    except Exception:
        info=await pg.evaluate("({tamanho:[innerWidth,innerHeight], corpo:document.body.className, app:!document.getElementById('app').hidden, login:!document.getElementById('telaLogin').hidden, carregando:!document.getElementById('telaCarregando').hidden, faixa:!document.getElementById('faixaTeste').hidden, toasts:document.getElementById('toasts').innerText})")
        print('DIAGNOSTICO ir(%s):'%tela, info)
        await pg.screenshot(path='v21/erro_%s.png'%tela)
        raise
    await pg.click(seletor); await pg.wait_for_timeout(1500)
async def real(pg): return await pg.evaluate("localStorage.getItem('abas')")
async def abrir_conta(pg):
    await pg.click('#botaoConta'); await pg.wait_for_timeout(200)
async def entrar_teste(pg):
    await abrir_conta(pg)
    await pg.click('#menuConta [data-acao=modo-teste]')
    await pg.wait_for_selector('#confirmacaoFundo:not([hidden])')
    await pg.click('#confirmacaoOk')
    await pg.wait_for_selector('#faixaTeste:not([hidden])', timeout=30000); await pg.wait_for_timeout(1200)

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo', locale='pt-BR')
        pg=await ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        pg.on('console', lambda m: erros.append(m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.evaluate("localStorage.clear()")
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')

        # Dados reais: uma empresa e um administrador comum
        await pg.evaluate(chamar(ADM+"""
          const e=w.criarEmpresa(tk,{nome:'Empresa Real SA',email:'real@x.com',senha:'abc123',cnpj:'',endereco:'Rua A'});
          w.__novaExecucao(); w.salvarPreco(tk,{empresa_id:e.empresa_id,valor_unitario:'19,00',data_inicio:'2026-01-01'});
          w.__novaExecucao(); w.criarAdministrador(tk,{nome:'Zé Comum',email:'ze@x.com',senha:'zesenha123',permissoes:{telas:{pedidos:true},funcoes:{}}});
        """))

        await entrar(pg,'admin@rest.com','senhaadmin12345', lembrar=True)
        await abrir_conta(pg)
        ok(await pg.is_visible('#menuConta [data-acao=modo-teste]'), 'dono vê "Entrar no modo teste"')
        await pg.screenshot(path='v21/01_menu_conta.png')
        await pg.click('#botaoConta')
        antes=await real(pg)
        token_real=await pg.evaluate("estado.token")

        await entrar_teste(pg)
        await pg.screenshot(path='v21/02_inicio_teste.png')
        ok(await pg.evaluate("document.body.classList.contains('em-modo-teste')"), 'faixa e marcação do modo teste')
        ok(await pg.evaluate("estado.token") != token_real, 'token trocado pelo de teste')
        r=await pg.evaluate(chamar("return "+json.dumps(token_real)+" && (function(){try{w.validarSessao(%s);return 'valida'}catch(e){return e.message}})();"%json.dumps(token_real)))
        ok('expirada' in r.lower(), 'sessão real antiga foi encerrada (%s)'%r)
        ok(not await pg.is_visible('#menuConta [data-acao=modo-teste]'), 'botão de entrar some dentro do teste')

        await ir(pg,'empresas')
        nomes=await pg.evaluate("document.getElementById('listaEmpresas').innerText")
        ok('Construtora Horizonte' in nomes and 'Empresa Real SA' not in nomes, 'empresas fictícias no teste (sem as reais)')
        await pg.screenshot(path='v21/03_empresas_teste.png')

        await ir(pg,'dashboard'); await pg.wait_for_selector('.cartao-grafico', timeout=15000)
        n=await pg.evaluate("document.querySelectorAll('.cartao-grafico').length")
        ok(n==4, 'Dashboard com 4 pizzas no teste (%d)'%n)
        await pg.screenshot(path='v21/04_dashboard_teste.png', full_page=True)
        tk=await pg.evaluate("estado.token")
        d=await pg.evaluate(chamar("w.validarSessao(%s); return w.obterDashboard(%s,'ESTE_ANO');"%(json.dumps(tk),json.dumps(tk))))
        chaves=[s['chave'] for s in (d['situacao'] or [])]
        ok(d['totais']['quentinhas']>500, 'muitos pedidos fictícios no ano (%d quentinhas)'%d['totais']['quentinhas'])
        ok(all(c in chaves for c in ['recebido','a_receber','vencido','nao_cobrado','desconto']), 'situação do dinheiro com todas as fatias %s'%chaves)
        for per in ['SETE_DIAS','ESTE_MES','MES_PASSADO']:
            dd=await pg.evaluate(chamar("return w.obterDashboard(%s,'%s');"%(json.dumps(tk),per)))
            ok(dd['totais']['quentinhas']>0, 'Dashboard %s tem dados (%d)'%(per,dd['totais']['quentinhas']))
        rel=await pg.evaluate(chamar("w.validarSessao("+json.dumps(tk)+"); const h=w.hojeTexto_('America/Sao_Paulo'); return w.montarRelatorio_(h.slice(0,4)+'-01-01',h,'',null).totais;"))
        ok(abs(rel['valor']-d['totais']['valor'])<0.01, 'relatório bate com o Dashboard no teste')

        await ir(pg,'cobrancas')
        txt=await pg.evaluate("document.getElementById('cobrancasConteudo').innerText")
        ok('Vencid' in txt or 'vencid' in txt, 'cobranças fictícias com vencidas')
        await pg.screenshot(path='v21/05_cobrancas_teste.png')
        await ir(pg,'pedidos')
        await pg.screenshot(path='v21/06_pedidos_teste.png')
        await ir(pg,'cardapios'); await pg.screenshot(path='v21/07_cardapio_teste.png')
        await ir(pg,'relatorios'); await pg.screenshot(path='v21/08_relatorios_teste.png')
        await ir(pg,'acessos')
        txt=await pg.evaluate("document.getElementById('listaAdministradores').innerText")
        ok('Ana Atendente' in txt and 'Zé Comum' not in txt, 'acessos do teste (fictícios)')

        # Gravações no teste
        r=await pg.evaluate(chamar("""const tk=%s;
           const e=w.criarEmpresa(tk,{nome:'Empresa Só Teste',login:'soteste',email:'so@teste.com',cnpj:'',endereco:''}); w.__novaExecucao();
           const p=w.lerPedidos_ ? null : null;
           const pedidos=(w.validarSessao(tk), w.lerPedidos_().lista.filter(x=>x.status==='ENVIADO')); w.__novaExecucao();
           w.confirmarPedido ? w.confirmarPedido(tk,pedidos[0].pedido_id) : null; w.__novaExecucao();
           const cob=(w.validarSessao(tk), w.lerCobrancas_().lista.find(c=>c.status!=='PAGA'&&c.status!=='CANCELADA')); w.__novaExecucao();
           w.registrarPagamento(tk,{cobranca_id:cob.cobranca_id,valor:'10,00',data:w.hojeTexto_('America/Sao_Paulo'),forma:'PIX'}); w.__novaExecucao();
           w.aplicarDescontoCobranca(tk,{cobranca_id:cob.cobranca_id,desconto_tipo:'VALOR',desconto_valor:'5,00',desconto_motivo:'teste'}); w.__novaExecucao();
           w.salvarHorarioLimite(tk,'10:30');
           return e.convite;"""%json.dumps(tk)))
        ok(r and r.get('teste') is True, 'convite gerado no teste vem marcado como teste')
        props=await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('p_'))")
        ok(any(k.startswith('p_teste_convite') for k in props) and not any(k.startswith('p_convite_') and 'soteste' in k for k in props), 'convite do teste guardado separado')
        ok(await real(pg)==antes, 'planilha REAL não mudou depois de gravar no teste')

        # Recarregar a página continua no teste
        await pg.reload(); await pg.wait_for_selector('#app:not([hidden])'); await pg.wait_for_timeout(1200)
        ok(await pg.is_visible('#faixaTeste'), 'ao recarregar continua no modo teste')
        await ir(pg,'empresas')
        ok('Empresa Só Teste' in await pg.evaluate("document.getElementById('listaEmpresas').innerText"), 'o que foi feito no teste aparece durante o teste')

        # celular e escuro
        await pg.set_viewport_size({'width':390,'height':844}); await pg.wait_for_timeout(500)
        await pg.screenshot(path='v21/09_m_faixa.png')
        await pg.evaluate("document.documentElement.dataset.tema='escuro'"); await pg.wait_for_timeout(300)
        await pg.screenshot(path='v21/10_m_faixa_escuro.png')
        await pg.evaluate("delete document.documentElement.dataset.tema"); await pg.set_viewport_size({'width':1440,'height':900}); await pg.wait_for_timeout(400)

        # Sair do teste
        await pg.click('#faixaTeste [data-acao=sair-teste]')
        await pg.wait_for_selector('#confirmacaoFundo:not([hidden])'); await pg.screenshot(path='v21/11_confirmar_saida.png')
        await pg.click('#confirmacaoOk')
        await pg.wait_for_selector('#faixaTeste', state='hidden', timeout=30000); await pg.wait_for_timeout(1200)
        ok(not await pg.evaluate("document.body.classList.contains('em-modo-teste')"), 'saiu do modo teste')
        await ir(pg,'empresas')
        nomes=await pg.evaluate("document.getElementById('listaEmpresas').innerText")
        ok('Empresa Real SA' in nomes and 'Construtora' not in nomes and 'Só Teste' not in nomes, 'de volta aos dados reais')
        livros=await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('abas_'))")
        ok(len(livros)==1, 'uma planilha de teste (%s)'%livros)
        vazio=await pg.evaluate("(function(){const o=JSON.parse(localStorage.getItem(%s));return Object.keys(o).every(n=>o[n].filter(r=>r.some(c=>c!==''&&c!==null)).length<=1);})()"%json.dumps(livros[0]))
        ok(vazio, 'planilha de teste esvaziada ao sair')
        props=await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('p_teste_'))")
        ok(not props, 'convites do teste apagados')
        ok(await real(pg)==antes, 'planilha real intacta depois de sair')
        hor=await pg.evaluate(chamar("return w.horarioLimite_();"))
        ok(hor=='09:00', 'horário limite real não mudou (%s)'%hor)

        # Entrar de novo: começa do zero
        await entrar_teste(pg)
        await ir(pg,'empresas')
        nomes=await pg.evaluate("document.getElementById('listaEmpresas').innerText")
        ok('Construtora Horizonte' in nomes and 'Só Teste' not in nomes, 'novo teste começa do zero')
        ok(await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('abas_')).length")==1, 'reaproveita a mesma planilha de teste')

        # Sessão de teste expirada: não volta sozinha ao sistema real
        tk=await pg.evaluate("estado.token")
        await pg.evaluate(chamar("CacheService.getScriptCache().remove(w.chaveSessao_(%s));"%json.dumps(tk)).replace("CacheService","w.CacheService"))
        await ir(pg,'pedidos'); await pg.wait_for_timeout(1500)
        ok(await pg.is_visible('#telaLogin'), 'sessão de teste expirada leva ao login (não renova no real)')
        ok(await real(pg)==antes, 'real intacta após expirar')

        # Entrar de novo (login salvo não pode cair no teste)
        await pg.reload(); await pg.wait_for_selector('#app:not([hidden]), #telaLogin:not([hidden])'); await pg.wait_for_timeout(1200)
        if await pg.is_visible('#telaLogin'): await entrar(pg,'admin@rest.com','senhaadmin12345')
        ok(not await pg.is_visible('#faixaTeste'), 'novo login entra no sistema real')

        # Sair da conta dentro do teste apaga o teste
        await entrar_teste(pg)
        await pg.evaluate(chamar("const tk=%s; w.criarEmpresa(tk,{nome:'Outra de Teste',login:'outra',email:'outra@teste.com',cnpj:'',endereco:''});"%json.dumps(await pg.evaluate("estado.token"))))
        await abrir_conta(pg); await pg.click('#menuConta [data-acao=sair]'); await pg.wait_for_selector('#telaLogin:not([hidden])'); await pg.wait_for_timeout(500)
        livro=(await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('abas_'))"))[0]
        vazio=await pg.evaluate("(function(){const o=JSON.parse(localStorage.getItem(%s));return Object.keys(o).every(n=>o[n].filter(r=>r.some(c=>c!==''&&c!==null)).length<=1);})()"%json.dumps(livro))
        ok(vazio, 'sair da conta no teste também apaga o teste')

        # Outros não podem
        r=await pg.evaluate(chamar("const t=w.autenticarUsuario('adm.ze','zesenha123').token; w.__novaExecucao();"+tenta("w.entrarModoTeste(t)")))
        ok('proprietário' in r.lower(), 'administrador comum não entra no modo teste (%s)'%r)
        r=await pg.evaluate(chamar("const t=w.autenticarUsuario('real@x.com','abc123').token; w.__novaExecucao();"+tenta("w.entrarModoTeste(t)")))
        ok(r!='sem erro', 'empresa não entra no modo teste (%s)'%r)
        await entrar(pg,'adm.ze','zesenha123')
        await abrir_conta(pg)
        ok(not await pg.is_visible('#menuConta [data-acao=modo-teste]'), 'administrador comum não vê o botão')
        ok(await real(pg)!=None, 'fim')

        print('ERROS:', [e for e in erros] or 'nenhum')
        await b.close()
asyncio.run(main())
