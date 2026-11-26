// ================================================================
// LIMPEZA.gs
// Exclusões que somente o PROPRIETÁRIO pode fazer:
//  - pedidos CANCELADOS (só os cancelados);
//  - cobranças CANCELADAS;
//  - funcionários (inativos). O histórico de pedidos deles continua
//    nos relatórios: nome, setor e matrícula vão para a aba
//    FUNCIONARIOS_EXCLUIDOS.
// Tudo fica registrado em LOGS.
// ================================================================
const ABA_FUNCIONARIOS_EXCLUIDOS = 'FUNCIONARIOS_EXCLUIDOS';
const CHAVE_ULTIMO_NUMERO_COBRANCA = 'ULTIMO_NUMERO_COBRANCA';

function validarDonoLimpeza_(token) {
  const sessao = validarAdministrador(token);

  if (!ehProprietario_(sessao.email)) {
    throw new Error('Somente o proprietário pode apagar registros do sistema.');
  }

  return sessao;
}

// Cria a aba (com cabeçalhos) se ainda não existir
function garantirAba_(nome) {
  const planilha = abrirPlanilha_();
  let aba = planilha.getSheetByName(nome);

  if (!aba) {
    aba = planilha.insertSheet(nome);
    const cabecalhos = ESTRUTURA[nome];
    aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]).setFontWeight('bold');
    aba.setFrozenRows(1);
    limparMemoriaExecucao_();
  }

  return aba;
}

// ================================================================
// RESUMO PARA A TELA DE CONFIGURAÇÕES
// ================================================================
function obterResumoLimpeza(token) {
  validarDonoLimpeza_(token);
  return montarResumoLimpeza_();
}

function montarResumoLimpeza_() {
  return {
    pedidos_cancelados: lerPedidos_().lista.filter(p => p.status === 'CANCELADO').length,
    cobrancas_canceladas: lerCobrancas_().lista.filter(c => c.status === 'CANCELADA').length,
    funcionarios_excluidos: lerFuncionariosExcluidos_().length
  };
}

// ================================================================
// PEDIDOS CANCELADOS
// ================================================================
function excluirPedidoCancelado(token, pedidoId) {
  const sessao = validarDonoLimpeza_(token);
  pedidoId = String(pedidoId || '').trim();

  return comBloqueio_(() => {
    const pedido = lerPedidos_().lista.find(p => p.pedido_id === pedidoId);

    if (!pedido) throw new Error('Pedido não encontrado. Ele pode já ter sido apagado.');
    if (pedido.status !== 'CANCELADO') throw new Error('Só é possível apagar pedidos cancelados.');
    if (pedido.cobranca_id) throw new Error('Este pedido está em uma cobrança e não pode ser apagado.');

    apagarPedidos_([pedido]);

    registrarLog_(null, sessao, pedido.empresa_id, 'APAGAR_PEDIDO_CANCELADO',
      'Pedido cancelado de ' + formatarDataBR_(pedido.data_entrega) + ' apagado (' + nomeDoPedido_(pedido) + ').');

    return {
      sucesso: true,
      mensagem: 'Pedido cancelado apagado.',
      pedido_id: pedidoId,
      dia: montarPedidosDia_(pedido.data_entrega)
    };
  });
}

function limparPedidosCancelados(token) {
  const sessao = validarDonoLimpeza_(token);

  return comBloqueio_(() => {
    const cancelados = lerPedidos_().lista.filter(p => p.status === 'CANCELADO' && !p.cobranca_id);
    if (!cancelados.length) throw new Error('Não há pedidos cancelados para apagar.');

    apagarPedidos_(cancelados);

    registrarLog_(null, sessao, '', 'LIMPAR_PEDIDOS_CANCELADOS',
      cancelados.length + ' pedido(s) cancelado(s) apagado(s).');

    return {
      sucesso: true,
      mensagem: cancelados.length + ' pedido(s) cancelado(s) apagado(s).',
      resumo: montarResumoLimpeza_()
    };
  });
}

