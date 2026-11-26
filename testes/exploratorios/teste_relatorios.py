import asyncio, datetime, openpyxl
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo', accept_downloads=True)
        pg=await ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        pg.on('console', lambda m: erros.append(m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        hoje=datetime.date.today()
        # dias úteis do mês até hoje
        dias=[hoje.replace(day=d) for d in range(1,hoje.day+1) if hoje.replace(day=d).weekday()<5][-6:]
        seg0=dias[0]-datetime.timedelta(days=dias[0].weekday())
        await pg.evaluate(SRV+".__agora=new Date(%d,%d,%d,7,0).getTime()"%(dias[0].year,dias[0].month-1,dias[0].day))
        await pg.evaluate(chamar("""const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token;
          for (const [n,em,preco] of [['Alfa','alfa@x.com','18,50'],['Beta Engenharia','beta@x.com','20,00']]) {
            w.__novaExecucao(); const e=w.criarEmpresa(tk,{nome:n,email:em,senha:'abc123'});
            w.__novaExecucao(); w.salvarPreco(tk,{empresa_id:e.empresa_id,valor_unitario:preco,data_inicio:'%s'});
            for (const [f,pa,setor] of [['Carlos '+n,true,'Escritório'],['Fernanda '+n,false,'Obra'],['Bruno '+n,false,'Obra']]) { w.__novaExecucao(); w.salvarFuncionario(tk,{empresa_id:e.empresa_id,nome:f,setor:setor,matricula:String(Math.floor(Math.random()*900+100)),pode_alterar_quentinha:pa}); }
          }
          const dia={acompanhamentos:['Arroz','Feijão'],saladas:['Alface'],guarnicoes:['Purê'],proteinas:['Frango assado','Carne moída'],opcao_extra:'Ovo frito ou ovo cozido',observacoes:''};
          for (let s=0;s<3;s++){ const d=new Date(%d,%d,%d+7*s); const segunda=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
            w.__novaExecucao(); w.salvarSemanaCardapio(tk,segunda,[0,1,2,3,4].map(()=>dia)); w.__novaExecucao(); w.publicarSemanaCardapio(tk,segunda,true); }
          return 1;""" % (dias[0].replace(day=1).isoformat(), seg0.year, seg0.month-1, seg0.day)))
        for i,d in enumerate(dias):
            await pg.evaluate(SRV+".__agora=new Date(%d,%d,%d,8,0).getTime()"%(d.year,d.month-1,d.day))
            for email,qtd in [('alfa@x.com',3 if i%2==0 else 2),('beta@x.com',2)]:
                await pg.evaluate(chamar("""const tk=w.autenticarUsuario('%s','abc123').token; w.__novaExecucao();
                  const est=w.obterPedidoEmpresa(tk); w.__novaExecucao();
                  const itens=est.funcionarios.slice(0,%d).map((f,j)=>({funcionario_id:f.funcionario_id,proteina:j%%2?'Carne moída':'Frango assado',opcao_extra:j==0?'Ovo frito':'',itens_removidos:f.pode_alterar_quentinha&&%d%%2==0?['Feijão']:[],observacao:''}));
                  w.salvarPedidoEmpresa(tk,{itens:itens}); return 1;""" % (email,qtd,i)))
            await pg.evaluate(chamar("""const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token; w.__novaExecucao();
               const d=w.listarPedidosDia(tk,'%s'); const p=d.pedidos.find(x=>x.nome_empresa==='Alfa'); w.__novaExecucao(); w.confirmarPedido(tk,p.pedido_id); return 1;""" % d.isoformat()))
        # cliente sem cadastro no último dia
        await pg.evaluate(chamar("""const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token; w.__novaExecucao();
           return w.salvarPedidoCliente(tk,{data:'%s',cliente_nome:'Marcos da Oficina',cliente_telefone:'',valor_unitario:'22,00',observacoes:'',itens:[{proteina:'Frango assado',quantidade:2}]}).mensagem;""" % dias[-1].isoformat()))
        # ---------- RELATÓRIOS ----------
        await pg.fill('#loginEmail','admin@rest.com'); await pg.fill('#loginSenha','senhaadmin12345'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#app:not([hidden])')
        await pg.click('#menuLateral [data-tela=relatorios]'); await pg.wait_for_selector('#relatorioConteudo .indicador', timeout=10000)
        print('filtro:', await pg.input_value('#relatorioInicio'), '->', await pg.input_value('#relatorioFim'))
        print('indicadores:', [x.replace('\n',' ') for x in await pg.eval_on_selector_all('#relatorioConteudo .indicador','e=>e.map(x=>x.innerText)')])
        print('alerta:', await pg.eval_on_selector_all('#relatorioConteudo .alerta .texto','e=>e.map(x=>x.textContent)'))
        await pg.screenshot(path='v8/a1_relatorio_empresa.png', full_page=True)
        for aba,arq in [('Por dia','a2_dia'),('Por funcionário','a3_func'),('Por proteína','a4_prot')]:
            await pg.click('.aba-relatorio:has-text("%s")'%aba); await pg.wait_for_timeout(200)
            await pg.screenshot(path='v8/%s.png'%arq, full_page=True)
        await pg.click('.aba-relatorio:has-text("Por funcionário")'); await pg.fill('#relatorioArea input[type=search]','obra')
        print('busca "obra":', await pg.inner_text('.total-relatorio'))
        # filtro empresa
        await pg.select_option('#relatorioEmpresa', label='Beta Engenharia'); await pg.wait_for_timeout(1200)
        print('Beta:', await pg.inner_text('.relatorio-topo h2'), '|', [x.split('\n')[1] for x in await pg.eval_on_selector_all('#relatorioConteudo .indicador','e=>e.map(x=>x.innerText)')])
        await pg.select_option('#relatorioEmpresa', label='Clientes sem cadastro'); await pg.wait_for_timeout(1200)
        print('Clientes:', [x.split('\n')[1] for x in await pg.eval_on_selector_all('#relatorioConteudo .indicador','e=>e.map(x=>x.innerText)')])
        await pg.select_option('#relatorioPeriodo', 'hoje'); await pg.wait_for_timeout(1200)
        print('Hoje + clientes:', await pg.inner_text('#relatorioConteudo')[:0] if False else (await pg.inner_text('#relatorioConteudo'))[:80].replace('\n',' | '))
        await pg.select_option('#relatorioEmpresa', label='Todas as empresas'); await pg.select_option('#relatorioPeriodo', 'este-mes'); await pg.wait_for_timeout(1500)
        # Excel
        async with pg.expect_download() as info:
            await pg.click('.relatorio-exportar button:has-text("Excel")')
        dl=await info.value; caminho='v8/relatorio.xlsx'; await dl.save_as(caminho)
        print('arquivo:', dl.suggested_filename)
        wb=openpyxl.load_workbook(caminho)
        print('abas:', wb.sheetnames)
        for nome in wb.sheetnames:
            ws=wb[nome]; print('  ',nome, ws.max_row,'linhas |', [c.value for c in ws[2]][:7], '| última:', [c.value for c in ws[ws.max_row]][:8])
        ws=wb['Detalhado']; print('   formato data/valor:', ws['A2'].number_format, type(ws['A2'].value).__name__, ws['J2'].number_format)
        # PDF
        await pg.evaluate("window.print=function(){}")
        await pg.click('.relatorio-exportar button:has-text("PDF")'); await pg.wait_for_timeout(300)
        print('pdf seções:', await pg.locator('#areaImpressao section').count())
        await pg.emulate_media(media='print'); await pg.pdf(path='v8/relatorio.pdf', format='A4', print_background=True); await pg.emulate_media(media='screen')
        await pg.evaluate("$('areaImpressao').innerHTML=''")
        # celular
        await pg.set_viewport_size({'width':390,'height':844}); await pg.wait_for_timeout(300)
        await pg.screenshot(path='v8/a5_m_relatorio.png', full_page=True)
        await pg.set_viewport_size({'width':1440,'height':900})
        # ---------- IMPRESSÃO DE PEDIDOS (alteradas separadas) ----------
        await pg.evaluate(SRV+".__agora=new Date(%d,%d,%d,8,0).getTime()"%(dias[-1].year,dias[-1].month-1,dias[-1].day))
        await pg.click('#menuLateral [data-tela=pedidos]'); await pg.wait_for_selector('.cartao-pedido')
        await pg.evaluate("abrirPedidosDia('%s')" % dias[-2].isoformat()); await pg.wait_for_timeout(1500)
        await pg.click('.cardapio-acoes button:has-text("Imprimir")'); await pg.wait_for_selector('.lista-impressao')
        await pg.click('#modalCorpo button[type=submit]'); await pg.wait_for_timeout(400)
        print('impressão: subtítulos =', await pg.eval_on_selector_all('#areaImpressao .imp-subtitulo','e=>e.map(x=>x.textContent)'))
        await pg.emulate_media(media='print'); await pg.pdf(path='v8/pedidos_alteradas.pdf', format='A4', print_background=True); await pg.emulate_media(media='screen')
        await pg.evaluate("$('areaImpressao').innerHTML=''")
        # ---------- VALOR DO CLIENTE ----------
        await pg.evaluate(SRV+".__agora=Date.now()")
        await pg.evaluate("abrirPedidosDia(hojeTexto())"); await pg.wait_for_timeout(1500)
        if await pg.locator('.cardapio-acoes button:has-text("Pedido de cliente")').count():
            await pg.click('.cardapio-acoes button:has-text("Pedido de cliente")'); await pg.wait_for_selector('.form-pedido-cliente')
            campo='.form-pedido-cliente input[data-mascara=moeda]'
            await pg.fill(campo,''); await pg.type(campo,'2000', delay=50); await pg.wait_for_timeout(100)
            print('valor digitado 2000 ->', await pg.input_value(campo), '| total:', (await pg.inner_text('.total-cliente')).replace('\n',' '))
            await pg.fill(campo,''); await pg.type(campo,'1850', delay=50); await pg.wait_for_timeout(100)
            await pg.click('.linha-cliente button[title=Aumentar]'); await pg.wait_for_timeout(100)
            print('valor 1850, 2 quentinhas ->', await pg.input_value(campo), '| total:', (await pg.inner_text('.total-cliente')).replace('\n',' '))
        else:
            print('sem botão de cliente hoje (fim de semana?)')
        await b.close()
asyncio.run(main())
print('ERROS:', erros)
