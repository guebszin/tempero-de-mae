import asyncio, datetime, os
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
ADM="const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token; w.__novaExecucao();"
os.makedirs('v13', exist_ok=True)
def ok(cond, texto):
    print(('OK   ' if cond else 'FALHA ')+texto)
    if not cond: erros.append('FALHA '+texto)

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
        inicio=hoje.replace(day=1)
        dias=[inicio+datetime.timedelta(days=i) for i in range((hoje-inicio).days+1)]
        dias=[d for d in dias if d.weekday()<5]
        seg0=dias[0]-datetime.timedelta(days=dias[0].weekday())
        await pg.evaluate(SRV+".__agora=new Date(%d,%d,%d,7,0).getTime()"%(dias[0].year,dias[0].month-1,dias[0].day))
        await pg.evaluate(chamar(ADM+"""
          for (const [n,em,preco] of [['Alfa','alfa@x.com','18,50'],['Beta Engenharia','beta@x.com','20,00']]) {
            w.__novaExecucao(); const e=w.criarEmpresa(tk,{nome:n,email:em,senha:'abc123',cnpj:'',endereco:'Rua das Flores, 10'});
            w.__novaExecucao(); w.salvarPreco(tk,{empresa_id:e.empresa_id,valor_unitario:preco,data_inicio:'%s'});
            for (const [f,pa,setor] of [['Carlos '+n,true,'Escritório'],['Fernanda '+n,false,'Obra'],['Bruno '+n,false,'Obra']]) { w.__novaExecucao(); w.salvarFuncionario(tk,{empresa_id:e.empresa_id,nome:f,setor:setor,matricula:String(Math.floor(Math.random()*900+100)),pode_alterar_quentinha:pa}); }
          }
          const dia={acompanhamentos:['Arroz','Feijão'],saladas:['Alface'],guarnicoes:['Purê'],proteinas:['Frango assado','Carne moída'],opcao_extra:'Ovo frito ou ovo cozido',observacoes:''};
          for (let s=0;s<5;s++){ const d=new Date(%d,%d,%d+7*s); const segunda=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
            w.__novaExecucao(); w.salvarSemanaCardapio(tk,segunda,[0,1,2,3,4].map(()=>dia)); w.__novaExecucao(); w.publicarSemanaCardapio(tk,segunda,true); }
          return 1;""" % (inicio.isoformat(), seg0.year, seg0.month-1, seg0.day)))
        for i,d in enumerate(dias):
            await pg.evaluate(SRV+".__agora=new Date(%d,%d,%d,8,0).getTime()"%(d.year,d.month-1,d.day))
            for email,qtd in [('alfa@x.com',3 if i%2==0 else 2),('beta@x.com',2)]:
                await pg.evaluate(chamar("""const tk=w.autenticarUsuario('%s','abc123').token; w.__novaExecucao();
                  const est=w.obterPedidoEmpresa(tk); w.__novaExecucao();
                  const itens=est.funcionarios.slice(0,%d).map((f,j)=>({funcionario_id:f.funcionario_id,proteina:j%%2?'Carne moída':'Frango assado',opcao_extra:'',itens_removidos:[],observacao:''}));
                  w.salvarPedidoEmpresa(tk,{itens:itens}); return 1;""" % (email,qtd)))
            if i%3: await pg.evaluate(chamar(ADM+"""const l=w.listarPedidosDia(tk,'%s'); for(const p of l.pedidos){ w.__novaExecucao(); w.confirmarPedido(tk,p.pedido_id);} return 1;""" % d.isoformat()))
        # cliente avulso não entra
        await pg.evaluate(chamar(ADM+"""return w.salvarPedidoCliente(tk,{data:'%s',cliente_nome:'Marcos',cliente_telefone:'',valor_unitario:'22,00',observacoes:'',itens:[{proteina:'Frango assado',quantidade:2}]}).mensagem;""" % dias[-1].isoformat()))

        # ---------- servidor: relógio hoje 10:00 (pedidos de hoje fechados) ----------
        await pg.evaluate(SRV+".__agora=new Date(%d,%d,%d,10,0).getTime()"%(hoje.year,hoje.month-1,hoje.day))
        painel=await pg.evaluate(chamar(ADM+"return w.obterPainelCobrancas(tk);"))
        alfa=[e for e in painel['empresas'] if e['nome_empresa']=='Alfa'][0]
        beta=[e for e in painel['empresas'] if e['nome_empresa']=='Beta Engenharia'][0]
        esperadoAlfa=sum(3 if i%2==0 else 2 for i in range(len(dias)))*18.5
        ok(abs(alfa['pendente']['valor']-esperadoAlfa)<0.01, 'a faturar Alfa = %s (esperado %s)'%(alfa['pendente']['valor'],esperadoAlfa))
        ok(abs(painel['totais']['a_faturar']-(esperadoAlfa+len(dias)*2*20))<0.01, 'a faturar total sem cliente avulso: %s'%painel['totais']['a_faturar'])
        ok(alfa['ciclo_cobranca']=='LIVRE' and alfa['dias_vencimento']==5, 'padrão: ciclo livre, 5 dias')
        print('   sugestão Alfa (livre):', alfa['sugestao'])

        r=await pg.evaluate(chamar(ADM+"return w.salvarConfigCobrancaEmpresa(tk,{empresa_id:'%s',ciclo_cobranca:'SEMANAL',dias_vencimento:'7'});"%alfa['empresa_id']))
        alfa=[e for e in r['painel']['empresas'] if e['nome_empresa']=='Alfa'][0]
        sem1_fim=(seg0+datetime.timedelta(days=6)).isoformat()
        ok(alfa['sugestao']['inicio']==seg0.isoformat() and alfa['sugestao']['fim']==sem1_fim and alfa['sugestao']['ciclo_completo'], 'semanal sugere %s a %s (pronta)'%(alfa['sugestao']['inicio'],alfa['sugestao']['fim']))
        await pg.evaluate(chamar(ADM+"return w.salvarConfigCobrancaEmpresa(tk,{empresa_id:'%s',ciclo_cobranca:'MENSAL',dias_vencimento:'10'});"%beta['empresa_id']))

        # fim = hoje antes do horário limite → erro
        await pg.evaluate(SRV+".__agora=new Date(%d,%d,%d,8,30).getTime()"%(hoje.year,hoje.month-1,hoje.day))
        msg=await pg.evaluate(chamar(ADM+"try{w.previaCobranca(tk,{empresa_id:'%s',inicio:'%s',fim:'%s'});return 'sem erro'}catch(e){return e.message}"%(beta['empresa_id'],inicio.isoformat(),hoje.isoformat())))
        ok('ainda podem ser alterados' in msg, 'bloqueia hoje antes do limite: '+msg[:70])
        await pg.evaluate(SRV+".__agora=new Date(%d,%d,%d,10,0).getTime()"%(hoje.year,hoje.month-1,hoje.day))
        msg=await pg.evaluate(chamar(ADM+"try{w.previaCobranca(tk,{empresa_id:'%s',inicio:'%s',fim:'%s'});return 'sem erro'}catch(e){return e.message}"%(beta['empresa_id'],inicio.isoformat(),(hoje+datetime.timedelta(days=1)).isoformat())))
        ok('só pode ir até hoje' in msg, 'bloqueia futuro')

        # ---------- TELA DO RESTAURANTE ----------
        await pg.fill('#loginEmail','admin@rest.com'); await pg.fill('#loginSenha','senhaadmin12345'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#app:not([hidden])')
        await pg.click('#menuLateral [data-tela=cobrancas]'); await pg.wait_for_selector('#cobrancasConteudo .indicador', timeout=10000)
        print('   indicadores:', [x.replace('\n',' ') for x in await pg.eval_on_selector_all('#cobrancasConteudo .indicador','e=>e.map(x=>x.innerText)')])
        await pg.screenshot(path='v13/c1_a_faturar.png', full_page=True)

        # Gerar pela sugestão da Alfa
        linha=pg.locator('#cobrancasArea .lista-linha', has_text='Alfa')
        await linha.locator('button:has-text("Gerar")').click()
        await pg.wait_for_selector('#modalCorpo .previa-total', timeout=8000)
        print('   prévia:', (await pg.inner_text('#modalCorpo .previa-total')).replace('\n',' | '), '| venc', await pg.input_value('#modalCorpo [name=vencimento]'))
        ok(await pg.input_value('#modalCorpo [name=vencimento]')==(hoje+datetime.timedelta(days=7)).isoformat(), 'vencimento sugerido = hoje + 7')
        await pg.screenshot(path='v13/c2_nova.png')
        await pg.fill('#modalCorpo [name=observacoes]','Semana 1')
        await pg.click('#modalCorpo [data-enviar]')
        await pg.wait_for_selector('#modalCorpo .valores-cobranca', timeout=8000)
        print('   detalhe:', (await pg.inner_text('#modalCorpo .valores-cobranca')).replace('\n',' | '))
        await pg.screenshot(path='v13/c3_detalhe.png')

        # Sobreposição
        msg=await pg.evaluate(chamar(ADM+"try{w.previaCobranca(tk,{empresa_id:'%s',inicio:'%s',fim:'%s'});return 'sem erro'}catch(e){return e.message}"%(alfa['empresa_id'],inicio.isoformat(),hoje.isoformat())))
        ok('sobrepõe' in msg, 'bloqueia sobreposição: '+msg[:60])

        # Pedido cobrado travado (recusar)
        msg=await pg.evaluate(chamar(ADM+"""const l=w.listarPedidosDia(tk,'%s'); const p=l.pedidos.find(x=>x.nome_empresa==='Alfa'); w.__novaExecucao();
          try{w.recusarPedido(tk,p.pedido_id,'teste de recusa');return 'sem erro '+p.cobrado}catch(e){return e.message+' cobrado='+p.cobrado}""" % dias[0].isoformat()))
        ok('já entrou numa cobrança' in msg and 'cobrado=true' in msg, 'recusar pedido cobrado bloqueado')

        # Pagamento parcial
        await pg.click('#modalCorpo button:has-text("Registrar pagamento")')
        await pg.wait_for_selector('#modalCorpo [name=valor]')
        valorPadrao=await pg.input_value('#modalCorpo [name=valor]')
        await pg.fill('#modalCorpo [name=valor]',''); await pg.type('#modalCorpo [name=valor]','10000')
        await pg.fill('#modalCorpo [name=comprovante]','E123PIX')
        await pg.click('#modalCorpo [data-enviar]')
        await pg.wait_for_selector('#modalCorpo .valores-cobranca', timeout=8000)
        etiqueta=await pg.inner_text('#modalCorpo .detalhe-cobranca-topo .etiqueta')
        ok(etiqueta=='Pago em parte', 'após R$100: %s (valor padrão era %s)'%(etiqueta,valorPadrao))
        # pagar mais que o saldo
        await pg.click('#modalCorpo button:has-text("Registrar pagamento")'); await pg.wait_for_selector('#modalCorpo [name=valor]')
        await pg.fill('#modalCorpo [name=valor]',''); await pg.type('#modalCorpo [name=valor]','999999')
        await pg.click('#modalCorpo [data-enviar]'); await pg.wait_for_timeout(900)
        erro=await pg.inner_text('#modalCorpo [data-erro]')
        ok('maior que o saldo' in erro, 'bloqueia pagamento acima do saldo')
        await pg.fill('#modalCorpo [name=valor]',''); await pg.click('#modalCorpo [data-cancelar]')
        # quitar
        await pg.click('#cobrancasArea button:has-text("Abrir")'); await pg.wait_for_selector('#modalCorpo .valores-cobranca')
        await pg.click('#modalCorpo button:has-text("Registrar pagamento")'); await pg.wait_for_selector('#modalCorpo [name=valor]')
        await pg.select_option('#modalCorpo [name=forma]','DINHEIRO')
        await pg.click('#modalCorpo [data-enviar]'); await pg.wait_for_selector('#modalCorpo .valores-cobranca', timeout=8000)
        ok(await pg.inner_text('#modalCorpo .detalhe-cobranca-topo .etiqueta')=='Paga', 'quitada')
        ok(await pg.locator('#modalCorpo button:has-text("Cancelar cobrança")').count()==0, 'sem botão cancelar quando há pagamentos')
        await pg.screenshot(path='v13/c4_paga.png')

        # Excluir um pagamento → volta a parcial
        await pg.evaluate("window.__conf=true")
        await pg.locator('#modalCorpo .lista-linha button[title^="Excluir"]').last.click()
        await pg.click('#confirmacaoOk'); await pg.wait_for_timeout(1500)
        ok(await pg.inner_text('#modalCorpo .detalhe-cobranca-topo .etiqueta')=='Pago em parte', 'excluir pagamento volta a parcial')

        # cancelar com pagamento → erro (servidor)
        cid=await pg.evaluate(chamar(ADM+"return w.obterPainelCobrancas(tk).cobrancas[0].cobranca_id"))
        msg=await pg.evaluate(chamar(ADM+"try{w.cancelarCobranca(tk,'%s','errado');return 'sem erro'}catch(e){return e.message}"%cid))
        ok('Exclua os pagamentos' in msg, 'cancelar com pagamento bloqueado')

        # PDF do extrato
        await pg.evaluate("window.print=function(){window.__imprimiu=(window.__imprimiu||0)+1}")
        await pg.click('#modalCorpo button:has-text("PDF")'); await pg.wait_for_timeout(300)
        print('   extrato seções:', await pg.locator('#areaImpressao section').count(), '| cabeçalho:', await pg.inner_text('#areaImpressao .imp-cabecalho strong'))
        await pg.emulate_media(media='print'); await pg.pdf(path='v13/extrato_admin.pdf', format='A4', print_background=True); await pg.emulate_media(media='screen')
        await pg.evaluate("$('areaImpressao').innerHTML=''")
        await pg.click('#modalFechar')

        # Dados para pagamento
        await pg.click('#cobrancasConteudo button:has-text("Dados para pagamento")')
        await pg.fill('#modalCorpo [name=instrucoes]','Pix (CNPJ): 12.345.678/0001-90\nFavorecido: Tempero de Mãe')
        await pg.click('#modalCorpo [data-enviar]'); await pg.wait_for_timeout(1200)
        ok(await pg.locator('#cobrancasConteudo .alerta.info').count()==0, 'alerta de dados some após salvar')

        # Beta: mensal, gerar pela tela usando a sugestão
        await pg.click('.aba-relatorio:has-text("A faturar")'); await pg.wait_for_timeout(200)
        await pg.locator('#cobrancasArea .lista-linha', has_text='Beta').locator('button:has-text("Gerar")').click()
        await pg.wait_for_selector('#modalCorpo .previa-total', timeout=8000)
        print('   Beta prévia:', await pg.input_value('#modalCorpo [name=inicio]'), '->', await pg.input_value('#modalCorpo [name=fim]'), '|', (await pg.inner_text('#modalCorpo .previa-total')).replace('\n',' '))
        await pg.click('#modalCorpo [data-enviar]'); await pg.wait_for_selector('#modalCorpo .valores-cobranca', timeout=8000)
        await pg.click('#modalFechar')
        await pg.click('.aba-relatorio:has-text("Cobranças")'); await pg.select_option('#cobrancasArea select >> nth=0','TODAS'); await pg.wait_for_timeout(200)
        await pg.screenshot(path='v13/c5_lista.png', full_page=True)
        print('   lista:', [x.replace('\n',' | ') for x in await pg.eval_on_selector_all('#cobrancasArea .lista-linha','e=>e.map(x=>x.innerText)')])

        # ---------- cancelar a Beta (sem pagamento) e gerar de novo ----------
        await pg.locator('#cobrancasArea .lista-linha', has_text='Beta').locator('button:has-text("Abrir")').click()
        await pg.wait_for_selector('#modalCorpo .valores-cobranca')
        await pg.click('#modalCorpo button:has-text("Cancelar cobrança")')
        await pg.fill('#modalCorpo [name=motivo]','Período errado'); await pg.click('#modalCorpo [data-enviar]')
        await pg.wait_for_selector('#modalCorpo .detalhe-cobranca-topo', timeout=8000); await pg.wait_for_timeout(300)
        ok(await pg.inner_text('#modalCorpo .detalhe-cobranca-topo .etiqueta')=='Cancelada', 'cobrança cancelada')
        painel=await pg.evaluate(chamar(ADM+"return w.obterPainelCobrancas(tk);"))
        beta=[e for e in painel['empresas'] if e['nome_empresa']=='Beta Engenharia'][0]
        ok(beta['pendente']['pedidos']==len(dias), 'pedidos da Beta liberados (%d)'%beta['pendente']['pedidos'])
        r=await pg.evaluate(chamar(ADM+"return w.gerarCobranca(tk,{empresa_id:'%s',inicio:'%s',fim:'%s',vencimento:'%s',observacoes:''}).mensagem"%(beta['empresa_id'],beta['sugestao']['inicio'],beta['sugestao']['fim'],(hoje+datetime.timedelta(days=10)).isoformat())))
        print('   regerada:', r)
        await pg.click('#modalFechar')

        # celular
        await pg.set_viewport_size({'width':390,'height':844}); await pg.wait_for_timeout(300)
        await pg.click('.aba-relatorio:has-text("A faturar")'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='v13/c6_m_faturar.png', full_page=True)
        await pg.set_viewport_size({'width':1440,'height':900})

        # ---------- PORTAL DA EMPRESA ----------
        await pg.evaluate("sair()"); await pg.wait_for_selector('#telaLogin:not([hidden])')
        await pg.fill('#loginEmail','beta@x.com'); await pg.fill('#loginSenha','abc123'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#app:not([hidden])')
        await pg.click('#menuLateral [data-tela=cobrancas-empresa]'); await pg.wait_for_selector('#cobrancasEmpresaConteudo .indicador', timeout=8000)
        print('   empresa indicadores:', [x.replace('\n',' ') for x in await pg.eval_on_selector_all('#cobrancasEmpresaConteudo .indicador','e=>e.map(x=>x.innerText)')])
        linhas=await pg.locator('#cobrancasEmpresaConteudo .lista-linha').count()
        ok(linhas==1, 'empresa vê só a própria cobrança ativa (%d)'%linhas)
        ok(await pg.locator('#cobrancasEmpresaConteudo .instrucoes-pagamento').count()==1, 'empresa vê dados para pagamento')
        await pg.screenshot(path='v13/c7_empresa.png', full_page=True)
        await pg.click('#cobrancasEmpresaConteudo button:has-text("Abrir")'); await pg.wait_for_selector('#modalCorpo .valores-cobranca')
        ok(await pg.locator('#modalCorpo button:has-text("Registrar pagamento")').count()==0, 'empresa não tem botões do restaurante')
        await pg.evaluate("window.print=function(){}")
        await pg.click('#modalCorpo button:has-text("PDF")'); await pg.wait_for_timeout(300)
        await pg.emulate_media(media='print'); await pg.pdf(path='v13/extrato_empresa.pdf', format='A4', print_background=True); await pg.emulate_media(media='screen')
        await pg.evaluate("$('areaImpressao').innerHTML=''")
        await pg.screenshot(path='v13/c8_empresa_detalhe.png')
        # empresa tentando ver cobrança de outra empresa
        msg=await pg.evaluate(chamar("const tk=w.autenticarUsuario('beta@x.com','abc123').token; w.__novaExecucao(); try{w.detalharCobranca(tk,'%s');return 'sem erro'}catch(e){return e.message}"%cid))
        ok(msg=='Cobrança não encontrada.', 'empresa não abre cobrança de outra')
        msg=await pg.evaluate(chamar("const tk=w.autenticarUsuario('beta@x.com','abc123').token; w.__novaExecucao(); try{w.obterPainelCobrancas(tk);return 'sem erro'}catch(e){return e.message}"))
        ok('somente ao restaurante' in msg, 'empresa não acessa painel do restaurante')

        # trava do pedido para a empresa: volta o relógio para 08:00 de um dia cobrado
        d=[x for x in dias if x.isoformat()<=beta['sugestao']['fim']][-1]
        await pg.evaluate(SRV+".__agora=new Date(%d,%d,%d,8,0).getTime()"%(d.year,d.month-1,d.day))
        msg=await pg.evaluate(chamar("const tk=w.autenticarUsuario('beta@x.com','abc123').token; w.__novaExecucao(); try{w.cancelarPedidoEmpresa(tk);return 'sem erro'}catch(e){return e.message}"))
        ok('já entrou numa cobrança' in msg, 'empresa não cancela pedido cobrado')
        await pg.evaluate(SRV+".__agora=0")

        await pg.set_viewport_size({'width':390,'height':844}); await pg.wait_for_timeout(300)
        await pg.screenshot(path='v13/c9_m_empresa_detalhe.png')

        print('ERROS:', erros if erros else 'nenhum')
        await b.close()
asyncio.run(main())
