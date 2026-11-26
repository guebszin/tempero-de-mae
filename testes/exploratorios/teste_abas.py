import asyncio, datetime, json
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
async def nova(ctx):
    pg=await ctx.new_page()
    pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
    pg.on('console', lambda m: erros.append(m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
    await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden]), #app:not([hidden])')
    await pg.wait_for_timeout(600)
    return pg
async def entrar(pg,email,senha):
    await pg.fill('#loginEmail',email); await pg.fill('#loginSenha',senha); await pg.click('#formLogin button[type=submit]')
    await pg.wait_for_selector('#app:not([hidden])'); await pg.wait_for_timeout(800)
async def quem(pg): return await pg.evaluate("estado.usuario ? estado.usuario.email : (document.getElementById('telaLogin').hidden ? '?' : 'tela de login')")
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1300,'height':900}, timezone_id='America/Sao_Paulo')
        A=await nova(ctx)
        hoje=datetime.date.today(); h=hoje.isoformat(); seg=(hoje-datetime.timedelta(days=hoje.weekday())).isoformat()
        await A.evaluate(SRV+".__agora=new Date(%d,%d,%d,8,0).getTime()"%(hoje.year,hoje.month-1,hoje.day))
        await A.evaluate(chamar("""const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token;
          w.__novaExecucao(); const e=w.criarEmpresa(tk,{nome:'AFX',email:'afx@x.com',senha:'abc123'});
          w.__novaExecucao(); w.salvarPreco(tk,{empresa_id:e.empresa_id,valor_unitario:'18,50',data_inicio:'%s'});
          for (const n of ['Ana AFX','Bruno AFX','Caio AFX']) { w.__novaExecucao(); w.salvarFuncionario(tk,{empresa_id:e.empresa_id,nome:n}); }
          const dia={acompanhamentos:['Arroz'],saladas:[],guarnicoes:[],proteinas:['Frango','Carne'],opcao_extra:'',observacoes:''};
          const vazio={acompanhamentos:[],saladas:[],guarnicoes:[],proteinas:[],opcao_extra:'',observacoes:''};
          w.__novaExecucao(); w.salvarSemanaCardapio(tk,'%s',[0,1,2,3,4].map(i=>i===%d?dia:vazio));
          w.__novaExecucao(); w.publicarSemanaCardapio(tk,'%s',true); return 1;""" % (h,seg,hoje.weekday(),seg)))
        B=await nova(ctx)
        # 1. duas telas de login, cada uma entra numa conta
        await entrar(A,'admin@rest.com','senhaadmin12345')
        await B.wait_for_timeout(1500)
        print('1) depois de entrar na aba A -> A:', await quem(A), '| B:', await quem(B))
        await entrar(B,'afx@x.com','abc123')
        print('   depois de entrar na aba B -> A:', await quem(A), '| B:', await quem(B))
        print('   logins salvos no aparelho:', len(json.loads(await A.evaluate("localStorage.getItem('logins_salvos')"))))
        # 2. sessão de 6h vence nas duas abas -> cada uma renova na PRÓPRIA conta
        await A.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('c_sessao_')).forEach(k=>localStorage.removeItem(k))")
        rA=await A.evaluate("apiSessao('listarEmpresas').then(l=>'ok', e=>'ERRO '+e.message)")
        rB=await B.evaluate("apiSessao('obterPedidoEmpresa').then(l=>'ok', e=>'ERRO '+e.message)")
        print('2) renovação após 6h -> A:', rA, await quem(A), '| B:', rB, await quem(B))
        # 3. aba nova abre na última conta que entrou; sair numa aba não derruba a outra
        C=await nova(ctx)
        print('3) aba nova abriu em:', await quem(C))
        await C.click('#botaoConta'); await C.click('#menuConta [data-acao=sair]'); await C.wait_for_selector('#telaLogin:not([hidden])')
        print('   saiu da AFX na aba C -> login salvo do restaurante continua:', bool(await A.evaluate("loginSalvoDe(estado.usuario.usuario_id)")),
              '| A continua:', await quem(A))
        await C.close()
        # 4. cardápio aberto nas duas abas do restaurante
        A2=await nova(ctx)  # abre já no restaurante (último login salvo)
        print('4) aba nova depois de sair da AFX abriu em:', await quem(A2))
        if await quem(A2)!='admin@rest.com': await entrar(A2,'admin@rest.com','senhaadmin12345')
        for pg in (A,A2):
            await pg.click('#menuLateral [data-tela=cardapios]'); await pg.wait_for_selector('[data-view=cardapios] .campo-item', timeout=8000)
        campo='[data-view=cardapios] .dia-cardapio >> nth=%d >> .campo-item >> nth=0' % hoje.weekday()
        await A.click(campo); await A.keyboard.type('Farofa'); await A.keyboard.press('Enter'); await A.wait_for_timeout(2500)
        await A2.click(campo); await A2.keyboard.type('Vinagrete'); await A2.keyboard.press('Enter'); await A2.wait_for_timeout(3000)
        linha=await A.evaluate(SRV+".__abas.CARDAPIOS.rows.slice(1).map(r=>r[3]).join(' / ')")
        print('   planilha (acompanhamentos):', linha.replace('\n',', '))
        print('   aviso na aba desatualizada:', (await A2.eval_on_selector_all('.toast .texto','e=>e.map(x=>x.textContent)'))[-1:])
        print('   aba desatualizada recarregou a versão nova:', 'Farofa' in await A2.inner_text('[data-view=cardapios]'))
        await A2.close()
        # 5. pedido da empresa aberto em duas abas
        await B.click('#menuLateral [data-tela=pedidos-empresa]'); await B.wait_for_selector('.pessoa-pedido')
        B2=await nova(ctx)
        if await quem(B2)!='afx@x.com':
            await B2.click('#botaoConta'); await B2.click('#menuConta [data-acao=sair]'); await B2.wait_for_selector('#telaLogin:not([hidden])')
            await entrar(B2,'afx@x.com','abc123')
        await B2.click('#menuLateral [data-tela=pedidos-empresa]'); await B2.wait_for_selector('.pessoa-pedido')
        async def marcar_e_enviar(pg, n, prot):
            for i in range(n):
                await pg.click('.pessoa-pedido >> nth=%d >> input[type=checkbox]'%i)
                await pg.click('.pessoa-pedido >> nth=%d >> .escolha:has-text("%s")'%(i,prot))
            await pg.click('#barraPedido button:has-text("Enviar")'); await pg.wait_for_timeout(1500)
        await marcar_e_enviar(B,2,'Frango')
        await marcar_e_enviar(B2,1,'Carne')
        print('5) aviso na aba desatualizada:', (await B2.eval_on_selector_all('.toast .texto','e=>e.map(x=>x.textContent)'))[-1:])
        print('   planilha: quantidade do pedido =', await B.evaluate(SRV+".__abas.PEDIDOS.rows.slice(1).map(r=>r[5]+':'+r[8]).join(',')"))
        print('   aba desatualizada agora mostra:', await B2.inner_text('.barra-pedido-resumo strong'))
        await B2.screenshot(path='v8/90_conflito_pedido.png')
        await b.close()
asyncio.run(main())
print('ERROS:', erros)
