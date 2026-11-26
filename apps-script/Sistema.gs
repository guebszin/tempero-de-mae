// ================================================================
// SISTEMA.gs
// Área do proprietário: liga e desliga funções do aplicativo, no
// geral e por empresa, e o modelo da mensagem de convite.
// Também cuida dos convites de primeiro acesso: o restaurante cadastra
// a empresa sem senha e envia um link; a própria empresa cria a senha.
// ================================================================

const COLUNA_CONFIG_EMPRESA = 11;      // EMPRESAS: coluna "configuracoes"
const DIAS_VALIDADE_CONVITE = 7;
const QUENTINHA_DO_DIA = 'Quentinha do dia';

// Como as quentinhas são escolhidas no pedido da empresa
const MODOS_ESCOLHA = {
  PERSONALIZADOS: 'Só quem pode personalizar escolhe',
  TODOS: 'Todos escolhem a proteína',
  NINGUEM: 'Ninguém escolhe (só a quentinha do dia)'
};

// Valores de fábrica (usados enquanto o proprietário não muda o padrão)
const PADRAO_FABRICA_EMPRESA = {
  cobrancas: true,
  mostrar_precos: true,
  avulsas: true,
  escolha: 'PERSONALIZADOS'
};

const MODELO_CONVITE_PADRAO =
  'Olá, {responsavel}!\n\n' +
  'A {empresa} foi cadastrada no sistema de pedidos do Tempero de Mãe.\n\n' +
  'Para o primeiro acesso, crie a sua senha por este link (vale até {validade}):\n' +
  '{link}\n\n' +
  'Seu usuário: {usuario}\n\n' +
  'Depois é só entrar em {endereco} com o seu usuário e a senha que você criou.';

const MODELO_NOVA_SENHA =
  'Olá, {responsavel}!\n\n' +
  'Para criar uma nova senha de acesso da {empresa} ao Tempero de Mãe, use este link (vale até {validade}):\n' +
  '{link}\n\n' +
  'Seu usuário: {usuario}';

// Convite de administrador do restaurante
const MODELO_CONVITE_ADMIN =
  'Olá, {responsavel}!\n\n' +
  'Você recebeu acesso ao painel do restaurante Tempero de Mãe.\n\n' +
  'Para criar a sua senha, abra este link (vale até {validade}):\n' +
  '{link}\n\n' +
  'Seu usuário: {usuario}\n\n' +
  'Depois é só entrar em {endereco} com o seu usuário e a senha que você criou.';

const MODELO_NOVA_SENHA_ADMIN =
  'Olá, {responsavel}!\n\n' +
  'Para criar uma nova senha de acesso ao painel do Tempero de Mãe, use este link (vale até {validade}):\n' +
  '{link}\n\n' +
  'Seu usuário: {usuario}';

// ----------------------------------------------------------------
// LEITURA DAS CONFIGURAÇÕES
// ----------------------------------------------------------------
function lerJson_(texto) {
  try {
    const valor = JSON.parse(String(texto || ''));
    return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : null;
  } catch (erro) {
    return null;
  }
}

// Completa e limpa uma configuração (o que faltar vem da base)
function normalizarConfigEmpresa_(config, base) {
  base = base || PADRAO_FABRICA_EMPRESA;
  config = config || {};
  const escolha = String(config.escolha || '').trim().toUpperCase();

  return {
    cobrancas: typeof config.cobrancas === 'boolean' ? config.cobrancas : base.cobrancas,
    mostrar_precos: typeof config.mostrar_precos === 'boolean' ? config.mostrar_precos : base.mostrar_precos,
    avulsas: typeof config.avulsas === 'boolean' ? config.avulsas : base.avulsas,
    escolha: MODOS_ESCOLHA[escolha] ? escolha : base.escolha
  };
}

function padraoEmpresas_() {
  return normalizarConfigEmpresa_(lerJson_(lerConfiguracao_('PADRAO_EMPRESAS', '')), PADRAO_FABRICA_EMPRESA);
}

function moduloCobrancasAtivo_() {
  return lerConfiguracao_('MODULO_COBRANCAS', 'SIM').toUpperCase() !== 'NAO';
}

