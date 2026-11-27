// ================================================================
// MODOTESTE.gs
// Modo teste (somente o proprietário).
// - Usa uma planilha SEPARADA ("TESTE - Sistema de Quentinhas"), criada
//   no Drive do proprietário na primeira vez. A planilha real nunca é
//   tocada enquanto o modo teste está ligado.
// - Ao entrar, a planilha de teste é zerada e recebe dados fictícios
//   (empresas, funcionários, cardápios, pedidos e cobranças de alguns
//   meses), para testar todas as telas e o Dashboard.
// - Ao sair (ou ao clicar em "Sair" da conta), tudo o que foi feito no
//   teste é apagado.
// - Cada chamada do navegador traz o token da sessão; quando a sessão é
//   de teste, validarSessao troca a planilha usada naquela execução.
// ================================================================
const CHAVE_PLANILHA_TESTE = 'PLANILHA_TESTE_ID';
const PREFIXO_TESTE = 'teste_';
const NOME_PLANILHA_TESTE = 'TESTE - Sistema de Quentinhas (pode ignorar)';
const MESES_DADOS_TESTE = 3;   // meses inteiros antes do mês atual

let bancoTesteAtivo_ = false;

// Prefixo das chaves de cache e de convites (separa o teste do real)
function prefixoBanco_() {
  return bancoTesteAtivo_ ? PREFIXO_TESTE : '';
}

function idPlanilhaTeste_() {
  return PropertiesService.getScriptProperties().getProperty(CHAVE_PLANILHA_TESTE) || '';
}

// A partir daqui, esta execução lê e grava só na planilha de teste
function ativarBancoTeste_() {
  if (bancoTesteAtivo_) return;

  const id = idPlanilhaTeste_();
  let planilha = null;
  try { planilha = id ? SpreadsheetApp.openById(id) : null; } catch (erro) { planilha = null; }
  if (!planilha) throw new Error('O modo teste foi encerrado. Sessão expirada. Faça login novamente.');

  planilhaAberta_ = planilha;
  bancoTesteAtivo_ = true;
  versaoDadosAtual_ = null;
  limparMemoriaExecucao_();
}

// ----------------------------------------------------------------
// ENTRAR NO MODO TESTE
// Troca a sessão real por uma sessão de teste (o navegador passa a usar
// o token novo). Devolve o mesmo formato do login.
// ----------------------------------------------------------------
function entrarModoTeste(token) {
  const sessao = validarProprietario_(token);
  if (sessao.modo_teste) throw new Error('Você já está no modo teste.');

  const usuarioDono = lerUsuarios_().lista.find(u => u.usuario_id === sessao.usuario_id);
  const linhasConfig = lerAba_('CONFIG').map(l => l.slice(0, 3));
  const linhaDono = lerAba_('USUARIOS')[usuarioDono.linha - 1].slice(0, ESTRUTURA.USUARIOS.length);

  // Um teste por vez (duas abas entrando juntas não se atrapalham)
  const trava = LockService.getUserLock();
  trava.waitLock(30000);

  try {
    const planilha = prepararPlanilhaTeste_();
    apagarPropriedadesTeste_();

    planilhaAberta_ = planilha;
    bancoTesteAtivo_ = true;
    versaoDadosAtual_ = null;
    limparMemoriaExecucao_();

    preencherDadosTeste_(planilha, linhaDono, linhasConfig, sessao.usuario_id);
    SpreadsheetApp.flush();
    invalidarCacheAbas_();
    marcarPedidosAlterados_();
    limparMemoriaExecucao_();
  } finally {
    trava.releaseLock();
  }

  // Sessão de teste no lugar da real
  CacheService.getScriptCache().remove(chaveSessao_(token));

  const sessaoTeste = JSON.parse(JSON.stringify(sessao));
  delete sessaoTeste.permissoes;
  sessaoTeste.modo_teste = true;

  const tokenTeste = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put(chaveSessao_(tokenTeste), JSON.stringify(sessaoTeste), CONFIG.DURACAO_SESSAO_SEGUNDOS);

  const atual = validarSessao(tokenTeste);

  return {
    token: tokenTeste,
    usuario: comRecursos_(atual),
    dados_iniciais: carregarDadosIniciais_(atual)
  };
}

