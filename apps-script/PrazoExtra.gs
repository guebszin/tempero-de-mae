// ================================================================
// PRAZOEXTRA.gs
// Pedido de prazo extra: passou do horário limite, a empresa pede ao
// restaurante para ainda fazer ou alterar o pedido de hoje. Se o
// restaurante liberar, a empresa ganha 10 minutos (contados a partir
// da liberação). Vale só para aquele dia; no dia seguinte volta o
// horário normal.
// Aba PRAZOS_EXTRAS: uma linha por pedido de prazo.
// ================================================================
const MINUTOS_PRAZO_EXTRA = 10;
const MAXIMO_PEDIDOS_PRAZO_POR_DIA = 3;

const COLUNAS_PRAZOS = {
  ID: 1,
  EMPRESA: 2,
  DATA: 3,
  SOLICITADO_EM: 4,
  SOLICITADO_POR: 5,
  MENSAGEM: 6,
  STATUS: 7,          // PENDENTE · LIBERADO · RECUSADO
  RESPONDIDO_EM: 8,
  RESPONDIDO_POR: 9,
  LIBERADO_ATE: 10,
  RESPOSTA: 11
};

function lerPrazosExtras_() {
  const fuso = Session.getScriptTimeZone();
  const dados = lerAba_('PRAZOS_EXTRAS');
  const lista = [];

  for (let i = 1; i < dados.length; i++) {
    const l = dados[i];
    if (!l[0]) continue;

    lista.push({
      linha: i + 1,
      solicitacao_id: String(l[0]),
      empresa_id: String(l[1]),
      data: dataParaTexto_(l[2], fuso),
      solicitado_em: milissegundos_(l[3]),
      solicitado_por: String(l[4] || ''),
      mensagem: String(l[5] || '').trim(),
      status: String(l[6] || '').trim().toUpperCase() || 'PENDENTE',
      respondido_em: milissegundos_(l[7]),
      respondido_por: String(l[8] || ''),
      liberado_ate: milissegundos_(l[9]),
      resposta: String(l[10] || '').trim()
    });
  }

  return {
    get aba() { return obterAba_('PRAZOS_EXTRAS'); },
    lista: lista
  };
}

function horaTexto_(ms) {
  return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), 'HH:mm');
}

// Prazo extra liberado e ainda valendo (empresa, hoje)
function prazoExtraAtivo_(empresaId, hoje, agoraMs) {
  const liberado = lerPrazosExtras_().lista
    .filter(s => s.empresa_id === empresaId && s.data === hoje && s.status === 'LIBERADO' && s.liberado_ate > agoraMs)
    .sort((a, b) => b.liberado_ate - a.liberado_ate)[0];

  return liberado ? { ate_ms: liberado.liberado_ate, ate: horaTexto_(liberado.liberado_ate) } : null;
}

// Alguma empresa com prazo extra valendo agora?
function algumPrazoExtraAtivo_(hoje) {
  const agora = Date.now();
  return lerPrazosExtras_().lista.some(s => s.data === hoje && s.status === 'LIBERADO' && s.liberado_ate > agora);
}

// Situação do pedido de prazo de hoje, para a tela da empresa
function situacaoPrazoExtra_(empresaId, hoje) {
  const doDia = lerPrazosExtras_().lista
    .filter(s => s.empresa_id === empresaId && s.data === hoje)
    .sort((a, b) => b.solicitado_em - a.solicitado_em);

  const ultimo = doDia[0];
  if (!ultimo) return { status: '', pedidos_hoje: 0, pode_pedir: true };

  const agora = Date.now();
  let status = ultimo.status;
  if (status === 'LIBERADO' && ultimo.liberado_ate <= agora) status = 'ENCERRADO';

  return {
    status: status,
    solicitado_em: ultimo.solicitado_em,
    liberado_ate: ultimo.liberado_ate || null,
    liberado_ate_texto: ultimo.liberado_ate ? horaTexto_(ultimo.liberado_ate) : '',
    resposta: ultimo.resposta,
    pedidos_hoje: doDia.length,
    pode_pedir: status !== 'PENDENTE' && status !== 'LIBERADO' && doDia.length < MAXIMO_PEDIDOS_PRAZO_POR_DIA
  };
}