// Configuração que vale para a empresa (a dela ou o padrão)
function configDaEmpresa_(empresa, padrao) {
  const propria = empresa ? lerJson_(empresa.configuracoes) : null;
  const config = normalizarConfigEmpresa_(propria, padrao || padraoEmpresas_());
  if (!moduloCobrancasAtivo_()) config.cobrancas = false;
  config.usa_padrao = !propria;
  return config;
}

function configDaEmpresaPorId_(empresaId) {
  return configDaEmpresa_(lerEmpresas_().lista.find(e => e.empresa_id === empresaId) || null);
}

// O que cada sessão pode ver (usado para montar os menus)
function recursosDaSessao_(sessao) {
  if (!sessao) return null;

  if (sessao.perfil === 'admin') {
    const permissoes = permissoesDaSessao_(sessao) || permissoesTotais_();
    return {
      cobrancas: moduloCobrancasAtivo_(),
      telas: permissoes.telas,
      funcoes: permissoes.funcoes
    };
  }

  const config = configDaEmpresaPorId_(sessao.empresa_id);
  return {
    cobrancas: config.cobrancas,
    mostrar_precos: config.mostrar_precos,
    avulsas: config.avulsas,
    escolha: config.escolha
  };
}

// Quem escolhe a proteína e quem personaliza, conforme a configuração
function permissoesQuentinha_(config, funcionario) {
  const autorizado = !!(funcionario && funcionario.pode_alterar_quentinha);

  if (config.escolha === 'NINGUEM') return { escolhe: false, personaliza: false };
  if (config.escolha === 'TODOS') return { escolhe: true, personaliza: autorizado };
  return { escolhe: autorizado, personaliza: autorizado };
}

function exigirModuloCobrancas_() {
  if (!moduloCobrancasAtivo_()) {
    throw new Error('O módulo de cobranças está desligado. O proprietário pode ligá-lo em Sistema › Configurações.');
  }
}

// Grava uma linha da aba CONFIG (cria se não existir). Chamar dentro de comBloqueio_.
function gravarConfiguracao_(chave, valor, descricao) {
  const aba = obterAba_('CONFIG');
  const dados = aba.getDataRange().getValues();
  let linha = 0;

  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]).trim() === chave) linha = i + 1;
  }

  if (linha) {
    aba.getRange(linha, 2).setValue(valor);
  } else {
    aba.appendRow([chave, valor, descricao || '']);
  }
}

// ----------------------------------------------------------------
// TELA DE CONFIGURAÇÕES (somente o proprietário)
// ----------------------------------------------------------------
function obterConfiguracoes(token) {
  validarProprietario_(token);
  return montarConfiguracoes_();
}

function montarConfiguracoes_() {
  const padrao = padraoEmpresas_();

  return {
    modulos: { cobrancas: moduloCobrancasAtivo_() },
    padrao: padrao,
    modos_escolha: MODOS_ESCOLHA,
    empresas: lerEmpresas_().lista
      .map(e => ({
        empresa_id: e.empresa_id,
        nome_empresa: e.nome_empresa,
        status: e.status,
        config: configDaEmpresa_(e, padrao)
      }))
      .sort((a, b) =>
        (a.status === b.status ? 0 : a.status === 'ATIVO' ? -1 : 1) ||
        a.nome_empresa.localeCompare(b.nome_empresa, 'pt-BR')
      ),
    modelo_convite: modeloConvite_(),
    modelo_convite_padrao: MODELO_CONVITE_PADRAO,
    validade_convite_dias: DIAS_VALIDADE_CONVITE,
    limpeza: montarResumoLimpeza_()
  };
}

function textoConfigEmpresa_(config) {
  return [
    'cobranças ' + (config.cobrancas ? 'ligadas' : 'desligadas'),
    'preços ' + (config.mostrar_precos ? 'visíveis' : 'ocultos'),
    'avulsas ' + (config.avulsas ? 'liberadas' : 'bloqueadas'),
    MODOS_ESCOLHA[config.escolha].toLowerCase()
  ].join(', ');
}

