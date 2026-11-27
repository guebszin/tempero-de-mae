// ================================================================
// AUTH.gs
// Usuários, senhas, login, sessões e permissões.
// ================================================================

// Posição das colunas da aba USUARIOS (1 = coluna A)
const COLUNAS_USUARIOS = {
  ID: 1,
  EMPRESA: 2,
  NOME: 3,
  EMAIL: 4,
  SENHA: 5,
  PERFIL: 6,
  STATUS: 7,
  DATA_CADASTRO: 8,
  LOGIN: 9,
  PERMISSOES: 10
};

// LER TODOS OS USUÁRIOS (do cache, quando possível)
function lerUsuarios_() {
  const dados = lerAba_('USUARIOS');
  const lista = [];

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];
    if (!linha[0]) continue;

    lista.push({
      linha: i + 1,
      usuario_id: String(linha[0]),
      empresa_id: String(linha[1] || ''),
      nome: String(linha[2]).trim(),
      email: String(linha[3]).trim().toLowerCase(),
      senha_hash: String(linha[4]),
      perfil: String(linha[5]).trim().toLowerCase(),
      status: String(linha[6]).trim().toUpperCase() === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      login: String(linha[8] || '').trim().toLowerCase(),
      permissoes_texto: String(linha[9] || ''),
      ativado: !!String(linha[4] || '').trim()   // já criou a senha
    });
  }

  return {
    get aba() { return obterAba_('USUARIOS'); },
    lista: lista
  };
}

// ================================================================
// SENHAS
// ================================================================

// GERAR HASH DE SENHA (formato v2)
function gerarHashSenha(senha, salt) {
  let valor = salt + ':' + senha;

  for (let i = 0; i < 10000; i++) {
    const digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      valor,
      Utilities.Charset.UTF_8
    );

    valor = Utilities.base64Encode(digest);
  }

  return 'v2:' + salt + ':' + valor;
}

// VALIDAR SENHA NO FORMATO v2
function verificarHashV2(senha, salt, hashArmazenado) {
  const hashCalculado = gerarHashSenha(senha, salt);
  return hashCalculado === 'v2:' + salt + ':' + hashArmazenado;
}

// VALIDAR SENHA NO FORMATO ANTIGO
function verificarHashAntigo(senha, salt, hashArmazenado) {
  let hash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + ':' + senha,
    Utilities.Charset.UTF_8
  );

  for (let i = 0; i < 10000; i++) {
    hash = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      hash
    );
  }

  return Utilities.base64Encode(hash) === hashArmazenado;
}

// CONFERIR SENHA CONTRA O VALOR ARMAZENADO (qualquer formato)
function senhaConfere_(senha, armazenado) {
  armazenado = String(armazenado || '');
  const partes = armazenado.split(':');

  if (armazenado.startsWith('v2:')) {
    return partes.length === 3 && verificarHashV2(senha, partes[1], partes[2]);
  }

  return partes.length === 2 && verificarHashAntigo(senha, partes[0], partes[1]);
}

// CRIAR HASH NOVO PARA UMA SENHA
function novoHashSenha_(senha) {
  return gerarHashSenha(senha, Utilities.getUuid());
}

// VALIDAR TAMANHO DA SENHA
function validarSenhaNova_(senha) {
  senha = String(senha || '');

  if (senha.length < CONFIG.TAMANHO_MINIMO_SENHA) {
    throw new Error('A senha precisa ter pelo menos ' + CONFIG.TAMANHO_MINIMO_SENHA + ' caracteres.');
  }

  return senha;
}

// GERAR SENHA TEMPORÁRIA FÁCIL DE LER (ex.: Kp7m-Qx3t-Wb9n)
function gerarSenhaTemporaria_() {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + Utilities.getUuid() + new Date().getTime()
  );

  let senha = '';

  for (let i = 0; i < 12; i++) {
    senha += alfabeto[(bytes[i] + 256) % alfabeto.length];
    if (i === 3 || i === 7) senha += '-';
  }

  return senha;
}

