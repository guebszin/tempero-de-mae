import asyncio
from playwright.async_api import async_playwright
erros=[]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}, timezone_id='America/Sao_Paulo', locale='pt-BR')
        pg=await ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
        pg.on('console', lambda m: erros.append(m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        await pg.fill('#loginEmail','admin@rest.com'); await pg.fill('#loginSenha','senhaadmin12345'); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#alertasAdmin .alerta')
        print('alertas inicio:', await pg.eval_on_selector_all('#alertasAdmin .alerta .texto', 'e=>e.map(x=>x.textContent)'))
        # cria empresa p/ testar portal depois
        await pg.click('#menuLateral [data-tela=empresas]'); await pg.wait_for_timeout(300)
        f='#modalCorpo form '
        await pg.click('#botaoNovaEmpresa'); await pg.wait_for_selector(f)
        await pg.fill(f+'[name=nome]','Alfa'); await pg.fill(f+'[name=email]','alfa@x.com')
        await pg.click(f+'[data-enviar]'); await pg.wait_for_selector('#modalCorpo [data-mensagem]')
        codigoAlfa=(await pg.inner_text('#modalCorpo [data-link]')).split('convite=')[1]; senha='abc123'
        await pg.evaluate("(function(w){w.__novaExecucao(); w.concluirConvite('%s','abc123',false);})(document.getElementById('servidor').contentWindow)" % codigoAlfa)
        await pg.click('#modalCorpo [data-cancelar]')
        # cardápio
        await pg.click('#menuLateral [data-tela=cardapios]'); await pg.wait_for_selector('#listaDiasCardapio')
        await pg.screenshot(path='40_cardapio_vazio.png')
        dia='#listaDiasCardapio .dia-cardapio[data-indice="0"] '
        # sugestões de um clique: Arroz, Feijão
        for item in ['Arroz','Feijão','Macarrão','Farofa']:
            await pg.click(dia+f'.grupo-cardapio:nth-child(2) .sugestao:has-text("{item}")')
        # salada digitando com vírgula
        await pg.click(dia+'.grupo-cardapio:nth-child(3) input.campo-item'); await pg.keyboard.type('alface, pepino, tomate'); await pg.keyboard.press('Enter')
        await pg.click(dia+'.grupo-cardapio:nth-child(4) input.campo-item'); await pg.keyboard.type('Abóbora madura'); await pg.keyboard.press('Enter')
        await pg.click(dia+'.grupo-cardapio:nth-child(5) input.campo-item'); await pg.keyboard.type('Carne de boi com batata'); await pg.keyboard.press('Enter')
        await pg.keyboard.type('Filé de peixe frito'); await pg.keyboard.press('Enter')
        await pg.wait_for_timeout(2500)
        print('estado salvamento:', await pg.inner_text('#estadoSalvamentoCardapio'))
        print('planilha seg:', await pg.evaluate("document.getElementById('servidor').contentWindow.__abas.CARDAPIOS.rows.slice(1).map(r=>[r[2],r[3],r[4],r[6],r[7],r[9]])"))
        # copiar dia anterior para terça e editar proteína
        await pg.click('#listaDiasCardapio .dia-cardapio[data-indice="1"] .dia-acoes button:first-child')
        await pg.wait_for_timeout(200)
        # quarta: sem proteína (pra testar validação)
        await pg.click('#listaDiasCardapio .dia-cardapio[data-indice="2"] .grupo-cardapio:nth-child(2) .sugestao:has-text("Arroz")')
        # quinta: observação feriado
        await pg.fill('#listaDiasCardapio .dia-cardapio[data-indice="3"] input.observacao','Feriado - sem atendimento')
        await pg.wait_for_timeout(2500)
        await pg.click('#botaoPublicarCardapio'); await pg.wait_for_timeout(500)
        print('toast validação:', await pg.eval_on_selector_all('.toast .texto','e=>e.map(x=>x.textContent).slice(-1)'))
        # adiciona proteína na quarta
        await pg.click('#listaDiasCardapio .dia-cardapio[data-indice="2"] .grupo-cardapio:nth-child(5) input.campo-item'); await pg.keyboard.type('Carne moída'); await pg.keyboard.press('Enter')
        await pg.wait_for_timeout(300)
        await pg.screenshot(path='41_cardapio_montado.png', full_page=True)
        await pg.click('#botaoPublicarCardapio'); await pg.wait_for_selector('#confirmacaoFundo:not([hidden])')
        print('confirmação:', await pg.inner_text('#confirmacaoTexto'))
        await pg.click('#confirmacaoOk'); await pg.wait_for_timeout(2500)
        print('situação:', await pg.inner_text('#situacaoCardapio'), '| status planilha:', await pg.evaluate("document.getElementById('servidor').contentWindow.__abas.CARDAPIOS.rows.slice(1).map(r=>r[9])"))
        # próxima semana: copiar anterior
        await pg.click('.semana-nav button[title="Próxima semana"]'); await pg.wait_for_selector('#listaDiasCardapio')
        await pg.wait_for_timeout(500)
        await pg.click('.cardapio-acoes button:has-text("Copiar semana anterior")'); await pg.wait_for_timeout(1500)
        print('prox semana após copiar - seg itens:', await pg.eval_on_selector_all('#listaDiasCardapio .dia-cardapio[data-indice="0"] .chip > span:first-child','e=>e.map(x=>x.textContent)'))
        await pg.wait_for_timeout(2000)
        print('linhas planilha:', await pg.evaluate("document.getElementById('servidor').contentWindow.__abas.CARDAPIOS.rows.length-1"))
        # voltar à semana atual (instantâneo, do cache)
        await pg.click('.semana-nav button:has-text("Esta semana")'); await pg.wait_for_timeout(400)
        # início: alertas
        await pg.click('#menuLateral [data-tela=inicio-admin]'); await pg.wait_for_timeout(1200)
        print('alertas inicio depois:', await pg.eval_on_selector_all('#alertasAdmin .alerta .texto', 'e=>e.map(x=>x.textContent)'))
        # empresa
        await pg.click('#botaoConta'); await pg.click('#menuConta [data-acao=sair]'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        await pg.fill('#loginEmail','alfa'); await pg.fill('#loginSenha',senha); await pg.click('#formLogin button[type=submit]')
        await pg.wait_for_selector('#cardapioDestaqueEmpresa > *'); await pg.wait_for_timeout(300)
        print('destaque:', await pg.inner_text('#tituloCardapioDestaque'))
        await pg.screenshot(path='42_inicio_empresa.png')
        await pg.click('#menuLateral [data-tela=cardapio-empresa]'); await pg.wait_for_selector('#gradeCardapioEmpresa .dia-cardapio, #gradeCardapioEmpresa .estado-vazio')
        await pg.screenshot(path='43_cardapio_empresa.png', full_page=True)
        await pg.click('.semana-nav button[title="Próxima semana"]'); await pg.wait_for_timeout(800)
        print('empresa prox semana (rascunho):', await pg.inner_text('#gradeCardapioEmpresa'))
        # celular
        await pg.set_viewport_size({'width':390,'height':844})
        await pg.click('.semana-nav button:has-text("Esta semana")'); await pg.wait_for_timeout(500)
        await pg.screenshot(path='44_m_cardapio_empresa.png')
        await b.close()
asyncio.run(main())
print('ERROS:', erros)