// Módulos do sistema inteiro
// dados = { cobrancas }
function salvarModulos(token, dados) {
  const sessao = validarProprietario_(token);
  const ligar = !!(dados && dados.cobrancas);

  return comBloqueio_(() => {
    gravarConfiguracao_('MODULO_COBRANCAS', ligar ? 'SIM' : 'NAO',
      'Módulo de cobranças ligado (SIM) ou desligado (NAO) para todo o sistema');

    marcarPedidosAlterados_();
    registrarLog_(null, sessao, '', 'CONFIGURAR_MODULOS', 'Módulo de cobranças ' + (ligar ? 'ligado' : 'desligado'));

    return {
      sucesso: true,
      mensagem: ligar ? 'Cobranças ligadas.' : 'Cobranças desligadas para todo o sistema.',
      configuracoes: montarConfiguracoes_()
    };
  });
}

// Padrão usado pelas empresas que não têm configuração própria
function salvarPadraoEmpresas(token, dados) {
  const sessao = validarProprietario_(token);
  const config = normalizarConfigEmpresa_(dados, PADRAO_FABRICA_EMPRESA);

  return comBloqueio_(() => {
    gravarConfiguracao_('PADRAO_EMPRESAS', JSON.stringify(config),
      'Configuração padrão das empresas (definida em Sistema › Configurações)');

    marcarPedidosAlterados_();
    registrarLog_(null, sessao, '', 'CONFIGURAR_PADRAO_EMPRESAS', 'Padrão: ' + textoConfigEmpresa_(config));

    return {
      sucesso: true,
      mensagem: 'Padrão das empresas salvo.',
      configuracoes: montarConfiguracoes_()
    };
  });
}

// Configuração própria de uma empresa (dados = null volta ao padrão)
function salvarConfigEmpresa(token, empresaId, dados) {
  const sessao = validarProprietario_(token);
  empresaId = String(empresaId || '').trim();
  const config = dados ? normalizarConfigEmpresa_(dados, padraoEmpresas_()) : null;

  return comBloqueio_(() => {
    const empresas = lerEmpresas_();
    const empresa = empresas.lista.find(e => e.empresa_id === empresaId);
    if (!empresa) throw new Error('Empresa não encontrada.');

    empresas.aba.getRange(empresa.linha, COLUNA_CONFIG_EMPRESA).setValue(config ? JSON.stringify(config) : '');

    marcarPedidosAlterados_();
    registrarLog_(null, sessao, empresaId, 'CONFIGURAR_EMPRESA',
      empresa.nome_empresa + ': ' + (config ? textoConfigEmpresa_(config) : 'voltou a usar o padrão'));

    return {
      sucesso: true,
      mensagem: config
        ? 'Configuração de ' + empresa.nome_empresa + ' salva.'
        : empresa.nome_empresa + ' voltou a usar o padrão.',
      configuracoes: montarConfiguracoes_()
    };
  });
}

// ----------------------------------------------------------------
// CONVITES DE PRIMEIRO ACESSO
// O link leva um código aleatório. Nas Propriedades do script fica só
// o resumo (hash) do código, com a validade. Um convite novo apaga o
// anterior. Usado o convite, ele deixa de valer.
// ----------------------------------------------------------------
function modeloConvite_() {
  return lerConfiguracao_('MODELO_CONVITE', '') || MODELO_CONVITE_PADRAO;
}

function salvarModeloConvite(token, texto) {
  const sessao = validarProprietario_(token);
  let modelo = String(texto === null || texto === undefined ? '' : texto).replace(/\r\n/g, '\n').trim();

  if (modelo.length > 1500) throw new Error('A mensagem do convite pode ter no máximo 1.500 caracteres.');
  if (modelo && modelo.indexOf('{link}') === -1) {
    throw new Error('A mensagem precisa ter {link}: é por ele que a empresa cria a senha.');
  }
  if (modelo === MODELO_CONVITE_PADRAO) modelo = '';

  return comBloqueio_(() => {
    gravarConfiguracao_('MODELO_CONVITE', textoPlanilha_(modelo),
      'Mensagem do convite de primeiro acesso ({responsavel}, {empresa}, {usuario}, {link}, {validade}, {endereco})');

    registrarLog_(null, sessao, '', 'ALTERAR_MODELO_CONVITE', modelo ? 'Mensagem do convite personalizada' : 'Mensagem do convite padrão');

    return {
      sucesso: true,
      mensagem: modelo ? 'Mensagem do convite salva.' : 'Mensagem do convite voltou ao padrão.',
      configuracoes: montarConfiguracoes_()
    };
  });
}