// ----------------------------------------------------------------
// SAIR DO MODO TESTE
// Apaga tudo o que foi feito no teste e volta ao sistema real.
// ----------------------------------------------------------------
function sairModoTeste(token) {
  const sessao = validarSessao(token);
  if (!sessao.modo_teste) throw new Error('Você não está no modo teste.');

  // Saindo enquanto vê como empresa: encerra também a sessão do restaurante
  const donoId = sessao.simulacao ? sessao.simulacao.proprietario_id : sessao.usuario_id;
  if (sessao.simulacao) CacheService.getScriptCache().remove(chaveSessao_(sessao.simulacao.token_restaurante));

  descartarTeste_(token);

  // Volta para a planilha real nesta execução
  bancoTesteAtivo_ = false;
  planilhaAberta_ = null;
  versaoDadosAtual_ = null;
  limparMemoriaExecucao_();

  const usuario = lerUsuarios_().lista.find(u => u.usuario_id === donoId);
  if (!usuario || usuario.status !== 'ATIVO' || usuario.perfil !== 'admin' || !ehProprietario_(usuario.email)) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const aberta = abrirSessao_(usuario, null);
  const real = validarSessao(aberta.token);

  return {
    token: aberta.token,
    usuario: comRecursos_(real),
    dados_iniciais: carregarDadosIniciais_(real)
  };
}

// ----------------------------------------------------------------
// VER COMO EMPRESA (só no modo teste)
// O proprietário passa a usar o sistema como o responsável de uma
// empresa fictícia, para mostrar o processo dos clientes. A sessão do
// restaurante fica guardada para voltar depois.
// ----------------------------------------------------------------
function listarEmpresasParaSimular(token) {
  const sessao = validarProprietario_(token);
  if (!sessao.modo_teste) throw new Error('Disponível somente no modo teste.');

  const usuarios = lerUsuarios_().lista;

  return lerEmpresas_().lista
    .filter(e => e.status === 'ATIVO')
    .map(e => {
      const responsavel = usuarios.find(u => u.perfil === 'empresa' && u.empresa_id === e.empresa_id && u.status === 'ATIVO');
      return {
        empresa_id: e.empresa_id,
        nome_empresa: e.nome_empresa,
        responsavel: responsavel ? responsavel.nome : '',
        tem_acesso: !!responsavel
      };
    })
    .sort((a, b) => a.nome_empresa.localeCompare(b.nome_empresa, 'pt-BR'));
}

function verComoEmpresa(token, empresaId) {
  const sessao = validarProprietario_(token);
  if (!sessao.modo_teste) throw new Error('Disponível somente no modo teste.');

  const empresa = lerEmpresas_().lista.find(e => e.empresa_id === String(empresaId || ''));
  if (!empresa) throw new Error('Empresa não encontrada.');
  if (empresa.status !== 'ATIVO') throw new Error('Esta empresa está inativa. Ative-a em Empresas para ver como ela.');

  const usuario = lerUsuarios_().lista.find(u => u.perfil === 'empresa' && u.empresa_id === empresa.empresa_id && u.status === 'ATIVO');
  if (!usuario) throw new Error('Esta empresa ainda não tem acesso de responsável. Crie o acesso em Empresas.');

  const sessaoEmpresa = {
    usuario_id: usuario.usuario_id,
    empresa_id: empresa.empresa_id,
    nome: usuario.nome,
    email: usuario.email,
    login: usuario.login || '',
    perfil: 'empresa',
    nome_empresa: empresa.nome_empresa,
    proprietario: false,
    modo_teste: true,
    dia: sessao.dia || hojeTexto_(Session.getScriptTimeZone()),
    simulacao: { token_restaurante: token, proprietario_id: sessao.usuario_id }
  };

  // A sessão do restaurante continua valendo (renovada) para a volta
  const cache = CacheService.getScriptCache();
  const guardada = cache.get(chaveSessao_(token));
  if (guardada) cache.put(chaveSessao_(token), guardada, CONFIG.DURACAO_SESSAO_SEGUNDOS);

  const tokenEmpresa = Utilities.getUuid() + Utilities.getUuid();
  cache.put(chaveSessao_(tokenEmpresa), JSON.stringify(sessaoEmpresa), CONFIG.DURACAO_SESSAO_SEGUNDOS);

  const atual = validarSessao(tokenEmpresa);

  return {
    token: tokenEmpresa,
    usuario: comRecursos_(atual),
    dados_iniciais: carregarDadosIniciais_(atual)
  };
}