// ================================================================
// PRIMEIRO ADMINISTRADOR (tela Setup)
// ================================================================
function criarPrimeiroAdministrador(nome, email, senha) {
  return comBloqueio_(() => {
    const usuarios = lerUsuarios_();

    if (usuarios.lista.some(u => u.perfil === 'admin')) {
      throw new Error('O administrador inicial já foi criado.');
    }

    nome = limparTexto_(nome, 120, 'O nome');
    email = validarEmail_(email);
    senha = validarSenhaNova_(senha);

    if (!nome) {
      throw new Error('Informe o nome.');
    }

    usuarios.aba.appendRow([
      'ADM-' + Utilities.getUuid(),
      '',
      textoPlanilha_(nome),
      email,
      novoHashSenha_(senha),
      'admin',
      'ATIVO',
      new Date()
    ]);

    return 'Administrador cadastrado com sucesso!';
  });
}

// ================================================================
// SESSÕES
// ================================================================

// CHAVE DA SESSÃO NO CACHE (o token nunca é guardado diretamente)
function chaveSessao_(token) {
  return 'sessao_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      String(token)
    )
  );
}

// VALIDAR O USUÁRIO DE ACESSO (login) DE UMA EMPRESA
function validarLogin_(valor) {
  const login = String(valor || '').trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(login)) {
    throw new Error('O usuário precisa ter de 3 a 40 caracteres: letras sem acento, números, ponto, hífen ou sublinhado, sem espaços.');
  }

  return login;
}

// Quem entra com o que foi digitado:
// - um usuário (login) criado pelo restaurante; ou
// - o e-mail, para o restaurante e para acessos antigos ainda sem usuário.
function encontrarUsuarioParaLogin_(lista, identificacao) {
  const candidatos = identificacao.indexOf('@') !== -1
    ? lista.filter(u => u.email === identificacao && (u.perfil === 'admin' || !u.login))
    : lista.filter(u => u.login === identificacao);

  return candidatos.length === 1 ? candidatos[0] : null;
}

// AUTENTICAR USUÁRIO
// O perfil (restaurante ou empresa) é descoberto pelo próprio usuário.
// lembrar = true: "Manter conectado neste aparelho" (devolve um login salvo).
function autenticarUsuario(identificacao, senha, lembrar) {
  identificacao = String(identificacao || '').trim().toLowerCase();
  senha = String(senha || '');

  if (!identificacao || !senha) {
    throw new Error('Informe o usuário e a senha.');
  }

  const cache = CacheService.getScriptCache();
  const chaveTentativas = 'tentativas_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, identificacao)
  );
  const tentativas = Number(cache.get(chaveTentativas) || 0);

  if (tentativas >= CONFIG.MAX_TENTATIVAS_LOGIN) {
    throw new Error('Muitas tentativas sem sucesso. Aguarde 15 minutos e tente novamente.');
  }

  const usuarios = lerUsuarios_();
  const usuario = encontrarUsuarioParaLogin_(usuarios.lista, identificacao);

  if (usuario && usuario.status === 'ATIVO' && !usuario.ativado) {
    throw new Error('Este acesso ainda não foi ativado. Abra o link de convite enviado pelo restaurante para criar a sua senha.');
  }

  const valido = usuario &&
    usuario.status === 'ATIVO' &&
    senhaConfere_(senha, usuario.senha_hash);

  if (!valido) {
    cache.put(chaveTentativas, String(tentativas + 1), CONFIG.BLOQUEIO_LOGIN_SEGUNDOS);
    throw new Error('Usuário ou senha inválidos.');
  }

  cache.remove(chaveTentativas);

  let empresa = null;

  if (usuario.perfil === 'empresa') {
    empresa = lerEmpresas_().lista.find(e => e.empresa_id === usuario.empresa_id);

    if (!empresa || empresa.status !== 'ATIVO') {
      throw new Error('O acesso desta empresa está inativo. Entre em contato com o restaurante.');
    }
  }

  // Atualiza senhas no formato antigo para o formato v2
  if (!usuario.senha_hash.startsWith('v2:')) {
    comBloqueio_(() => {
      const atual = lerUsuarios_().lista.find(u => u.usuario_id === usuario.usuario_id);
      if (atual) {
        obterAba_('USUARIOS')
          .getRange(atual.linha, COLUNAS_USUARIOS.SENHA)
          .setValue(novoHashSenha_(senha));
      }
    });
  }

  const aberta = abrirSessao_(usuario, empresa);

  return {
    token: aberta.token,
    usuario: comRecursos_(aberta.sessao),
    lembrete: lembrar ? criarLoginSalvo_(usuario) : '',
    dados_iniciais: carregarDadosIniciais_(aberta.sessao)
  };
}

