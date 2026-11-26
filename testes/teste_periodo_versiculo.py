import asyncio, json, os, datetime
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
ADM="const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token; w.__novaExecucao();"
os.makedirs('v24', exist_ok=True)
def ok(c,t):
    print(('OK   ' if c else 'FALHA ')+t)
    if not c: erros.append('FALHA '+t)

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo', locale='pt-BR')
        pg=await ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        pg.on('console', lambda m: erros.append(m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.evaluate("localStorage.clear()")
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        await pg.evaluate(chamar(ADM+"return 1"))
        await pg.reload(); await pg.wait_for_selector('#telaLogin:not([hidden])'); await pg.wait_for_timeout(1200)

        # ---------- VERSÍCULO DO DIA ----------
        ok(await pg.is_visible('#versiculoDia'), 'versículo aparece na tela de entrada')
        texto=await pg.inner_text('#versiculoTexto'); ref=await pg.inner_text('#versiculoReferencia')
        ok(len(texto)>10 and ':' in ref, 'versículo com texto e referência (%s — %s)'%(texto,ref))
        caixa=await pg.evaluate("(function(){const a=document.getElementById('versiculoDia').getBoundingClientRect(), b=document.querySelector('#telaLogin .login-card').getBoundingClientRect(); return [a.bottom<=b.top+1, Math.abs((a.left+a.right)/2-(b.left+b.right)/2)<2]})()")
        ok(all(caixa), 'versículo fica acima do quadro, centralizado')
        hoje=await pg.evaluate("versiculoDoDia(new Date())[1]")
        ok(hoje==ref, 'é o versículo de hoje')
        r=await pg.evaluate("""(function(){const vistos=new Set();let iguais=0,ant=null;const n=VERSICULOS.length;
            for(let i=0;i<n;i++){const d=new Date(2026,10,26+i,10);const v=versiculoDoDia(d)[1];vistos.add(v);if(v===ant)iguais++;ant=v;}
            const manha=versiculoDoDia(new Date(2026,10,26,0,5))[1], noite=versiculoDoDia(new Date(2026,10,26,23,55))[1], amanha=versiculoDoDia(new Date(2026,10,27,0,5))[1];
            return {n:n,vistos:vistos.size,iguais:iguais,mesmoDia:manha===noite,muda:manha!==amanha};})()""")
        ok(r['vistos']==r['n'], 'em %d dias passa por todos os %d versículos'%(r['n'],r['vistos']))
        ok(r['iguais']==0 and r['mesmoDia'] and r['muda'], 'mesmo versículo o dia todo e outro no dia seguinte')
        ok(await pg.evaluate("VERSICULOS.some(v=>v[1]==='1 Samuel 7:12' && v[0].indexOf('Até aqui nos ajudou o Senhor')===0)"), 'inclui 1 Samuel 7:12')
        await pg.screenshot(path='v24/01_login_versiculo.png')
        await pg.set_viewport_size({'width':390,'height':844}); await pg.wait_for_timeout(400)
        await pg.screenshot(path='v24/02_m_login_versiculo.png')
        caixa=await pg.evaluate("(function(){const a=document.getElementById('versiculoDia').getBoundingClientRect(), b=document.querySelector('#telaLogin .login-card').getBoundingClientRect(); return [a.bottom<=b.top+1, a.left>=0, a.right<=innerWidth]})()")
        ok(all(caixa), 'no celular também cabe acima do quadro')
        await pg.evaluate("document.documentElement.dataset.tema='escuro'"); await pg.wait_for_timeout(300)
        await pg.screenshot(path='v24/03_m_login_escuro.png')
        await pg.evaluate("delete document.documentElement.dataset.tema")
        await pg.set_viewport_size({'width':1440,'height':900})

        # ---------- DASHBOARD COM DATAS ----------
        await pg.fill('#loginEmail','admin@rest.com'); await pg.fill('#loginSenha','senhaadmin12345')
        await pg.click('#formLogin button[type=submit]'); await pg.wait_for_selector('#app:not([hidden])'); await pg.wait_for_timeout(800)
        # dados fictícios do modo teste
        await pg.click('#botaoConta'); await pg.click('#menuConta [data-acao=modo-teste]')
        await pg.wait_for_selector('#confirmacaoFundo:not([hidden])'); await pg.click('#confirmacaoOk')
        await pg.wait_for_selector('#faixaTeste:not([hidden])', timeout=30000); await pg.wait_for_timeout(1200)
        await pg.click('#menuLateral [data-tela=dashboard]'); await pg.wait_for_selector('.cartao-grafico', timeout=15000)
        abas=await pg.evaluate("[...document.querySelectorAll('#dashboardConteudo .aba-relatorio')].map(b=>b.textContent.trim())")
        ok('Escolher datas' in abas, 'aba "Escolher datas" (%s)'%abas)
        ok(not await pg.is_visible('.dashboard-datas'), 'datas escondidas até escolher a aba')
        await pg.click('#dashboardConteudo .aba-datas'); await pg.wait_for_timeout(300)
        ok(await pg.is_visible('#dashboardInicio') and await pg.is_visible('#dashboardFim'), 'aba mostra os campos De e Até')
        ok(await pg.evaluate("document.getElementById('dashboardInicio').type")=='date', 'campos de data abrem o calendário')
        pre=await pg.evaluate("[document.getElementById('dashboardInicio').value, document.getElementById('dashboardFim').value]")
        ok(pre[0] and pre[1], 'já vem preenchido com o período da tela %s'%pre)
        await pg.screenshot(path='v24/04_dashboard_escolher.png')

        hoje=datetime.date.fromisoformat(await pg.evaluate(chamar("return w.hojeTexto_('America/Sao_Paulo');")))
        ini=(hoje.replace(day=1)-datetime.timedelta(days=1)).replace(day=15)   # dia 15 do mês passado
        fim=ini+datetime.timedelta(days=2)
        # fim antes do início
        await pg.fill('#dashboardInicio', fim.isoformat()); await pg.fill('#dashboardFim', ini.isoformat())
        await pg.evaluate("document.getElementById('dashboardFim').value=%s"%json.dumps(ini.isoformat()))
        await pg.click('.dashboard-datas button[type=submit]'); await pg.wait_for_timeout(400)
        ok('depois da data inicial' in await pg.inner_text('#toasts'), 'avisa quando a data final é antes da inicial')
        # mais de 1 ano
        await pg.evaluate("document.getElementById('dashboardInicio').value='2024-01-01';document.getElementById('dashboardFim').value='2025-06-01'")
        await pg.click('.dashboard-datas button[type=submit]'); await pg.wait_for_timeout(400)
        ok('até 1 ano' in await pg.inner_text('#toasts'), 'limita a 1 ano')
        # período válido
        await pg.fill('#dashboardInicio', ini.isoformat()); await pg.fill('#dashboardFim', fim.isoformat())
        await pg.click('.dashboard-datas button[type=submit]')
        await pg.wait_for_function("document.querySelector('.dashboard-periodo') && document.querySelector('.dashboard-periodo').textContent.indexOf(%s)>=0"%json.dumps(ini.strftime('%d/%m')), timeout=15000)
        await pg.wait_for_timeout(500)
        periodo=await pg.inner_text('.dashboard-periodo')
        ok(ini.strftime('%d/%m') in periodo and fim.strftime('%d/%m') in periodo, 'mostra o período escolhido (%s)'%periodo)
        ok(await pg.evaluate("document.querySelector('.aba-datas').classList.contains('ativa')"), 'aba "Escolher datas" fica marcada')
        ok(await pg.is_visible('#dashboardInicio') and await pg.input_value('#dashboardInicio')==ini.isoformat(), 'datas continuam visíveis para ajustar')
        tk=await pg.evaluate("estado.token")
        d=await pg.evaluate(chamar("return w.obterDashboard(%s,'PERSONALIZADO',%s,%s);"%(json.dumps(tk),json.dumps(ini.isoformat()),json.dumps(fim.isoformat()))))
        rel=await pg.evaluate(chamar("w.validarSessao(%s); return w.montarRelatorio_(%s,%s,'',null).totais;"%(json.dumps(tk),json.dumps(ini.isoformat()),json.dumps(fim.isoformat()))))
        ok(d['inicio']==ini.isoformat() and d['fim']==fim.isoformat() and d['periodo']=='PERSONALIZADO', 'servidor usa as datas escolhidas')
        ok(abs(d['totais']['valor']-rel['valor'])<0.01 and d['totais']['quentinhas']==rel['quentinhas'], 'totais batem com o relatório do mesmo período (%s quentinhas)'%rel['quentinhas'])
        tela=await pg.evaluate("[...document.querySelectorAll('.grade-indicadores .indicador-valor, .grade-indicadores strong')].map(e=>e.textContent)")
        ok(any(str(rel['quentinhas']) in t for t in tela) or rel['quentinhas']==0, 'número de quentinhas na tela (%s)'%tela[:2])
        await pg.screenshot(path='v24/05_dashboard_periodo.png', full_page=True)

        # servidor recusa datas erradas
        r=await pg.evaluate(chamar("try{w.obterDashboard(%s,'PERSONALIZADO','2026-10-17','2026-10-15');return 'sem erro'}catch(e){return e.message}"%json.dumps(tk)))
        ok('depois da data inicial' in r, 'servidor recusa fim antes do início')
        r=await pg.evaluate(chamar("try{w.obterDashboard(%s,'PERSONALIZADO','2024-01-01','2025-12-31');return 'sem erro'}catch(e){return e.message}"%json.dumps(tk)))
        ok('1 ano' in r, 'servidor recusa mais de 1 ano')
        r=await pg.evaluate(chamar("try{w.obterDashboard(%s,'PERSONALIZADO','','');return 'sem erro'}catch(e){return e.message}"%json.dumps(tk)))
        ok('Escolha a data' in r, 'servidor exige as duas datas')

        # voltar a um período pronto
        await pg.click("#dashboardConteudo .aba-relatorio:has-text('Este mês')")
        await pg.wait_for_function("document.querySelector('.aba-relatorio.ativa') && document.querySelector('.aba-relatorio.ativa').textContent.trim()==='Este mês'", timeout=15000)
        await pg.wait_for_timeout(500)
        ok(not await pg.is_visible('.dashboard-datas'), 'ao voltar para "Este mês" as datas somem')
        # mesmo período outra vez vem do que já foi carregado
        n0=await pg.evaluate("window.__chamadas ? window.__chamadas.length : -1")
        await pg.click('#dashboardConteudo .aba-datas'); await pg.wait_for_timeout(200)
        await pg.fill('#dashboardInicio', ini.isoformat()); await pg.fill('#dashboardFim', fim.isoformat())
        await pg.click('.dashboard-datas button[type=submit]'); await pg.wait_for_timeout(800)
        ok(ini.strftime('%d/%m') in await pg.inner_text('.dashboard-periodo'), 'reabrir o mesmo período funciona')

        # dia único
        await pg.fill('#dashboardInicio', ini.isoformat()); await pg.fill('#dashboardFim', ini.isoformat())
        await pg.click('.dashboard-datas button[type=submit]'); await pg.wait_for_timeout(1500)
        d1=await pg.evaluate(chamar("return w.obterDashboard(%s,'PERSONALIZADO',%s,%s).totais;"%(json.dumps(tk),json.dumps(ini.isoformat()),json.dumps(ini.isoformat()))))
        ok(d1['dias']<=1, 'um dia só (%s dia com pedidos)'%d1['dias'])

        # celular e escuro
        await pg.set_viewport_size({'width':390,'height':844}); await pg.wait_for_timeout(500)
        await pg.screenshot(path='v24/06_m_dashboard_datas.png')
        larg=await pg.evaluate("(function(){const f=document.querySelector('.dashboard-datas').getBoundingClientRect();return f.right<=innerWidth+1})()")
        ok(larg, 'datas cabem na tela do celular')
        await pg.evaluate("document.documentElement.dataset.tema='escuro'"); await pg.wait_for_timeout(300)
        await pg.screenshot(path='v24/07_m_dashboard_escuro.png')

        print('ERROS:', erros or 'nenhum')
        await b.close()
asyncio.run(main())
