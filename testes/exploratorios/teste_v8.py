import asyncio, datetime, subprocess
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
async def toasts(pg): return await pg.eval_on_selector_all('.toast .texto','e=>e.map(x=>x.textContent)')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo', locale='pt-BR')
        pg=await ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        pg.on('console', lambda m: erros.append(m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        hoje=datetime.date.today(); h=hoje.isoformat(); seg=(hoje-datetime.timedelta(days=hoje.weekday())).isoformat()
        await pg.evaluate(SRV+".__agora=new Date(%d,%d,%d,8,0).getTime()"%(hoje.year,hoje.month-1,hoje.day))
        await pg.evaluate(chamar("""
          const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token;
          for (const [n,em] of [['Alfa','alfa@x.com'],['Beta Engenharia','beta@x.com']]) {
            w.__novaExecucao(); const e=w.criarEmpresa(tk,{nome:n,email:em,senha:'abc123'});
            w.__novaExecucao(); w.salvarPreco(tk,{empresa_id:e.empresa_id,valor_unitario:'18,50',data_inicio:'%s'});
            for (const [f,pa] of [['Carlos '+n,true],['Fernanda '+n,false],['Bruno '+n,false]]) { w.__novaExecucao(); w.salvarFuncionario(tk,{empresa_id:e.empresa_id,nome:f,pode_alterar_quentinha:pa}); }
          }
          const dia={acompanhamentos:['Arroz','Feijão'],saladas:['Alface'],guarnicoes:['Purê de batata'],proteinas:['Frango assado','Carne moída'],opcao_extra:'Ovo frito ou ovo cozido',observacoes:''};
          const vazio={acompanhamentos:[],saladas:[],guarnicoes:[],proteinas:[],opcao_extra:'',observacoes:''};
          w.__novaExecucao(); w.salvarSemanaCardapio(tk,'%s',[0,1,2,3,4].map(i=>i===%d?dia:vazio));
          w.__novaExecucao(); w.publicarSemanaCardapio(tk,'%s',true); return 1;""" % (h, seg, hoje.weekday(), seg)))
        pedido_empresa = lambda email, quantos, prot: chamar("""
          const tk=w.autenticarUsuario('%s','abc123').token; w.__novaExecucao();
          const est=w.obterPedidoEmpresa(tk); w.__novaExecucao();
          const itens=est.funcionarios.slice(0,%d).map((f,i)=>({funcionario_id:f.funcionario_id,proteina:'%s',itens_removidos:f.pode_alterar_quentinha?['Feijão']:[],observacao:f.pode_alterar_quentinha?'pouco sal':''}));
          return w.salvarPedidoEmpresa(tk,{itens:itens}).mensagem;""" % (email, quantos, prot))

        # ---------- 1. LOGIN SALVO ----------
        print('caixa marcada por padrão:', await pg.is_checked('#loginLembrar'))
        await pg.fill('#loginEmail','admin@rest.com'); await pg.fill('#loginSenha','senhaadmin12345'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#app:not([hidden])')
        salvo=await pg.evaluate("localStorage.getItem('logins_salvos')")
        print('login salvo no aparelho:', bool(salvo) and len(salvo), '| propriedades no servidor:', await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('p_login_')).length"))
        # fecha o navegador (sessionStorage some) e abre de novo
        await pg.evaluate("sessionStorage.clear()"); await pg.reload(); await pg.wait_for_selector('#app:not([hidden]), #telaLogin:not([hidden])')
        print('reabriu já conectado:', await pg.is_visible('#app'), '| chamadas:', await pg.evaluate("window.__chamadas"))
        # sessão de 6h expira no meio do uso -> renova sozinho
        await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('c_sessao_')).forEach(k=>localStorage.removeItem(k))")
        tokenAntes=await pg.evaluate("estado.token")
        await pg.click('#menuLateral [data-tela=empresas]'); await pg.wait_for_timeout(1500)
        print('sessão renovada sem sair:', await pg.is_visible('#app'), '| token trocou:', tokenAntes!=await pg.evaluate("estado.token"), '| lista empresas:', await pg.locator('[data-view=empresas] .principal').count())

        # ---------- 2. AO VIVO ----------
        await pg.click('#menuLateral [data-tela=pedidos]'); await pg.wait_for_selector('.prazo-pedidos')
        await pg.evaluate("verificarNovidades()"); await pg.wait_for_timeout(800)
        print('indicador:', await pg.inner_text('#indicadorAoVivo'))
        print('empresa envia:', await pg.evaluate(pedido_empresa('alfa@x.com',3,'Frango assado')))
        await pg.evaluate("aoVivo.ocupado=false; verificarNovidades()"); await pg.wait_for_timeout(1500)
        print('avisos:', await toasts(pg))
        print('cartões na tela:', await pg.locator('.cartao-pedido').count(), '| contador menu:', await pg.inner_text('#menuLateral [data-tela=pedidos] .contador-menu'), '| título:', await pg.title())
        await pg.click('.cartao-pedido button:has-text("Confirmar")'); await pg.wait_for_timeout(1200)
        await pg.evaluate("aoVivo.ocupado=false; verificarNovidades()"); await pg.wait_for_timeout(1200)
        print('após confirmar -> contador:', await pg.locator('#menuLateral [data-tela=pedidos] .contador-menu').count(), '| título:', await pg.title())
        await pg.click('#menuLateral [data-tela=inicio-admin]'); await pg.wait_for_timeout(800)
        print(await pg.evaluate(pedido_empresa('beta@x.com',2,'Carne moída')))
        await pg.evaluate("aoVivo.ocupado=false; verificarNovidades()"); await pg.wait_for_timeout(1500)
        print('início atualizado sozinho:', (await pg.inner_text('#pedidosHojeAdmin')).replace('\n',' | '))
        await pg.screenshot(path='v8/70_inicio_ao_vivo.png')

        # ---------- 3. PEDIDO DE CLIENTE ----------
        await pg.click('#menuLateral [data-tela=pedidos]'); await pg.wait_for_selector('.cartao-pedido')
        await pg.click('.cardapio-acoes button:has-text("Pedido de cliente")'); await pg.wait_for_selector('.form-pedido-cliente')
        await pg.click('.form-pedido-cliente button:has-text("Registrar pedido")'); await pg.wait_for_timeout(200)
        print('validação:', await pg.inner_text('#modalCorpo .mensagem-erro'))
        await pg.fill('.form-pedido-cliente input >> nth=0','Marcos da Oficina')
        await pg.type('.form-pedido-cliente input[type=tel]','11987654321')
        await pg.type('.form-pedido-cliente input[data-mascara=moeda]','2000')
        l1='.linha-cliente >> nth=0'
        await pg.select_option(l1+' >> select >> nth=0','Frango assado'); await pg.click(l1+' >> button[title=Aumentar]')
        await pg.click('.form-pedido-cliente button:has-text("Adicionar outra proteína")')
        l2='.linha-cliente >> nth=1'
        await pg.select_option(l2+' >> select >> nth=0','Carne moída'); await pg.select_option(l2+' >> select >> nth=1','Ovo frito')
        await pg.fill(l2+' >> input.observacao','sem feijão')
        await pg.fill('.form-pedido-cliente textarea','Retira às 11h30')
        print('total no formulário:', (await pg.inner_text('.total-cliente')).replace('\n',' | '))
        await pg.screenshot(path='v8/71_form_cliente.png')
        await pg.click('.form-pedido-cliente button:has-text("Registrar pedido")'); await pg.wait_for_timeout(1500)
        print('aviso:', (await toasts(pg))[-1])
        card='.cartao-pedido.cliente'
        print('cartão cliente:', (await pg.inner_text(card+' .cartao-pedido-topo')).replace('\n',' | '))
        print('produção:', (await pg.inner_text('.tabela-producao')).replace('\n',' | '))
        print('planilha PEDIDOS:', await pg.evaluate(SRV+".__abas.PEDIDOS.rows.filter(r=>!r[1]).map(r=>[r[5],r[7],r[8],r[12],r[13]])"))
        print('CONFIG preço:', await pg.evaluate(SRV+".__abas.CONFIG.rows.filter(r=>r[0]==='PRECO_CLIENTE_AVULSO').map(r=>r[1])"))
        await pg.screenshot(path='v8/72_pedidos_com_cliente.png', full_page=True)
        # editar: tira 1 de frango
        await pg.click(card+' button:has-text("Editar")'); await pg.wait_for_selector('.form-pedido-cliente')
        print('edição carregou linhas:', await pg.locator('.linha-cliente').count(), '| valor:', await pg.input_value('.form-pedido-cliente input[data-mascara=moeda]'))
        await pg.click('.linha-cliente >> nth=0 >> button[title=Diminuir]')
        await pg.click('.form-pedido-cliente button:has-text("Salvar alterações")'); await pg.wait_for_timeout(1500)
        print('após editar:', (await pg.inner_text(card+' .cartao-pedido-topo span')))
        # o restaurante não deve receber "novo pedido" do próprio cadastro
        n=len(await toasts(pg)); await pg.evaluate("aoVivo.ocupado=false; verificarNovidades()"); await pg.wait_for_timeout(1200)
        print('avisos extras após cadastro próprio:', (await toasts(pg))[n:])
        # recusar pedido de cliente via servidor deve falhar
        r=await pg.evaluate("""new Promise(res=>{const p=pedidosAdmin.dias[hojeTexto()].dia.pedidos.find(x=>x.cliente_avulso);google.script.run.withSuccessHandler(()=>res('RECUSOU')).withFailureHandler(e=>res(e.message)).recusarPedido(estado.token,p.pedido_id,'teste')})""")
        print('recusar cliente:', r)

        # ---------- 4. IMPRESSÃO ----------
        await pg.evaluate("window.print=function(){window.__imprimiu=(window.__imprimiu||0)+1;(window.__pilhas=window.__pilhas||[]).push(new Error().stack.split('\\n').slice(1,4).join(' / '))}")
        await pg.click('.cardapio-acoes button:has-text("Imprimir")'); await pg.wait_for_selector('.lista-impressao')
        print('opções de impressão:', await pg.locator('.opcao-impressao').count())
        await pg.screenshot(path='v8/73_modal_imprimir.png')
        await pg.click('#modalCorpo button[type=submit]'); await pg.wait_for_timeout(400)
        print('pilhas:', await pg.evaluate("window.__pilhas")); print('imprimiu:', await pg.evaluate("window.__imprimiu"), '| seções:', await pg.locator('#areaImpressao section').count(), '| novas folhas:', await pg.locator('#areaImpressao .imp-nova-folha').count())
        await pg.emulate_media(media='print')
        await pg.pdf(path='v8/impressao.pdf', format='A4', print_background=True)
        await pg.emulate_media(media='screen')
        # um pedido só
        await pg.evaluate("$('areaImpressao').innerHTML=''")
        await pg.click('.cartao-pedido >> nth=0 >> button:has-text("Imprimir")'); await pg.wait_for_timeout(300)
        print('imprimir um pedido -> seções:', await pg.locator('#areaImpressao section').count(), '| imprimiu:', await pg.evaluate("window.__imprimiu"))
        await pg.evaluate("$('areaImpressao').innerHTML=''")
        # cancelar pedido do cliente
        await pg.click(card+' button:has-text("Cancelar")'); await pg.click('#confirmacaoOk'); await pg.wait_for_timeout(1500)
        print('cliente cancelado:', await pg.inner_text(card+' .etiqueta'), '| produção total:', await pg.inner_text('.linha-producao.total strong'))

        # ---------- 5. EMPRESA AO VIVO ----------
        await pg.click('#botaoConta'); await pg.click('#menuConta [data-acao=sair]'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        print('após sair -> login salvo apagado:', await pg.evaluate("localStorage.getItem('logins_salvos')"), '| propriedades:', await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('p_login_')).length"))
        await pg.uncheck('#loginLembrar')
        await pg.fill('#loginEmail','beta@x.com'); await pg.fill('#loginSenha','abc123'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#pedidoHojeEmpresa .etiqueta')
        print('sem manter conectado -> salvo:', await pg.evaluate("localStorage.getItem('logins_salvos')"))
        await pg.evaluate("verificarNovidades()"); await pg.wait_for_timeout(1000)
        await pg.evaluate(chamar("""const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token; w.__novaExecucao();
           const d=w.listarPedidosDia(tk,'%s'); const p=d.pedidos.find(x=>x.nome_empresa==='Beta Engenharia'); w.__novaExecucao(); return w.confirmarPedido(tk,p.pedido_id).mensagem;""" % h))
        await pg.evaluate("aoVivo.ocupado=false; verificarNovidades()"); await pg.wait_for_timeout(1500)
        print('empresa avisada:', (await toasts(pg))[-1:], '| cartão:', (await pg.inner_text('#pedidoHojeEmpresa')).replace('\n',' | '))

        # ---------- 6. TROCA DE SENHA INVALIDA LOGIN SALVO ----------
        await pg.click('#botaoConta'); await pg.click('#menuConta [data-acao=sair]'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        await pg.check('#loginLembrar')
        await pg.fill('#loginEmail','alfa@x.com'); await pg.fill('#loginSenha','abc123'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#app:not([hidden])')
        await pg.evaluate(chamar("""const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token; w.__novaExecucao();
           const e=w.listarEmpresas(tk).find(x=>x.nome_empresa==='Alfa'); w.__novaExecucao(); const c=w.gerarConviteEmpresa(tk,e.empresa_id); w.__novaExecucao(); return !!w.concluirConvite(c.link.split('convite=')[1],'outra123',false).token;"""))
        await pg.evaluate("sessionStorage.clear()"); await pg.reload(); await pg.wait_for_selector('#app:not([hidden]), #telaLogin:not([hidden])')
        await pg.wait_for_timeout(500)
        print('após redefinir senha, pede login de novo:', await pg.is_visible('#telaLogin'), '| salvo apagado:', await pg.evaluate("localStorage.getItem('logins_salvos')"))

        # ---------- 7. CELULAR ----------
        await pg.set_viewport_size({'width':390,'height':844})
        await pg.fill('#loginEmail','admin@rest.com'); await pg.fill('#loginSenha','senhaadmin12345'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#app:not([hidden])')
        await pg.screenshot(path='v8/74_m_login_ok.png')
        await pg.evaluate(pedido_empresa('alfa@x.com',1,'Carne moída').replace("'abc123'","w.__senhaAlfa"))  if False else None
        await pg.click('#barraInferior [data-tela=pedidos]'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path='v8/75_m_pedidos.png', full_page=True)
        await pg.click('.cardapio-acoes button:has-text("Pedido de cliente")'); await pg.wait_for_selector('.form-pedido-cliente')
        await pg.click('.form-pedido-cliente button:has-text("Adicionar outra proteína")')
        await pg.screenshot(path='v8/76_m_form_cliente.png')
        await b.close()
asyncio.run(main())
print('ERROS:', erros)
