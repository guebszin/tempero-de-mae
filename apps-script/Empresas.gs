// ================================================================
// EMPRESAS.gs
// Cadastro, edição, inativação e acesso das empresas clientes.
// A empresa entra com um usuário criado pelo restaurante. O e-mail fica
// só como contato. A senha é criada pela própria empresa (convite).
// Tudo aqui é exclusivo do restaurante (administrador).
// ================================================================

// Posição das colunas da aba EMPRESAS (1 = coluna A)
const COLUNAS_EMPRESAS = {
  ID: 1,
  NOME: 2,
  CNPJ: 3,
  TELEFONE: 4,
  EMAIL: 5,
  ENDERECO: 6,
  STATUS: 7,
  DATA_CADASTRO: 8
};

// LER TODAS AS EMPRESAS DA PLANILHA
// (do cache, quando possível)
function lerEmpresas_() {
  const dados = lerAba_('EMPRESAS');
  const lista = [];

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];
    if (!linha[0]) continue;

    lista.push({
      linha: i + 1,
      empresa_id: String(linha[0]),
      nome_empresa: String(linha[1]).trim(),
      cnpj: String(linha[2]).trim(),
      telefone: String(linha[3]).trim(),
      email: String(linha[4]).trim().toLowerCase(),
      endereco: String(linha[5]).trim(),
      status: String(linha[6]).trim().toUpperCase() === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      ciclo_cobranca: cicloDaEmpresa_(linha[8]),
      dias_vencimento: diasVencimentoDaEmpresa_(linha[9]),
      configuracoes: String(linha[10] || '')
    });
  }

  return {
    get aba() { return obterAba_('EMPRESAS'); },
    lista: lista
  };
}

// Ciclo de cobrança gravado na empresa (vazio = livre)
function cicloDaEmpresa_(valor) {
  const ciclo = String(valor || '').trim().toUpperCase();
  return ['SEMANAL', 'QUINZENAL', 'MENSAL'].indexOf(ciclo) !== -1 ? ciclo : 'LIVRE';
}

// Dias para pagar depois da emissão (vazio = padrão de 5 dias)
function diasVencimentoDaEmpresa_(valor) {
  if (valor === '' || valor === null || valor === undefined) return DIAS_VENCIMENTO_PADRAO;
  const dias = Number(valor);
  return isFinite(dias) && dias >= 0 && dias <= 90 ? Math.floor(dias) : DIAS_VENCIMENTO_PADRAO;
}

// VALIDAR E LIMPAR OS DADOS DO FORMULÁRIO DE EMPRESA
function lerDadosFormularioEmpresa_(dados) {
  if (!dados) {
    throw new Error('Dados da empresa não informados.');
  }

  const empresa = {
    nome: limparTexto_(dados.nome, 120, 'O nome da empresa'),
    cnpj: validarCnpj_(dados.cnpj),
    responsavel: limparTexto_(dados.responsavel, 120, 'O nome do responsável'),
    telefone: validarTelefone_(dados.telefone),
    email: validarEmail_(dados.email),
    login: validarLogin_(dados.login),
    endereco: limparTexto_(dados.endereco, 200, 'O endereço')
  };

  if (empresa.nome.length < 2) {
    throw new Error('Informe o nome da empresa.');
  }

  if (!empresa.responsavel) {
    empresa.responsavel = empresa.nome;
  }

  return empresa;
}

// CONFERIR SE O USUÁRIO E O CNPJ JÁ ESTÃO EM USO POR OUTRA EMPRESA
// (o e-mail é só contato: pode se repetir)
function conferirDuplicidadeEmpresa_(planilha, empresa, ignorarEmpresaId) {
  const usuarios = lerUsuarios_(planilha).lista;

  const loginEmUso = usuarios.find(u =>
    u.login === empresa.login &&
    !(u.perfil === 'empresa' && u.empresa_id === ignorarEmpresaId)
  );

  if (loginEmUso) {
    throw new Error('O usuário "' + empresa.login + '" já existe. Escolha outro.');
  }

  if (empresa.cnpj) {
    const numeros = empresa.cnpj.replace(/\D/g, '');

    const cnpjEmUso = lerEmpresas_(planilha).lista.find(e =>
      e.empresa_id !== ignorarEmpresaId &&
      e.cnpj.replace(/\D/g, '') === numeros
    );

    if (cnpjEmUso) {
      throw new Error('Este CNPJ já está cadastrado para ' + cnpjEmUso.nome_empresa + '.');
    }
  }
}