// No modo teste, os convites ficam separados (prefixo "teste_") e são
// apagados ao sair do teste
function chaveConvite_(codigo) {
  return prefixoBanco_() + 'convite_' + resumoTexto_(codigo);
}

function chaveConviteDoUsuario_(usuarioId) {
  return prefixoBanco_() + 'convite_usuario_' + usuarioId;
}

// Validade do convite ativo de cada usuário (para a lista de empresas)
function convitesAtivos_() {
  const todas = PropertiesService.getScriptProperties().getProperties();
  const agora = new Date().getTime();
  const resultado = {};

  const prefixo = prefixoBanco_() + 'convite_usuario_';

  Object.keys(todas).forEach(chave => {
    if (chave.indexOf(prefixo) !== 0) return;
    const dados = lerJson_(todas[todas[chave]]);
    if (dados && dados.expira > agora) resultado[chave.slice(prefixo.length)] = dados.expira;
  });

  return resultado;
}

function criarConvite_(usuario) {
  const propriedades = PropertiesService.getScriptProperties();
  const anterior = propriedades.getProperty(chaveConviteDoUsuario_(usuario.usuario_id));
  if (anterior) propriedades.deleteProperty(anterior);

  const codigo = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + Utilities.getUuid() + new Date().getTime()
    )
  ).replace(/=+$/, '').slice(0, 32);

  const expira = new Date().getTime() + DIAS_VALIDADE_CONVITE * 86400000;
  const chave = chaveConvite_(codigo);

  propriedades.setProperty(chave, JSON.stringify({
    usuario_id: usuario.usuario_id,
    expira: expira,
    criado: new Date().getTime()
  }));
  propriedades.setProperty(chaveConviteDoUsuario_(usuario.usuario_id), chave);

  return { codigo: codigo, expira: expira };
}

function apagarConvite_(usuarioId) {
  const propriedades = PropertiesService.getScriptProperties();
  const chave = propriedades.getProperty(chaveConviteDoUsuario_(usuarioId));
  if (chave) propriedades.deleteProperty(chave);
  propriedades.deleteProperty(chaveConviteDoUsuario_(usuarioId));
}

function preencherModelo_(modelo, valores) {
  return String(modelo).replace(/\{(\w+)\}/g, (trecho, nome) =>
    Object.prototype.hasOwnProperty.call(valores, nome) ? valores[nome] : trecho
  );
}

// Monta o convite (link + mensagem pronta) de um usuário de empresa
function montarConvite_(usuario, empresa, novaSenha) {
  const convite = criarConvite_(usuario);
  const endereco = enderecoAplicativo_();
  const link = (endereco || '') + '?convite=' + convite.codigo;
  const validade = Utilities.formatDate(new Date(convite.expira), Session.getScriptTimeZone(), 'dd/MM/yyyy');

  const valores = {
    responsavel: usuario.nome || empresa.nome_empresa,
    empresa: empresa.nome_empresa,
    usuario: usuario.login,
    link: link,
    validade: validade,
    endereco: endereco
  };

  return {
    link: link,
    usuario: usuario.login,
    expira: convite.expira,
    validade: validade,
    nova_senha: !!novaSenha,
    nome_empresa: empresa.nome_empresa,
    responsavel: usuario.nome,
    telefone: empresa.telefone,
    email: usuario.email || empresa.email,
    teste: bancoTesteAtivo_,
    mensagem: preencherModelo_(novaSenha ? MODELO_NOVA_SENHA : modeloConvite_(), valores)
  };
}

// Convite de um administrador do restaurante
function montarConviteAdmin_(usuario, novaSenha) {
  const convite = criarConvite_(usuario);
  const endereco = enderecoAplicativo_();
  const link = (endereco || '') + '?convite=' + convite.codigo;
  const validade = Utilities.formatDate(new Date(convite.expira), Session.getScriptTimeZone(), 'dd/MM/yyyy');

  const valores = {
    responsavel: usuario.nome,
    empresa: 'Tempero de Mãe',
    usuario: usuario.login,
    link: link,
    validade: validade,
    endereco: endereco
  };

  return {
    link: link,
    usuario: usuario.login,
    expira: convite.expira,
    validade: validade,
    nova_senha: !!novaSenha,
    nome_empresa: 'Painel do restaurante',
    responsavel: usuario.nome,
    telefone: '',
    email: usuario.email || '',
    administrador: true,
    teste: bancoTesteAtivo_,
    mensagem: preencherModelo_(novaSenha ? MODELO_NOVA_SENHA_ADMIN : MODELO_CONVITE_ADMIN, valores)
  };
}

