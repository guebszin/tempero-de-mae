import asyncio, datetime, os
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
ADM="const tk=w.autenticarUsuario('admin@rest.com','senhaadmin12345').token; w.__novaExecucao();"
CAIXA="const tk=w.autenticarUsuario('caixa@rest.com','caixa12345').token; w.__novaExecucao();"
os.makedirs('v16', exist_ok=True)
def ok(c,t):
    print(('OK   ' if c else 'FALHA ')+t)
    if not c: erros.append('FALHA '+t)
def relogio(d,h=8): return SRV+".__agora=new Date(%d,%d,%d,%d,0).getTime()"%(d.year,d.month-1,d.day,h)

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo')
        pg=await ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        pg.on('console', lambda m: erros.append(m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.evaluate("localStorage.clear()")
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        # remove a aba do arquivo para testar a criação automática
        await pg.evaluate(SRV+".__abas.EMPRESAS_EXCLUIDAS && delete "+SRV+".__abas.EMPRESAS_EXCLUIDAS")

        hoje=datetime.date.today()
        # dias úteis de 3 semanas atrás até ontem
        dias=[hoje-datetime.timedelta(days=i) for i in range(21,0,-1)]
        dias=[d for d in dias if d.weekday()<5][:5]
        amanha=hoje+datetime.timedelta(days=1)
        while amanha.weekday()>=5: amanha+=datetime.timedelta(days=1)
        seg0=dias[0]-datetime.timedelta(days=dias[0].weekday())
        await pg.evaluate(relogio(dias[0],7))
        await pg.evaluate(chamar(ADM+"""
          for (const [n,em] of [['Marlon','marlon@x.com'],['Beta','beta@x.com']]) {
            w.__novaExecucao(); const e=w.criarEmpresa(tk,{nome:n,email:em,senha:'abc123',cnpj:'',endereco:'Rua A, 1'});
            w.__novaExecucao(); w.salvarPreco(tk,{empresa_id:e.empresa_id,valor_unitario:'20,00',data_inicio:'%s'});
            for (const [f,setor] of [['Joana '+n,'Cozinha'],['Pedro '+n,'Loja']]) { w.__novaExecucao(); w.salvarFuncionario(tk,{empresa_id:e.empresa_id,nome:f,setor:setor,matricula:String(Math.floor(Math.random()*90000+1000)),pode_alterar_quentinha:true}); }
          }
          const dia={acompanhamentos:['Arroz'],saladas:['Alface'],guarnicoes:['Purê'],proteinas:['Frango assado','Carne moída'],opcao_extra:'',observacoes:''};
          for (let s=0;s<6;s++){ const d=new Date(%d,%d,%d+7*s); const segunda=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
            w.__novaExecucao(); w.salvarSemanaCardapio(tk,segunda,[0,1,2,3,4].map(()=>dia)); w.__novaExecucao(); w.publicarSemanaCardapio(tk,segunda,true); }
          w.__novaExecucao(); w.criarAdministrador(tk,{nome:'Caixa',email:'caixa@rest.com',senha:'caixa12345'});
          return 1;""" % (dias[0].replace(day=1).isoformat() if False else (dias[0]-datetime.timedelta(days=1)).isoformat(), seg0.year, seg0.month-1, seg0.day)))
        PEDIR="""const tk=w.autenticarUsuario('%s','abc123').token; w.__novaExecucao();
          const est=w.obterPedidoEmpresa(tk); w.__novaExecucao();
          const itens=est.funcionarios.map(f=>({funcionario_id:f.funcionario_id,proteina:'Frango assado',opcao_extra:'',itens_removidos:[],observacao:''}));
          w.salvarPedidoEmpresa(tk,{itens:itens}); return 1;"""
        for d in dias + [amanha]:
            await pg.evaluate(relogio(d,8))
            for em in ['marlon@x.com','beta@x.com']: await pg.evaluate(chamar(PEDIR%em))
        await pg.evaluate(relogio(hoje,10))
        ids=await pg.evaluate(chamar(ADM+"const l=w.listarEmpresas(tk); return Object.fromEntries(l.map(e=>[e.nome_empresa,e.empresa_id]));"))
        mid=ids['Marlon']
        # cobrança dos 3 primeiros dias + pagamento parcial
        r=await pg.evaluate(chamar(ADM+"const c=w.gerarCobranca(tk,{empresa_id:'%s',inicio:'%s',fim:'%s',vencimento:'%s',observacoes:''}); w.__novaExecucao(); const cid=(c.cobranca&&c.cobranca.cobranca_id)||c.cobranca_id; w.registrarPagamento(tk,{cobranca_id:cid,data:'%s',valor:'50,00',forma:'PIX',comprovante:'',observacoes:''}); return cid;"%(mid,dias[0].isoformat(),dias[2].isoformat(),(hoje+datetime.timedelta(days=5)).isoformat(),hoje.isoformat())))
        cid=r
        ok(bool(cid), 'cobrança gerada com pagamento parcial')
        rel_antes=await pg.evaluate(chamar(ADM+"return w.gerarRelatorio(tk,{inicio:'%s',fim:'%s',empresa:''});"%(dias[0].isoformat(),hoje.isoformat())))
        marlon_antes=[e for e in rel_antes['por_empresa'] if e['nome']=='Marlon'][0]

        # inativar Marlon
        await pg.evaluate(chamar(ADM+"w.alterarStatusEmpresa(tk,'%s',false); return 1;"%mid))

        # ---------- administrador comum: bloqueado ----------
        msg=await pg.evaluate(chamar(CAIXA+"try{w.excluirEmpresa(tk,'%s','Marlon',{manter_historico:true});return 'excluiu'}catch(e){return e.message}"%mid))
        ok('Somente o proprietário' in msg, 'administrador comum não exclui com histórico: '+msg[:60])
        pv=await pg.evaluate(chamar(CAIXA+"return w.previaExclusaoEmpresa(tk,'%s');"%mid))
        ok(pv['tem_historico'] and not pv['proprietario'], 'prévia para administrador comum: sem permissão')
        # sem a opção explícita, nem o proprietário exclui
        msg=await pg.evaluate(chamar(ADM+"try{w.excluirEmpresa(tk,'%s','Marlon');return 'excluiu'}catch(e){return e.message}"%mid))
        ok('histórico' in msg and msg!='excluiu', 'sem confirmar histórico não exclui: '+msg[:60])

        # ---------- tela: proprietário ----------
        await pg.fill('#loginEmail','admin@rest.com'); await pg.fill('#loginSenha','senhaadmin12345'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#app:not([hidden])')
        await pg.click('#menuLateral [data-tela=empresas]'); await pg.wait_for_timeout(400)
        await pg.select_option('#filtroStatusEmpresas','INATIVO'); await pg.wait_for_timeout(200)
        f='#modalCorpo form '
        await pg.click('#listaEmpresas .lista-linha:has-text("Marlon") button:has-text("Excluir")'); await pg.wait_for_selector(f+'.resumo-exclusao')
        texto=await pg.inner_text(f)
        ok('5 pedido(s)' in texto and '1 cobrança(s)' in texto and '1 em aberto' in texto and '1 pagamento(s)' in texto, 'prévia mostra o que fica guardado')
        ok('1 pedido(s) com entrega futura' in texto, 'prévia avisa do pedido futuro cancelado')
        ok(await pg.inner_text(f+'[data-enviar]')=='Excluir e guardar histórico', 'botão: Excluir e guardar histórico')
        await pg.fill(f+'[name=confirmacao]','marlon')
        await pg.screenshot(path='v16/x1_previa.png')
        await pg.click(f+'[data-enviar]'); await pg.wait_for_selector('#modalFundo', state='hidden')
        await pg.wait_for_timeout(300)
        ok(await pg.locator('#listaEmpresas .lista-linha:has-text("Marlon")').count()==0, 'Marlon some da lista')

        a=await pg.evaluate("(function(w){const a=w.__abas;return {criada:(w.__abasCriadas||[]).includes('EMPRESAS_EXCLUIDAS'),arq:a.EMPRESAS_EXCLUIDAS.rows,emp:a.EMPRESAS.rows.map(r=>r[1]),usu:a.USUARIOS.rows.map(r=>r[3]),fun:a.FUNCIONARIOS.rows.map(r=>r[2]),pre:a.PRECOS.rows.map(r=>r[1]),ped:a.PEDIDOS.rows.filter(r=>r[1]==='%s').map(r=>r[5]),cob:a.COBRANCAS.rows.filter(r=>r[1]==='%s').length,pag:a.PAGAMENTOS.rows.filter(r=>r[2]==='%s').length,log:a.LOGS.rows.slice(-1)[0][3]}})(%s)"%(mid,mid,mid,SRV))
        ok(len(a['arq'])==2 and a['arq'][1][1]=='Marlon', 'aba EMPRESAS_EXCLUIDAS criada com a empresa')
        ok('Marlon' not in a['emp'] and 'marlon@x.com' not in a['usu'], 'cadastro e acesso apagados')
        ok(not any('Marlon' in n for n in a['fun']) and mid not in a['pre'], 'funcionários e preços apagados')
        ok(a['ped'].count('CANCELADO')==1 and len(a['ped'])==6, 'pedidos guardados, só o futuro cancelado: %s'%a['ped'])
        ok(a['cob']==1 and a['pag']==1, 'cobrança e pagamento guardados')
        ok(a['log']=='EXCLUIR_EMPRESA_COM_HISTORICO', 'log registrado')
        msg=await pg.evaluate(chamar("try{w.autenticarUsuario('marlon@x.com','abc123');return 'entrou'}catch(e){return e.message}"))
        ok(msg!='entrou', 'empresa excluída não entra mais')

        # ---------- relatórios continuam iguais ----------
        rel=await pg.evaluate(chamar(ADM+"return w.gerarRelatorio(tk,{inicio:'%s',fim:'%s',empresa:''});"%(dias[0].isoformat(),hoje.isoformat())))
        m=[e for e in rel['por_empresa'] if e['nome']=='Marlon (excluída)']
        ok(m and m[0]['quentinhas']==marlon_antes['quentinhas'] and abs(m[0]['valor']-marlon_antes['valor'])<0.01, 'relatório mantém Marlon (excluída) com os mesmos números')
        ok(abs(rel['totais']['valor']-rel_antes['totais']['valor'])<0.01, 'total do relatório igual ao de antes')
        pessoas=[x for x in rel['por_funcionario'] if 'Marlon' in x['nome']]
        ok(len(pessoas)==2 and all(x['setor'] for x in pessoas), 'funcionários da empresa excluída continuam com nome e setor')
        relm=await pg.evaluate(chamar(ADM+"return w.gerarRelatorio(tk,{inicio:'%s',fim:'%s',empresa:'%s'});"%(dias[0].isoformat(),hoje.isoformat(),mid)))
        ok(relm['nome_filtro']=='Marlon (excluída)' and relm['totais']['quentinhas']==marlon_antes['quentinhas'], 'relatório filtrado pela empresa excluída')

        # ---------- cobranças ----------
        det=await pg.evaluate(chamar(ADM+"return w.detalharCobranca(tk,'%s');"%cid))
        ok(det['empresa'] and det['empresa']['nome_empresa']=='Marlon' and det['cobranca']['saldo']>0, 'cobrança em aberto abre com os dados da empresa')
        msg=await pg.evaluate(chamar(ADM+"try{w.registrarPagamento(tk,{cobranca_id:'%s',data:'%s',valor:'10,00',forma:'PIX',comprovante:'',observacoes:''});return 'ok'}catch(e){return e.message}"%(cid,hoje.isoformat())))
        ok(msg=='ok', 'ainda dá para registrar pagamento: '+msg[:60])
        painel=await pg.evaluate(chamar(ADM+"return w.obterPainelCobrancas(tk);"))
        ok(any(c['nome_empresa']=='Marlon (excluída)' for c in painel['cobrancas']), 'lista de cobranças mostra Marlon (excluída)')

        # ---------- tela de relatórios: opção da excluída ----------
        await pg.click('#menuLateral [data-tela=relatorios]'); await pg.wait_for_timeout(1200)
        opcoes=await pg.eval_on_selector_all('#relatorioEmpresa option','os=>os.map(o=>o.textContent)')
        ok('Marlon (excluída)' in opcoes, 'filtro de relatórios lista Marlon (excluída)')
        await pg.click('#menuLateral [data-tela=cobrancas]'); await pg.wait_for_timeout(1200)
        await pg.screenshot(path='v16/x2_cobrancas.png')
        # Beta intacta
        rb=await pg.evaluate(chamar("const tk=w.autenticarUsuario('beta@x.com','abc123').token; return tk?'ok':'x';"))
        ok(rb=='ok', 'outra empresa continua normal')

        # ---------- sem histórico continua para qualquer administrador ----------
        r=await pg.evaluate(chamar(CAIXA+"""const e=w.criarEmpresa(tk,{nome:'Vazia',email:'v@x.com',senha:'abc123'}); w.__novaExecucao();
          w.alterarStatusEmpresa(tk,e.empresa_id,false); w.__novaExecucao(); return w.excluirEmpresa(tk,e.empresa_id,'vazia').mensagem;"""))
        ok('definitivamente' in r, 'empresa sem histórico: administrador comum exclui')
        # erro sem prefixo "Error:"
        await pg.evaluate("apiSessao('excluirEmpresa','nao-existe','x').catch(e=>{window.__m=e.message})"); await pg.wait_for_timeout(500)
        m=await pg.evaluate("window.__m")
        ok(m and not m.startswith('Error'), 'mensagem de erro sem "Error:": '+str(m)[:40])
        # criação automática da aba do arquivo, se não existir
        r=await pg.evaluate(chamar("delete w.__abas.EMPRESAS_EXCLUIDAS; const antes=w.lerEmpresasExcluidas_().length; w.abaEmpresasExcluidas_(); return [antes, w.__abas.EMPRESAS_EXCLUIDAS.rows[0].join(',')];"))
        ok(r[0]==0 and r[1].startswith('empresa_id,nome_empresa'), 'sem a aba: lê vazio e cria com cabeçalhos')
        await b.close()
    print('ERROS:', erros if erros else 'nenhum')
    if erros: raise SystemExit(1)
asyncio.run(main())