// LISTAR EMPRESAS (com responsável, preço vigente e nº de funcionários)
function listarEmpresas(token) {
  validarAdministrador(token);
  return montarListaEmpresas_();
}

// MONTAR A LISTA COMPLETA (ou só uma empresa, se informada)
function montarListaEmpresas_(somenteEmpresaId) {
  const empresas = lerEmpresas_().lista.filter(e =>
    !somenteEmpresaId || e.empresa_id === somenteEmpresaId
  );
  const usuarios = lerUsuarios_().lista;
  const precos = lerPrecos_();
  const funcionarios = lerFuncionarios_().lista;
  const hoje = hojeTexto_(precos.fuso);
  const convites = convitesAtivos_();

  return empresas
    .map(empresa => {
      const usuario = usuarios.find(u =>
        u.perfil === 'empresa' && u.empresa_id === empresa.empresa_id
      );

      const preco = precoVigente_(precos.lista, empresa.empresa_id, hoje);

      return {
        empresa_id: empresa.empresa_id,
        nome_empresa: empresa.nome_empresa,
        cnpj: empresa.cnpj,
        telefone: empresa.telefone,
        email: usuario ? usuario.email : empresa.email,
        endereco: empresa.endereco,
        status: empresa.status,
        responsavel: usuario ? usuario.nome : '',
        login: usuario ? usuario.login : '',
        acesso_ativado: !!(usuario && usuario.ativado),
        convite_expira: usuario ? convites[usuario.usuario_id] || null : null,
        preco_vigente: preco ? preco.valor_unitario : null,
        preco_desde: preco ? preco.data_inicio : '',
        funcionarios_ativos: funcionarios.filter(f =>
          f.empresa_id === empresa.empresa_id && f.status === 'ATIVO'
        ).length
      };
    })
    .sort((a, b) => a.nome_empresa.localeCompare(b.nome_empresa, 'pt-BR'));
}

// DADOS ATUALIZADOS DE UMA EMPRESA (devolvidos depois de cada gravação)
function resumoEmpresa_(empresaId) {
  return montarListaEmpresas_(empresaId)[0] || null;
}

// CADASTRAR EMPRESA (cria também o acesso do responsável, ainda sem senha)
// Devolve o convite: a própria empresa cria a senha pelo link.
function criarEmpresa(token, dados) {
  const sessao = exigirTela_(token, 'empresas');
  const empresa = lerDadosFormularioEmpresa_(dados);

  return comBloqueio_(() => {
    const planilha = abrirPlanilha_();

    conferirDuplicidadeEmpresa_(planilha, empresa, null);

    const empresaId = 'EMP-' + Utilities.getUuid();
    const agora = new Date();

    obterAba_('EMPRESAS').appendRow([
      empresaId,
      textoPlanilha_(empresa.nome),
      textoPlanilha_(empresa.cnpj),
      textoPlanilha_(empresa.telefone),
      empresa.email,
      textoPlanilha_(empresa.endereco),
      'ATIVO',
      agora
    ]);

    const usuario = {
      usuario_id: 'USR-' + Utilities.getUuid(),
      empresa_id: empresaId,
      nome: empresa.responsavel,
      email: empresa.email,
      login: empresa.login,
      ativado: false
    };

    obterAba_('USUARIOS').appendRow([
      usuario.usuario_id,
      empresaId,
      textoPlanilha_(empresa.responsavel),
      empresa.email,
      '',
      'empresa',
      'ATIVO',
      agora,
      empresa.login
    ]);

    const convite = montarConvite_(usuario, {
      nome_empresa: empresa.nome,
      telefone: empresa.telefone,
      email: empresa.email
    }, false);

    registrarLog_(planilha, sessao, empresaId, 'CRIAR_EMPRESA',
      'Empresa cadastrada: ' + empresa.nome + ' (usuário ' + empresa.login + '). Convite válido até ' + convite.validade);

    return {
      sucesso: true,
      mensagem: 'Empresa cadastrada com sucesso!',
      empresa_id: empresaId,
      empresa: resumoEmpresa_(empresaId),
      convite: convite
    };
  });
}