// Gerar (ou gerar de novo) o convite de uma empresa
// Se a empresa já tem senha, ela continua valendo até a nova ser criada.
function gerarConviteEmpresa(token, empresaId) {
  const sessao = exigirTela_(token, 'empresas');
  empresaId = String(empresaId || '').trim();

  return comBloqueio_(() => {
    const empresa = lerEmpresas_().lista.find(e => e.empresa_id === empresaId);
    if (!empresa) throw new Error('Empresa não encontrada.');
    if (empresa.status !== 'ATIVO') throw new Error('Reative a empresa antes de enviar o convite.');

    const usuario = lerUsuarios_().lista.find(u => u.perfil === 'empresa' && u.empresa_id === empresaId);
    if (!usuario) throw new Error('Acesso da empresa não encontrado.');
    if (!usuario.login) throw new Error('Defina o usuário de acesso da empresa (botão Editar) antes de enviar o convite.');

    const convite = montarConvite_(usuario, empresa, usuario.ativado);

    registrarLog_(null, sessao, empresaId, usuario.ativado ? 'CONVITE_NOVA_SENHA' : 'CONVITE_PRIMEIRO_ACESSO',
      'Convite gerado para ' + empresa.nome_empresa + ' (usuário ' + usuario.login + '), válido até ' + convite.validade);

    return convite;
  });
}

// Confere o código do link (sem login)
function lerConvite_(codigo) {
  const invalido = 'Este convite não é mais válido. Peça um novo convite ao restaurante.';
  codigo = String(codigo || '').trim();
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(codigo)) throw new Error(invalido);

  const dados = lerJson_(PropertiesService.getScriptProperties().getProperty(chaveConvite_(codigo)));
  if (!dados || dados.expira < new Date().getTime()) throw new Error(invalido);

  const usuario = lerUsuarios_().lista.find(u => u.usuario_id === dados.usuario_id);
  if (!usuario || usuario.status !== 'ATIVO') throw new Error(invalido);

  // Administrador do restaurante: não tem empresa
  if (usuario.perfil === 'admin') return { dados: dados, usuario: usuario, empresa: null };

  const empresa = lerEmpresas_().lista.find(e => e.empresa_id === usuario.empresa_id);
  if (!empresa || empresa.status !== 'ATIVO') {
    throw new Error('O acesso desta empresa está inativo. Entre em contato com o restaurante.');
  }

  return { dados: dados, usuario: usuario, empresa: empresa };
}

function abrirConvite(codigo) {
  const convite = lerConvite_(codigo);

  return {
    nome_empresa: convite.empresa ? convite.empresa.nome_empresa : 'Painel do restaurante',
    administrador: !convite.empresa,
    responsavel: convite.usuario.nome,
    usuario: convite.usuario.login,
    nova_senha: convite.usuario.ativado,
    expira: convite.dados.expira
  };
}

// A empresa cria a senha e já entra no sistema
function concluirConvite(codigo, senha, lembrar) {
  senha = validarSenhaNova_(senha);

  const usuario = comBloqueio_(() => {
    const convite = lerConvite_(codigo);
    const usuarios = lerUsuarios_();
    const atual = usuarios.lista.find(u => u.usuario_id === convite.usuario.usuario_id);

    usuarios.aba.getRange(atual.linha, COLUNAS_USUARIOS.SENHA).setValue(novoHashSenha_(senha));
    apagarConvite_(atual.usuario_id);

    registrarLog_(null, { usuario_id: atual.usuario_id }, atual.empresa_id,
      atual.ativado ? 'NOVA_SENHA_POR_CONVITE' : 'PRIMEIRO_ACESSO',
      (atual.ativado ? 'Nova senha criada pelo convite' : 'Primeiro acesso concluído') + ' (usuário ' + atual.login + ')');

    return atual;
  });

  return autenticarUsuario(usuario.login || usuario.email, senha, lembrar);
}