function voltarParaRestaurante(token) {
  const sessao = validarSessao(token);
  if (!sessao.simulacao) throw new Error('Você não está vendo como empresa.');

  const tokenRestaurante = sessao.simulacao.token_restaurante;
  const cache = CacheService.getScriptCache();
  cache.remove(chaveSessao_(token));

  const guardada = cache.get(chaveSessao_(tokenRestaurante));
  if (!guardada) throw new Error('Sessão expirada. Faça login novamente.');
  cache.put(chaveSessao_(tokenRestaurante), guardada, CONFIG.DURACAO_SESSAO_SEGUNDOS);

  const restaurante = validarSessao(tokenRestaurante);

  return {
    token: tokenRestaurante,
    usuario: comRecursos_(restaurante),
    dados_iniciais: carregarDadosIniciais_(restaurante)
  };
}

// Apaga a sessão de teste, os dados e os convites do teste
function descartarTeste_(token) {
  if (token) CacheService.getScriptCache().remove(chaveSessao_(token));
  apagarPropriedadesTeste_();

  const id = idPlanilhaTeste_();
  if (!id) return;

  try {
    const planilha = SpreadsheetApp.openById(id);
    Object.keys(ESTRUTURA).forEach(nome => {
      const aba = planilha.getSheetByName(nome);
      if (aba && aba.getLastRow() > 1) {
        aba.getRange(2, 1, aba.getLastRow() - 1, Math.max(aba.getLastColumn(), 1)).clearContent();
      }
    });
    SpreadsheetApp.flush();
  } catch (erro) {
    Logger.log('Não foi possível limpar a planilha de teste: ' + erro.message);
  }
}

function apagarPropriedadesTeste_() {
  const propriedades = PropertiesService.getScriptProperties();
  Object.keys(propriedades.getProperties()).forEach(chave => {
    if (chave.indexOf(PREFIXO_TESTE) === 0) propriedades.deleteProperty(chave);
  });
}

// ----------------------------------------------------------------
// PLANILHA DE TESTE (criada uma vez, zerada a cada entrada)
// ----------------------------------------------------------------
function prepararPlanilhaTeste_() {
  const propriedades = PropertiesService.getScriptProperties();
  let planilha = null;
  const id = idPlanilhaTeste_();

  if (id) {
    try { planilha = SpreadsheetApp.openById(id); } catch (erro) { planilha = null; }
  }

  if (!planilha) {
    planilha = SpreadsheetApp.create(NOME_PLANILHA_TESTE);
    propriedades.setProperty(CHAVE_PLANILHA_TESTE, planilha.getId());
  }

  planilha.setSpreadsheetTimeZone(Session.getScriptTimeZone());

  Object.keys(ESTRUTURA).forEach(nome => {
    const cabecalhos = ESTRUTURA[nome];
    let aba = planilha.getSheetByName(nome);
    if (!aba) aba = planilha.insertSheet(nome);
    aba.clearContents();
    aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]).setFontWeight('bold');
    aba.setFrozenRows(1);
  });

  // Remove a aba padrão de uma planilha nova
  planilha.getSheets().forEach(aba => {
    if (!ESTRUTURA[aba.getName()] && planilha.getSheets().length > 1) planilha.deleteSheet(aba);
  });

  return planilha;
}