// EDITAR EMPRESA
function editarEmpresa(token, dados) {
  const sessao = exigirTela_(token, 'empresas');
  const empresaId = String((dados && dados.empresa_id) || '').trim();
  const empresa = lerDadosFormularioEmpresa_(dados);

  if (!empresaId) {
    throw new Error('Empresa não informada.');
  }

  return comBloqueio_(() => {
    const planilha = abrirPlanilha_();
    const empresas = lerEmpresas_(planilha);
    const atual = empresas.lista.find(e => e.empresa_id === empresaId);

    if (!atual) {
      throw new Error('Empresa não encontrada.');
    }

    conferirDuplicidadeEmpresa_(planilha, empresa, empresaId);

    empresas.aba
      .getRange(atual.linha, COLUNAS_EMPRESAS.NOME, 1, 5)
      .setValues([[
        textoPlanilha_(empresa.nome),
        textoPlanilha_(empresa.cnpj),
        textoPlanilha_(empresa.telefone),
        empresa.email,
        textoPlanilha_(empresa.endereco)
      ]]);

    // Atualiza nome do responsável e e-mail de acesso
    const usuarios = lerUsuarios_(planilha);
    const usuario = usuarios.lista.find(u =>
      u.perfil === 'empresa' && u.empresa_id === empresaId
    );

    if (usuario) {
      usuarios.aba
        .getRange(usuario.linha, COLUNAS_USUARIOS.NOME, 1, 2)
        .setValues([[textoPlanilha_(empresa.responsavel), empresa.email]]);
      usuarios.aba
        .getRange(usuario.linha, COLUNAS_USUARIOS.LOGIN)
        .setValue(empresa.login);
    }

    const loginMudou = usuario && usuario.login !== empresa.login;

    registrarLog_(planilha, sessao, empresaId, 'EDITAR_EMPRESA',
      'Empresa atualizada: ' + empresa.nome +
      (loginMudou ? ' (usuário de acesso: ' + (usuario.login || 'sem usuário') + ' → ' + empresa.login + ')' : ''));

    return {
      sucesso: true,
      mensagem: loginMudou
        ? 'Empresa atualizada. O usuário de acesso agora é ' + empresa.login + '.'
        : 'Empresa atualizada com sucesso!',
      empresa: resumoEmpresa_(empresaId)
    };
  });
}

// INATIVAR OU REATIVAR EMPRESA
// Empresa inativa não consegue entrar no portal. Nada é apagado.
function alterarStatusEmpresa(token, empresaId, ativar) {
  const sessao = exigirTela_(token, 'empresas');
  empresaId = String(empresaId || '').trim();

  const novoStatus = ativar === true ? 'ATIVO' : 'INATIVO';

  return comBloqueio_(() => {
    const planilha = abrirPlanilha_();
    const empresas = lerEmpresas_(planilha);
    const empresa = empresas.lista.find(e => e.empresa_id === empresaId);

    if (!empresa) {
      throw new Error('Empresa não encontrada.');
    }

    if (empresa.status === novoStatus) {
      throw new Error('A empresa já está ' + (ativar ? 'ativa.' : 'inativa.'));
    }

    empresas.aba
      .getRange(empresa.linha, COLUNAS_EMPRESAS.STATUS)
      .setValue(novoStatus);

    registrarLog_(planilha, sessao, empresaId,
      ativar ? 'REATIVAR_EMPRESA' : 'INATIVAR_EMPRESA',
      'Empresa ' + empresa.nome_empresa + ' agora está ' + novoStatus);

    return {
      sucesso: true,
      mensagem: ativar
        ? empresa.nome_empresa + ' foi reativada.'
        : empresa.nome_empresa + ' foi inativada e não consegue mais acessar o portal.',
      empresa: resumoEmpresa_(empresaId)
    };
  });
}