// Apaga as linhas dos pedidos e os itens que ainda existirem
function apagarPedidos_(pedidos) {
  const abaItens = obterAba_('ITENS_PEDIDOS');
  let linhasItens = [];
  pedidos.forEach(p => { linhasItens = linhasItens.concat(linhasDoPedido_(abaItens, p.pedido_id)); });

  excluirLinhas_(abaItens, linhasItens);
  excluirLinhas_(obterAba_('PEDIDOS'), pedidos.map(p => p.linha));
  marcarPedidosAlterados_();
}

function nomeDoPedido_(pedido) {
  if (!pedido.empresa_id) return 'cliente ' + (pedido.cliente_nome || 'sem cadastro');
  return nomesEmpresasComExcluidas_()[pedido.empresa_id] || 'empresa removida';
}

// ================================================================
// COBRANÇAS CANCELADAS
// O número de uma cobrança apagada nunca é usado de novo.
// ================================================================
function excluirCobrancaCancelada(token, cobrancaId) {
  const sessao = validarDonoLimpeza_(token);
  cobrancaId = String(cobrancaId || '').trim();

  return comBloqueio_(() => {
    const cobranca = lerCobrancas_().lista.find(c => c.cobranca_id === cobrancaId);

    if (!cobranca) throw new Error('Cobrança não encontrada. Ela pode já ter sido apagada.');
    if (cobranca.status !== 'CANCELADA') throw new Error('Só é possível apagar cobranças canceladas.');

    apagarCobrancas_([cobranca]);

    registrarLog_(null, sessao, cobranca.empresa_id, 'APAGAR_COBRANCA_CANCELADA',
      'Cobrança cancelada nº ' + numeroCobranca_(cobranca.numero) + ' apagada.');

    return {
      sucesso: true,
      mensagem: 'Cobrança nº ' + numeroCobranca_(cobranca.numero) + ' apagada.',
      painel: montarPainelCobrancas_()
    };
  });
}

function limparCobrancasCanceladas(token) {
  const sessao = validarDonoLimpeza_(token);

  return comBloqueio_(() => {
    const canceladas = lerCobrancas_().lista.filter(c => c.status === 'CANCELADA');
    if (!canceladas.length) throw new Error('Não há cobranças canceladas para apagar.');

    apagarCobrancas_(canceladas);

    registrarLog_(null, sessao, '', 'LIMPAR_COBRANCAS_CANCELADAS',
      canceladas.length + ' cobrança(s) cancelada(s) apagada(s): nº ' +
      canceladas.map(c => numeroCobranca_(c.numero)).join(', ') + '.');

    return {
      sucesso: true,
      mensagem: canceladas.length + ' cobrança(s) cancelada(s) apagada(s).',
      resumo: montarResumoLimpeza_()
    };
  });
}

function apagarCobrancas_(cobrancas) {
  const ids = {};
  cobrancas.forEach(c => { ids[c.cobranca_id] = true; });

  // Segurança: cobrança cancelada não tem pagamentos nem pedidos, mas confere
  if (lerPagamentos_().lista.some(p => ids[p.cobranca_id])) {
    throw new Error('Há pagamentos ligados a esta cobrança. Exclua os pagamentos antes.');
  }

  const pedidos = lerPedidos_();
  const presos = pedidos.lista.filter(p => ids[p.cobranca_id]);
  presos.forEach(p => pedidos.aba.getRange(p.linha, COLUNA_COBRANCA_PEDIDO).setValue(''));
  if (presos.length) marcarPedidosAlterados_();

  // Guarda o maior número já usado, para não repetir numeração
  const maior = cobrancas.reduce((m, c) => Math.max(m, c.numero), ultimoNumeroCobrancaApagada_());
  gravarConfiguracao_(CHAVE_ULTIMO_NUMERO_COBRANCA, maior,
    'Maior número de cobrança já usado (cobranças apagadas não repetem o número)');

  excluirLinhas_(obterAba_('COBRANCAS'), cobrancas.map(c => c.linha));
}

function ultimoNumeroCobrancaApagada_() {
  return Number(lerConfiguracao_(CHAVE_ULTIMO_NUMERO_COBRANCA, '0')) || 0;
}

