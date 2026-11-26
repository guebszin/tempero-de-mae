import asyncio, datetime
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
async def entrar(pg,email,senha):
    await pg.fill('#loginEmail',email); await pg.fill('#loginSenha',senha); await pg.click('#formLogin button[type=submit]')
    await pg.wait_for_selector('#app:not([hidden])'); await pg.wait_for_timeout(800)
async def sair(pg):
    await pg.click('#botaoConta'); await pg.click('#menuConta [data-acao=sair]')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg=await (await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo')).new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        pg.on('console', lambda m: erros.append(m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        hoje=datetime.date.today(); h=hoje.isoformat(); seg=(hoje-datetime.timedelta(days=hoje.weekday())).isoformat()
        await pg.evaluate(SRV+".__agora=new Date(%d,%d,%d,8,0).getTime()"%(hoje.year,hoje.month-1,hoje.day))
        await pg.evaluate(chamar("""const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token;
          w.__novaExecucao(); const e=w.criarEmpresa(tk,{nome:'Alfa',email:'alfa@x.com',senha:'abc123'});
          w.__novaExecucao(); w.salvarPreco(tk,{empresa_id:e.empresa_id,valor_unitario:'18,50',data_inicio:'%s'});
          w.__novaExecucao(); w.salvarFuncionario(tk,{empresa_id:e.empresa_id,nome:'Carlos Alfa',pode_alterar_quentinha:true});
          const dia={acompanhamentos:['Arroz'],saladas:[],guarnicoes:[],proteinas:['Frango','Carne'],opcao_extra:'',observacoes:''};
          const vazio={acompanhamentos:[],saladas:[],guarnicoes:[],proteinas:[],opcao_extra:'',observacoes:''};
          w.__novaExecucao(); w.salvarSemanaCardapio(tk,'%s',[0,1,2,3,4].map(i=>i===%d?dia:vazio));
          w.__novaExecucao(); w.publicarSemanaCardapio(tk,'%s',true); return 1;""" % (h,seg,hoje.weekday(),seg)))
        await pg.evaluate("window.__semRecarregar=1")
        # 1. admin entra, navega, sai
        await entrar(pg,'admin@rest.com','senhaadmin12345')
        for t in ['empresas','pedidos','funcionarios-admin','precos','inicio-admin']:
            await pg.click('#menuLateral [data-tela=%s]'%t); await pg.wait_for_timeout(600)
        print('admin -> empresas em memória:', await pg.evaluate("empresas.length"), '| login salvo:', bool(await pg.evaluate("localStorage.getItem('logins_salvos')")))
        await sair(pg)
        await pg.wait_for_selector('#telaLogin:not([hidden])', timeout=3000)
        print('1) login apareceu sem recarregar:', await pg.evaluate("window.__semRecarregar===1"), '| app oculto:', await pg.is_hidden('#app'),
              '| memória limpa:', await pg.evaluate("[empresas.length, resumoAdmin, estado.token, Object.keys(pedidosAdmin.dias).length]"),
              '| login salvo apagado:', await pg.evaluate("localStorage.getItem('logins_salvos')"), '| título:', await pg.title())
        await pg.wait_for_timeout(800)
        print('   servidor apagou o login salvo:', await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('p_login_')).length"))
        # 2. empresa entra no mesmo aparelho
        await entrar(pg,'alfa@x.com','abc123')
        print('2) empresa: menu:', await pg.evaluate("[...document.querySelectorAll('#menuLateral [data-tela]')].map(b=>b.dataset.tela).join(',')"),
              '| empresas (dado do restaurante) em memória:', await pg.evaluate("empresas.length"),
              '| tela:', await pg.evaluate("estado.telaAtual"), '| nome:', await pg.inner_text('#sidebarNome'))
        # 3. pedido com alteração não enviada
        await pg.click('#menuLateral [data-tela=pedidos-empresa]'); await pg.wait_for_selector('.pessoa-pedido')
        await pg.click('.pessoa-pedido input[type=checkbox]')
        await sair(pg); await pg.wait_for_selector('#confirmacaoFundo:not([hidden])')
        print('3) pergunta antes de sair:', await pg.inner_text('#confirmacaoTitulo'))
        await pg.click('#confirmacaoCancelar'); await pg.wait_for_timeout(300)
        print('   "Voltar" mantém conectado:', await pg.is_visible('#app'), '| marcação preservada:', await pg.evaluate("Object.keys(pedidoEmpresa.selecao).length"))
        await sair(pg); await pg.click('#confirmacaoOk'); await pg.wait_for_selector('#telaLogin:not([hidden])', timeout=3000)
        print('   saiu:', await pg.is_visible('#telaLogin'), '| pedido em memória:', await pg.evaluate("[pedidoEmpresa.estado, pedidoEmpresa.alterado, Object.keys(pedidoEmpresa.selecao).length]"))
        # 4. restaurante editando cardápio e saindo logo em seguida
        await entrar(pg,'admin@rest.com','senhaadmin12345')
        print('4) restaurante volta, contador pedidos ok, ao vivo ativo:', await pg.evaluate("!!aoVivo.temporizador"), '| tela:', await pg.evaluate("estado.telaAtual"))
        await pg.click('#menuLateral [data-tela=cardapios]'); await pg.wait_for_selector('.campo-item', timeout=8000)
        campo='.dia-cardapio >> nth=%d >> .campo-item >> nth=0' % hoje.weekday()
        await pg.click(campo); await pg.keyboard.type('Farofa de alho'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(100)
        print('   campo digitado:', await pg.evaluate("[...document.querySelectorAll('[data-view=cardapios] input.campo-item')].map(i=>i.value).filter(Boolean).join(' / ')"), '| alterado:', await pg.evaluate("cardapioAdmin.alterado"))
        await sair(pg); await pg.wait_for_selector('#telaLogin:not([hidden])', timeout=8000)
        salvo=await pg.evaluate(SRV+".__abas.CARDAPIOS.rows.map(r=>r.join(';')).join(' | ')")
        print('   planilha:', salvo[:300])
        print('   cardápio salvo antes de sair:', 'Farofa de alho' in salvo, '| login:', await pg.is_visible('#telaLogin'))
        await pg.screenshot(path='v8/80_login_apos_sair.png')
        # 5. celular
        await pg.set_viewport_size({'width':390,'height':844})
        await entrar(pg,'alfa@x.com','abc123')
        await pg.click('#botaoConta'); await pg.click('#menuConta [data-acao=sair]')
        await pg.wait_for_selector('#telaLogin:not([hidden])', timeout=3000)
        print('5) celular: login apareceu:', await pg.is_visible('#telaLogin'), '| sem recarregar:', await pg.evaluate("window.__semRecarregar===1"))
        await b.close()
asyncio.run(main())
print('ERROS:', erros)