// ================================================================
// EXCLUIR EMPRESA DEFINITIVAMENTE
// Regras de segurança:
// 1. A empresa precisa estar inativa.
// 2. Não pode ter pedidos, cobranças ou pagamentos (histórico financeiro).
// 3. É preciso confirmar digitando o nome da empresa.
// São apagados: a empresa, o acesso do responsável, os funcionários e
// os preços dela. A aba LOGS é mantida, como registro da exclusão.
// ================================================================
function excluirEmpresa(token, empresaId, nomeDigitado, opcoes) {
  const sessao = exigirFuncao_(token, 'empresas_excluir');
  empresaId = String(empresaId || '').trim();

  if (!empresaId) {
    throw new Error('Empresa não informada.');
  }

  return comBloqueio_(() => {
    const planilha = abrirPlanilha_();
    const empresas = lerEmpresas_(planilha);
    const empresa = empresas.lista.find(e => e.empresa_id === empresaId);

    if (!empresa) {
      throw new Error('Empresa não encontrada. Ela pode já ter sido excluída.');
    }

    if (empresa.status === 'ATIVO') {
      throw new Error('Inative a empresa antes de excluí-la.');
    }

    if (normalizarNome_(nomeDigitado) !== normalizarNome_(empresa.nome_empresa)) {
      throw new Error('O nome digitado não confere com o nome da empresa.');
    }

    // Com histórico (pedidos, cobranças ou pagamentos), só o proprietário
    // exclui — e o histórico fica guardado (ver excluirEmpresaGuardandoHistorico_)
    const historico = historicoDaEmpresa_(planilha, empresaId);

    if (historico.length) {
      if (!ehProprietario_(sessao.email)) {
        throw new Error(
          'Esta empresa tem ' +
          historico.map(item => item.quantidade + ' ' + item.nome).join(', ') +
          ' registrados. Somente o proprietário pode excluir empresas com histórico. ' +
          'Enquanto isso, ela pode continuar inativa, sem acesso ao portal.'
        );
      }

      if (!(opcoes && opcoes.manter_historico)) {
        throw new Error('Esta empresa tem histórico. Abra a exclusão de novo para ver o que será guardado.');
      }

      return excluirEmpresaGuardandoHistorico_(planilha, sessao, empresas, empresa);
    }

    // Apaga os dados ligados à empresa
    lerUsuarios_().lista
      .filter(u => u.perfil === 'empresa' && u.empresa_id === empresaId)
      .forEach(u => apagarConvite_(u.usuario_id));

    const abaUsuarios = obterAba_('USUARIOS');
    const abaFuncionarios = obterAba_('FUNCIONARIOS');
    const abaPrecos = obterAba_('PRECOS');

    const totalFuncionarios = excluirLinhas_(abaFuncionarios,
      linhasDaEmpresa_(abaFuncionarios, 1, empresaId));
    const totalPrecos = excluirLinhas_(abaPrecos,
      linhasDaEmpresa_(abaPrecos, 1, empresaId));
    excluirLinhas_(abaUsuarios,
      linhasDaEmpresa_(abaUsuarios, 1, empresaId));
    excluirLinhas_(empresas.aba, [empresa.linha]);

    registrarLog_(planilha, sessao, empresaId, 'EXCLUIR_EMPRESA',
      'Empresa excluída definitivamente: ' + empresa.nome_empresa +
      (empresa.cnpj ? ' (CNPJ ' + empresa.cnpj + ')' : '') +
      '. Removidos: ' + totalFuncionarios + ' funcionário(s) e ' + totalPrecos + ' preço(s).');

    return {
      sucesso: true,
      mensagem: empresa.nome_empresa + ' foi excluída definitivamente.',
      empresa_id: empresaId
    };
  });
}

