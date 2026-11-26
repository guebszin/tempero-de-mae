import asyncio, datetime, os
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
ADM="const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token; w.__novaExecucao();"
os.makedirs('v20', exist_ok=True)
def ok(c,t):
    print(('OK   ' if c else 'FALHA ')+t)
    if not c: erros.append('FALHA '+t)
def relogio(d,h=8): return SRV+".__agora=new Date(%d,%d,%d,%d,0).getTime()"%(d.year,d.month-1,d.day,h)
def tenta(js): return "try{"+js+";return 'sem erro'}catch(e){return e.message}"
async def entrar(pg,u,s):
    await pg.fill('#loginEmail',u); await pg.fill('#loginSenha',s); await pg.click('#formLogin button[type=submit]')
    await pg.wait_for_selector('#app:not([hidden]), #erroLogin:not([hidden])'); await pg.wait_for_timeout(600)
async def menu(pg): return await pg.evaluate("[...document.querySelectorAll('#menuLateral [data-tela]')].map(b=>b.dataset.tela)")

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo', locale='pt-BR')
        pg=await ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        pg.on('console', lambda m: erros.append(m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.evaluate("localStorage.clear()")
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')

        # ---------- dados: 3 empresas, 8 dias de pedidos ----------
        hoje=datetime.date.today()
        dias=[hoje-datetime.timedelta(days=i) for i in range(20,0,-1)]
        dias=[d for d in dias if d.weekday()<5][:8]
        seg0=dias[0]-datetime.timedelta(days=dias[0].weekday())
        await pg.evaluate(relogio(dias[0],7))
        await pg.evaluate(chamar(ADM+"""
          const nomes=[['Alfa','alfa@x.com','20,00'],['Beta','beta@x.com','18,00'],['Gama','gama@x.com','22,00']];
          for (const [n,em,pr] of nomes) {
            w.__novaExecucao(); const e=w.criarEmpresa(tk,{nome:n,email:em,senha:'abc123',cnpj:'',endereco:'Rua A'});
            w.__novaExecucao(); w.salvarPreco(tk,{empresa_id:e.empresa_id,valor_unitario:pr,data_inicio:'%s'});
            for (let i=0;i<3;i++) { w.__novaExecucao(); w.salvarFuncionario(tk,{empresa_id:e.empresa_id,nome:'Pessoa '+i+' '+n,setor:'S',matricula:String(Math.random()).slice(2,8),pode_alterar_quentinha:true}); }
          }
          const dia={acompanhamentos:['Arroz'],saladas:['Alface'],guarnicoes:['Purê'],proteinas:['Frango assado','Carne moída','Peixe'],opcao_extra:'',observacoes:''};
          for (let s=0;s<5;s++){ const d=new Date(%d,%d,%d+7*s); const segunda=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
            w.__novaExecucao(); w.salvarSemanaCardapio(tk,segunda,[0,1,2,3,4].map(()=>dia)); w.__novaExecucao(); w.publicarSemanaCardapio(tk,segunda,true); }
          return 1;""" % ((dias[0]-datetime.timedelta(days=1)).isoformat(), seg0.year, seg0.month-1, seg0.day)))
        for i,d in enumerate(dias):
            await pg.evaluate(relogio(d,8))
            for j,em in enumerate(['alfa@x.com','beta@x.com','gama@x.com']):
                await pg.evaluate(chamar("""const tk=w.autenticarUsuario('%s','abc123').token; w.__novaExecucao();
                  const est=w.obterPedidoEmpresa(tk); w.__novaExecucao();
                  const prot=['Frango assado','Carne moída','Peixe'];
                  const itens=est.funcionarios.slice(0,%d).map((f,k)=>({funcionario_id:f.funcionario_id,proteina:prot[(k+%d)%%3],opcao_extra:'',itens_removidos:[],observacao:''}));
                  w.salvarPedidoEmpresa(tk,{itens:itens}); return 1;""" % (em, 3 if j==0 else (2 if j==1 else 1), i)))
        await pg.evaluate(relogio(hoje,10))
        ids=await pg.evaluate(chamar(ADM+"return Object.fromEntries(w.listarEmpresas(tk).map(e=>[e.nome_empresa,e.empresa_id]));"))

        # ================= 1. ACESSOS: novo administrador por convite =================
        await entrar(pg,'admin@rest.com','senhaadmin12345')
        ok('dashboard' in await menu(pg), 'proprietário vê o Dashboard no menu')
        await pg.click('#menuLateral [data-tela=acessos]'); await pg.wait_for_selector('#listaAdministradores .lista-linha')
        await pg.click('#botaoNovoAdministrador'); await pg.wait_for_selector('#modalCorpo [data-permissoes] .permissao-aba')
        f='#modalCorpo form '
        ok(await pg.locator(f+'[name=senha]').count()==0 and await pg.locator(f+'[name=email]').count()==1, 'formulário sem senha; e-mail opcional')
        await pg.type(f+'[name=nome]','Ana Caixa')
        ok(await pg.input_value(f+'[name=login]')=='ana.caixa', 'usuário sugerido pelo nome')
        padrao=await pg.evaluate("""[...document.querySelectorAll('#modalCorpo .permissao-aba')].map(b=>b.querySelector('strong').textContent+':'+b.querySelector('input').checked)""")
        ok('Dashboard:false' in padrao and 'Pedidos:true' in padrao, 'padrão: tudo menos Dashboard (%s)'%padrao)
        # libera só Pedidos e Cobranças (sem pagamentos)
        for aba in ['Empresas','Preços','Funcionários','Cardápios','Relatórios']:
            await pg.click('#modalCorpo .permissao-aba:has(strong:text-is("%s")) > label input'%aba)
        await pg.click('#modalCorpo .permissao-aba:has(strong:text-is("Cobranças")) label:has-text("Registrar e excluir pagamentos") input')
        ok(await pg.locator('#modalCorpo .permissao-aba:has(strong:text-is("Preços")) .permissao-funcoes input').is_disabled(), 'função de aba desligada fica bloqueada')
        await pg.screenshot(path='v20/a1_form_admin.png', full_page=True)
        await pg.click(f+'[data-enviar]'); await pg.wait_for_selector('#modalCorpo [data-mensagem]')
        msg=await pg.input_value('#modalCorpo [data-mensagem]'); link=await pg.inner_text('#modalCorpo [data-link]')
        ok('ana.caixa' in msg and 'painel do restaurante' in msg and link in msg, 'convite de administrador com usuário e link')
        await pg.screenshot(path='v20/a2_convite_admin.png')
        await pg.click('#modalCorpo [data-cancelar]'); await pg.wait_for_timeout(300)
        linha=await pg.inner_text('#listaAdministradores .lista-linha:has-text("Ana Caixa")')
        ok('Aguardando 1º acesso' in linha and 'usuário ana.caixa' in linha and 'Pedidos, Cobranças' in linha, 'lista: usuário, abas e aguardando: '+linha.replace('\n',' | '))
        m=await pg.evaluate(chamar(tenta("w.autenticarUsuario('ana.caixa','x123456')")))
        ok('ainda não foi ativado' in m, 'antes do convite não entra')
        usuarios=await pg.evaluate(SRV+".__abas.USUARIOS.rows.find(r=>r[8]==='ana.caixa')")
        ok(usuarios[3]=='' and usuarios[4]=='' and '"dashboard":false' in usuarios[9], 'planilha: sem e-mail, sem senha, com permissões')

        # convite
        await pg.evaluate("sair()"); await pg.wait_for_selector('#telaLogin:not([hidden])')
        await pg.goto('http://localhost:8765/index.html?convite='+link.split('convite=')[1]); await pg.wait_for_selector('#formConvite:not([hidden])', timeout=10000)
        t=await pg.inner_text('#conviteTexto')
        ok('painel do restaurante' in t, 'tela de convite fala do painel: '+t[:60])
        await pg.fill('#conviteSenha','anasenha1'); await pg.fill('#conviteConfirmacao','anasenha1'); await pg.click('#formConvite button[type=submit]')
        await pg.wait_for_selector('#app:not([hidden])', timeout=10000); await pg.wait_for_timeout(500)
        mn=await menu(pg)
        ok(mn==['inicio-admin','pedidos','cobrancas'], 'menu da Ana só com as abas liberadas: %s'%mn)
        ok(await pg.locator('#menuLateral .menu-grupo:text-is("Cadastros")').count()==0, 'grupo vazio some do menu')

        # bloqueios no servidor
        for nome,js in [('empresas',"w.criarEmpresa(tk,{nome:'X',email:'x@x.com',login:'xxxx'})"),('preços',"w.listarPrecos(tk,'')"),
                        ('relatórios',"w.gerarRelatorio(tk,{inicio:'%s',fim:'%s',empresa:''})"%(dias[0].isoformat(),hoje.isoformat())),
                        ('dashboard',"w.obterDashboard(tk,'ESTE_MES')"),('pagamento',"w.registrarPagamento(tk,{})"),
                        ('acessos',"w.obterAcessos(tk)"),('cardápio',"w.salvarSemanaCardapio(tk,'2026-01-05',[])")]:
            m=await pg.evaluate(chamar("const tk=w.autenticarUsuario('ana.caixa','anasenha1').token; w.__novaExecucao();"+tenta(js)))
            ok('não permite' in m or 'Somente o proprietário' in m, 'Ana bloqueada no servidor: '+nome+' ('+m[:40]+')')
        m=await pg.evaluate(chamar("const tk=w.autenticarUsuario('ana.caixa','anasenha1').token; w.__novaExecucao(); return w.listarPedidosDia(tk,'%s').pedidos.length;"%dias[-1].isoformat()))
        ok(m==3, 'Ana vê os pedidos (%s)'%m)

        # cobranças: vê, gera, mas não registra pagamento
        await pg.click('#menuLateral [data-tela=cobrancas]'); await pg.wait_for_timeout(900)
        ok(await pg.locator('button:has-text("Nova cobrança")').count()==1, 'Ana pode gerar cobrança (função liberada)')
        r=await pg.evaluate(chamar("const tk=w.autenticarUsuario('ana.caixa','anasenha1').token; w.__novaExecucao(); return w.gerarCobranca(tk,{empresa_id:'%s',inicio:'%s',fim:'%s',vencimento:'%s',observacoes:''}).cobranca_id;"%(ids['Alfa'],dias[0].isoformat(),dias[3].isoformat(),(hoje+datetime.timedelta(days=5)).isoformat())))
        cobA=r
        await pg.evaluate("cobranca.painel=null; carregarCobrancas && carregarCobrancas()") if False else None
        await pg.evaluate("abrirDetalheCobranca('%s')"%cobA); await pg.wait_for_selector('#modalCorpo .detalhe-cobranca-topo'); await pg.wait_for_timeout(300)
        bts=await pg.locator('#modalCorpo .detalhe-cobranca-acoes button').all_inner_texts()
        ok(not any('Registrar pagamento' in x for x in bts) and any('Desconto' in x for x in bts), 'sem botão de pagamento, com Desconto: %s'%bts)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)

        # proprietário muda as permissões com a Ana usando: menu muda sozinho
        await pg.evaluate(chamar(ADM+"""const a=w.obterAcessos(tk).administradores.find(x=>x.login==='ana.caixa'); w.__novaExecucao();
          const perm=a.permissoes; perm.telas.dashboard=true; perm.telas.cobrancas=false;
          return w.editarAdministrador(tk,{usuario_id:a.usuario_id,nome:a.nome,login:a.login,email:'',permissoes:perm}).mensagem;"""))
        await pg.evaluate("verificarNovidades && verificarNovidades()"); await pg.wait_for_timeout(900)
        mn=await menu(pg)
        ok('dashboard' in mn and 'cobrancas' not in mn, 'menu da Ana mudou sem recarregar: %s'%mn)
        ok(await pg.evaluate("estado.telaAtual")!='cobrancas', 'saiu da tela que foi bloqueada')
        await pg.evaluate("sair()"); await pg.wait_for_selector('#telaLogin:not([hidden])')

        # ================= 2. DESCONTOS =================
        await entrar(pg,'admin@rest.com','senhaadmin12345')
        await pg.click('#menuLateral [data-tela=cobrancas]'); await pg.wait_for_timeout(900)
        await pg.evaluate("abrirDetalheCobranca('%s')"%cobA); await pg.wait_for_selector('#modalCorpo .detalhe-cobranca-topo'); await pg.wait_for_timeout(300)
        total=await pg.evaluate(chamar(ADM+"return w.detalharCobranca(tk,'%s').cobranca.valor_total;"%cobA))
        await pg.click('#modalCorpo .detalhe-cobranca-acoes button:has-text("Desconto")'); await pg.wait_for_selector('#modalCorpo [name=desconto_valor]')
        await pg.select_option('#modalCorpo [name=desconto_tipo]','PERCENTUAL'); await pg.fill('#modalCorpo [name=desconto_valor]','10')
        prev=await pg.inner_text('#modalCorpo [data-resultado-desconto]')
        ok('a pagar' in prev, 'prévia do desconto: '+prev)
        await pg.click('#modalCorpo [data-enviar]'); await pg.wait_for_timeout(500)
        ok('motivo' in (await pg.inner_text('#modalCorpo [data-erro]')).lower(), 'exige o motivo')
        await pg.fill('#modalCorpo [name=desconto_motivo]','Cliente antigo'); await pg.click('#modalCorpo [data-enviar]')
        await pg.wait_for_selector('#modalCorpo .detalhe-cobranca-topo'); await pg.wait_for_timeout(500)
        det=await pg.evaluate(chamar(ADM+"return w.detalharCobranca(tk,'%s').cobranca;"%cobA))
        ok(abs(det['desconto']-round(total*0.1,2))<0.01 and abs(det['saldo']-(total-det['desconto']))<0.01, 'desconto de 10%% aplicado: total %s, desconto %s, saldo %s'%(total,det['desconto'],det['saldo']))
        txt=await pg.inner_text('#modalCorpo')
        ok('Valor a pagar' in txt and 'Cliente antigo' in txt, 'detalhe mostra valor a pagar e motivo')
        await pg.screenshot(path='v20/b1_detalhe_desconto.png')
        # pagamento parcial e depois o restante
        liquido=det['valor_liquido']
        m=await pg.evaluate(chamar(ADM+"w.registrarPagamento(tk,{cobranca_id:'%s',data:'%s',valor:'%s',forma:'PIX',comprovante:'',observacoes:''}); w.__novaExecucao(); return w.detalharCobranca(tk,'%s').cobranca;"%(cobA,hoje.isoformat(),str(round(liquido-10,2)).replace('.',','),cobA)))
        ok(m['status']=='PARCIAL' and abs(m['saldo']-10)<0.01, 'pagamento parcial respeita o desconto (saldo %s)'%m['saldo'])
        m=await pg.evaluate(chamar(ADM+tenta("w.aplicarDescontoCobranca(tk,{cobranca_id:'%s',desconto_tipo:'VALOR',desconto_valor:'%s',desconto_motivo:'teste'})"%(cobA,str(round(total,2)).replace('.',',')))))
        ok('menor do que já foi pago' in m, 'desconto não pode ficar abaixo do já pago')
        m=await pg.evaluate(chamar(ADM+"w.aplicarDescontoCobranca(tk,{cobranca_id:'%s',desconto_tipo:'VALOR',desconto_valor:'%s',desconto_motivo:'arredondar'}); w.__novaExecucao(); return w.detalharCobranca(tk,'%s').cobranca;"%(cobA,str(round(det['desconto']+10,2)).replace('.',','),cobA)))
        ok(m['status']=='PAGA' and m['saldo']==0, 'aumentar o desconto quita a cobrança')
        m=await pg.evaluate(chamar(ADM+"w.aplicarDescontoCobranca(tk,{cobranca_id:'%s',desconto_valor:''}); w.__novaExecucao(); return w.detalharCobranca(tk,'%s').cobranca;"%(cobA,cobA)))
        ok(m['desconto']==0 and m['status']=='PARCIAL', 'remover desconto volta o saldo (%s)'%m['status'])
        # gerar já com desconto (Beta)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        await pg.click('button:has-text("Nova cobrança")'); await pg.wait_for_selector('#modalCorpo [data-bloco-desconto]')
        await pg.select_option('#modalCorpo [name=empresa_id]', ids['Beta']); await pg.fill('#modalCorpo [name=inicio]', dias[0].isoformat()); await pg.fill('#modalCorpo [name=fim]', dias[-1].isoformat())
        await pg.dispatch_event('#modalCorpo [name=fim]','change'); await pg.wait_for_timeout(800)
        await pg.click('#modalCorpo [data-bloco-desconto] summary')
        await pg.fill('#modalCorpo [name=desconto_valor]','15,50'); await pg.fill('#modalCorpo [name=desconto_motivo]','Primeiro mês')
        await pg.screenshot(path='v20/b2_nova_com_desconto.png')
        await pg.click('#modalCorpo [data-enviar]'); await pg.wait_for_selector('#modalCorpo .detalhe-cobranca-topo'); await pg.wait_for_timeout(500)
        cb=await pg.evaluate(chamar(ADM+"return w.obterPainelCobrancas(tk).cobrancas.find(c=>c.nome_empresa==='Beta');"))
        ok(cb and cb['desconto']==15.5 and abs(cb['saldo']-(cb['valor_total']-15.5))<0.01, 'cobrança gerada já com desconto de R$ 15,50')
        # PDF
        await pg.evaluate("imprimirExtratoCobranca && apiSessao('detalharCobranca','%s').then(imprimirExtratoCobranca)"%cb['cobranca_id']); await pg.wait_for_timeout(800)
        imp=await pg.inner_text('#areaImpressao')
        ok('desconto' in imp.lower() and 'Primeiro mês' in imp, 'extrato em PDF mostra o desconto')
        # empresa vê o valor com desconto
        m=await pg.evaluate(chamar("const tk=w.autenticarUsuario('beta@x.com','abc123').token; w.__novaExecucao(); return w.listarCobrancasEmpresa(tk).cobrancas[0];"))
        ok(m['desconto']==15.5 and m['valor_liquido']==round(m['valor_total']-15.5,2), 'empresa vê o desconto')

        # ================= 3. DASHBOARD =================
        await pg.evaluate("fecharModal()"); await pg.click("#menuLateral [data-tela=dashboard]"); await pg.wait_for_selector(".cartao-grafico", timeout=10000)
        n=await pg.locator('.cartao-grafico').count()
        ok(n==4, '4 gráficos de pizza (%d)'%n)
        d=await pg.evaluate(chamar(ADM+"return w.obterDashboard(tk,'ESTE_ANO');"))
        rel=await pg.evaluate(chamar(ADM+"return w.gerarRelatorio(tk,{inicio:'%s',fim:'%s',empresa:''});"%(hoje.replace(month=1,day=1).isoformat(),hoje.isoformat())))
        ok(d['totais']['quentinhas']==rel['totais']['quentinhas'] and abs(d['totais']['valor']-rel['totais']['valor'])<0.01, 'números do dashboard batem com o relatório')
        ok(sum(x['valor'] for x in d['quentinhas_por_empresa'])==d['totais']['quentinhas'], 'pizza de quentinhas soma o total')
        sit=sum(x['valor'] for x in d['situacao'])
        ok(abs(sit-d['totais']['valor'])<0.05, 'situação do dinheiro soma o faturamento (%s × %s)'%(sit,d['totais']['valor']))
        ok({x['chave'] for x in d['situacao']} >= {'recebido','nao_cobrado','desconto','a_receber'}, 'situação tem recebido, a receber, não cobrado e desconto: %s'%[x['chave'] for x in d['situacao']])
        await pg.wait_for_timeout(600)
        caixa=await pg.locator('.cartao-grafico .pizza svg').first.bounding_box()
        await pg.hover('.cartao-grafico .pizza svg >> nth=0', position={'x':caixa['width']*0.78,'y':caixa['height']*0.4}); await pg.wait_for_timeout(300)
        dicas=await pg.evaluate("[...document.querySelectorAll('.pizza-dica')].map(d=>d.hidden)")
        ok(dicas.count(False)==1, 'passar o mouse mostra o número %s'%dicas)
        dica=await pg.inner_text('.pizza-dica:not([hidden])')
        ok('Alfa' in dica and '50%' in dica, 'a caixinha mostra a fatia certa: '+dica.replace(chr(10),' '))
        await pg.mouse.move(5,5); await pg.wait_for_timeout(200)
        ok(await pg.locator('.pizza-dica:not([hidden])').count()==0, 'tirar o mouse esconde a caixinha')
        await pg.screenshot(path='v20/c1_dashboard.png', full_page=True)
        await pg.click('.aba-relatorio:has-text("Este ano")'); await pg.wait_for_timeout(800)
        ok(await pg.locator('.aba-relatorio.ativa:has-text("Este ano")').count()==1, 'troca de período')
        await pg.click('#sidebar .seletor-tema button[data-tema=escuro]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='v20/c2_dashboard_escuro.png', full_page=True)
        await pg.click('#sidebar .seletor-tema button[data-tema=claro]')
        # celular (mesma janela, tela estreita)
        await pg.set_viewport_size({'width':390,'height':844}); await pg.wait_for_timeout(400)
        await pg.evaluate("window.scrollTo(0,0)")
        await pg.screenshot(path='v20/c3_m_dashboard.png', full_page=True)
        larg=await pg.evaluate("document.querySelector('.grafico-corpo').getBoundingClientRect().width")
        ok(larg<=390, 'cabe na tela do celular (%d px)'%larg)
        await b.close()
    print('ERROS:', erros if erros else 'nenhum')
    if erros: raise SystemExit(1)
asyncio.run(main())