// CRIAR A SESSÃO (6 horas no cache do Google)
function abrirSessao_(usuario, empresa) {
  const sessao = {
    usuario_id: usuario.usuario_id,
    empresa_id: usuario.empresa_id,
    nome: usuario.nome,
    email: usuario.email,
    login: usuario.login || '',
    perfil: usuario.perfil,
    nome_empresa: empresa ? empresa.nome_empresa : '',
    proprietario: usuario.perfil === 'admin' && ehProprietario_(usuario.email),
    dia: hojeTexto_(Session.getScriptTimeZone())   // a sessão vale só neste dia
  };

  const token = Utilities.getUuid() + Utilities.getUuid();

  CacheService.getScriptCache().put(
    chaveSessao_(token),
    JSON.stringify(sessao),
    CONFIG.DURACAO_SESSAO_SEGUNDOS
  );

  return { token: token, sessao: sessao };
}

// Junta à sessão o que ela pode ver (menus). Não fica guardado na sessão:
// é lido de novo a cada entrada, para valer na hora o que o proprietário mudar.
function comRecursos_(sessao) {
  const copia = JSON.parse(JSON.stringify(sessao));
  // "Ver como empresa": o navegador só precisa saber que é uma simulação
  if (copia.simulacao) copia.simulacao = true;
  try {
    copia.recursos = recursosDaSessao_(sessao);
  } catch (erro) {
    copia.recursos = null;
  }
  copia.tutorial_visto = tutorialVisto_(sessao);
  return copia;
}

// ================================================================
// MANTER CONECTADO (login salvo no aparelho)
// O aparelho guarda um código aleatório. Aqui fica só o "resumo"
// (hash) desse código, nas Propriedades do script — nunca o código.
// O login salvo deixa de valer quando:
// - o dia termina (meia-noite, horário do script): no dia seguinte
//   é preciso digitar a senha de novo;
// - a senha do usuário é trocada ou redefinida;
// - o usuário ou a empresa são inativados;
// - a pessoa clica em "Sair".
// ================================================================
const MAXIMO_APARELHOS_POR_USUARIO = 10;

// Meia-noite de hoje (fim do dia), em milissegundos
function fimDoDiaMs_() {
  return converterDataFormulario(hojeTexto_(Session.getScriptTimeZone(), 1)).getTime();
}

function resumoTexto_(texto) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(texto))
  ).replace(/=+$/, '');
}

function chaveLoginSalvo_(lembrete) {
  return 'login_' + resumoTexto_(lembrete);
}

// Assinatura da senha atual: muda quando a senha muda
function assinaturaSenha_(senhaHash) {
  return resumoTexto_(senhaHash).slice(0, 16);
}

function criarLoginSalvo_(usuario) {
  const propriedades = PropertiesService.getScriptProperties();
  const agora = new Date().getTime();
  const lembrete = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();

  // Limpeza: apaga logins vencidos e mantém no máximo 10 aparelhos por usuário
  const todas = propriedades.getProperties();
  const doUsuario = [];

  Object.keys(todas).forEach(chave => {
    if (chave.indexOf('login_') !== 0) return;

    let dados = null;
    try { dados = JSON.parse(todas[chave]); } catch (erro) { /* inválido */ }

    if (!dados || dados.expira < agora) {
      propriedades.deleteProperty(chave);
    } else if (dados.usuario_id === usuario.usuario_id) {
      doUsuario.push({ chave: chave, usado: dados.usado || 0 });
    }
  });

  doUsuario
    .sort((a, b) => b.usado - a.usado)
    .slice(MAXIMO_APARELHOS_POR_USUARIO - 1)
    .forEach(item => propriedades.deleteProperty(item.chave));

  propriedades.setProperty(chaveLoginSalvo_(lembrete), JSON.stringify({
    usuario_id: usuario.usuario_id,
    assinatura: assinaturaSenha_(usuario.senha_hash),
    expira: fimDoDiaMs_(),
    usado: agora
  }));

  return lembrete;
}