// ================================================================
// EXCLUIR EMPRESA COM HISTÓRICO (somente o proprietário)
// A empresa sai do sistema: cadastro, acesso, convite, funcionários e
// preços são apagados. Pedidos, cobranças e pagamentos FICAM, com o
// mesmo código da empresa. O nome e os dados dela (e os nomes dos
// funcionários) vão para a aba EMPRESAS_EXCLUIDAS, de onde os
// relatórios e as cobranças continuam lendo.
// Pedidos com entrega depois de hoje são cancelados (ninguém vai
// receber). Os de hoje e anteriores continuam como estão.
// ================================================================
const ABA_EMPRESAS_EXCLUIDAS = 'EMPRESAS_EXCLUIDAS';
const SUFIXO_EMPRESA_EXCLUIDA = ' (excluída)';

function historicoDaEmpresa_(planilha, empresaId) {
  return [
    { aba: 'PEDIDOS', coluna: 1, nome: 'pedido(s)' },
    { aba: 'COBRANCAS', coluna: 1, nome: 'cobrança(s)' },
    { aba: 'PAGAMENTOS', coluna: 2, nome: 'pagamento(s)' }
  ]
    .map(item => ({
      chave: item.aba,
      nome: item.nome,
      quantidade: linhasDaEmpresa_(planilha.getSheetByName(item.aba), item.coluna, empresaId).length
    }))
    .filter(item => item.quantidade > 0);
}

// PRÉVIA: o que acontece se a empresa for excluída
function previaExclusaoEmpresa(token, empresaId) {
  const sessao = exigirTela_(token, 'empresas');
  empresaId = String(empresaId || '').trim();

  const empresa = lerEmpresas_().lista.find(e => e.empresa_id === empresaId);
  if (!empresa) throw new Error('Empresa não encontrada. Ela pode já ter sido excluída.');

  const hoje = hojeTexto_(Session.getScriptTimeZone());
  const pedidos = lerPedidos_().lista.filter(p => p.empresa_id === empresaId);
  const cobrancas = lerCobrancas_().lista.filter(c => c.empresa_id === empresaId);
  const pagamentos = lerPagamentos_().lista.filter(p => p.empresa_id === empresaId);
  const funcionarios = lerFuncionarios_().lista.filter(f => f.empresa_id === empresaId);

  const abertas = cobrancas.filter(c => c.status === 'ABERTA' || c.status === 'PARCIAL');
  const futuros = pedidos.filter(pedidoSeraCanceladoNaExclusao_.bind(null, hoje));

  return {
    empresa_id: empresaId,
    nome_empresa: empresa.nome_empresa,
    status: empresa.status,
    proprietario: ehProprietario_(sessao.email),
    funcionarios: funcionarios.length,
    pedidos: pedidos.filter(p => p.status !== 'CANCELADO').length - futuros.length,
    pedidos_futuros: futuros.length,
    cobrancas: cobrancas.filter(c => c.status !== 'CANCELADA').length,
    cobrancas_abertas: abertas.length,
    saldo_aberto: arredondar_(abertas.reduce((soma, c) => soma + Math.max(0, c.valor_total - c.valor_pago), 0)),
    pagamentos: pagamentos.length,
    tem_historico: !!(pedidos.length || cobrancas.length || pagamentos.length)
  };
}

function pedidoSeraCanceladoNaExclusao_(hoje, pedido) {
  return pedido.data_entrega > hoje && (pedido.status === 'ENVIADO' || pedido.status === 'CONFIRMADO');
}