// ----------------------------------------------------------------
// DADOS FICTÍCIOS
// Sempre os mesmos (sorteio com semente fixa), com datas a partir de hoje.
// ----------------------------------------------------------------
const EMPRESAS_TESTE = [
  { nome: 'Construtora Horizonte', login: 'horizonte', responsavel: 'Marcos Silva', ciclo: 'MENSAL', dias: 10, precos: [20, 22], pessoas: 12 },
  { nome: 'Clínica Vida Plena', login: 'vidaplena', responsavel: 'Dra. Paula Reis', ciclo: 'QUINZENAL', dias: 5, precos: [24], pessoas: 8 },
  { nome: 'Transportadora Rota Sul', login: 'rotasul', responsavel: 'Jorge Almeida', ciclo: 'MENSAL', dias: 7, precos: [21], pessoas: 10 },
  { nome: 'Escritório Andrade & Lima', login: 'andradelima', responsavel: 'Carla Andrade', ciclo: 'SEMANAL', dias: 3, precos: [25], pessoas: 5 },
  { nome: 'Mercado Bom Preço', login: 'bompreco', responsavel: 'Sandra Costa', ciclo: 'MENSAL', dias: 5, precos: [20.5], pessoas: 7 },
  { nome: 'Oficina Torque', login: 'torque', responsavel: 'Renato Dias', ciclo: 'LIVRE', dias: 5, precos: [23], pessoas: 4 },
  { nome: 'Academia Corpo em Forma', login: 'corpoemforma', responsavel: 'Bianca Souza', ciclo: 'LIVRE', dias: 5, precos: [22], pessoas: 3, inativa: true }
];

const NOMES_TESTE = ['Ana', 'Bruno', 'Carlos', 'Daniela', 'Eduardo', 'Fernanda', 'Gabriel', 'Helena', 'Igor', 'Juliana',
  'Lucas', 'Mariana', 'Nelson', 'Olívia', 'Pedro', 'Rafaela', 'Sérgio', 'Tatiane', 'Vinícius', 'Wagner', 'Yasmin',
  'André', 'Beatriz', 'Caio', 'Débora', 'Felipe', 'Gisele', 'Henrique', 'Isabela', 'João', 'Larissa', 'Mateus',
  'Natália', 'Otávio', 'Priscila', 'Rodrigo', 'Sabrina', 'Thiago', 'Vanessa', 'Wesley', 'Aline', 'Diego', 'Elaine',
  'Fábio', 'Gustavo', 'Jéssica', 'Leandro', 'Márcia', 'Paulo'];
const SOBRENOMES_TESTE = ['Souza', 'Oliveira', 'Santos', 'Pereira', 'Lima', 'Ferreira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Carvalho', 'Gomes', 'Martins', 'Araújo', 'Ribeiro'];
const SETORES_TESTE = ['Administrativo', 'Operacional', 'Financeiro', 'Atendimento', 'Logística', 'Produção'];
const PROTEINAS_TESTE = ['Frango grelhado', 'Carne de panela', 'Bife acebolado', 'Peixe empanado', 'Strogonoff de frango',
  'Linguiça toscana', 'Omelete'];
const GUARNICOES_TESTE = ['Batata frita', 'Purê de batata', 'Legumes refogados', 'Farofa de ovos', 'Mandioca cozida', 'Abobrinha refogada'];
const SALADAS_TESTE = ['Alface', 'Tomate', 'Pepino', 'Cenoura ralada', 'Repolho', 'Beterraba'];
const EXTRAS_TESTE = ['Ovo frito', 'Banana à milanesa', 'Torresmo', ''];
const CLIENTES_TESTE = [['Roberto (balcão)', '(21) 99876-1122'], ['Luciana Prado', '(21) 98765-4321'], ['Seu Antônio', '(21) 97654-3210'], ['Patrícia Melo', '(21) 99123-4567']];

// Sorteio com semente fixa (os dados ficam iguais a cada entrada)
function sorteioTeste_(semente) {
  let s = semente >>> 0;
  return function() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dataTeste_(texto, hora, minuto) {
  const p = texto.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2], hora || 0, minuto || 0, 0);
}