// ----------------------------------------------------------------
// EMPRESA: PEDIR MAIS PRAZO
// ----------------------------------------------------------------
function solicitarPrazoExtra(token, mensagem) {
  const acesso = validarUsuarioEmpresa_(token);
  const empresaId = acesso.sessao.empresa_id;
  const hoje = hojeTexto_(Session.getScriptTimeZone());
  const texto = limparTexto_(mensagem, 200, 'A mensagem');

  return comBloqueio_(() => {
    const prazo = prazoPedido_(hoje, empresaId);

    if (prazo.aberto) throw new Error('O prazo de hoje ainda está aberto: você pode fazer ou alterar o pedido normalmente.');
    if (!prazo.encerrado_por_horario) throw new Error(prazo.motivo || 'Hoje não é possível pedir.');

    const cardapio = cardapioPublicadoDoDia_(hoje);
    if (!cardapio || !diaTemConteudo_(cardapio)) {
      throw new Error('Não há cardápio publicado para hoje.');
    }

    const situacao = situacaoPrazoExtra_(empresaId, hoje);
    if (situacao.status === 'PENDENTE') throw new Error('Você já pediu mais prazo. Aguarde a resposta do restaurante.');
    if (!situacao.pode_pedir) throw new Error('Você já pediu mais prazo ' + MAXIMO_PEDIDOS_PRAZO_POR_DIA + ' vezes hoje. Fale com o restaurante.');

    const agora = new Date();

    lerPrazosExtras_().aba.appendRow([
      'PRZ-' + Utilities.getUuid(),
      empresaId,
      converterDataFormulario(hoje),
      agora,
      acesso.sessao.usuario_id,
      textoPlanilha_(texto),
      'PENDENTE',
      '', '', '', ''
    ]);

    marcarPedidosAlterados_();
    registrarLog_(null, acesso.sessao, empresaId, 'PEDIR_PRAZO_EXTRA',
      'Pediu mais ' + MINUTOS_PRAZO_EXTRA + ' minutos para o pedido de ' + formatarDataBR_(hoje) + (texto ? ': ' + texto : ''));

    return {
      sucesso: true,
      mensagem: 'Pedido enviado ao restaurante. Você será avisado assim que ele responder.',
      estado: montarEstadoPedidoEmpresa_(empresaId)
    };
  });
}

// ----------------------------------------------------------------
// RESTAURANTE: LIBERAR OU RECUSAR
// ----------------------------------------------------------------
function responderPrazoExtra(token, solicitacaoId, liberar, resposta) {
  const sessao = exigirTela_(token, 'pedidos');
  const texto = limparTexto_(resposta, 200, 'A resposta');
  const hoje = hojeTexto_(Session.getScriptTimeZone());

  return comBloqueio_(() => {
    const prazos = lerPrazosExtras_();
    const pedido = prazos.lista.find(s => s.solicitacao_id === String(solicitacaoId || ''));

    if (!pedido) throw new Error('Pedido de prazo não encontrado.');
    if (pedido.status !== 'PENDENTE') throw new Error('Este pedido de prazo já foi respondido.');
    if (pedido.data !== hoje) throw new Error('Este pedido de prazo era de outro dia e não vale mais.');

    const agora = new Date();
    const ate = liberar === true ? new Date(agora.getTime() + MINUTOS_PRAZO_EXTRA * 60000) : '';

    prazos.aba.getRange(pedido.linha, COLUNAS_PRAZOS.STATUS, 1, 5).setValues([[
      liberar === true ? 'LIBERADO' : 'RECUSADO',
      agora,
      sessao.usuario_id,
      ate,
      textoPlanilha_(texto)
    ]]);

    marcarPedidosAlterados_();

    const nome = nomesEmpresasComExcluidas_()[pedido.empresa_id] || 'Empresa';
    registrarLog_(null, sessao, pedido.empresa_id, liberar === true ? 'LIBERAR_PRAZO_EXTRA' : 'RECUSAR_PRAZO_EXTRA',
      liberar === true
        ? 'Prazo extra para ' + nome + ' até ' + horaTexto_(ate.getTime())
        : 'Prazo extra recusado para ' + nome + (texto ? ': ' + texto : ''));

    return {
      sucesso: true,
      mensagem: liberar === true
        ? nome + ' pode pedir até ' + horaTexto_(ate.getTime()) + '.'
        : 'Pedido de prazo de ' + nome + ' recusado.',
      dia: montarPedidosDia_(hoje)
    };
  });
}

// Pedidos de prazo de um dia (tela de pedidos do restaurante)
function prazosExtrasDoDia_(dia) {
  const nomes = nomesEmpresasComExcluidas_();
  const agora = Date.now();

  return lerPrazosExtras_().lista
    .filter(s => s.data === dia)
    .sort((a, b) => b.solicitado_em - a.solicitado_em)
    .map(s => ({
      solicitacao_id: s.solicitacao_id,
      empresa_id: s.empresa_id,
      nome: nomes[s.empresa_id] || 'Empresa',
      mensagem: s.mensagem,
      status: s.status === 'LIBERADO' && s.liberado_ate <= agora ? 'ENCERRADO' : s.status,
      solicitado_em: s.solicitado_em,
      liberado_ate: s.liberado_ate || null,
      liberado_ate_texto: s.liberado_ate ? horaTexto_(s.liberado_ate) : '',
      resposta: s.resposta
    }));
}