function excluirEmpresaGuardandoHistorico_(planilha, sessao, empresas, empresa) {
  const empresaId = empresa.empresa_id;
  const hoje = hojeTexto_(Session.getScriptTimeZone());
  const usuarios = lerUsuarios_().lista.filter(u => u.perfil === 'empresa' && u.empresa_id === empresaId);
  const funcionarios = lerFuncionarios_().lista.filter(f => f.empresa_id === empresaId);
  const historico = historicoDaEmpresa_(planilha, empresaId);

  // 1. Pedidos com entrega futura: cancelados
  const pedidos = lerPedidos_();
  const futuros = pedidos.lista.filter(p => p.empresa_id === empresaId && pedidoSeraCanceladoNaExclusao_(hoje, p));
  if (futuros.length) {
    const abaPedidos = obterAba_('PEDIDOS');
    futuros.forEach(p => {
      abaPedidos.getRange(p.linha, COLUNAS_PEDIDOS.STATUS).setValue('CANCELADO');
      abaPedidos.getRange(p.linha, COLUNAS_PEDIDOS.ATUALIZADO).setValue(new Date());
      abaPedidos.getRange(p.linha, COLUNAS_PEDIDOS.RESPOSTA).setValue('Cancelado: empresa excluída do sistema.');
    });
    marcarPedidosAlterados_();
  }

  // 2. Arquivo com os dados da empresa e os nomes dos funcionários
  const nomesFuncionarios = {};
  funcionarios.forEach(f => {
    nomesFuncionarios[f.funcionario_id] = { nome: f.nome, setor: f.setor || '', matricula: f.matricula || '' };
  });

  const resumo = historico.map(item => item.quantidade + ' ' + item.nome).join(', ') +
    (futuros.length ? '; ' + futuros.length + ' pedido(s) futuro(s) cancelado(s)' : '');

  const responsavel = usuarios[0];
  abaEmpresasExcluidas_().appendRow([
    empresaId,
    textoPlanilha_(empresa.nome_empresa),
    textoPlanilha_(empresa.cnpj),
    textoPlanilha_(empresa.telefone),
    textoPlanilha_(responsavel ? responsavel.email : empresa.email),
    textoPlanilha_(empresa.endereco),
    new Date(),
    textoPlanilha_(sessao.nome || sessao.email || ''),
    JSON.stringify(nomesFuncionarios),
    textoPlanilha_(resumo)
  ]);

  // 3. Apaga o que é da empresa (acesso, convite, funcionários, preços e cadastro)
  usuarios.forEach(u => apagarConvite_(u.usuario_id));

  const abaUsuarios = obterAba_('USUARIOS');
  const abaFuncionarios = obterAba_('FUNCIONARIOS');
  const abaPrecos = obterAba_('PRECOS');

  const totalFuncionarios = excluirLinhas_(abaFuncionarios, linhasDaEmpresa_(abaFuncionarios, 1, empresaId));
  const totalPrecos = excluirLinhas_(abaPrecos, linhasDaEmpresa_(abaPrecos, 1, empresaId));
  excluirLinhas_(abaUsuarios, linhasDaEmpresa_(abaUsuarios, 1, empresaId));
  excluirLinhas_(obterAba_('EMPRESAS'), [empresa.linha]);

  registrarLog_(planilha, sessao, empresaId, 'EXCLUIR_EMPRESA_COM_HISTORICO',
    'Empresa excluída (histórico guardado): ' + empresa.nome_empresa +
    (empresa.cnpj ? ' (CNPJ ' + empresa.cnpj + ')' : '') +
    '. Guardados: ' + resumo + '. Removidos: ' + totalFuncionarios + ' funcionário(s) e ' + totalPrecos + ' preço(s).');

  return {
    sucesso: true,
    mensagem: empresa.nome_empresa + ' foi excluída. Os pedidos e cobranças continuam nos relatórios.',
    empresa_id: empresaId
  };
}

// A aba do arquivo é criada na primeira exclusão, se ainda não existir
function abaEmpresasExcluidas_() {
  return garantirAba_(ABA_EMPRESAS_EXCLUIDAS);
}

