import asyncio, datetime, os
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
ADM="const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token; w.__novaExecucao();"
CAIXA="const tk=w.autenticarUsuario('caixa@rest.com','caixa12345').token; w.__novaExecucao();"
os.makedirs('v17', exist_ok=True)
def ok(c,t):
    print(('OK   ' if c else 'FALHA ')+t)
    if not c: erros.append('FALHA '+t)
def relogio(d,h=8): return SRV+".__agora=new Date(%d,%d,%d,%d,0).getTime()"%(d.year,d.month-1,d.day,h)
def tenta(js): return "try{"+js+";return 'sem erro'}catch(e){return e.message}"

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo')
        pg=await ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        pg.on('console', lambda m: erros.append(m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.evaluate("localStorage.clear()")
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')

        hoje=datetime.date.today()
        dias=[hoje-datetime.timedelta(days=i) for i in range(21,0,-1)]
        dias=[d for d in dias if d.weekday()<5][:5]
        seg0=dias[0]-datetime.timedelta(days=dias[0].weekday())
        await pg.evaluate(relogio(dias[0],7))
        await pg.evaluate(chamar(ADM+"""
          const e=w.criarEmpresa(tk,{nome:'Alfa',email:'alfa@x.com',senha:'abc123',cnpj:'',endereco:'Rua A, 1'});
          w.__novaExecucao(); w.salvarPreco(tk,{empresa_id:e.empresa_id,valor_unitario:'20,00',data_inicio:'%s'});
          for (const [f,setor,mat] of [['Joana','Cozinha','101'],['Pedro','Loja','102'],['Rita','Loja','103']]) { w.__novaExecucao(); w.salvarFuncionario(tk,{empresa_id:e.empresa_id,nome:f,setor:setor,matricula:mat,pode_alterar_quentinha:true}); }
          const dia={acompanhamentos:['Arroz'],saladas:['Alface'],guarnicoes:['Purê'],proteinas:['Frango assado','Carne moída'],opcao_extra:'',observacoes:''};
          for (let s=0;s<6;s++){ const d=new Date(%d,%d,%d+7*s); const segunda=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
            w.__novaExecucao(); w.salvarSemanaCardapio(tk,segunda,[0,1,2,3,4].map(()=>dia)); w.__novaExecucao(); w.publicarSemanaCardapio(tk,segunda,true); }
          w.__novaExecucao(); w.criarAdministrador(tk,{nome:'Caixa',email:'caixa@rest.com',senha:'caixa12345'});
          return 1;""" % ((dias[0]-datetime.timedelta(days=1)).isoformat(), seg0.year, seg0.month-1, seg0.day)))
        PEDIR="""const tk=w.autenticarUsuario('alfa@x.com','abc123').token; w.__novaExecucao();
          const est=w.obterPedidoEmpresa(tk); w.__novaExecucao();
          const itens=est.funcionarios.map(f=>({funcionario_id:f.funcionario_id,proteina:'Frango assado',opcao_extra:'',itens_removidos:[],observacao:''}));
          w.salvarPedidoEmpresa(tk,{itens:itens}); return 1;"""
        for i,d in enumerate(dias):
            await pg.evaluate(relogio(d,8))
            await pg.evaluate(chamar(PEDIR))
            if i==1:  # empresa cancela o pedido deste dia
                await pg.evaluate(chamar("const tk=w.autenticarUsuario('alfa@x.com','abc123').token; w.__novaExecucao(); w.cancelarPedidoEmpresa(tk); return 1;"))
        # cliente avulso cancelado no último dia
        await pg.evaluate(chamar(ADM+"const r=w.salvarPedidoCliente(tk,{data:'%s',cliente_nome:'Marcos',cliente_telefone:'',valor_unitario:'22,00',observacoes:'',itens:[{proteina:'Frango assado',quantidade:2}]}); w.__novaExecucao(); const l=w.listarPedidosDia(tk,'%s'); const pc=l.pedidos.find(p=>p.cliente_avulso); w.__novaExecucao(); w.cancelarPedidoCliente(tk,pc.pedido_id); return 1;"%(dias[-1].isoformat(),dias[-1].isoformat())))
        await pg.evaluate(relogio(hoje,10))
        eid=await pg.evaluate(chamar(ADM+"return w.listarEmpresas(tk)[0].empresa_id;"))
        funcs=await pg.evaluate(chamar(ADM+"return Object.fromEntries(w.listarFuncionarios(tk,'%s').map(f=>[f.nome,f.funcionario_id]));"%eid))
        pedidos=await pg.evaluate("(function(w){return w.__abas.PEDIDOS.rows.slice(1).map(r=>[r[0],r[5],String(r[3]).slice(0,10)])})(%s)"%SRV)
        canc=[x for x in pedidos if x[1]=='CANCELADO']; ativos=[x for x in pedidos if x[1]!='CANCELADO']
        ok(len(canc)==2, 'dois pedidos cancelados para o teste (%d)'%len(canc))

        # cobranças: nº1 cancelada, nº2 ativa
        cob=await pg.evaluate(chamar(ADM+"const a=w.gerarCobranca(tk,{empresa_id:'%s',inicio:'%s',fim:'%s',vencimento:'%s',observacoes:''}); w.__novaExecucao(); const ida=(a.cobranca&&a.cobranca.cobranca_id)||a.cobranca_id; w.cancelarCobranca(tk,ida,'erro de período'); w.__novaExecucao(); const b=w.gerarCobranca(tk,{empresa_id:'%s',inicio:'%s',fim:'%s',vencimento:'%s',observacoes:''}); return [ida,(b.cobranca&&b.cobranca.cobranca_id)||b.cobranca_id];"%(eid,dias[0].isoformat(),dias[2].isoformat(),(hoje+datetime.timedelta(days=5)).isoformat(),eid,dias[0].isoformat(),dias[2].isoformat(),(hoje+datetime.timedelta(days=5)).isoformat())))
        cob_canc,cob_ativa=cob

        rel_antes=await pg.evaluate(chamar(ADM+"return w.gerarRelatorio(tk,{inicio:'%s',fim:'%s',empresa:''});"%(dias[0].isoformat(),hoje.isoformat())))

        # ---------- administrador comum: bloqueado em tudo ----------
        for nome,js in [('pedido',"w.excluirPedidoCancelado(tk,'%s')"%canc[0][0]),('cobrança',"w.excluirCobrancaCancelada(tk,'%s')"%cob_canc),
                        ('funcionário',"w.excluirFuncionario(tk,'%s')"%funcs['Pedro']),('limpeza pedidos',"w.limparPedidosCancelados(tk)"),
                        ('limpeza cobranças',"w.limparCobrancasCanceladas(tk)"),('resumo',"w.obterResumoLimpeza(tk)")]:
            m=await pg.evaluate(chamar(CAIXA+tenta(js)))
            ok('Somente o proprietário' in m, 'administrador comum bloqueado: '+nome)

        # ---------- regras do proprietário ----------
        m=await pg.evaluate(chamar(ADM+tenta("w.excluirPedidoCancelado(tk,'%s')"%ativos[0][0])))
        ok('Só é possível apagar pedidos cancelados' in m, 'pedido não cancelado não pode ser apagado')
        m=await pg.evaluate(chamar(ADM+tenta("w.excluirCobrancaCancelada(tk,'%s')"%cob_ativa)))
        ok('Só é possível apagar cobranças canceladas' in m, 'cobrança ativa não pode ser apagada')
        m=await pg.evaluate(chamar(ADM+tenta("w.excluirFuncionario(tk,'%s')"%funcs['Pedro'])))
        ok('Inative o funcionário' in m, 'funcionário ativo não pode ser apagado')

        # ---------- tela: pedidos cancelados ----------
        await pg.fill('#loginEmail','admin@rest.com'); await pg.fill('#loginSenha','senhaadmin12345'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#app:not([hidden])')
        await pg.evaluate("abrirPedidosDia('%s')"%dias[1].isoformat()) if False else None
        await pg.click('#menuLateral [data-tela=pedidos]'); await pg.wait_for_timeout(600)
        await pg.evaluate("abrirPedidosDia('%s')"%dias[1].isoformat()); await pg.wait_for_timeout(800)
        cart='.cartao-pedido:has(.etiqueta:has-text("Cancelado"))'
        ok(await pg.locator(cart+' button:has-text("Apagar")').count()==1, 'cartão cancelado mostra Apagar')
        ok(await pg.locator('.cartao-pedido:not(:has(.etiqueta:has-text("Cancelado"))) button:has-text("Apagar")').count()==0, 'pedidos válidos não têm Apagar')
        await pg.screenshot(path='v17/l1_pedido_cancelado.png')
        await pg.click(cart+' button:has-text("Apagar")'); await pg.wait_for_selector('#confirmacaoFundo:not([hidden])')
        await pg.click('#confirmacaoOk'); await pg.wait_for_timeout(800)
        ok(await pg.locator(cart).count()==0, 'pedido cancelado some da lista do dia')
        n=await pg.evaluate("(function(w){return w.__abas.PEDIDOS.rows.filter(r=>r[5]==='CANCELADO').length})(%s)"%SRV)
        ok(n==1, 'sobrou só o cancelado do cliente')

        # ---------- tela: cobrança cancelada ----------
        await pg.click('#menuLateral [data-tela=cobrancas]'); await pg.wait_for_timeout(800)
        await pg.evaluate("abrirDetalheCobranca('%s')"%cob_canc); await pg.wait_for_selector('#modalCorpo .detalhe-cobranca-topo')
        await pg.wait_for_timeout(300)
        ok(await pg.locator('#modalCorpo button:has-text("Apagar cobrança")').count()==1, 'cobrança cancelada mostra Apagar cobrança')
        await pg.click('#modalCorpo button:has-text("Apagar cobrança")'); await pg.wait_for_selector('#confirmacaoFundo:not([hidden])')
        await pg.click('#confirmacaoOk'); await pg.wait_for_timeout(800)
        rest=await pg.evaluate("(function(w){return w.__abas.COBRANCAS.rows.slice(1).map(r=>r[0])})(%s)"%SRV)
        ok(cob_canc not in rest and cob_ativa in rest, 'cobrança cancelada apagada, a ativa ficou')
        await pg.evaluate("abrirDetalheCobranca('%s')"%cob_ativa); await pg.wait_for_selector('#modalCorpo .detalhe-cobranca-topo'); await pg.wait_for_timeout(300)
        ok(await pg.locator('#modalCorpo button:has-text("Apagar cobrança")').count()==0, 'cobrança ativa não tem Apagar')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        # número não se repete: cancela nº2, apaga, gera de novo → nº3
        nums=await pg.evaluate(chamar(ADM+"w.cancelarCobranca(tk,'%s','teste'); w.__novaExecucao(); w.excluirCobrancaCancelada(tk,'%s'); w.__novaExecucao(); const c=w.gerarCobranca(tk,{empresa_id:'%s',inicio:'%s',fim:'%s',vencimento:'%s',observacoes:''}); w.__novaExecucao(); return w.obterPainelCobrancas(tk).cobrancas.map(x=>x.numero);"%(cob_ativa,cob_ativa,eid,dias[0].isoformat(),dias[2].isoformat(),(hoje+datetime.timedelta(days=5)).isoformat())))
        ok(nums==[3], 'número de cobrança apagada não se repete: %s'%nums)

        # ---------- tela: funcionário ----------
        await pg.evaluate(chamar(ADM+"w.alterarStatusFuncionario(tk,'%s',false); return 1;"%funcs['Pedro']))
        await pg.click('#menuLateral [data-tela=funcionarios-admin]'); await pg.wait_for_timeout(600)
        await pg.evaluate("delete funcionariosPorEmpresa['%s']; carregarFuncionariosAdmin()"%eid); await pg.wait_for_timeout(700)
        await pg.select_option('#filtroStatusFuncionariosAdmin','TODOS') if await pg.locator('#filtroStatusFuncionariosAdmin option[value=TODOS]').count() else None
        await pg.wait_for_timeout(300)
        linhaPedro='#listaFuncionariosAdmin .lista-linha:has-text("Pedro")'
        ok(await pg.locator(linhaPedro+' button:has-text("Apagar")').count()==1, 'funcionário inativo mostra Apagar')
        ok(await pg.locator('#listaFuncionariosAdmin .lista-linha:has-text("Joana") button:has-text("Apagar")').count()==0, 'ativo não mostra Apagar')
        await pg.click(linhaPedro+' button:has-text("Apagar")'); await pg.wait_for_selector('#confirmacaoFundo:not([hidden])')
        txt=await pg.inner_text('#confirmacaoTexto')
        ok('quentinha(s) dele continuam nos relatórios' in txt, 'confirmação avisa que o histórico fica: '+txt[:80])
        await pg.screenshot(path='v17/l2_funcionario.png')
        await pg.click('#confirmacaoOk'); await pg.wait_for_timeout(800)
        ok(await pg.locator(linhaPedro).count()==0, 'Pedro some da lista')
        arq=await pg.evaluate("(function(w){return w.__abas.FUNCIONARIOS_EXCLUIDOS.rows.slice(1)})(%s)"%SRV)
        ok(len(arq)==1 and arq[0][2]=='Pedro' and arq[0][4]=='Loja', 'Pedro guardado no arquivo')
        rel=await pg.evaluate(chamar(ADM+"return w.gerarRelatorio(tk,{inicio:'%s',fim:'%s',empresa:''});"%(dias[0].isoformat(),hoje.isoformat())))
        pa=[x for x in rel_antes['por_funcionario'] if x['nome']=='Pedro']; pd=[x for x in rel['por_funcionario'] if x['nome']=='Pedro']
        ok(pd and pa and pd[0]['quentinhas']==pa[0]['quentinhas'] and pd[0]['setor']=='Loja', 'relatório mantém Pedro com setor e quentinhas')
        ok(rel['totais']['quentinhas']==rel_antes['totais']['quentinhas'], 'total de quentinhas igual')
        m=await pg.evaluate(chamar(ADM+"w.salvarFuncionario(tk,{empresa_id:'%s',nome:'Novo',setor:'Loja',matricula:'102',pode_alterar_quentinha:false}); return 'ok';"%eid))
        ok(m=='ok', 'matrícula do apagado pode ser reutilizada')

        # ---------- Configurações: limpeza em lote ----------
        await pg.click('#menuLateral [data-tela=configuracoes]'); await pg.wait_for_selector('.linha-limpeza')
        t=await pg.inner_text('.linha-limpeza:has-text("Pedidos cancelados")')
        ok('1 para apagar' in t, 'limpeza mostra 1 pedido cancelado')
        ok(await pg.locator('.linha-limpeza:has-text("Cobranças canceladas") button').is_disabled(), 'cobranças: nada para apagar, botão desligado')
        await pg.screenshot(path='v17/l3_limpeza.png', full_page=True)
        await pg.click('.linha-limpeza:has-text("Pedidos cancelados") button'); await pg.wait_for_selector('#confirmacaoFundo:not([hidden])')
        await pg.click('#confirmacaoOk'); await pg.wait_for_timeout(800)
        ok('Nada para apagar' in await pg.inner_text('.linha-limpeza:has-text("Pedidos cancelados")'), 'pedidos cancelados apagados em lote')
        n=await pg.evaluate("(function(w){return [w.__abas.PEDIDOS.rows.filter(r=>r[5]==='CANCELADO').length, w.__abas.PEDIDOS.rows.length-1]})(%s)"%SRV)
        ok(n[0]==0 and n[1]==len(ativos), 'só os válidos ficaram (%s)'%n)
        logs=await pg.evaluate("(function(w){return w.__abas.LOGS.rows.map(r=>r[3])})(%s)"%SRV)
        ok(all(x in logs for x in ['APAGAR_PEDIDO_CANCELADO','APAGAR_COBRANCA_CANCELADA','APAGAR_FUNCIONARIO','LIMPAR_PEDIDOS_CANCELADOS']), 'tudo registrado nos logs')

        # ---------- tela do administrador comum: sem botões ----------
        await pg.evaluate("localStorage.clear()")
        c2=await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo')
        await b.close()
    print('ERROS:', erros if erros else 'nenhum')
    if erros: raise SystemExit(1)
asyncio.run(main())
