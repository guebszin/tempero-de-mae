# Versão 27: "Manter conectado até o fim do dia" (entrada vale só no dia)
import asyncio, datetime, json
from playwright.async_api import async_playwright
erros=[]
SRV="document.getElementById('servidor').contentWindow"
def chamar(js): return "(function(w){w.__novaExecucao();"+js+"})("+SRV+")"
def ok(c,t):
    print(('OK   ' if c else 'FALHA ')+t)
    if not c: erros.append('FALHA '+t)
def relogio(d,h=8,m=0): return SRV+".__agora=new Date(%d,%d,%d,%d,%d).getTime()"%(d.year,d.month-1,d.day,h,m)
async def entrar(pg,u,s,lembrar):
    await pg.fill('#loginEmail',u); await pg.fill('#loginSenha',s)
    if await pg.is_checked('#loginLembrar') != lembrar: await pg.click('#loginLembrar')
    await pg.click('#formLogin button[type=submit]')
    await pg.wait_for_selector('#app:not([hidden]), #erroLogin:not([hidden])'); await pg.wait_for_timeout(700)
async def abrir(ctx):
    pg=await ctx.new_page()
    pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
    await pg.goto('http://localhost:8765/index.html')
    await pg.wait_for_selector('#app:not([hidden]), #telaLogin:not([hidden])', timeout=30000); await pg.wait_for_timeout(800)
    return pg
async def tela(pg): return 'app' if await pg.is_visible('#app') else 'login'

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1280,'height':850}, timezone_id='America/Sao_Paulo', locale='pt-BR')
        pg=await ctx.new_page()
        await pg.goto('http://localhost:8765/index.html'); await pg.evaluate("localStorage.clear()")
        hoje=datetime.date.today()
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#telaLogin:not([hidden])')
        await pg.evaluate(relogio(hoje,10))

        txt=await pg.inner_text('label.lembrar-login')
        ok(txt.strip()=='Manter conectado até o fim do dia', 'texto da opção (%s)'%txt.strip())

        # Com a opção marcada: outra aba entra sozinha no mesmo dia
        await entrar(pg,'admin@rest.com','senhaadmin12345',True)
        ok(await tela(pg)=='app', 'entrou')
        lembrete=await pg.evaluate("loginSalvoAoAbrir()")
        exp=await pg.evaluate(chamar("const d=JSON.parse(w.PropertiesService.getScriptProperties().getProperty(w.chaveLoginSalvo_(%s))); return d.expira;"%json.dumps(lembrete)))
        meia=await pg.evaluate("(function(){const d=new Date(%d,%d,%d);d.setDate(d.getDate()+1);return d.getTime();})()"%(hoje.year,hoje.month-1,hoje.day))
        ok(exp==meia, 'login salvo vence à meia-noite de hoje')
        await pg.evaluate(relogio(hoje,23,50))
        pg2=await abrir(ctx)
        ok(await tela(pg2)=='app', 'às 23:50 outra aba entra sem senha')
        await pg2.close()

        # Virou o dia: precisa entrar de novo (aba nova e aba aberta)
        await pg.evaluate(relogio(hoje+datetime.timedelta(days=1),7,30))
        pg3=await abrir(ctx)
        ok(await tela(pg3)=='login', 'no dia seguinte a aba nova pede a senha')
        await pg3.close()
        r=await pg.evaluate("apiSessao('obterResumoAdmin').then(()=>'ok',e=>e.message)")
        await pg.wait_for_timeout(1500)
        ok(await tela(pg)=='login', 'aba que ficou aberta volta para o login (%s)'%r)
        r=await pg.evaluate(chamar("try{w.entrarComLoginSalvo(%s);return 'entrou'}catch(e){return e.message}"%json.dumps(lembrete)))
        ok('expirou' in r, 'servidor recusa o login salvo de ontem (%s)'%r)

        # Sem a opção: sessão também acaba na virada do dia
        await entrar(pg,'admin@rest.com','senhaadmin12345',False)
        tk=await pg.evaluate("estado.token")
        await pg.evaluate(relogio(hoje+datetime.timedelta(days=2),8))
        r=await pg.evaluate(chamar("try{w.validarSessao(%s);return 'valida'}catch(e){return e.message}"%json.dumps(tk)))
        ok('novo dia' in r, 'sessão de ontem expira (%s)'%r)

        # Login salvo antigo (regra dos 30 dias) não vale mais
        r=await pg.evaluate(chamar("""
          const props=w.PropertiesService.getScriptProperties(); const lem='x'.repeat(80);
          const u=w.lerUsuarios_().lista.find(u=>u.perfil==='admin');
          props.setProperty(w.chaveLoginSalvo_(lem), JSON.stringify({usuario_id:u.usuario_id, assinatura:w.assinaturaSenha_(u.senha_hash), expira:Date.now()+20*86400000, usado:Date.now()}));
          w.__novaExecucao(); try{w.entrarComLoginSalvo(lem);return 'entrou'}catch(e){return e.message}"""))
        ok('expirou' in r, 'login salvo antigo de 30 dias é recusado (%s)'%r)

        await b.close()
    print('ERROS:', erros if erros else 'nenhum')

asyncio.run(main())