// LER O ARQUIVO DE EMPRESAS EXCLUÍDAS (vazio se a aba ainda não existe)
function lerEmpresasExcluidas_() {
  let dados;
  try {
    dados = lerAba_(ABA_EMPRESAS_EXCLUIDAS);
  } catch (erro) {
    return [];
  }

  const lista = [];
  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];
    if (!linha[0]) continue;

    lista.push({
      empresa_id: String(linha[0]),
      nome_empresa: String(linha[1]).trim(),
      cnpj: String(linha[2]).trim(),
      telefone: String(linha[3]).trim(),
      email: String(linha[4]).trim(),
      endereco: String(linha[5]).trim(),
      excluida_em: milissegundos_(linha[6]),
      excluida_por: String(linha[7] || ''),
      funcionarios: lerJson_(linha[8]) || {},
      resumo: String(linha[9] || '')
    });
  }

  return lista;
}

// NOMES DE TODAS AS EMPRESAS: as atuais e as excluídas (com o aviso)
function nomesEmpresasComExcluidas_() {
  const nomes = {};
  lerEmpresasExcluidas_().forEach(e => { nomes[e.empresa_id] = e.nome_empresa + SUFIXO_EMPRESA_EXCLUIDA; });
  lerEmpresas_().lista.forEach(e => { nomes[e.empresa_id] = e.nome_empresa; });
  return nomes;
}

// FUNCIONÁRIOS: os atuais, os apagados e os das empresas excluídas
// (dos que saíram, só nome, setor e matrícula)
function funcionariosComExcluidos_() {
  const mapa = {};
  lerFuncionariosExcluidos_().forEach(f => { mapa[f.funcionario_id] = f; });
  lerEmpresasExcluidas_().forEach(e => {
    Object.keys(e.funcionarios).forEach(id => {
      const f = e.funcionarios[id] || {};
      mapa[id] = { funcionario_id: id, empresa_id: e.empresa_id, nome: String(f.nome || ''), setor: String(f.setor || ''), matricula: String(f.matricula || '') };
    });
  });
  lerFuncionarios_().lista.forEach(f => { mapa[f.funcionario_id] = f; });
  return mapa;
}

// LISTA DAS EMPRESAS EXCLUÍDAS (para filtros de relatório)
function listarEmpresasExcluidas(token) {
  exigirTela_(token, 'relatorios');
  return lerEmpresasExcluidas_()
    .map(e => ({ empresa_id: e.empresa_id, nome_empresa: e.nome_empresa, excluida_em: e.excluida_em }))
    .sort((a, b) => a.nome_empresa.localeCompare(b.nome_empresa, 'pt-BR'));
}

// NÚMEROS DAS LINHAS DE UMA ABA QUE PERTENCEM À EMPRESA
// coluna: posição (começando em 0) da coluna empresa_id
function linhasDaEmpresa_(aba, coluna, empresaId) {
  if (!aba) return [];

  const dados = aba.getDataRange().getValues();
  const linhas = [];

  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][coluna]) === empresaId) linhas.push(i + 1);
  }

  return linhas;
}

// APAGAR LINHAS (de baixo para cima, agrupando linhas seguidas)
function excluirLinhas_(aba, linhas) {
  if (!aba || !linhas.length) return 0;

  const ordenadas = linhas.slice().sort((a, b) => b - a);
  let i = 0;

  while (i < ordenadas.length) {
    let fim = ordenadas[i];
    let inicio = fim;

    while (i + 1 < ordenadas.length && ordenadas[i + 1] === inicio - 1) {
      i++;
      inicio = ordenadas[i];
    }

    aba.deleteRows(inicio, fim - inicio + 1);
    i++;
  }

  return linhas.length;
}

// COMPARAR NOMES SEM DIFERENCIAR MAIÚSCULAS, ACENTOS E ESPAÇOS
function normalizarNome_(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