// ENTRAR COM O LOGIN SALVO NO APARELHO
// semDados = true: só renova a sessão (usado quando as 6 horas acabam no meio do uso)
// usuarioEsperado: na renovação, garante que a aba continua na mesma conta
function entrarComLoginSalvo(lembrete, semDados, usuarioEsperado) {
  lembrete = String(lembrete || '');
  const propriedades = PropertiesService.getScriptProperties();
  const chave = chaveLoginSalvo_(lembrete);
  const invalido = 'Seu login salvo expirou. Entre novamente.';

  if (lembrete.length < 60) throw new Error(invalido);

  let dados = null;
  try { dados = JSON.parse(propriedades.getProperty(chave) || 'null'); } catch (erro) { /* inválido */ }

  const agora = new Date().getTime();

  // Vencido, ou salvo com a regra antiga de 30 dias (vai além de hoje)
  if (!dados || dados.expira < agora || dados.expira > fimDoDiaMs_()) {
    propriedades.deleteProperty(chave);
    throw new Error(invalido);
  }

  if (usuarioEsperado && dados.usuario_id !== usuarioEsperado) {
    throw new Error('Sessão expirada. Entre novamente.');
  }

  const usuario = lerUsuarios_().lista.find(u => u.usuario_id === dados.usuario_id);

  if (!usuario || usuario.status !== 'ATIVO' || assinaturaSenha_(usuario.senha_hash) !== dados.assinatura) {
    propriedades.deleteProperty(chave);
    throw new Error(invalido);
  }

  let empresa = null;

  if (usuario.perfil === 'empresa') {
    empresa = lerEmpresas_().lista.find(e => e.empresa_id === usuario.empresa_id);

    if (!empresa || empresa.status !== 'ATIVO') {
      propriedades.deleteProperty(chave);
      throw new Error('O acesso desta empresa está inativo. Entre em contato com o restaurante.');
    }
  }

  // Último uso (para manter os aparelhos mais usados); a validade não
  // muda: termina à meia-noite do dia em que a senha foi digitada
  if (agora - (dados.usado || 0) > 3600000) {
    dados.usado = agora;
    propriedades.setProperty(chave, JSON.stringify(dados));
  }

  const aberta = abrirSessao_(usuario, empresa);

  return {
    token: aberta.token,
    usuario: comRecursos_(aberta.sessao),
    dados_iniciais: semDados ? null : carregarDadosIniciais_(aberta.sessao)
  };
}