// ================================================================
// FUNCIONÁRIOS
// Só funcionários INATIVOS podem ser apagados (inative antes).
// ================================================================
function previaExclusaoFuncionario(token, funcionarioId) {
  const sessao = exigirTela_(token, 'funcionarios');
  funcionarioId = String(funcionarioId || '').trim();

  const funcionario = lerFuncionarios_().lista.find(f => f.funcionario_id === funcionarioId);
  if (!funcionario) throw new Error('Funcionário não encontrado. Ele pode já ter sido apagado.');

  const historico = historicoDoFuncionario_(funcionarioId, funcionario.empresa_id);

  return {
    funcionario_id: funcionarioId,
    nome: funcionario.nome,
    status: funcionario.status,
    proprietario: ehProprietario_(sessao.email),
    quentinhas: historico.quentinhas,
    pedidos_abertos: historico.pedidos_abertos
  };
}

// Quantas quentinhas ele já recebeu e quantos pedidos de hoje em diante o incluem
function historicoDoFuncionario_(funcionarioId, empresaId) {
  const hoje = hojeTexto_(Session.getScriptTimeZone());
  const pedidos = {};
  lerPedidos_().lista.forEach(p => {
    if (p.empresa_id === empresaId && p.status !== 'CANCELADO') pedidos[p.pedido_id] = p;
  });

  const abaItens = obterAba_('ITENS_PEDIDOS');
  const ultima = abaItens.getLastRow();
  let quentinhas = 0;
  const abertos = {};

  if (ultima >= 2) {
    abaItens.getRange(2, 1, ultima - 1, 4).getValues().forEach(l => {
      if (String(l[3]) !== funcionarioId) return;
      const pedido = pedidos[String(l[1])];
      if (!pedido) return;
      quentinhas++;
      if (pedido.data_entrega >= hoje && (pedido.status === 'ENVIADO' || pedido.status === 'CONFIRMADO')) {
        abertos[pedido.pedido_id] = true;
      }
    });
  }

  return { quentinhas: quentinhas, pedidos_abertos: Object.keys(abertos).length };
}

function excluirFuncionario(token, funcionarioId) {
  const sessao = validarDonoLimpeza_(token);
  funcionarioId = String(funcionarioId || '').trim();

  return comBloqueio_(() => {
    const funcionarios = lerFuncionarios_();
    const funcionario = funcionarios.lista.find(f => f.funcionario_id === funcionarioId);

    if (!funcionario) throw new Error('Funcionário não encontrado. Ele pode já ter sido apagado.');
    if (funcionario.status === 'ATIVO') throw new Error('Inative o funcionário antes de apagá-lo.');

    const historico = historicoDoFuncionario_(funcionarioId, funcionario.empresa_id);

    // Guarda nome, setor e matrícula para os relatórios
    garantirAba_(ABA_FUNCIONARIOS_EXCLUIDOS).appendRow([
      funcionarioId,
      funcionario.empresa_id,
      textoPlanilha_(funcionario.nome),
      textoPlanilha_(funcionario.matricula),
      textoPlanilha_(funcionario.setor),
      new Date(),
      textoPlanilha_(sessao.nome || sessao.email || ''),
      historico.quentinhas
    ]);

    excluirLinhas_(funcionarios.aba, [funcionario.linha]);

    registrarLog_(null, sessao, funcionario.empresa_id, 'APAGAR_FUNCIONARIO',
      'Funcionário apagado: ' + funcionario.nome + (funcionario.matricula ? ' (matrícula ' + funcionario.matricula + ')' : '') +
      '. Histórico guardado: ' + historico.quentinhas + ' quentinha(s).');

    return {
      sucesso: true,
      mensagem: funcionario.nome + ' foi apagado.' +
        (historico.quentinhas ? ' As quentinhas dele continuam nos relatórios.' : ''),
      funcionario_id: funcionarioId
    };
  });
}

// LER O ARQUIVO DE FUNCIONÁRIOS EXCLUÍDOS (vazio se a aba ainda não existe)
function lerFuncionariosExcluidos_() {
  let dados;
  try {
    dados = lerAba_(ABA_FUNCIONARIOS_EXCLUIDOS);
  } catch (erro) {
    return [];
  }

  const lista = [];
  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];
    if (!linha[0]) continue;

    lista.push({
      funcionario_id: String(linha[0]),
      empresa_id: String(linha[1]),
      nome: String(linha[2]).trim(),
      matricula: String(linha[3]).trim(),
      setor: String(linha[4]).trim()
    });
  }

  return lista;
}