function idTeste_(prefixo) {
  return prefixo + '-' + Utilities.getUuid();
}

function gravarLinhasTeste_(planilha, nome, linhas) {
  if (!linhas.length) return;
  const colunas = ESTRUTURA[nome].length;
  const completas = linhas.map(l => {
    const linha = l.slice(0, colunas);
    while (linha.length < colunas) linha.push('');
    return linha;
  });
  planilha.getSheetByName(nome).getRange(2, 1, completas.length, colunas).setValues(completas);
}

function preencherDadosTeste_(planilha, linhaDono, linhasConfig, donoId) {
  const fuso = Session.getScriptTimeZone();
  const hoje = hojeTexto_(fuso);
  const sorte = sorteioTeste_(20261126);
  const escolher = lista => lista[Math.floor(sorte() * lista.length)];
  const agora = new Date();

  // Período: do dia 1º, alguns meses atrás, até hoje
  const [anoHoje, mesHoje] = hoje.split('-').map(Number);
  const inicio = textoDeData_(new Date(anoHoje, mesHoje - 1 - MESES_DADOS_TESTE, 1));
  const segunda = segundaDaSemana_(hoje);
  const fimCardapio = somarDiasTexto_(segunda, 4);

  const diasUteis = [];
  for (let d = inicio; d <= fimCardapio; d = somarDiasTexto_(d, 1)) {
    const semana = converterDataFormulario(d).getDay();
    if (semana !== 0 && semana !== 6) diasUteis.push(d);
  }

  // CONFIG (cópia da real) e o proprietário
  const config = linhasConfig.slice(1)
    .filter(l => String(l[0]).trim())
    .map(l => [l[0], l[1] instanceof Date ? l[1] : "'" + String(l[1]), l[2]]);

  const usuarios = [linhaDono];
  const empresas = [];
  const precos = [];
  const funcionarios = [];
  const registro = [];   // empresas com dados para gerar pedidos

  // Administrador de exemplo com acesso limitado (para testar Acessos)
  usuarios.push([idTeste_('ADM'), '', 'Ana Atendente', '', '', 'admin', 'ATIVO', dataTeste_(inicio, 9),
    'ana', JSON.stringify({ telas: { dashboard: false, empresas: false, precos: false, funcionarios: false, cardapios: true, pedidos: true, cobrancas: false, relatorios: false }, funcoes: {} })]);

  let pessoa = 0;
  EMPRESAS_TESTE.forEach((e, indice) => {
    const empresaId = idTeste_('EMP');
    const cadastro = dataTeste_(inicio, 10, indice);

    empresas.push([empresaId, e.nome, '', "'(21) 3" + String(2000 + indice * 111) + '-' + String(1000 + indice * 37),
      e.login + '@exemplo.com', 'Rua de Exemplo, ' + (100 + indice * 25) + ' - Centro', e.inativa ? 'INATIVO' : 'ATIVO',
      cadastro, e.ciclo, e.dias, '']);

    // Acesso já ativado, com uma senha que ninguém sabe (não dá para entrar)
    usuarios.push([idTeste_('USR'), empresaId, e.responsavel, e.login + '@exemplo.com',
      'v2:' + Utilities.getUuid() + ':' + Utilities.getUuid(), 'empresa', 'ATIVO', cadastro, e.login, '']);

    // Preço (a Construtora teve um reajuste no meio do período)
    const tabela = [];
    if (e.precos.length > 1) {
      const virada = textoDeData_(new Date(anoHoje, mesHoje - 1 - MESES_DADOS_TESTE + 1, 16));
      precos.push([idTeste_('PRC'), empresaId, 'Normal', e.precos[0], dataTeste_(inicio), dataTeste_(somarDiasTexto_(virada, -1)), 'ATIVO']);
      precos.push([idTeste_('PRC'), empresaId, 'Normal', e.precos[1], dataTeste_(virada), '', 'ATIVO']);
      tabela.push({ desde: inicio, valor: e.precos[0] }, { desde: virada, valor: e.precos[1] });
    } else {
      precos.push([idTeste_('PRC'), empresaId, 'Normal', e.precos[0], dataTeste_(inicio), '', 'ATIVO']);
      tabela.push({ desde: inicio, valor: e.precos[0] });
    }

    const equipe = [];
    for (let i = 0; i < e.pessoas; i++) {
      const nome = NOMES_TESTE[pessoa % NOMES_TESTE.length] + ' ' + SOBRENOMES_TESTE[(pessoa * 7) % SOBRENOMES_TESTE.length];
      pessoa++;
      const id = idTeste_('FUN');
      const inativo = i === e.pessoas - 1 && e.pessoas > 6;
      const personaliza = i % 4 === 0;
      funcionarios.push([id, empresaId, nome, "'" + String(100 + i), SETORES_TESTE[(i + indice) % SETORES_TESTE.length], '',
        personaliza ? 'SIM' : 'NAO', inativo ? 'INATIVO' : 'ATIVO']);
      equipe.push({ id: id, nome: nome, personaliza: personaliza, inativo: inativo });
    }

    if (!e.inativa) registro.push({ empresa_id: empresaId, dados: e, tabela: tabela, equipe: equipe, usuario_id: usuarios[usuarios.length - 1][0] });
  });

  // CARDÁPIOS (publicados, um por dia útil até sexta desta semana)
  const cardapios = [];
  const cardapioDoDia = {};
  diasUteis.forEach((d, i) => {
    const proteinas = [PROTEINAS_TESTE[i % PROTEINAS_TESTE.length], PROTEINAS_TESTE[(i * 5 + 3) % PROTEINAS_TESTE.length], PROTEINAS_TESTE[(i * 7 + 6) % PROTEINAS_TESTE.length]]
      .filter((p, j, lista) => lista.indexOf(p) === j);
    const extra = EXTRAS_TESTE[i % EXTRAS_TESTE.length];
    const id = idTeste_('CAR');
    cardapios.push([id, dataTeste_(d), NOMES_DIAS[converterDataFormulario(d).getDay()],
      ['Arroz', 'Feijão', i % 3 === 0 ? 'Macarrão' : 'Farofa'].join('\n'),
      [SALADAS_TESTE[i % 6], SALADAS_TESTE[(i + 2) % 6]].join('\n'),
      [GUARNICOES_TESTE[i % GUARNICOES_TESTE.length]].join('\n'),
      proteinas.join('\n'), extra, '', 'PUBLICADO']);
    cardapioDoDia[d] = { id: id, proteinas: proteinas, extra: extra };
  });

  // PEDIDOS (empresas e clientes sem cadastro)
  const pedidos = [];
  const itens = [];
  const pedidosPorEmpresa = {};

  diasUteis.filter(d => d <= hoje).forEach(d => {
    const cardapio = cardapioDoDia[d];
    const ehHoje = d === hoje;

    registro.forEach((r, indice) => {
      // Hoje só algumas empresas já pediram (para testar confirmar/recusar)
      if (ehHoje && indice > 2) return;
      if (!ehHoje && sorte() < 0.06) return;   // dia sem pedido

      const preco = r.tabela.filter(t => t.desde <= d).slice(-1)[0].valor;
      const linhasItens = [];

      r.equipe.forEach(f => {
        if (f.inativo || sorte() < 0.18) return;
        const padrao = sorte() < 0.08;
        const removidos = f.personaliza && sorte() < 0.3 ? 'Feijão' : '';
        const proteina = sorte() < 0.45 ? cardapio.proteinas[0] : escolher(cardapio.proteinas);
        linhasItens.push([f.id, f.nome, padrao ? '' : proteina, cardapio.extra && sorte() < 0.4 ? cardapio.extra : '', removidos,
          removidos && sorte() < 0.5 ? 'Pouco arroz' : '']);
      });
      if (sorte() < 0.15) linhasItens.push(['', 'Visitante', escolher(cardapio.proteinas), '', '', '']);
      if (!linhasItens.length) return;

      let status = 'CONFIRMADO';
      if (ehHoje) status = 'ENVIADO';
      else if (sorte() < 0.02) status = 'CANCELADO';
      else if (sorte() < 0.01) status = 'RECUSADO';

      const pedidoId = idTeste_('PED');
      const criado = dataTeste_(d, 7 + Math.floor(sorte() * 2), Math.floor(sorte() * 59));
      const cancelado = status === 'CANCELADO';
      const valor = cancelado ? 0 : Math.round(preco * linhasItens.length * 100) / 100;

      pedidos.push([pedidoId, r.empresa_id, criado, dataTeste_(d), r.usuario_id, status, '', valor,
        cancelado ? 0 : linhasItens.length, criado, status === 'CONFIRMADO' ? dataTeste_(d, 9, 30) : '',
        status === 'RECUSADO' ? 'Fora do horário combinado' : '', '', '', '']);

      if (!cancelado) {
        linhasItens.forEach(l => {
          itens.push([idTeste_('ITM'), pedidoId, r.empresa_id, l[0], cardapio.id, 'Normal', 1, preco, preco,
            l[5] ? "'" + l[5] : '', "'" + l[1], l[2] ? "'" + l[2] : '', l[3] ? "'" + l[3] : '', l[4] ? "'" + l[4] : '']);
        });
      }

      if (status === 'CONFIRMADO' || status === 'ENVIADO') {
        (pedidosPorEmpresa[r.empresa_id] = pedidosPorEmpresa[r.empresa_id] || []).push({
          indice: pedidos.length - 1, data: d, valor: valor, quantidade: linhasItens.length
        });
      }
    });

    // Clientes sem cadastro (pagam na hora)
    if (!ehHoje && sorte() < 0.35) {
      const cliente = escolher(CLIENTES_TESTE);
      const pedidoId = idTeste_('PED');
      const criado = dataTeste_(d, 11, Math.floor(sorte() * 59));
      pedidos.push([pedidoId, '', criado, dataTeste_(d), donoId, 'CONFIRMADO', '', 25, 1, criado, criado, '', "'" + cliente[0], "'" + cliente[1], '']);
      itens.push([idTeste_('ITM'), pedidoId, '', '', cardapio.id, 'Normal', 1, 25, 25, '', "'" + cliente[0], "'" + escolher(cardapio.proteinas), '', '']);
    }
  });

  // COBRANÇAS conforme o ciclo de cada empresa, até poucos dias atrás
  // (o que vem depois fica "ainda não cobrado")
  const cobrancas = [];
  const pagamentos = [];
  const limite = somarDiasTexto_(hoje, -3);
  let numero = 0;
  const formas = ['PIX', 'PIX', 'PIX', 'TRANSFERENCIA', 'BOLETO', 'DINHEIRO'];

  registro.forEach((r, indice) => {
    const periodos = periodosTeste_(r.dados.ciclo, inicio, limite);

    periodos.forEach((p, i) => {
      const doPeriodo = (pedidosPorEmpresa[r.empresa_id] || []).filter(x => x.data >= p.inicio && x.data <= p.fim);
      if (!doPeriodo.length) return;

      numero++;
      const cobrancaId = idTeste_('COB');
      const total = Math.round(doPeriodo.reduce((s, x) => s + x.valor, 0) * 100) / 100;
      const quantidade = doPeriodo.reduce((s, x) => s + x.quantidade, 0);
      const emissao = somarDiasTexto_(p.fim, 1);
      const ultima = i === periodos.length - 1;
      let vencimento = somarDiasTexto_(emissao, r.dados.dias);
      // Sempre há uma cobrança ainda no prazo ("a receber"), qualquer que seja o dia
      if (indice === 1 && ultima && vencimento < hoje) vencimento = somarDiasTexto_(hoje, 7);

      // Situações variadas para testar
      let desconto = 0;
      let motivoDesconto = '';
      if (indice === 0 && i === 1) { desconto = Math.round(total * 0.1 * 100) / 100; motivoDesconto = 'Desconto de 10% por fidelidade'; }
      const liquido = Math.round((total - desconto) * 100) / 100;

      let pago = liquido;
      if (vencimento >= hoje) pago = 0;                                  // ainda no prazo
      if (indice === 2 && ultima) pago = 0;                              // vencida
      if (indice === 4 && ultima) pago = Math.round(liquido * 0.5 * 100) / 100;   // paga pela metade

      const status = pago >= liquido - 0.004 ? 'PAGA' : (pago > 0 ? 'PARCIAL' : 'ABERTA');

      cobrancas.push([cobrancaId, r.empresa_id, dataTeste_(p.inicio), dataTeste_(p.fim), dataTeste_(emissao), dataTeste_(vencimento),
        total, status, '', numero, quantidade, doPeriodo.length, pago, donoId, dataTeste_(emissao, 10), '', desconto, motivoDesconto ? "'" + motivoDesconto : '']);

      doPeriodo.forEach(x => { pedidos[x.indice][14] = cobrancaId; });

      if (pago > 0) {
        const dataPagamento = vencimento < hoje ? somarDiasTexto_(vencimento, -Math.floor(sorte() * 3)) : hoje;
        pagamentos.push([idTeste_('PAG'), cobrancaId, r.empresa_id, dataTeste_(dataPagamento), pago, escolher(formas), '', '', donoId, dataTeste_(dataPagamento, 14)]);
      }
    });
  });

  config.forEach(l => { if (String(l[0]).trim() === 'ULTIMO_NUMERO_COBRANCA') l[1] = "'" + numero; });
  if (!config.some(l => String(l[0]).trim() === 'ULTIMO_NUMERO_COBRANCA')) {
    config.push(['ULTIMO_NUMERO_COBRANCA', "'" + numero, 'Maior número de cobrança já usado (cobranças apagadas não repetem o número)']);
  }

  gravarLinhasTeste_(planilha, 'CONFIG', config);
  gravarLinhasTeste_(planilha, 'USUARIOS', usuarios);
  gravarLinhasTeste_(planilha, 'EMPRESAS', empresas);
  gravarLinhasTeste_(planilha, 'PRECOS', precos);
  gravarLinhasTeste_(planilha, 'FUNCIONARIOS', funcionarios);
  gravarLinhasTeste_(planilha, 'CARDAPIOS', cardapios);
  gravarLinhasTeste_(planilha, 'PEDIDOS', pedidos);
  gravarLinhasTeste_(planilha, 'ITENS_PEDIDOS', itens);
  gravarLinhasTeste_(planilha, 'COBRANCAS', cobrancas);
  gravarLinhasTeste_(planilha, 'PAGAMENTOS', pagamentos);
  gravarLinhasTeste_(planilha, 'LOGS', [[idTeste_('LOG'), donoId, '', 'MODO_TESTE', 'Dados fictícios criados para o modo teste', agora]]);
}

// Períodos de cobrança de um ciclo, do início até o limite
function periodosTeste_(ciclo, inicio, limite) {
  const periodos = [];
  let atual = inicio;

  while (atual <= limite) {
    const data = converterDataFormulario(atual);
    let fim;

    if (ciclo === 'SEMANAL') {
      fim = somarDiasTexto_(segundaDaSemana_(atual), 6);
    } else if (ciclo === 'QUINZENAL') {
      fim = data.getDate() <= 15
        ? textoDeData_(new Date(data.getFullYear(), data.getMonth(), 15))
        : textoDeData_(new Date(data.getFullYear(), data.getMonth() + 1, 0));
    } else if (ciclo === 'LIVRE') {
      fim = textoDeData_(new Date(data.getFullYear(), data.getMonth() + 2, 0));   // dois meses
    } else {
      fim = textoDeData_(new Date(data.getFullYear(), data.getMonth() + 1, 0));
    }

    if (fim > limite) break;
    periodos.push({ inicio: atual, fim: fim });
    atual = somarDiasTexto_(fim, 1);
  }

  return periodos;
}