// VALIDAR SESSÃO
function validarSessao(token) {
  if (!token) {
    throw new Error('Sessão não encontrada. Faça login novamente.');
  }

  const dados = CacheService.getScriptCache().get(chaveSessao_(token));

  if (!dados) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const sessao = JSON.parse(dados);

  // Entradas valem só no dia em que foram feitas
  if (sessao.dia && sessao.dia !== hojeTexto_(Session.getScriptTimeZone())) {
    CacheService.getScriptCache().remove(chaveSessao_(token));
    throw new Error('Sessão expirada. Começou um novo dia: entre novamente.');
  }

  // Sessão do modo teste: só o proprietário (conferido na planilha real);
  // a partir daqui esta execução usa a planilha de teste.
  // "Ver como empresa": a sessão é de uma empresa fictícia, mas quem está
  // usando é o proprietário (simulacao.proprietario_id).
  if (sessao.modo_teste && !bancoTesteAtivo_) {
    const donoId = sessao.simulacao ? sessao.simulacao.proprietario_id : sessao.usuario_id;
    const dono = lerUsuarios_().lista.find(u => u.usuario_id === donoId);

    if (!dono || dono.status !== 'ATIVO' || dono.perfil !== 'admin' || !ehProprietario_(dono.email)) {
      CacheService.getScriptCache().remove(chaveSessao_(token));
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    ativarBancoTeste_();
  }

  // Quem foi desativado ou removido perde o acesso na hora
  const usuario = lerUsuarios_().lista.find(u => u.usuario_id === sessao.usuario_id);

  if (!usuario || usuario.status !== 'ATIVO') {
    CacheService.getScriptCache().remove(chaveSessao_(token));
    throw new Error('Sessão expirada. Seu acesso foi desativado ou removido.');
  }

  if (sessao.perfil === 'admin') {
    sessao.proprietario = ehProprietario_(usuario.email);
    // Permissões lidas na hora: o que o proprietário mudar vale já
    sessao.permissoes = permissoesDoUsuario_(usuario);
  }

  return sessao;
}

// RETOMAR SESSÃO AO ATUALIZAR A PÁGINA (também renova as 6 horas)
// Devolve o usuário e os dados da primeira tela, numa única ida ao servidor.
function retomarSessao(token) {
  const sessao = validarSessao(token);

  if (sessao.perfil === 'empresa') {
    const acesso = validarUsuarioEmpresa_(token);
    sessao.nome_empresa = acesso.nome_empresa;
  }

  CacheService.getScriptCache().put(
    chaveSessao_(token),
    JSON.stringify(sessao),
    CONFIG.DURACAO_SESSAO_SEGUNDOS
  );

  return {
    usuario: comRecursos_(sessao),
    dados_iniciais: carregarDadosIniciais_(sessao)
  };
}

// ENCERRAR SESSÃO (botão "Sair": também apaga o login salvo do aparelho)
function encerrarSessao(token, lembrete) {
  // Saindo da conta no modo teste: o teste também é apagado
  if (token) {
    const dados = lerJson_(CacheService.getScriptCache().get(chaveSessao_(token)));
    if (dados && dados.modo_teste) {
      // Vendo como empresa: a sessão do restaurante (de teste) também acaba
      if (dados.simulacao) CacheService.getScriptCache().remove(chaveSessao_(dados.simulacao.token_restaurante));
      descartarTeste_(token);
    }
  }

  if (token) CacheService.getScriptCache().remove(chaveSessao_(token));
  if (lembrete) PropertiesService.getScriptProperties().deleteProperty(chaveLoginSalvo_(lembrete));
  return true;
}

// VALIDAR SE É ADMINISTRADOR (restaurante)
function validarAdministrador(token) {
  const sessao = validarSessao(token);

  if (sessao.perfil !== 'admin') {
    throw new Error('Acesso permitido somente ao restaurante.');
  }

  return sessao;
}

// VALIDAR RESPONSÁVEL DE EMPRESA
// Sempre usa a empresa da sessão, nunca uma empresa enviada pelo navegador.
function validarUsuarioEmpresa_(token) {
  const sessao = validarSessao(token);

  if (sessao.perfil !== 'empresa' || !sessao.empresa_id) {
    throw new Error('Acesso permitido somente ao responsável da empresa.');
  }

  const empresa = lerEmpresas_().lista.find(e =>
    e.empresa_id === sessao.empresa_id
  );

  if (!empresa || empresa.status !== 'ATIVO') {
    throw new Error('O acesso desta empresa está inativo. Entre em contato com o restaurante.');
  }

  return {
    sessao: sessao,
    get planilha() { return abrirPlanilha_(); },
    empresa: empresa,
    nome_empresa: empresa.nome_empresa
  };
}

// ================================================================
// TROCAR MINHA SENHA (restaurante ou empresa)
// ================================================================
function trocarMinhaSenha(token, senhaAtual, novaSenha) {
  const sessao = validarSessao(token);

  senhaAtual = String(senhaAtual || '');
  novaSenha = validarSenhaNova_(novaSenha);

  if (novaSenha === senhaAtual) {
    throw new Error('A nova senha precisa ser diferente da atual.');
  }

  return comBloqueio_(() => {
    const planilha = abrirPlanilha_();
    const usuarios = lerUsuarios_();
    const usuario = usuarios.lista.find(u => u.usuario_id === sessao.usuario_id);

    if (!usuario || usuario.status !== 'ATIVO') {
      throw new Error('Usuário não encontrado.');
    }

    if (!senhaConfere_(senhaAtual, usuario.senha_hash)) {
      throw new Error('A senha atual está incorreta.');
    }

    usuarios.aba
      .getRange(usuario.linha, COLUNAS_USUARIOS.SENHA)
      .setValue(novoHashSenha_(novaSenha));

    registrarLog_(planilha, sessao, sessao.empresa_id, 'TROCAR_SENHA',
      'Senha alterada pelo próprio usuário');

    return {
      sucesso: true,
      mensagem: 'Senha alterada com sucesso!'
    };
  });
}

// ================================================================
// ACESSOS DO RESTAURANTE (administradores)
// Somente o proprietário (e-mail em CONFIG > EMAIL_PROPRIETARIO, ou o
// primeiro administrador cadastrado) cadastra e gerencia administradores.
// Os outros administradores usam o painel normalmente, mas não veem
// nem mexem nesta área.
// ================================================================
function emailProprietario_() {
  const configurado = lerConfiguracao_('EMAIL_PROPRIETARIO', '').toLowerCase();
  if (configurado) return configurado;

  const primeiro = lerUsuarios_().lista.find(u => u.perfil === 'admin');
  return primeiro ? primeiro.email : '';
}

function ehProprietario_(email) {
  const dono = emailProprietario_();
  return !!dono && String(email || '').trim().toLowerCase() === dono;
}

function validarProprietario_(token) {
  const sessao = validarAdministrador(token);

  if (!ehProprietario_(sessao.email)) {
    throw new Error('Somente o proprietário pode gerenciar os acessos do restaurante.');
  }

  return sessao;
}

function administradorParaNavegador_(usuario, dataCadastro, convites) {
  const expira = convites ? convites[usuario.usuario_id] : null;   // data de validade do convite
  return {
    usuario_id: usuario.usuario_id,
    nome: usuario.nome,
    email: usuario.email,
    login: usuario.login || '',
    status: usuario.status,
    ativado: usuario.ativado,
    convite_expira: expira || null,
    proprietario: ehProprietario_(usuario.email),
    permissoes: permissoesDoUsuario_(usuario),
    data_cadastro: dataCadastro ? milissegundos_(dataCadastro) : null
  };
}

// LISTAR ADMINISTRADORES (+ a lista de abas e funções para o formulário)
function obterAcessos(token) {
  validarProprietario_(token);
  return {
    administradores: listarAdministradores_(),
    catalogo: catalogoPermissoes_()
  };
}

function listarAdministradores(token) {
  validarProprietario_(token);
  return listarAdministradores_();
}

function listarAdministradores_() {
  const dados = lerAba_('USUARIOS');
  const datas = {};
  for (let i = 1; i < dados.length; i++) datas[String(dados[i][0])] = dados[i][COLUNAS_USUARIOS.DATA_CADASTRO - 1];
  const convites = convitesAtivos_();

  return lerUsuarios_().lista
    .filter(u => u.perfil === 'admin')
    .map(u => administradorParaNavegador_(u, datas[u.usuario_id], convites))
    .sort((a, b) => (b.proprietario - a.proprietario) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

// O usuário (login) não pode repetir entre ninguém do sistema
function conferirLoginLivre_(lista, login, usuarioId) {
  if (lista.some(u => u.login === login && u.usuario_id !== usuarioId)) {
    throw new Error('Este usuário já está em uso. Escolha outro.');
  }
}

// E-mail é opcional para administradores (só para contato)
function emailOpcional_(valor) {
  const texto = String(valor || '').trim();
  return texto ? validarEmail_(texto) : '';
}

// CADASTRAR ADMINISTRADOR (sem senha: ele cria a própria pelo convite)
// dados = { nome, login, email?, permissoes }
function criarAdministrador(token, dados) {
  const sessao = validarProprietario_(token);
  dados = dados || {};

  const nome = limparTexto_(dados.nome, 120, 'O nome');
  const login = validarLogin_(dados.login);
  const email = emailOpcional_(dados.email);
  const permissoes = normalizarPermissoes_(dados.permissoes);

  if (nome.length < 2) throw new Error('Informe o nome.');

  return comBloqueio_(() => {
    const usuarios = lerUsuarios_();
    conferirLoginLivre_(usuarios.lista, login, '');

    if (email && usuarios.lista.some(u => u.email === email && u.perfil === 'admin')) {
      throw new Error('Este e-mail já é usado por outro administrador.');
    }

    const agora = new Date();
    const novo = {
      usuario_id: 'ADM-' + Utilities.getUuid(),
      empresa_id: '',
      nome: nome,
      email: email,
      login: login,
      perfil: 'admin',
      status: 'ATIVO',
      ativado: false,
      permissoes_texto: JSON.stringify(permissoes)
    };

    usuarios.aba.appendRow([
      novo.usuario_id,
      '',
      textoPlanilha_(nome),
      email,
      '',
      'admin',
      'ATIVO',
      agora,
      login,
      novo.permissoes_texto
    ]);

    const convite = montarConviteAdmin_(novo, false);

    registrarLog_(null, sessao, '', 'CRIAR_ADMINISTRADOR',
      'Novo administrador: ' + nome + ' (usuário ' + login + '). Convite válido até ' + convite.validade);

    return {
      sucesso: true,
      mensagem: nome + ' foi cadastrado. Envie o convite para ele criar a senha.',
      administrador: administradorParaNavegador_(novo, agora, convitesAtivos_()),
      convite: convite
    };
  });
}

// EDITAR NOME, USUÁRIO, E-MAIL E PERMISSÕES
function editarAdministrador(token, dados) {
  const sessao = validarProprietario_(token);
  dados = dados || {};

  const usuarioId = String(dados.usuario_id || '').trim();
  const nome = limparTexto_(dados.nome, 120, 'O nome');

  if (nome.length < 2) throw new Error('Informe o nome.');

  return comBloqueio_(() => {
    const usuarios = lerUsuarios_();
    const usuario = usuarios.lista.find(u => u.usuario_id === usuarioId && u.perfil === 'admin');

    if (!usuario) throw new Error('Administrador não encontrado.');

    // Proprietário: só o nome muda por aqui (ele entra pelo e-mail)
    if (ehProprietario_(usuario.email)) {
      usuarios.aba.getRange(usuario.linha, COLUNAS_USUARIOS.NOME).setValue(textoPlanilha_(nome));
      registrarLog_(null, sessao, '', 'EDITAR_ADMINISTRADOR', 'Proprietário agora se chama ' + nome);
      usuario.nome = nome;
      return {
        sucesso: true,
        mensagem: 'Dados de ' + nome + ' atualizados.',
        administrador: administradorParaNavegador_(usuario, null, convitesAtivos_())
      };
    }

    const login = validarLogin_(dados.login);
    const email = emailOpcional_(dados.email);
    const permissoes = normalizarPermissoes_(dados.permissoes);

    conferirLoginLivre_(usuarios.lista, login, usuarioId);
    if (email && usuarios.lista.some(u => u.email === email && u.perfil === 'admin' && u.usuario_id !== usuarioId)) {
      throw new Error('Este e-mail já é usado por outro administrador.');
    }

    const aba = usuarios.aba;
    aba.getRange(usuario.linha, COLUNAS_USUARIOS.NOME, 1, 2).setValues([[textoPlanilha_(nome), email]]);
    aba.getRange(usuario.linha, COLUNAS_USUARIOS.LOGIN, 1, 2).setValues([[login, JSON.stringify(permissoes)]]);

    registrarLog_(null, sessao, '', 'EDITAR_ADMINISTRADOR',
      'Administrador ' + nome + ' (usuário ' + login + '): abas ' +
      TELAS_PERMISSAO.filter(t => permissoes.telas[t.chave]).map(t => t.titulo).join(', '));

    usuario.nome = nome;
    usuario.email = email;
    usuario.login = login;
    usuario.permissoes_texto = JSON.stringify(permissoes);

    return {
      sucesso: true,
      mensagem: 'Dados de ' + nome + ' atualizados.',
      administrador: administradorParaNavegador_(usuario, null, convitesAtivos_())
    };
  });
}

// Busca um administrador que não seja o proprietário (para as ações abaixo)
function outroAdministrador_(usuarios, usuarioId) {
  const usuario = usuarios.lista.find(u => u.usuario_id === String(usuarioId || '') && u.perfil === 'admin');

  if (!usuario) throw new Error('Administrador não encontrado.');
  if (ehProprietario_(usuario.email)) throw new Error('O acesso do proprietário não pode ser alterado por aqui.');

  return usuario;
}

// CONVITE (primeiro acesso ou nova senha). A senha atual, se houver,
// continua valendo até a nova ser criada.
function gerarConviteAdministrador(token, usuarioId) {
  const sessao = validarProprietario_(token);

  return comBloqueio_(() => {
    const usuarios = lerUsuarios_();
    const usuario = outroAdministrador_(usuarios, usuarioId);

    if (usuario.status !== 'ATIVO') throw new Error('Reative o acesso antes de enviar o convite.');
    if (!usuario.login) throw new Error('Defina o usuário de acesso (botão Editar) antes de enviar o convite.');

    const convite = montarConviteAdmin_(usuario, usuario.ativado);

    registrarLog_(null, sessao, '', usuario.ativado ? 'CONVITE_NOVA_SENHA_ADMIN' : 'CONVITE_ADMIN',
      'Convite para ' + usuario.nome + ' (usuário ' + usuario.login + '), válido até ' + convite.validade);

    return convite;
  });
}

// Mantido por compatibilidade: agora gera um convite de nova senha
function redefinirSenhaAdministrador(token, usuarioId) {
  return gerarConviteAdministrador(token, usuarioId);
}

// DESATIVAR OU REATIVAR (desativado perde o acesso na hora)
function alterarStatusAdministrador(token, usuarioId, ativar) {
  const sessao = validarProprietario_(token);

  return comBloqueio_(() => {
    const usuarios = lerUsuarios_();
    const usuario = outroAdministrador_(usuarios, usuarioId);
    const status = ativar ? 'ATIVO' : 'INATIVO';

    usuarios.aba.getRange(usuario.linha, COLUNAS_USUARIOS.STATUS).setValue(status);
    if (!ativar) apagarConvite_(usuario.usuario_id);

    registrarLog_(null, sessao, '', ativar ? 'REATIVAR_ADMINISTRADOR' : 'DESATIVAR_ADMINISTRADOR',
      'Administrador ' + usuario.nome + (ativar ? ' reativado' : ' desativado'));

    usuario.status = status;

    return {
      sucesso: true,
      mensagem: ativar ? usuario.nome + ' voltou a ter acesso.' : usuario.nome + ' não tem mais acesso ao painel.',
      administrador: administradorParaNavegador_(usuario, null, convitesAtivos_())
    };
  });
}

// EXCLUIR (o histórico nos registros continua guardado)
function excluirAdministrador(token, usuarioId) {
  const sessao = validarProprietario_(token);

  return comBloqueio_(() => {
    const usuarios = lerUsuarios_();
    const usuario = outroAdministrador_(usuarios, usuarioId);

    apagarConvite_(usuario.usuario_id);
    usuarios.aba.deleteRow(usuario.linha);

    registrarLog_(null, sessao, '', 'EXCLUIR_ADMINISTRADOR',
      'Administrador ' + usuario.nome + ' (' + (usuario.login || usuario.email) + ') excluído');

    return {
      sucesso: true,
      mensagem: 'Acesso de ' + usuario.nome + ' excluído.',
      usuario_id: usuario.usuario_id
    };
  });
}
