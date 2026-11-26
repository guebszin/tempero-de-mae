import asyncio
from playwright.async_api import async_playwright
erros=[]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg=await (await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo')).new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        pg.on('console', lambda m: erros.append(m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        await pg.fill('#loginEmail','admin@rest.com'); await pg.fill('#loginSenha','senhaadmin12345'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#app:not([hidden])')
        f='#modalCorpo form '
        # empresa com senha de 6 caracteres
        await pg.click('#menuLateral [data-tela=empresas]'); await pg.wait_for_timeout(300)
        await pg.click('#botaoNovaEmpresa'); await pg.wait_for_selector(f)
        await pg.fill(f+'[name=nome]','Alfa'); await pg.fill(f+'[name=email]','alfa@x.com'); await pg.fill(f+'[name=login]','al fa')
        await pg.click(f+'[data-enviar]'); await pg.wait_for_selector(f+'[data-erro]:not([hidden])'); print('usuário inválido:', await pg.inner_text(f+'[data-erro]'))
        await pg.fill(f+'[name=login]','alfa'); await pg.click(f+'[data-enviar]'); await pg.wait_for_selector('#modalCorpo [data-mensagem]'); print('convite gerado')
        codigoAlfa=(await pg.inner_text('#modalCorpo [data-link]')).split('convite=')[1]
        await pg.click('#modalCorpo [data-cancelar]')
        await pg.evaluate("(function(w){w.__novaExecucao(); w.concluirConvite('%s','abc123',false);})(document.getElementById('servidor').contentWindow)" % codigoAlfa)
        # funcionários pelo restaurante
        await pg.click('#menuLateral [data-tela=funcionarios-admin]'); await pg.wait_for_selector('#listaFuncionariosAdmin .estado-vazio')
        print('empresa pré-selecionada:', await pg.eval_on_selector('#filtroEmpresaFuncionarios','s=>s.options[s.selectedIndex].text'))
        await pg.click('#botaoNovoFuncionarioAdmin'); await pg.wait_for_selector(f)
        print('empresa no form:', await pg.eval_on_selector(f+'[name=empresa_id]','s=>s.options[s.selectedIndex].text'))
        await pg.fill(f+'[name=nome]','Carlos Souza'); await pg.fill(f+'[name=matricula]','00123'); await pg.fill(f+'[name=setor]','Obras')
        await pg.click(f+'button:has-text("Salvar e cadastrar outro")'); await pg.wait_for_timeout(700)
        print('mantém empresa/setor:', await pg.input_value(f+'[name=empresa_id]')!='', await pg.input_value(f+'[name=setor]'))
        await pg.fill(f+'[name=nome]','Fernanda Dias'); await pg.fill(f+'[name=matricula]','00123'); await pg.check(f+'[name=pode_alterar_quentinha]')
        await pg.click(f+'[data-enviar]'); await pg.wait_for_selector(f+'[data-erro]:not([hidden])'); print('matrícula dup:', await pg.inner_text(f+'[data-erro]'))
        await pg.fill(f+'[name=matricula]','00124'); await pg.click(f+'[data-enviar]'); await pg.wait_for_timeout(800)
        print('lista admin:', await pg.eval_on_selector_all('#listaFuncionariosAdmin .lista-linha .principal','e=>e.map(x=>x.textContent)'))
        # editar
        await pg.click('#listaFuncionariosAdmin .lista-linha:has-text("Carlos") button:has-text("Editar")'); await pg.wait_for_selector(f)
        print('empresa travada na edição:', await pg.is_disabled(f+'[name=empresa_id]'))
        await pg.check(f+'[name=pode_alterar_quentinha]'); await pg.click(f+'[data-enviar]'); await pg.wait_for_timeout(800)
        # inativar
        await pg.click('#listaFuncionariosAdmin .lista-linha:has-text("Fernanda") button:has-text("Inativar")'); await pg.click('#confirmacaoOk'); await pg.wait_for_timeout(800)
        print('ativos visíveis:', await pg.eval_on_selector_all('#listaFuncionariosAdmin .lista-linha .principal','e=>e.map(x=>x.textContent)'), '|', await pg.inner_text('#contadorFuncionariosAdmin'))
        await pg.screenshot(path='50_func_admin.png')
        # contagem na lista de empresas atualizada sem nova consulta
        await pg.click('#menuLateral [data-tela=empresas]'); await pg.wait_for_timeout(300)
        print('empresa mostra funcionários ativos:', await pg.inner_text('#listaEmpresas .lista-linha:has-text("Alfa") .lista-celula:nth-child(4)'))
        # empresa: somente consulta
        await pg.click('#botaoConta'); await pg.click('#menuConta [data-acao=sair]'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        await pg.fill('#loginEmail','alfa'); await pg.fill('#loginSenha','abc123'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#indicadoresEmpresa .indicador')
        print('indicadores empresa:', await pg.eval_on_selector_all('#indicadoresEmpresa .indicador-rotulo','e=>e.map(x=>x.textContent)'))
        await pg.click('#atalhoVerFuncionarios'); await pg.wait_for_selector('#listaFuncionarios .lista-linha')
        print('empresa vê:', await pg.eval_on_selector_all('#listaFuncionarios .lista-linha .principal','e=>e.map(x=>x.textContent)'),
              '| botões na lista:', await pg.locator('#listaFuncionarios button').count(), '| botão novo existe:', await pg.locator('#botaoNovoFuncionario').count())
        await pg.screenshot(path='51_func_empresa.png')
        # empresa tentando gravar direto no servidor (deve ser bloqueado)
        r=await pg.evaluate("""new Promise(res=>google.script.run.withSuccessHandler(()=>res('GRAVOU!')).withFailureHandler(e=>res(e.message)).salvarFuncionario(estado.token,{nome:'Intruso da Silva'}))""")
        print('empresa chamando salvarFuncionario:', r)
        # trocar senha para 6 caracteres
        await pg.click('#botaoConta'); await pg.click('#menuConta [data-acao=trocar-senha]'); await pg.wait_for_selector(f)
        await pg.fill(f+'[name=atual]','abc123'); await pg.fill(f+'[name=nova]','xyz789'); await pg.fill(f+'[name=confirmacao]','xyz789')
        await pg.click(f+'[data-enviar]'); await pg.wait_for_timeout(1500); print('trocou senha (modal fechado):', not await pg.is_visible('#modalFundo'))
        await b.close()
asyncio.run(main())
print('ERROS:', erros)
