import asyncio, datetime, os
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
ADM="const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token; w.__novaExecucao();"
EMP="const tk=w.autenticarUsuario('padaria.sol','minhasenha1').token; w.__novaExecucao();"
os.makedirs('v14', exist_ok=True)
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
        await pg.goto('http://localhost:8765/index.html'); await pg.evaluate("localStorage.clear(); sessionStorage.clear()")
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        hoje=datetime.date.today(); seg=hoje-datetime.timedelta(days=hoje.weekday())
        await pg.evaluate(SRV+".__agora=new Date(%d,%d,%d,8,0).getTime()"%(hoje.year,hoje.month-1,hoje.day))
        await pg.evaluate(chamar(ADM+"""const dia={acompanhamentos:['Arroz','Feijão'],saladas:['Alface'],guarnicoes:['Purê'],proteinas:['Frango assado','Carne moída'],opcao_extra:'Ovo frito ou ovo cozido',observacoes:''};
          w.salvarSemanaCardapio(tk,'%s',[0,1,2,3,4].map(()=>dia)); w.__novaExecucao(); w.publicarSemanaCardapio(tk,'%s',true); return 1;"""%(seg.isoformat(),seg.isoformat())))

        # ---------- 1. CADASTRO COM USUÁRIO E CONVITE ----------
        await pg.fill('#loginEmail','admin@rest.com'); await pg.fill('#loginSenha','senhaadmin12345'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#app:not([hidden])')
        await pg.click('#menuLateral [data-tela=empresas]'); await pg.wait_for_timeout(300)
        f='#modalCorpo form '
        await pg.click('#botaoNovaEmpresa'); await pg.wait_for_selector(f)
        await pg.type(f+'[name=nome]','Padaria Sol');
        ok(await pg.input_value(f+'[name=login]')=='padaria.sol', 'usuário sugerido pelo nome: '+await pg.input_value(f+'[name=login]'))
        await pg.fill(f+'[name=email]','contato@padariasol.com'); await pg.fill(f+'[name=responsavel]','Joana Lima'); await pg.fill(f+'[name=telefone]','21988887777')
        ok(await pg.locator(f+'[name=senha]').count()==0, 'formulário não pede senha')
        await pg.click(f+'[data-enviar]'); await pg.wait_for_selector('#modalCorpo [data-mensagem]')
        msg=await pg.input_value('#modalCorpo [data-mensagem]'); link=await pg.inner_text('#modalCorpo [data-link]')
        ok('Joana' in msg and 'padaria.sol' in msg and link in msg, 'mensagem do convite com nome, usuário e link')
        href=await pg.get_attribute('#modalCorpo [data-whatsapp]','href')
        ok(href.startswith('https://wa.me/5521988887777?text='), 'WhatsApp com o telefone da empresa')
        await pg.screenshot(path='v14/s1_convite_modal.png')
        codigo=link.split('convite=')[1]
        await pg.click('#modalCorpo [data-cancelar]'); await pg.wait_for_timeout(300)
        linha=await pg.inner_text('#listaEmpresas .lista-linha')
        ok('Aguardando 1º acesso' in linha and 'Usuário: padaria.sol' in linha, 'lista mostra usuário e aguardando 1º acesso')

        msg=await pg.evaluate(chamar("try{w.autenticarUsuario('padaria.sol','qualquer1');return 'entrou'}catch(e){return e.message}"))
        ok('ainda não foi ativado' in msg, 'login antes do convite: '+msg[:60])

        # funcionários
        await pg.evaluate(chamar(ADM+"""const e=w.listarEmpresas(tk).find(x=>x.nome_empresa==='Padaria Sol'); w.__novaExecucao();
          w.salvarPreco(tk,{empresa_id:e.empresa_id,valor_unitario:'19,90',data_inicio:'%s'});
          for (const [n,pa] of [['Ana Chefe',true],['Bruno Caixa',false],['Carla Forno',false]]) { w.__novaExecucao(); w.salvarFuncionario(tk,{empresa_id:e.empresa_id,nome:n,setor:'Loja',matricula:'',pode_alterar_quentinha:pa}); }
          return 1;"""%hoje.replace(day=1).isoformat()))

        # ---------- 2. PRIMEIRO ACESSO PELO LINK ----------
        await pg.evaluate("sair()"); await pg.wait_for_selector('#telaLogin:not([hidden])')
        await pg.goto('http://localhost:8765/index.html?convite='+codigo); await pg.wait_for_selector('#formConvite:not([hidden])', timeout=10000)
        ok(await pg.inner_text('#conviteUsuario')=='padaria.sol', 'tela de convite mostra o usuário')
        await pg.screenshot(path='v14/s2_primeiro_acesso.png')
        await pg.fill('#conviteSenha','minhasenha1'); await pg.fill('#conviteConfirmacao','outra'); await pg.click('#formConvite button[type=submit]')
        ok('não são iguais' in await pg.inner_text('#erroConvite'), 'confere a confirmação da senha')
        await pg.fill('#conviteConfirmacao','minhasenha1'); await pg.click('#formConvite button[type=submit]')
        await pg.wait_for_selector('#app:not([hidden])', timeout=10000)
        ok(await pg.evaluate("estado.usuario.perfil")=='empresa', 'entrou como empresa após criar a senha')
        ok(await pg.evaluate("!!window.__historicoLimpo"), 'tirou o convite do endereço')
        msg=await pg.evaluate(chamar("try{w.abrirConvite('%s');return 'aberto'}catch(e){return e.message}"%codigo))
        ok('não é mais válido' in msg, 'link usado não funciona de novo')
        msg=await pg.evaluate(chamar("try{w.autenticarUsuario('contato@padariasol.com','minhasenha1');return 'entrou'}catch(e){return e.message}"))
        ok('inválidos' in msg, 'empresa não entra pelo e-mail')
        ok(await pg.evaluate(chamar("return !!w.autenticarUsuario('PADARIA.SOL','minhasenha1').token")), 'entra pelo usuário (maiúsculas tanto faz)')

        # ---------- 3. ESCOLHA DA QUENTINHA (padrão: só quem personaliza) ----------
        await pg.click('#menuLateral [data-tela=pedidos-empresa]'); await pg.wait_for_selector('#listaPessoasPedido .pessoa-pedido')
        await pg.click('button:has-text("Marcar todos")'); await pg.wait_for_timeout(200)
        n_escolha=await pg.locator('#listaPessoasPedido .pessoa-pedido.marcada .escolha').count()
        n_dia=await pg.locator('#listaPessoasPedido .quentinha-do-dia').count()
        ok(n_dia==2, 'dois funcionários recebem a quentinha do dia (%d)'%n_dia)
        ok(await pg.locator('#secaoAvulsas').count()==1, 'avulsas liberadas por padrão')
        await pg.screenshot(path='v14/s3_pedido_padrao.png', full_page=True)
        # tenta enviar sem escolher a proteína da Ana
        await pg.click('#barraPedido button:has-text("Enviar pedido")'); await pg.wait_for_timeout(400)
        ok(await pg.locator('.pessoa-pedido.faltando').count()==1, 'só quem escolhe precisa escolher a proteína')
        await pg.locator('.pessoa-pedido', has_text='Ana Chefe').locator('button:has-text("Carne moída")').click()
        await pg.click('#barraPedido button:has-text("Enviar pedido")'); await pg.wait_for_timeout(1500)
        itens=await pg.evaluate(chamar(ADM+"const l=w.listarPedidosDia(tk,'%s'); return [l.pedidos[0].itens.map(i=>i.nome+':'+i.proteina), l.producao.por_proteina]"%hoje.isoformat()))
        print('   itens:', itens)
        ok('Bruno Caixa:Quentinha do dia' in itens[0] and 'Ana Chefe:Carne moída' in itens[0], 'restaurante vê quentinha do dia e a escolha da Ana')
        msg=await pg.evaluate(chamar(EMP+"""const est=w.obterPedidoEmpresa(tk); const b=est.funcionarios.find(f=>f.nome==='Bruno Caixa'); w.__novaExecucao();
          try{w.salvarPedidoEmpresa(tk,{itens:[{funcionario_id:b.funcionario_id,proteina:'Frango assado',observacao:'sem sal'}],base_atualizado_em:est.pedido.atualizado_em});return 'salvou'}catch(e){return e.message}"""))
        ok('não tem permissão' in msg, 'servidor recusa personalização de quem não pode')
        r=await pg.evaluate(chamar(EMP+"""const est=w.obterPedidoEmpresa(tk); const b=est.funcionarios.find(f=>f.nome==='Bruno Caixa'); w.__novaExecucao();
          w.salvarPedidoEmpresa(tk,{itens:[{funcionario_id:b.funcionario_id,proteina:'Frango assado'}],base_atualizado_em:est.pedido.atualizado_em}); w.__novaExecucao();
          return w.obterPedidoEmpresa(tk).pedido.itens.map(i=>i.proteina)"""))
        ok(r==['Quentinha do dia'], 'proteína enviada por quem não escolhe é ignorada')

        # ---------- 4. CONFIGURAÇÕES POR EMPRESA (proprietário) ----------
        await pg.evaluate("sair()"); await pg.wait_for_selector('#telaLogin:not([hidden])')
        await pg.fill('#loginEmail','admin@rest.com'); await pg.fill('#loginSenha','senhaadmin12345'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#app:not([hidden])')
        await pg.click('#menuLateral [data-tela=configuracoes]'); await pg.wait_for_selector('#configuracoesConteudo .cartao-config')
        await pg.screenshot(path='v14/s4_configuracoes.png', full_page=True)
        await pg.locator('#configuracoesConteudo .lista-linha', has_text='Padaria Sol').locator('button:has-text("Configurar")').click()
        await pg.wait_for_selector(f+'[name=usa_padrao]')
        await pg.uncheck(f+'[name=usa_padrao]'); await pg.uncheck(f+'[name=mostrar_precos]'); await pg.uncheck(f+'[name=cobrancas]'); await pg.uncheck(f+'[name=avulsas]')
        await pg.select_option(f+'[name=escolha]','NINGUEM')
        await pg.screenshot(path='v14/s5_config_empresa.png')
        await pg.click(f+'[data-enviar]'); await pg.wait_for_timeout(1200)
        txt=await pg.inner_text('#configuracoesConteudo .lista-linha:has-text("Padaria Sol")')
        ok('Própria' in txt and 'preços ocultos' in txt, 'empresa com configuração própria')

        est=await pg.evaluate(chamar(EMP+"return w.obterPedidoEmpresa(tk)"))
        ok(est['preco_unitario'] is None and est['pedido']['valor_total'] is None and est['tem_preco'], 'servidor não envia preços à empresa')
        ok(all(not f['escolhe'] for f in est['funcionarios']), 'ninguém escolhe no modo "Ninguém"')
        res=await pg.evaluate(chamar(EMP+"return w.obterResumoEmpresa(tk).preco_vigente"))
        ok(res is None, 'resumo da empresa sem preço')
        msg=await pg.evaluate(chamar(EMP+"try{w.listarCobrancasEmpresa(tk);return 'viu'}catch(e){return e.message}"))
        ok('não estão disponíveis' in msg, 'empresa sem cobrança não lista cobranças')
        painel=await pg.evaluate(chamar(ADM+"return w.obterPainelCobrancas(tk)"))
        ok('Padaria Sol' in painel['empresas_sem_cobranca'] and not any(e['nome_empresa']=='Padaria Sol' for e in painel['empresas']), 'cobrança desligada some de "A faturar"')
        msg=await pg.evaluate(chamar(EMP+"""const est=w.obterPedidoEmpresa(tk); w.__novaExecucao();
          try{w.salvarPedidoEmpresa(tk,{itens:[{funcionario_id:'',nome:'Visitante'}],base_atualizado_em:est.pedido.atualizado_em});return 'salvou'}catch(e){return e.message}"""))
        ok('avulsas não estão liberadas' in msg, 'avulsa bloqueada quando desligada')

        # ---------- 5. TELA DA EMPRESA SE ADAPTA (sem recarregar) ----------
        pg2=await ctx.new_page()
        pg2.on('pageerror', lambda e: erros.append('PAGEERROR2 '+str(e)))
        await pg2.goto('http://localhost:8765/index.html'); await pg2.wait_for_selector('#telaLogin:not([hidden]), #app:not([hidden])')
        if await pg2.is_visible('#app'): await pg2.evaluate("sair()"); await pg2.wait_for_selector('#telaLogin:not([hidden])')
        await pg2.evaluate(SRV+".__agora=new Date(%d,%d,%d,8,0).getTime()"%(hoje.year,hoje.month-1,hoje.day))
        await pg2.fill('#loginEmail','padaria.sol'); await pg2.fill('#loginSenha','minhasenha1'); await pg2.click('#formLogin button[type=submit]')
        await pg2.wait_for_selector('#app:not([hidden])')
        ok(await pg2.locator('#menuLateral [data-tela=cobrancas-empresa]').count()==0, 'menu da empresa sem Cobranças')
        rotulos=await pg2.eval_on_selector_all('#indicadoresEmpresa .indicador-rotulo','e=>e.map(x=>x.textContent)')
        ok('Valor da quentinha' not in rotulos, 'início da empresa sem valor da quentinha: %s'%rotulos)
        await pg2.click('#menuLateral [data-tela=pedidos-empresa]'); await pg2.wait_for_selector('#barraPedido')
        barra=await pg2.inner_text('#barraPedido')
        ok('R$' not in barra and await pg2.locator('#secaoAvulsas').count()==0, 'pedido sem valores e sem avulsas: '+barra.replace('\n',' | '))
        await pg2.screenshot(path='v14/s6_pedido_sem_preco.png', full_page=True)
        # proprietário volta ao padrão → menu da empresa atualiza no próximo aviso ao vivo
        await pg.locator('#configuracoesConteudo .lista-linha', has_text='Padaria Sol').locator('button:has-text("Configurar")').click()
        await pg.wait_for_selector(f+'[name=usa_padrao]'); await pg.check(f+'[name=usa_padrao]'); await pg.click(f+'[data-enviar]'); await pg.wait_for_timeout(1200)
        await pg2.evaluate("verificarNovidades()"); await pg2.wait_for_timeout(1500)
        ok(await pg2.locator('#menuLateral [data-tela=cobrancas-empresa]').count()==1, 'Cobranças volta ao menu da empresa sem recarregar')
        ok(await pg2.locator('#secaoAvulsas').count()==1, 'tela do pedido refeita com avulsas de volta')

        # ---------- 6. MÓDULO DE COBRANÇAS DESLIGADO NO GERAL ----------
        await pg.click('#configuracoesConteudo .cartao-config .opcao-checkbox input')
        await pg.click('#confirmacaoOk'); await pg.wait_for_timeout(1500)
        ok(await pg.locator('#menuLateral [data-tela=cobrancas]').count()==0, 'restaurante sem Cobranças no menu')
        msg=await pg.evaluate(chamar(ADM+"try{w.obterPainelCobrancas(tk);return 'abriu'}catch(e){return e.message}"))
        ok('desligado' in msg, 'painel de cobranças bloqueado no servidor')
        await pg2.evaluate("verificarNovidades()"); await pg2.wait_for_timeout(1500)
        ok(await pg2.locator('#menuLateral [data-tela=cobrancas-empresa]').count()==0, 'empresa perde Cobranças quando o módulo é desligado')
        await pg.click('#configuracoesConteudo .cartao-config .opcao-checkbox input'); await pg.wait_for_timeout(1500)
        ok(await pg.locator('#menuLateral [data-tela=cobrancas]').count()==1, 'religado: Cobranças volta')

        # ---------- 7. MENSAGEM DO CONVITE PERSONALIZADA ----------
        # Espera a tela de Configurações terminar de se redesenhar (depois de religar o módulo):
        # força a atualização automática agora, para ela não redesenhar a tela no meio do teste
        await pg.evaluate("""new Promise(function(fim){
            (function esperar(){ if (aoVivo.ocupado) return setTimeout(esperar,100); verificarNovidades();
              (function fimDaVerificacao(){ if (aoVivo.ocupado) return setTimeout(fimDaVerificacao,100); fim(); })(); })();
          })""")
        await pg.evaluate("""new Promise(function(fim){
            let antes=null, iguais=0, voltas=0;
            const t=setInterval(function(){
              const atual=document.querySelector('#configuracoesConteudo textarea');
              iguais = (atual && atual===antes && !document.querySelector('#configuracoesConteudo .spinner-pequeno')) ? iguais+1 : 0;
              antes=atual; voltas++;
              if (iguais>=6 || voltas>100) { clearInterval(t); fim(); }
            }, 250);
          })""")
        txt=pg.locator('#configuracoesConteudo textarea')
        await txt.fill('Oi {responsavel}, sem link aqui'); await pg.click('button:has-text("Salvar mensagem")')
        try: await pg.wait_for_function("document.getElementById('toasts').innerText.indexOf('precisa ter {link}')>=0", timeout=10000)
        except Exception: pass
        ok(await pg.locator('#toasts').inner_text()!='' and 'precisa ter {link}' in await pg.locator('#toasts').inner_text(), 'exige {link} na mensagem')
        await txt.fill('Oi {responsavel}! Crie sua senha da {empresa}: {link} (usuário {usuario})'); await pg.click('button:has-text("Salvar mensagem")')
        try: await pg.wait_for_function("(document.getElementById('servidor').contentWindow.localStorage.getItem('abas')||'').indexOf('Crie sua senha da {empresa}')>=0", timeout=10000)
        except Exception: pass
        c=await pg.evaluate(chamar(ADM+"const e=w.listarEmpresas(tk).find(x=>x.nome_empresa==='Padaria Sol'); w.__novaExecucao(); return w.gerarConviteEmpresa(tk,e.empresa_id)"))
        ok(c['nova_senha'] and 'nova senha' in c['mensagem'], 'empresa ativa recebe link de nova senha')
        await pg.evaluate(chamar(ADM+"""const e=w.listarEmpresas(tk).find(x=>x.nome_empresa==='Padaria Sol'); w.__novaExecucao(); w.criarEmpresa(tk,{nome:'Beta Ltda',email:'b@b.com',login:'beta',responsavel:'Rui'}); return 1"""))
        c=await pg.evaluate(chamar(ADM+"const e=w.listarEmpresas(tk).find(x=>x.nome_empresa==='Beta Ltda'); w.__novaExecucao(); return w.gerarConviteEmpresa(tk,e.empresa_id)"))
        ok(c['mensagem'].startswith('Oi Rui! Crie sua senha da Beta Ltda:'), 'convite usa a mensagem personalizada')
        msg=await pg.evaluate(chamar(ADM+"try{w.criarEmpresa(tk,{nome:'Outra',email:'o@o.com',login:'beta'});return 'criou'}catch(e){return e.message}"))
        ok('já existe' in msg, 'usuário repetido é recusado')
        msg=await pg.evaluate(chamar("const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token; w.__novaExecucao(); w.criarAdministrador(tk,{nome:'Caixa',email:'caixa@rest.com',senha:'caixa12345'}); w.__novaExecucao(); const t2=w.autenticarUsuario('caixa@rest.com','caixa12345').token; w.__novaExecucao(); try{w.obterConfiguracoes(t2);return 'viu'}catch(e){return e.message}"))
        ok('Somente o proprietário' in msg, 'outro administrador não vê as configurações')

        # ---------- 8. CELULAR ----------
        await pg2.set_viewport_size({'width':390,'height':844}); await pg2.wait_for_timeout(400)
        await pg2.screenshot(path='v14/s7_m_pedido.png', full_page=True)
        await pg2.evaluate("sair()"); await pg2.wait_for_selector('#telaLogin:not([hidden])')
        c2=await pg.evaluate(chamar(ADM+"const e=w.listarEmpresas(tk).find(x=>x.nome_empresa==='Beta Ltda'); w.__novaExecucao(); return w.gerarConviteEmpresa(tk,e.empresa_id).link"))
        await pg2.goto('http://localhost:8765/index.html?convite='+c2.split('convite=')[1]); await pg2.wait_for_selector('#formConvite:not([hidden])')
        await pg2.screenshot(path='v14/s8_m_convite.png')
        await pg2.goto('http://localhost:8765/index.html?convite=codigoinvalido1234567890'); await pg2.wait_for_selector('#conviteInvalido:not([hidden])')
        ok('não é mais válido' in await pg2.inner_text('#conviteInvalidoTexto'), 'link inválido mostra aviso')

        print('ERROS:', erros if erros else 'nenhum')
        await b.close()
asyncio.run(main())
