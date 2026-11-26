import asyncio, datetime, os, json
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
ADM="const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token; w.__novaExecucao();"
EMP="const te=w.autenticarUsuario('alfa@x.com','abc123').token; w.__novaExecucao();"
os.makedirs('v25', exist_ok=True)
def ok(c,t):
    print(('OK   ' if c else 'FALHA ')+t)
    if not c: erros.append('FALHA '+t)
def relogio(d,h=8,m=0): return SRV+".__agora=new Date(%d,%d,%d,%d,%d).getTime()"%(d.year,d.month-1,d.day,h,m)
def tenta(js): return "try{"+js+";return 'sem erro'}catch(e){return e.message}"
async def entrar(pg,u,s):
    await pg.fill('#loginEmail',u); await pg.fill('#loginSenha',s); await pg.click('#formLogin button[type=submit]')
    await pg.wait_for_selector('#app:not([hidden]), #erroLogin:not([hidden])'); await pg.wait_for_timeout(700)
async def sair(pg):
    await pg.evaluate("sair()"); await pg.wait_for_selector('#telaLogin:not([hidden])'); await pg.wait_for_timeout(300)

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo', locale='pt-BR')
        pg=await ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        pg.on('console', lambda m: erros.append(m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.evaluate("localStorage.clear()")
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')

        # Semana de teste: a próxima segunda-feira
        hoje=datetime.date.today()
        seg=hoje+datetime.timedelta(days=7-hoje.weekday())
        dia=lambda i: seg+datetime.timedelta(days=i)
        S=seg.isoformat()
        await pg.evaluate(relogio(seg-datetime.timedelta(days=3),10))
        await pg.evaluate(chamar(ADM+"""
          const e=w.criarEmpresa(tk,{nome:'Alfa',email:'alfa@x.com',senha:'abc123',cnpj:'',endereco:'Rua A'});
          w.__novaExecucao(); w.salvarPreco(tk,{empresa_id:e.empresa_id,valor_unitario:'20,00',data_inicio:'2026-01-01'});
          for (let i=0;i<3;i++){ w.__novaExecucao(); w.salvarFuncionario(tk,{empresa_id:e.empresa_id,nome:'Pessoa '+i,setor:'S',matricula:'M'+i,pode_alterar_quentinha:true}); }
          const d={acompanhamentos:['Arroz'],saladas:['Alface'],guarnicoes:['Purê'],proteinas:['Frango','Carne'],opcao_extra:'',observacoes:''};
          const vazio={acompanhamentos:[],saladas:[],guarnicoes:[],proteinas:[],opcao_extra:'',observacoes:''};
          w.__novaExecucao(); w.salvarSemanaCardapio(tk,%s,[d,d,d,d,d,vazio,vazio]);
          w.__novaExecucao(); w.publicarSemanaCardapio(tk,%s,true);
          return 1;""" % (json.dumps(S),json.dumps(S))))

        # ================= 1. CARDÁPIO DE SEGUNDA A DOMINGO =================
        sem=await pg.evaluate(chamar(ADM+"return w.obterSemanaCardapio(tk,%s);"%json.dumps(S)))
        ok(len(sem['dias'])==7 and sem['domingo']==dia(6).isoformat(), 'semana com 7 dias (segunda a domingo)')
        ok([d['fechado'] for d in sem['dias']]==[False]*5+[True,True], 'sábado e domingo começam fechados')

        await entrar(pg,'admin@rest.com','senhaadmin12345')
        await pg.evaluate("irPara('cardapios',{segunda:%s})"%json.dumps(S))
        await pg.wait_for_selector('#listaDiasCardapio .dia-cardapio'); await pg.wait_for_timeout(500)
        n=await pg.evaluate("document.querySelectorAll('#listaDiasCardapio .dia-cardapio').length")
        ok(n==7, 'tela mostra 7 dias (%d)'%n)
        ok('a '+dia(6).strftime('%d/%m') in await pg.inner_text('#cardapioTopo .semana-textos strong'), 'título da semana vai até domingo')
        fech=await pg.evaluate("[...document.querySelectorAll('#listaDiasCardapio .dia-cardapio')].map(c=>c.classList.contains('fechado'))")
        ok(fech==[False]*5+[True,True], 'sábado e domingo aparecem fechados')
        await pg.screenshot(path='v25/01_cardapio_semana.png', full_page=True)

        # Fechar a quinta-feira (feriado)
        quinta='#listaDiasCardapio .dia-cardapio[data-indice="3"]'
        await pg.click(quinta+' .chave-dia'); await pg.wait_for_selector('#confirmacaoFundo:not([hidden])')
        ok('Fechar quinta' in await pg.inner_text('#confirmacaoFundo'), 'pede confirmação para fechar o dia')
        await pg.click('#confirmacaoOk')
        await pg.wait_for_selector(quinta+'.fechado', timeout=10000); await pg.wait_for_timeout(400)
        ok(await pg.inner_text(quinta+' .chave-dia')=='Fechado', 'quinta-feira fica fechada')
        await pg.fill(quinta+' input.observacao','Feriado de teste'); await pg.wait_for_timeout(2500)
        await pg.screenshot(path='v25/02_quinta_fechada.png', full_page=True)
        r=await pg.evaluate(chamar(ADM+"return w.obterSemanaCardapio(tk,%s).dias[3];"%json.dumps(S)))
        ok(r['fechado'] and r['observacoes']=='Feriado de teste' and r['proteinas']==['Frango','Carne'], 'fechado no servidor, com motivo e cardápio guardado')

        # Abrir o sábado e montar o cardápio
        sab='#listaDiasCardapio .dia-cardapio[data-indice="5"]'
        await pg.click(sab+' .chave-dia'); await pg.wait_for_selector(sab+':not(.fechado)', timeout=10000); await pg.wait_for_timeout(400)
        ok(await pg.inner_text(sab+' .chave-dia')=='Aberto', 'sábado aberto com um clique (sem confirmação)')
        campo=sab+' [data-grupo="proteinas"] input.campo-item'
        await pg.fill(campo,'Feijoada'); await pg.press(campo,'Enter')
        await pg.fill(sab+' [data-grupo="acompanhamentos"] input.campo-item','Arroz'); await pg.press(sab+' [data-grupo="acompanhamentos"] input.campo-item','Enter')
        await pg.wait_for_timeout(2600)
        r=await pg.evaluate(chamar(ADM+"return w.obterSemanaCardapio(tk,%s).dias[5];"%json.dumps(S)))
        ok(not r['fechado'] and 'Feijoada' in r['proteinas'], 'sábado salvo com feijoada (%s)'%r['proteinas'])
        await pg.screenshot(path='v25/03_sabado_aberto.png', full_page=True)

        # Publicar não reclama de domingo (fechado)
        aviso=await pg.evaluate("""(function(){const s=cardapioAdmin.semana;const ab=s.dias.filter(d=>!d.fechado);return ab.filter(d=>!diaTemItens(d)).length})()""")
        ok(aviso==0, 'nenhum dia aberto sem cardápio para avisar')

        # Empresa: vê a semana com sábado e quinta fechada
        emp=await pg.evaluate(chamar(EMP+"return w.obterCardapioEmpresa(te,%s);"%json.dumps(S)))
        ok(emp['dias'][3]['fechado'] and emp['dias'][3]['proteinas']==[] and emp['dias'][3]['observacoes']=='Feriado de teste', 'empresa vê quinta fechada (sem o cardápio guardado)')
        ok('Feijoada' in emp['dias'][5]['proteinas'] and emp['dias'][6]['fechado'], 'empresa vê o sábado e o domingo fechado')

        # Pedidos: quinta fechada não aceita; sábado aceita; domingo não
        await pg.evaluate(relogio(dia(3),8))
        e=await pg.evaluate(chamar(EMP+"return w.obterPedidoEmpresa(te);"))
        ok(not e['prazo']['aberto'] and 'não abre hoje' in e['prazo']['motivo'] and 'Feriado de teste' in e['prazo']['motivo'] and e['cardapio'] is None, 'quinta fechada: sem pedido (%s)'%e['prazo']['motivo'])
        await pg.evaluate(relogio(dia(5),8))
        r=await pg.evaluate(chamar(EMP+"const est=w.obterPedidoEmpresa(te); w.__novaExecucao(); return w.salvarPedidoEmpresa(te,{itens:est.funcionarios.slice(0,2).map(f=>({funcionario_id:f.funcionario_id,proteina:'Feijoada',opcao_extra:'',itens_removidos:[],observacao:''}))}).mensagem;"))
        ok('enviado' in r.lower(), 'sábado aberto aceita pedido (%s)'%r)
        await pg.evaluate(relogio(dia(6),8))
        e=await pg.evaluate(chamar(EMP+"return w.obterPedidoEmpresa(te).prazo;"))
        ok(not e['aberto'] and 'não abre' in e['motivo'], 'domingo fechado não aceita pedido')
        # Não fecha um dia que já tem pedido
        r=await pg.evaluate(chamar(ADM+tenta("w.definirDiaFechado(tk,%s,true)"%json.dumps(dia(5).isoformat()))))
        ok('Recuse ou cancele' in r, 'não fecha dia com pedido: '+r)

        # ================= 2. PRAZO EXTRA =================
        await pg.evaluate(relogio(dia(0),9,30))   # segunda, depois do limite (09:00)
        await sair(pg)
        await entrar(pg,'alfa@x.com','abc123')
        await pg.evaluate("irPara('pedidos-empresa')"); await pg.wait_for_selector('.cartao-prazo-extra', timeout=10000)
        ok('Pedir mais 30 minutos' in await pg.inner_text('.cartao-prazo-extra'), 'depois do horário aparece "Pedir mais 30 minutos"')
        await pg.screenshot(path='v25/04_empresa_pedir_prazo.png', full_page=True)
        await pg.fill('#mensagemPrazoExtra','Esquecemos de pedir hoje')
        await pg.click(".cartao-prazo-extra button:has-text('Pedir mais')")
        await pg.wait_for_function("document.querySelector('.cartao-prazo-extra') && document.querySelector('.cartao-prazo-extra').innerText.indexOf('Aguardando')>=0", timeout=10000)
        ok(True, 'empresa vê "aguardando o restaurante"')
        r=await pg.evaluate(chamar(EMP+tenta("w.solicitarPrazoExtra(te,'de novo')")))
        ok('Aguarde' in r, 'não deixa pedir de novo enquanto espera')
        await pg.screenshot(path='v25/05_empresa_aguardando.png')
        await sair(pg)

        # Restaurante vê e libera
        await entrar(pg,'admin@rest.com','senhaadmin12345')
        res=await pg.evaluate(chamar(ADM+"return w.novidadesPedidos(tk,null).resumo.prazos_pendentes;"))
        ok(len(res)==1 and res[0]['nome']=='Alfa' and res[0]['mensagem']=='Esquecemos de pedir hoje', 'pedido de prazo chega ao restaurante')
        txt=await pg.inner_text('#pedidosHojeAdmin') if await pg.locator('#pedidosHojeAdmin').count() else ''
        ok('Alfa pediu mais tempo' in txt, 'tela inicial avisa do pedido de prazo')
        await pg.evaluate("irPara('pedidos',{data:%s})"%json.dumps(seg.isoformat())); await pg.wait_for_selector('.prazo-extra-pedido', timeout=10000)
        ok('Esquecemos de pedir hoje' in await pg.inner_text('.prazo-extra-pedido'), 'tela de pedidos mostra a mensagem da empresa')
        await pg.screenshot(path='v25/06_restaurante_pedido_prazo.png')
        await pg.click(".prazo-extra-pedido button:has-text('Liberar')")
        await pg.wait_for_selector('.prazo-extra-item.liberado', timeout=10000)
        hist=await pg.inner_text('.prazo-extra-historico')
        ok('até 10:00' in hist, 'liberado até 10:00 (30 min a partir de 09:30): '+hist)
        await pg.screenshot(path='v25/07_restaurante_liberado.png')

        # Empresa agora pode pedir até 10:00
        await pg.evaluate(relogio(dia(0),9,45))
        e=await pg.evaluate(chamar(EMP+"return w.obterPedidoEmpresa(te).prazo;"))
        ok(e['aberto'] and e['prazo_extra'] and e['limite']=='10:00', 'empresa com prazo extra até 10:00')
        r=await pg.evaluate(chamar(EMP+"const est=w.obterPedidoEmpresa(te); w.__novaExecucao(); return w.salvarPedidoEmpresa(te,{itens:est.funcionarios.map(f=>({funcionario_id:f.funcionario_id,proteina:'Frango',opcao_extra:'',itens_removidos:[],observacao:''}))}).mensagem;"))
        ok('enviado' in r.lower(), 'pedido enviado no prazo extra')
        # Outra empresa não ganha o prazo
        r=await pg.evaluate(chamar(ADM+"const e=w.criarEmpresa(tk,{nome:'Beta',email:'beta@x.com',senha:'abc123',cnpj:'',endereco:'R'}); return 1;"))
        e=await pg.evaluate(chamar("const tb=w.autenticarUsuario('beta@x.com','abc123').token; w.__novaExecucao(); return w.obterPedidoEmpresa(tb).prazo;"))
        ok(not e['aberto'], 'prazo extra vale só para a empresa liberada')
        await sair(pg)
        await entrar(pg,'alfa@x.com','abc123')
        await pg.evaluate("irPara('pedidos-empresa')"); await pg.wait_for_selector('.cabecalho-pedido'); await pg.wait_for_timeout(500)
        ok('Prazo extra liberado' in await pg.inner_text('.cabecalho-pedido'), 'tela da empresa mostra "prazo extra liberado"')
        await pg.screenshot(path='v25/08_empresa_prazo_extra.png')
        await sair(pg)

        # Depois das 10:00 fecha de novo; não vale para o dia seguinte
        await pg.evaluate(relogio(dia(0),10,5))
        e=await pg.evaluate(chamar(EMP+"const o=w.obterPedidoEmpresa(te); return [o.prazo.aberto,o.prazo_extra.status,o.prazo_extra.pode_pedir];"))
        ok(e==[False,'ENCERRADO',True], 'às 10:05 o prazo extra acabou (%s)'%e)
        await pg.evaluate(relogio(dia(1),9,30))
        e=await pg.evaluate(chamar(EMP+"const o=w.obterPedidoEmpresa(te); return [o.prazo.aberto,o.prazo_extra.status];"))
        ok(e==[False,''], 'no dia seguinte não vale (%s)'%e)

        # Recusar
        await pg.evaluate(chamar(EMP+"w.solicitarPrazoExtra(te,''); return 1;"))
        await entrar(pg,'admin@rest.com','senhaadmin12345')
        await pg.evaluate("irPara('pedidos',{data:%s})"%json.dumps(dia(1).isoformat())); await pg.wait_for_selector('.prazo-extra-pedido', timeout=10000)
        await pg.click(".prazo-extra-pedido button:has-text('Recusar')"); await pg.wait_for_selector('#modalCorpo input')
        await pg.fill('#modalCorpo input','Produção já fechada'); await pg.click("#modalCorpo button[type=submit]")
        await pg.wait_for_selector('.prazo-extra-item.recusado', timeout=10000)
        e=await pg.evaluate(chamar(EMP+"const o=w.obterPedidoEmpresa(te); return [o.prazo.aberto,o.prazo_extra.status,o.prazo_extra.resposta];"))
        ok(e==[False,'RECUSADO','Produção já fechada'], 'recusado com motivo (%s)'%e)
        r=await pg.evaluate(chamar(EMP+tenta("w.solicitarPrazoExtra(te,'')")))
        r2=await pg.evaluate(chamar(EMP+tenta("w.solicitarPrazoExtra(te,'')")))
        ok(r=='sem erro' and 'vezes' not in r and 'Aguarde' in r2, 'pode pedir de novo depois de recusado (limite por dia)')
        # dentro do horário não pede
        await pg.evaluate(relogio(dia(2),8))
        r=await pg.evaluate(chamar(EMP+tenta("w.solicitarPrazoExtra(te,'')")))
        ok('ainda está aberto' in r, 'antes do limite não precisa pedir prazo')
        # dia fechado não pede
        await pg.evaluate(relogio(dia(3),9,30))
        r=await pg.evaluate(chamar(EMP+tenta("w.solicitarPrazoExtra(te,'')")))
        ok('não abre' in r, 'dia fechado: não pede prazo')

        # ================= 3. RELATÓRIO FINANCEIRO =================
        await pg.evaluate(relogio(dia(6)+datetime.timedelta(days=1),15))
        ids=await pg.evaluate(chamar(ADM+"return Object.fromEntries(w.listarEmpresas(tk).map(e=>[e.nome_empresa,e.empresa_id]));"))
        cob=await pg.evaluate(chamar(ADM+"""const c=w.gerarCobranca(tk,{empresa_id:%s,inicio:%s,fim:%s,vencimento:%s,desconto_tipo:'PERCENTUAL',desconto_valor:'10',desconto_motivo:'Cliente fiel'}); return c;"""%(
            json.dumps(ids['Alfa']),json.dumps(dia(0).isoformat()),json.dumps(dia(6).isoformat()),json.dumps((dia(6)+datetime.timedelta(days=10)).isoformat()))))
        cid=cob.get('cobranca',{}).get('cobranca_id') or cob.get('cobranca_id')
        await pg.evaluate(chamar(ADM+"w.registrarPagamento(tk,{cobranca_id:%s,valor:'30,00',data:%s,forma:'PIX'}); return 1;"%(json.dumps(cid),json.dumps((dia(6)+datetime.timedelta(days=1)).isoformat()))))
        f=await pg.evaluate(chamar(ADM+"return w.gerarRelatorioFinanceiro(tk,{empresa:%s,inicio:%s,fim:%s});"%(json.dumps(ids['Alfa']),json.dumps(dia(0).isoformat()),json.dumps(dia(6).isoformat()))))
        t=f['totais']
        ok(f['consumo']['quentinhas']==5 and abs(f['consumo']['valor']-100)<0.01, 'consumo: 5 quentinhas, R$ 100 (%s)'%f['consumo'])
        ok(abs(t['valor_bruto']-100)<0.01 and abs(t['descontos']-10)<0.01 and abs(t['valor_liquido']-90)<0.01, 'cobrado R$ 90 depois de R$ 10 de desconto')
        ok(abs(t['recebido']-30)<0.01 and abs(t['saldo']-60)<0.01, 'recebido R$ 30, falta R$ 60')
        ok(len(f['descontos'])==1 and f['descontos'][0]['motivo']=='Cliente fiel' and f['descontos'][0]['percentual']==10, 'desconto com motivo e porcentagem')
        ok(len(f['pagamentos'])==1 and f['pagamentos'][0]['forma']=='Pix', 'pagamento listado')
        r=await pg.evaluate(chamar(ADM+tenta("w.gerarRelatorioFinanceiro(tk,{empresa:'',inicio:'2026-01-01',fim:'2026-01-31'})")))
        ok('Escolha uma empresa' in r, 'exige uma empresa')

        await pg.evaluate("irPara('relatorios')"); await pg.wait_for_selector('.tipos-relatorio', timeout=10000)
        await pg.click(".tipos-relatorio button[data-tipo=financeiro]")
        await pg.wait_for_function("document.getElementById('relatorioEmpresa').value!==''", timeout=10000)
        opcoes=await pg.evaluate("[...document.querySelectorAll('#relatorioEmpresa option')].map(o=>o.textContent)")
        ok('Todas as empresas' not in opcoes and 'Alfa' in opcoes, 'no financeiro escolhe uma empresa (%s)'%opcoes)
        await pg.select_option('#relatorioPeriodo','personalizado')
        await pg.fill('#relatorioInicio',dia(0).isoformat()); await pg.fill('#relatorioFim',dia(6).isoformat())
        await pg.select_option('#relatorioEmpresa',ids['Alfa'])
        await pg.click('#botaoGerarRelatorio')
        await pg.wait_for_function("document.getElementById('relatorioConteudo').innerText.indexOf('Descontos e motivos')>=0", timeout=15000)
        tela=(await pg.inner_text('#relatorioConteudo')).replace('\xa0',' ')
        ok('Cliente fiel' in tela and 'R$ 60,00' in tela and 'R$ 10,00' in tela, 'tela mostra desconto, motivo e saldo')
        await pg.screenshot(path='v25/09_relatorio_financeiro.png', full_page=True)
        async with pg.expect_download() as baixa:
            await pg.click("#relatorioConteudo button:has-text('Excel')")
        arq=await (await baixa.value).path()
        import zipfile
        z=zipfile.ZipFile(arq); nomes=z.namelist()
        ok(sum(1 for n in nomes if n.startswith('xl/worksheets/'))==4 and 'Cliente fiel' in z.read('xl/worksheets/sheet3.xml').decode(), 'Excel com 4 abas e o motivo do desconto')
        await pg.evaluate("window.print=function(){}")
        await pg.click("#relatorioConteudo button:has-text('PDF')"); await pg.wait_for_timeout(300)
        imp=await pg.inner_text('#areaImpressao')
        ok('Relatório financeiro' in imp and 'Cliente fiel' in imp and 'Falta receber' in imp, 'impressão/PDF com resumo e descontos')
        # Voltar ao consumo
        await pg.click(".tipos-relatorio button[data-tipo=consumo]"); await pg.wait_for_timeout(1500)
        ok('Todas as empresas' in await pg.evaluate("[...document.querySelectorAll('#relatorioEmpresa option')].map(o=>o.textContent).join('|')"), 'consumo volta a ter "Todas as empresas"')

        # celular
        await pg.click(".tipos-relatorio button[data-tipo=financeiro]"); await pg.wait_for_timeout(1500)
        await pg.set_viewport_size({'width':390,'height':844}); await pg.wait_for_timeout(500)
        await pg.screenshot(path='v25/10_m_financeiro.png', full_page=True)
        await pg.evaluate("irPara('cardapios',{segunda:%s})"%json.dumps(S)); await pg.wait_for_timeout(1200)
        await pg.screenshot(path='v25/11_m_cardapio.png')
        await pg.evaluate("document.documentElement.dataset.tema='escuro'"); await pg.wait_for_timeout(300)
        await pg.screenshot(path='v25/12_m_cardapio_escuro.png')

        print('ERROS:', erros or 'nenhum')
        await b.close()
asyncio.run(main())
