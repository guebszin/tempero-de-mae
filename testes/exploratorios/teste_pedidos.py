import asyncio, datetime
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js):  # executa no "servidor" como uma nova execução
    return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo', locale='pt-BR')
        pg=await ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        pg.on('console', lambda m: erros.append(m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        hoje=datetime.date.today()
        h=hoje.isoformat(); seg=(hoje-datetime.timedelta(days=hoje.weekday())).isoformat()
        # relógio do servidor: hoje 08:00
        await pg.evaluate(SRV+".__agora=new Date(%d,%d,%d,8,0).getTime()"%(hoje.year,hoje.month-1,hoje.day))
        # preparar dados como restaurante, direto no servidor
        r=await pg.evaluate(chamar("""
          const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token;
          w.__novaExecucao(); const e=w.criarEmpresa(tk,{nome:'Alfa',email:'alfa@x.com',senha:'abc123'});
          w.__novaExecucao(); w.salvarPreco(tk,{empresa_id:e.empresa_id,valor_unitario:'18,50',data_inicio:'%s'});
          for (const [n,pa] of [['Carlos Souza',true],['Fernanda Dias',false],['Bruno Lima',false]]) { w.__novaExecucao(); w.salvarFuncionario(tk,{empresa_id:e.empresa_id,nome:n,pode_alterar_quentinha:pa}); }
          const dia={acompanhamentos:['Arroz','Feijão'],saladas:['Alface'],guarnicoes:['Purê de batata'],proteinas:['Frango assado','Carne moída'],opcao_extra:'Ovo frito ou ovo cozido',observacoes:''};
          const vazio={acompanhamentos:[],saladas:[],guarnicoes:[],proteinas:[],opcao_extra:'',observacoes:''};
          const dias=[0,1,2,3,4].map(i=>i===%d?dia:vazio);
          w.__novaExecucao(); w.salvarSemanaCardapio(tk,'%s',dias);
          w.__novaExecucao(); w.publicarSemanaCardapio(tk,'%s',true);
          return 'ok';""" % (h, hoje.weekday(), seg, seg)))
        print('preparo:', r)
        # empresa faz o pedido
        await pg.fill('#loginEmail','alfa@x.com'); await pg.fill('#loginSenha','abc123'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#pedidoHojeEmpresa button')
        print('cartão início:', await pg.inner_text('#pedidoHojeEmpresa'))
        await pg.click('#pedidoHojeEmpresa button'); await pg.wait_for_selector('#listaPessoasPedido .pessoa-pedido')
        print('cabeçalho:', (await pg.inner_text('.cabecalho-pedido')).replace('\n',' | '))
        for nome in ['Carlos','Fernanda']:
            await pg.click(f'.pessoa-pedido:has-text("{nome}") .pessoa-topo input')
        await pg.click('.barra-pedido button:has-text("Enviar pedido")'); await pg.wait_for_timeout(300)
        print('sem proteína:', await pg.eval_on_selector_all('.toast .texto','e=>e.map(x=>x.textContent).slice(-1)'), '| destacados:', await pg.locator('.pessoa-pedido.faltando').count())
        await pg.click('.proteina-para-todos .escolha:has-text("Frango assado")')
        await pg.click('.pessoa-pedido:has-text("Fernanda") .escolhas.extras .escolha:has-text("Ovo cozido")')
        await pg.click('.pessoa-pedido:has-text("Carlos") .escolha:has-text("Carne moída")')
        await pg.click('.pessoa-pedido:has-text("Carlos") button:has-text("Personalizar")'); await pg.wait_for_selector('#modalCorpo form')
        await pg.click('#modalCorpo .item-personalizar:has-text("Feijão") input'); await pg.fill('#modalCorpo textarea','pouco sal')
        await pg.click('#modalCorpo button:has-text("Aplicar")'); await pg.wait_for_timeout(200)
        print('personalização Carlos:', await pg.inner_text('.pessoa-pedido:has-text("Carlos") .personalizacao span'))
        print('Fernanda tem botão personalizar?', await pg.locator('.pessoa-pedido:has-text("Fernanda") button:has-text("Personalizar")').count())
        await pg.click('#secaoAvulsas button:has-text("Adicionar quentinha avulsa")')
        await pg.fill('#secaoAvulsas input.campo-item','Visitante João'); await pg.click('#secaoAvulsas .escolha:has-text("Frango assado")')
        await pg.fill('.observacao-pedido textarea','Entregar na portaria B')
        print('barra:', (await pg.inner_text('.barra-pedido-resumo')).replace('\n',' | '))
        await pg.screenshot(path='60_pedido_empresa.png', full_page=True)
        await pg.click('.barra-pedido button:has-text("Enviar pedido")'); await pg.wait_for_timeout(1500)
        print('após envio:', await pg.eval_on_selector_all('.toast .texto','e=>e.map(x=>x.textContent).slice(-1)'), '| etiqueta:', await pg.inner_text('.cabecalho-pedido .etiqueta'))
        itens=await pg.evaluate(SRV+".__abas.ITENS_PEDIDOS.rows.slice(1).map(r=>[r[10],r[11],r[12],r[13],r[9],r[7]])")
        print('itens na planilha:', itens)
        print('pedido:', await pg.evaluate(SRV+".__abas.PEDIDOS.rows.slice(1).map(r=>[r[5],r[6],r[7],r[8]])"))
        # empresa tentando burlar: Fernanda (sem permissão) com item removido
        r=await pg.evaluate("""new Promise(res=>{const f=pedidoEmpresa.estado.funcionarios.find(x=>x.nome.startsWith('Fernanda'));google.script.run.withSuccessHandler(()=>res('GRAVOU')).withFailureHandler(e=>res(e.message)).salvarPedidoEmpresa(estado.token,{itens:[{funcionario_id:f.funcionario_id,proteina:'Frango assado',itens_removidos:['Feijão']}]})})""")
        print('burla personalização:', r)
        # restaurante
        await pg.click('#botaoConta'); await pg.click('#menuConta [data-acao=sair]'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        await pg.fill('#loginEmail','admin@rest.com'); await pg.fill('#loginSenha','senhaadmin12345'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#pedidosHojeAdmin button')
        print('início restaurante:', (await pg.inner_text('#pedidosHojeAdmin')).replace('\n',' | '))
        await pg.click('#pedidosHojeAdmin button'); await pg.wait_for_selector('.cartao-pedido')
        print('produção:', (await pg.inner_text('.tabela-producao')).replace('\n',' | '))
        print('personalizadas:', (await pg.inner_text('.lista-personalizadas')).replace('\n',' | '))
        await pg.screenshot(path='61_pedidos_restaurante.png', full_page=True)
        await pg.click('.cartao-pedido button:has-text("Ver itens")'); await pg.wait_for_selector('.lista-itens-pedido')
        await pg.screenshot(path='62_itens.png'); await pg.click('#modalCorpo button:has-text("Fechar")')
        await pg.click('.cartao-pedido button:has-text("Confirmar")'); await pg.wait_for_timeout(1000)
        print('após confirmar:', await pg.inner_text('.cartao-pedido .etiqueta'))
        # empresa altera depois da confirmação (adiciona Bruno) -> volta a aguardar
        r=await pg.evaluate(chamar("""
          const tk=w.autenticarUsuario('alfa@x.com','abc123').token; w.__novaExecucao();
          const est=w.obterPedidoEmpresa(tk); w.__novaExecucao();
          const itens=est.pedido.itens.map(i=>({funcionario_id:i.funcionario_id,nome:i.nome,proteina:i.proteina,opcao_extra:i.opcao_extra,itens_removidos:i.itens_removidos,observacao:i.observacao}));
          const bruno=est.funcionarios.find(f=>f.nome.startsWith('Bruno')); itens.push({funcionario_id:bruno.funcionario_id,proteina:'Carne moída'});
          const r=w.salvarPedidoEmpresa(tk,{itens:itens,observacoes:est.pedido.observacoes}); return [r.estado.pedido.status, r.estado.pedido.quantidade_total, r.estado.pedido.alterado_apos_confirmacao];"""))
        print('empresa alterou após confirmação:', r)
        await pg.click('.semana-nav button[title="Próximo dia"]'); await pg.wait_for_timeout(500); await pg.click('.semana-nav button:has-text("Hoje")'); await pg.wait_for_timeout(1200)
        print('restaurante vê:', await pg.inner_text('.cartao-pedido .etiqueta'), '|', await pg.locator('.cartao-pedido .alerta:has-text("alterou")').count())
        await pg.click('.cartao-pedido button:has-text("Recusar")'); await pg.wait_for_selector('#modalCorpo textarea')
        await pg.click('#modalCorpo button:has-text("Recusar pedido")'); await pg.wait_for_timeout(500)
        print('recusa sem motivo:', await pg.inner_text('#modalCorpo .mensagem-erro'))
        await pg.fill('#modalCorpo textarea','Falta de gás hoje'); await pg.click('#modalCorpo button:has-text("Recusar pedido")'); await pg.wait_for_timeout(1000)
        print('após recusar:', await pg.inner_text('.cartao-pedido .etiqueta'))
        # horário limite
        await pg.click('.prazo-pedidos button'); await pg.wait_for_selector('#modalCorpo input[type=time]')
        await pg.fill('#modalCorpo input[type=time]','10:30'); await pg.click('#modalCorpo button:has-text("Salvar")'); await pg.wait_for_timeout(1500)
        print('prazo:', await pg.inner_text('.prazo-pedidos span'))
        # empresa vê recusa; depois das 10:30 fica fechado
        await pg.click('#botaoConta'); await pg.click('#menuConta [data-acao=sair]'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        await pg.fill('#loginEmail','alfa@x.com'); await pg.fill('#loginSenha','abc123'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#pedidoHojeEmpresa .etiqueta')
        print('início empresa:', (await pg.inner_text('#pedidoHojeEmpresa')).replace('\n',' | '))
        await pg.evaluate(SRV+".__agora=new Date(%d,%d,%d,10,31).getTime()"%(hoje.year,hoje.month-1,hoje.day))
        await pg.click('#menuLateral [data-tela=pedidos-empresa]'); await pg.wait_for_timeout(1500)
        print('fechado:', (await pg.inner_text('.cabecalho-pedido .subtitulo-cartao')), '| botões enviar:', await pg.locator('.barra-pedido button').count(), '| checkboxes ativos:', await pg.locator('.pessoa-topo input:not([disabled])').count())
        await pg.screenshot(path='63_pedido_fechado.png', full_page=True)
        r=await pg.evaluate("""new Promise(res=>google.script.run.withSuccessHandler(()=>res('GRAVOU')).withFailureHandler(e=>res(e.message)).salvarPedidoEmpresa(estado.token,{itens:[]}))""")
        print('envio após prazo:', r)
        # celular, antes do prazo
        await pg.evaluate(SRV+".__agora=new Date(%d,%d,%d,8,30).getTime()"%(hoje.year,hoje.month-1,hoje.day))
        await pg.set_viewport_size({'width':390,'height':844})
        await pg.click('#barraInferior [data-tela=inicio-empresa]'); await pg.wait_for_timeout(300)
        await pg.click('#barraInferior [data-tela=pedidos-empresa]'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path='64_m_pedido.png')
        # cancelar
        await pg.click('.barra-pedido button:has-text("Cancelar pedido")'); await pg.click('#confirmacaoOk'); await pg.wait_for_timeout(1200)
        print('cancelado:', await pg.evaluate(SRV+".__abas.PEDIDOS.rows.slice(1).map(r=>[r[5],r[8]])"), '| itens restantes:', await pg.evaluate(SRV+".__abas.ITENS_PEDIDOS.rows.length-1"))
        await b.close()
asyncio.run(main())
print('ERROS:', erros)
