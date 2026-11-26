// ================================================================
// COBRANCAS.gs
// Fechamento de cobranças por empresa e controle de pagamentos.
// Regras:
// - Cada empresa pode ter um ciclo (semanal, quinzenal, mensal ou
//   livre). O sistema sugere o próximo período, mas as datas podem
//   ser mudadas na hora de gerar.
// - Entram os pedidos enviados e confirmados do período que ainda não
//   foram cobrados. Cancelados e recusados ficam de fora. Pedidos de
//   clientes sem cadastro não entram (são pagos na hora).
// - Pedido cobrado fica travado: não pode ser alterado, cancelado nem
//   recusado. Para mudar, cancele a cobrança (sem pagamentos) e gere
//   outra.
// - Os períodos de uma mesma empresa não podem se sobrepor.
// - Aceita vários pagamentos (parciais) até completar o valor.
// - A empresa vê as próprias cobranças e baixa o extrato em PDF.
// ================================================================

const COLUNAS_COBRANCAS = {
  ID: 1,
  EMPRESA: 2,
  INICIO: 3,
  FIM: 4,
  EMISSAO: 5,
  VENCIMENTO: 6,
  VALOR: 7,
  STATUS: 8,
  OBSERVACOES: 9,
  NUMERO: 10,
  QUANTIDADE: 11,
  PEDIDOS: 12,
  VALOR_PAGO: 13,
  CRIADO_POR: 14,
  ATUALIZADO: 15,
  MOTIVO_CANCELAMENTO: 16,
  DESCONTO: 17,
  MOTIVO_DESCONTO: 18
};

const COLUNA_COBRANCA_PEDIDO = 15;    // PEDIDOS: coluna "cobranca_id"
const COLUNA_CICLO_EMPRESA = 9;       // EMPRESAS: "ciclo_cobranca"
const COLUNA_DIAS_VENCIMENTO = 10;    // EMPRESAS: "dias_vencimento"

const CICLOS_COBRANCA = {
  LIVRE: 'Livre',
  SEMANAL: 'Semanal',
  QUINZENAL: 'Quinzenal',
  MENSAL: 'Mensal'
};

const FORMAS_PAGAMENTO = {
  PIX: 'Pix',
  DINHEIRO: 'Dinheiro',
  TRANSFERENCIA: 'Transferência',
  BOLETO: 'Boleto',
  CARTAO: 'Cartão',
  OUTRO: 'Outro'
};

const DIAS_VENCIMENTO_PADRAO = 5;
const MAXIMO_DIAS_COBRANCA = 186;

// ----------------------------------------------------------------
// LEITURA
// ----------------------------------------------------------------
function lerCobrancas_() {
  const fuso = Session.getScriptTimeZone();
  const dados = lerAba_('COBRANCAS');
  const lista = [];

  for (let i = 1; i < dados.length; i++) {
    const l = dados[i];
    if (!l[0]) continue;

    lista.push({
      linha: i + 1,
      cobranca_id: String(l[0]),
      empresa_id: String(l[1]),
      periodo_inicio: dataParaTexto_(l[2], fuso),
      periodo_fim: dataParaTexto_(l[3], fuso),
      data_emissao: dataParaTexto_(l[4], fuso),
      data_vencimento: dataParaTexto_(l[5], fuso),
      valor_total: arredondar_(l[6]),
      status: String(l[7] || '').trim().toUpperCase() || 'ABERTA',
      observacoes: String(l[8] || '').trim(),
      numero: Number(l[9]) || 0,
      quantidade_total: Number(l[10]) || 0,
      quantidade_pedidos: Number(l[11]) || 0,
      valor_pago: arredondar_(l[12]),
      criado_por: String(l[13] || ''),
      atualizado_em: milissegundos_(l[14]),
      motivo_cancelamento: String(l[15] || '').trim(),
      desconto: arredondar_(l[16]),
      motivo_desconto: String(l[17] || '').trim()
    });
    // Valor a pagar = valor dos pedidos − desconto
    const atual = lista[lista.length - 1];
    atual.valor_liquido = arredondar_(Math.max(0, atual.valor_total - atual.desconto));
  }

  return {
    get aba() { return obterAba_('COBRANCAS'); },
    fuso: fuso,
    lista: lista
  };
}

function lerPagamentos_() {
  const fuso = Session.getScriptTimeZone();
  const dados = lerAba_('PAGAMENTOS');
  const lista = [];

  for (let i = 1; i < dados.length; i++) {
    const l = dados[i];
    if (!l[0]) continue;

    lista.push({
      linha: i + 1,
      pagamento_id: String(l[0]),
      cobranca_id: String(l[1]),
      empresa_id: String(l[2]),
      data_pagamento: dataParaTexto_(l[3], fuso),
      valor_pago: arredondar_(l[4]),
      forma_pagamento: String(l[5] || '').trim().toUpperCase(),
      comprovante: String(l[6] || '').trim(),
      observacoes: String(l[7] || '').trim(),
      registrado_em: milissegundos_(l[9])
    });
  }

  return {
    get aba() { return obterAba_('PAGAMENTOS'); },
    lista: lista
  };
}

// Pedidos de empresa que podem ser cobrados (enviados ou confirmados)
function pedidoCobravel_(p) {
  return !!p.empresa_id && (p.status === 'ENVIADO' || p.status === 'CONFIRMADO');
}

// Situação pelo valor pago (CANCELADA nunca muda por aqui)
function statusPeloPagamento_(valorTotal, valorPago) {
  if (valorPago >= valorTotal - 0.004) return 'PAGA';
  if (valorPago > 0) return 'PARCIAL';
  return 'ABERTA';
}

function cobrancaParaNavegador_(c, nomesEmpresas, hoje) {
  const saldo = c.status === 'CANCELADA' ? 0 : arredondar_(Math.max(0, c.valor_liquido - c.valor_pago));
  const emAberto = c.status === 'ABERTA' || c.status === 'PARCIAL';

  return {
    cobranca_id: c.cobranca_id,
    numero: c.numero,
    empresa_id: c.empresa_id,
    nome_empresa: (nomesEmpresas && nomesEmpresas[c.empresa_id]) || 'Empresa removida',
    periodo_inicio: c.periodo_inicio,
    periodo_fim: c.periodo_fim,
    data_emissao: c.data_emissao,
    data_vencimento: c.data_vencimento,
    valor_total: c.valor_total,
    desconto: c.desconto,
    motivo_desconto: c.motivo_desconto,
    valor_liquido: c.valor_liquido,
    valor_pago: c.valor_pago,
    saldo: saldo,
    status: c.status,
    vencida: emAberto && !!c.data_vencimento && c.data_vencimento < hoje,
    quantidade_total: c.quantidade_total,
    quantidade_pedidos: c.quantidade_pedidos,
    observacoes: c.observacoes,
    motivo_cancelamento: c.motivo_cancelamento,
    atualizado_em: c.atualizado_em
  };
}

function nomesDasEmpresas_() {
  return nomesEmpresasComExcluidas_();
}

function instrucoesPagamento_() {
  return lerConfiguracao_('INSTRUCOES_PAGAMENTO', '');
}

// ----------------------------------------------------------------
// DATAS E PERÍODO SUGERIDO
// ----------------------------------------------------------------

// Último dia que já pode ser cobrado: hoje, se os pedidos de hoje já
// fecharam; senão, ontem (o pedido de hoje ainda pode mudar).
function ultimoDiaCobravel_(fuso) {
  const hoje = hojeTexto_(fuso);
  // Prazo extra liberado para alguma empresa: o dia de hoje ainda pode mudar
  return prazoPedido_(hoje).aberto || algumPrazoExtraAtivo_(hoje) ? somarDiasTexto_(hoje, -1) : hoje;
}

function ultimoDiaDoMesTexto_(texto) {
  const data = converterDataFormulario(texto.slice(0, 8) + '01');
  data.setMonth(data.getMonth() + 1);
  data.setDate(0);
  return texto.slice(0, 8) + String(data.getDate()).padStart(2, '0');
}

// Fim natural do ciclo que começa (ou está em andamento) em "inicio"
function fimDoCiclo_(ciclo, inicio) {
  if (ciclo === 'SEMANAL') {
    const diaSemana = converterDataFormulario(inicio).getDay();   // 0 = domingo
    return somarDiasTexto_(inicio, diaSemana === 0 ? 0 : 7 - diaSemana);
  }

  if (ciclo === 'QUINZENAL') {
    return Number(inicio.slice(8)) <= 15
      ? inicio.slice(0, 8) + '15'
      : ultimoDiaDoMesTexto_(inicio);
  }

  if (ciclo === 'MENSAL') return ultimoDiaDoMesTexto_(inicio);

  return '';
}

// Sugere o próximo período a cobrar de uma empresa
// pendentes: pedidos cobráveis ainda sem cobrança (ordenados por data)
function sugerirPeriodo_(empresa, cobrancasEmpresa, pendentes, ultimoCobravel) {
  const ativas = cobrancasEmpresa.filter(c => c.status !== 'CANCELADA');
  const anteriores = pendentes.filter(p => p.data_entrega <= ultimoCobravel);

  if (!anteriores.length) return null;

  const ultimaFim = ativas.reduce((maior, c) => c.periodo_fim > maior ? c.periodo_fim : maior, '');
  const primeiraPendente = anteriores[0].data_entrega;

  let inicio = ultimaFim ? proximoDiaTexto_(ultimaFim) : primeiraPendente;
  if (primeiraPendente < inicio) inicio = primeiraPendente;

  // No ciclo, o período começa no início natural (ex.: dia 1º do mês)
  // quando ainda não houve cobrança anterior.
  if (!ultimaFim) {
    if (empresa.ciclo_cobranca === 'MENSAL') inicio = inicio.slice(0, 8) + '01';
    if (empresa.ciclo_cobranca === 'QUINZENAL') inicio = inicio.slice(0, 8) + (Number(inicio.slice(8)) <= 15 ? '01' : '16');
    if (empresa.ciclo_cobranca === 'SEMANAL') {
      const diaSemana = converterDataFormulario(inicio).getDay();
      inicio = somarDiasTexto_(inicio, diaSemana === 0 ? -6 : 1 - diaSemana);
    }
  }

  const fimCiclo = fimDoCiclo_(empresa.ciclo_cobranca, inicio);
  let fim = fimCiclo && fimCiclo < ultimoCobravel ? fimCiclo : ultimoCobravel;

  // Não invade uma cobrança que começa depois (pedido esquecido num intervalo)
  ativas.forEach(c => {
    if (c.periodo_inicio > inicio && c.periodo_inicio <= fim) fim = somarDiasTexto_(c.periodo_inicio, -1);
  });

  const noPeriodo = anteriores.filter(p => p.data_entrega >= inicio && p.data_entrega <= fim);
  if (!noPeriodo.length) return null;

  return {
    inicio: inicio,
    fim: fim,
    ciclo_completo: !!fimCiclo && fimCiclo <= ultimoCobravel,
    pedidos: noPeriodo.length,
    valor: arredondar_(noPeriodo.reduce((s, p) => s + p.valor_total, 0))
  };
}

// ----------------------------------------------------------------
// RESTAURANTE: PAINEL
// ----------------------------------------------------------------
function obterPainelCobrancas(token) {
  exigirTela_(token, 'cobrancas');
  exigirModuloCobrancas_();
  return montarPainelCobrancas_();
}

const MENSAGEM_COBRANCA_EMPRESA_DESLIGADA = 'As cobranças não estão disponíveis para a sua empresa. Fale com o restaurante.';

function montarPainelCobrancas_() {
  const fuso = Session.getScriptTimeZone();
  const hoje = hojeTexto_(fuso);
  const ultimoCobravel = ultimoDiaCobravel_(fuso);
  const empresas = lerEmpresas_().lista;
  const nomes = nomesEmpresasComExcluidas_();

  const cobrancas = lerCobrancas_().lista;
  const pagamentos = lerPagamentos_().lista;

  const pendentesPorEmpresa = {};
  lerPedidos_().lista
    .filter(p => pedidoCobravel_(p) && !p.cobranca_id && p.data_entrega <= hoje)
    .sort((a, b) => a.data_entrega.localeCompare(b.data_entrega))
    .forEach(p => { (pendentesPorEmpresa[p.empresa_id] = pendentesPorEmpresa[p.empresa_id] || []).push(p); });

  const totais = { a_receber: 0, vencido: 0, recebido_mes: 0, a_faturar: 0, cobrancas_abertas: 0, cobrancas_vencidas: 0 };

  // Empresas com a cobrança desligada (Sistema › Configurações) ficam de fora
  const padrao = padraoEmpresas_();
  const semCobranca = [];
  const comCobranca = empresas.filter(e => {
    const ligada = configDaEmpresa_(e, padrao).cobrancas;
    if (!ligada && e.status === 'ATIVO') semCobranca.push(e.nome_empresa);
    return ligada;
  });

  const listaEmpresas = comCobranca
    .filter(e => e.status === 'ATIVO' || pendentesPorEmpresa[e.empresa_id])
    .map(e => {
      const pendentes = pendentesPorEmpresa[e.empresa_id] || [];
      const daEmpresa = cobrancas.filter(c => c.empresa_id === e.empresa_id);
      const valorPendente = arredondar_(pendentes.reduce((s, p) => s + p.valor_total, 0));
      totais.a_faturar += valorPendente;

      const ultima = daEmpresa
        .filter(c => c.status !== 'CANCELADA')
        .sort((a, b) => b.periodo_fim.localeCompare(a.periodo_fim))[0];

      return {
        empresa_id: e.empresa_id,
        nome_empresa: e.nome_empresa,
        status: e.status,
        ciclo_cobranca: e.ciclo_cobranca,
        dias_vencimento: e.dias_vencimento,
        pendente: {
          pedidos: pendentes.length,
          quentinhas: pendentes.reduce((s, p) => s + p.quantidade_total, 0),
          valor: valorPendente,
          aguardando_confirmacao: pendentes.filter(p => p.status === 'ENVIADO').length,
          primeira_data: pendentes.length ? pendentes[0].data_entrega : '',
          ultima_data: pendentes.length ? pendentes[pendentes.length - 1].data_entrega : ''
        },
        ultima_cobranca_fim: ultima ? ultima.periodo_fim : '',
        sugestao: sugerirPeriodo_(e, daEmpresa, pendentes, ultimoCobravel)
      };
    })
    .sort((a, b) => a.nome_empresa.localeCompare(b.nome_empresa, 'pt-BR'));

  const lista = cobrancas
    .map(c => cobrancaParaNavegador_(c, nomes, hoje))
    .sort((a, b) => b.numero - a.numero);

  lista.forEach(c => {
    if (c.status !== 'ABERTA' && c.status !== 'PARCIAL') return;
    totais.a_receber += c.saldo;
    totais.cobrancas_abertas++;
    if (c.vencida) {
      totais.vencido += c.saldo;
      totais.cobrancas_vencidas++;
    }
  });

  const mes = hoje.slice(0, 7);
  pagamentos.forEach(p => {
    if (p.data_pagamento.slice(0, 7) === mes) totais.recebido_mes += p.valor_pago;
  });

  Object.keys(totais).forEach(k => { totais[k] = arredondar_(totais[k]); });

  return {
    hoje: hoje,
    ultimo_dia_cobravel: ultimoCobravel,
    horario_limite: horarioLimite_(),
    instrucoes_pagamento: instrucoesPagamento_(),
    totais: totais,
    empresas: listaEmpresas,
    empresas_sem_cobranca: semCobranca.sort((a, b) => a.localeCompare(b, 'pt-BR')),
    cobrancas: lista
  };
}

// ----------------------------------------------------------------
// RESTAURANTE: CONFIGURAÇÕES
// ----------------------------------------------------------------

// Ciclo e prazo de pagamento de uma empresa
// dados = { empresa_id, ciclo_cobranca, dias_vencimento }
function salvarConfigCobrancaEmpresa(token, dados) {
  const sessao = exigirFuncao_(token, 'cobrancas_gerar');
  dados = dados || {};

  const ciclo = String(dados.ciclo_cobranca || 'LIVRE').trim().toUpperCase();
  if (!CICLOS_COBRANCA[ciclo]) throw new Error('Escolha um ciclo de cobrança válido.');

  const dias = Number(String(dados.dias_vencimento === undefined ? '' : dados.dias_vencimento).trim());
  if (!isFinite(dias) || dias < 0 || dias > 90 || Math.floor(dias) !== dias) {
    throw new Error('Informe o prazo de pagamento em dias (de 0 a 90).');
  }

  const empresaId = String(dados.empresa_id || '').trim();

  return comBloqueio_(() => {
    const empresas = lerEmpresas_();
    const empresa = empresas.lista.find(e => e.empresa_id === empresaId);
    if (!empresa) throw new Error('Empresa não encontrada.');

    empresas.aba.getRange(empresa.linha, COLUNA_CICLO_EMPRESA, 1, 2).setValues([[ciclo, dias]]);

    registrarLog_(null, sessao, empresaId, 'CONFIGURAR_COBRANCA',
      'Ciclo ' + CICLOS_COBRANCA[ciclo].toLowerCase() + ', pagamento em ' + dias + ' dia(s)');

    return {
      sucesso: true,
      mensagem: 'Cobrança de ' + empresa.nome_empresa + ' configurada.',
      painel: montarPainelCobrancas_()
    };
  });
}

// Texto com os dados para pagamento (chave Pix, conta...) que aparece no extrato
function salvarInstrucoesPagamento(token, texto) {
  const sessao = exigirFuncao_(token, 'cobrancas_gerar');
  const valor = String(texto === null || texto === undefined ? '' : texto)
    .replace(/\r\n/g, '\n')
    .split('\n').map(l => l.trim().replace(/\s+/g, ' ')).join('\n')
    .trim();

  if (valor.length > 500) throw new Error('Os dados para pagamento podem ter no máximo 500 caracteres.');

  return comBloqueio_(() => {
    const aba = obterAba_('CONFIG');
    const dados = aba.getDataRange().getValues();
    let linha = 0;

    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === 'INSTRUCOES_PAGAMENTO') linha = i + 1;
    }

    if (linha) {
      aba.getRange(linha, 2).setValue(textoPlanilha_(valor));
    } else {
      aba.appendRow([
        'INSTRUCOES_PAGAMENTO',
        textoPlanilha_(valor),
        'Dados para pagamento que aparecem no extrato de cobrança (chave Pix, conta etc.)'
      ]);
    }

    registrarLog_(null, sessao, '', 'ALTERAR_DADOS_PAGAMENTO', 'Dados para pagamento atualizados');

    return {
      sucesso: true,
      mensagem: valor ? 'Dados para pagamento salvos.' : 'Dados para pagamento removidos.',
      instrucoes_pagamento: valor
    };
  });
}

// ----------------------------------------------------------------
// RESTAURANTE: GERAR COBRANÇA
// ----------------------------------------------------------------

// Confere empresa e período e devolve o que entraria na cobrança
function conferirPeriodoCobranca_(dados) {
  dados = dados || {};
  const fuso = Session.getScriptTimeZone();
  const empresaId = String(dados.empresa_id || '').trim();
  const empresa = lerEmpresas_().lista.find(e => e.empresa_id === empresaId);

  if (!empresa) throw new Error('Escolha a empresa.');

  exigirModuloCobrancas_();
  if (!configDaEmpresa_(empresa).cobrancas) {
    throw new Error('A cobrança está desligada para ' + empresa.nome_empresa + '. O proprietário pode ligá-la em Sistema › Configurações.');
  }

  const inicio = validarDataFormulario_(dados.inicio);
  const fim = validarDataFormulario_(dados.fim);
  const hoje = hojeTexto_(fuso);

  if (fim < inicio) throw new Error('A data final precisa ser igual ou depois da data inicial.');

  const dias = Math.round((converterDataFormulario(fim) - converterDataFormulario(inicio)) / 86400000) + 1;
  if (dias > MAXIMO_DIAS_COBRANCA) throw new Error('Escolha um período de até 6 meses.');

  if (fim > hoje) throw new Error('A cobrança só pode ir até hoje. Dias futuros ainda não têm pedidos fechados.');

  const prazoHoje = prazoPedido_(hoje, empresaId);
  if (fim === hoje && prazoHoje.aberto) {
    throw new Error('Os pedidos de hoje ainda podem ser alterados até ' + prazoHoje.limite +
      '. Termine o período ontem ou gere a cobrança depois desse horário.');
  }

  const conflito = lerCobrancas_().lista.find(c =>
    c.empresa_id === empresaId && c.status !== 'CANCELADA' &&
    !(fim < c.periodo_inicio || inicio > c.periodo_fim)
  );

  if (conflito) {
    throw new Error('Este período se sobrepõe à cobrança nº ' + numeroCobranca_(conflito.numero) + ' (' +
      formatarDataBR_(conflito.periodo_inicio) + ' a ' + formatarDataBR_(conflito.periodo_fim) +
      '). Escolha datas depois de ' + formatarDataBR_(conflito.periodo_fim) + '.');
  }

  const pedidos = lerPedidos_();
  const selecionados = pedidos.lista.filter(p =>
    p.empresa_id === empresaId && pedidoCobravel_(p) && !p.cobranca_id &&
    p.data_entrega >= inicio && p.data_entrega <= fim
  );

  return {
    empresa: empresa,
    inicio: inicio,
    fim: fim,
    hoje: hoje,
    pedidos: pedidos,
    selecionados: selecionados,
    quantidade: selecionados.reduce((s, p) => s + p.quantidade_total, 0),
    valor: arredondar_(selecionados.reduce((s, p) => s + p.valor_total, 0)),
    aguardando: selecionados.filter(p => p.status === 'ENVIADO').length
  };
}

function numeroCobranca_(numero) {
  return String(numero || 0).padStart(4, '0');
}

// Prévia (antes de gerar)
// dados = { empresa_id, inicio, fim }
function previaCobranca(token, dados) {
  exigirTela_(token, 'cobrancas');
  const conferido = conferirPeriodoCobranca_(dados);
  const diasPrazo = conferido.empresa.dias_vencimento;

  const porDia = {};
  conferido.selecionados.forEach(p => {
    if (!porDia[p.data_entrega]) porDia[p.data_entrega] = { data: p.data_entrega, quentinhas: 0, valor: 0, aguardando: false };
    porDia[p.data_entrega].quentinhas += p.quantidade_total;
    porDia[p.data_entrega].valor = arredondar_(porDia[p.data_entrega].valor + p.valor_total);
    if (p.status === 'ENVIADO') porDia[p.data_entrega].aguardando = true;
  });

  return {
    empresa_id: conferido.empresa.empresa_id,
    nome_empresa: conferido.empresa.nome_empresa,
    inicio: conferido.inicio,
    fim: conferido.fim,
    pedidos: conferido.selecionados.length,
    quantidade: conferido.quantidade,
    valor: conferido.valor,
    aguardando: conferido.aguardando,
    vencimento_sugerido: somarDiasTexto_(conferido.hoje, diasPrazo),
    dias: Object.keys(porDia).sort().map(d => {
      porDia[d].dia_semana = nomeDoDia_(d);
      return porDia[d];
    })
  };
}

// Gerar a cobrança
// dados = { empresa_id, inicio, fim, vencimento, observacoes,
//           desconto_tipo?, desconto_valor?, desconto_motivo? }
function gerarCobranca(token, dados) {
  const sessao = exigirFuncao_(token, 'cobrancas_gerar');
  dados = dados || {};

  const vencimento = validarDataFormulario_(dados.vencimento);
  const observacoes = limparTexto_(dados.observacoes, 300, 'A observação');
  const pedidoDesconto = lerPedidoDesconto_(dados);
  if (pedidoDesconto && !sessaoPode_(sessao, 'cobrancas_descontos')) throw new Error(MENSAGEM_SEM_PERMISSAO);

  return comBloqueio_(() => {
    const conferido = conferirPeriodoCobranca_(dados);

    if (!conferido.selecionados.length) {
      throw new Error('Não há pedidos sem cobrança de ' + conferido.empresa.nome_empresa + ' neste período.');
    }

    if (vencimento < conferido.hoje) throw new Error('O vencimento não pode ser antes de hoje.');

    const cobrancas = lerCobrancas_();
    // Números de cobranças apagadas não se repetem
    const numero = cobrancas.lista.reduce((maior, c) => Math.max(maior, c.numero), ultimoNumeroCobrancaApagada_()) + 1;
    const cobrancaId = 'COB-' + Utilities.getUuid();
    const agora = new Date();
    const desconto = pedidoDesconto ? calcularDesconto_(pedidoDesconto, conferido.valor, 0) : 0;

    cobrancas.aba.appendRow([
      cobrancaId,
      conferido.empresa.empresa_id,
      converterDataFormulario(conferido.inicio),
      converterDataFormulario(conferido.fim),
      converterDataFormulario(conferido.hoje),
      converterDataFormulario(vencimento),
      conferido.valor,
      'ABERTA',
      textoPlanilha_(observacoes),
      numero,
      conferido.quantidade,
      conferido.selecionados.length,
      0,
      sessao.usuario_id,
      agora,
      '',
      desconto,
      desconto ? textoPlanilha_(pedidoDesconto.motivo) : ''
    ]);

    const abaPedidos = conferido.pedidos.aba;
    conferido.selecionados.forEach(p => {
      abaPedidos.getRange(p.linha, COLUNA_COBRANCA_PEDIDO).setValue(cobrancaId);
    });

    marcarPedidosAlterados_();

    registrarLog_(null, sessao, conferido.empresa.empresa_id, 'GERAR_COBRANCA',
      'Cobrança nº ' + numeroCobranca_(numero) + ' de ' + formatarDataBR_(conferido.inicio) + ' a ' +
      formatarDataBR_(conferido.fim) + ': ' + conferido.quantidade + ' quentinha(s), ' + formatarMoeda_(conferido.valor) +
      (desconto ? ' − desconto ' + formatarMoeda_(desconto) + ' (' + pedidoDesconto.motivo + ')' : ''));

    return {
      sucesso: true,
      mensagem: 'Cobrança nº ' + numeroCobranca_(numero) + ' gerada: ' +
        formatarMoeda_(arredondar_(conferido.valor - desconto)) + (desconto ? ' (com desconto de ' + formatarMoeda_(desconto) + ')' : '') + '.',
      cobranca_id: cobrancaId,
      painel: montarPainelCobrancas_()
    };
  });
}

// ----------------------------------------------------------------
// DETALHE (restaurante e empresa)
// ----------------------------------------------------------------
function detalharCobranca(token, cobrancaId) {
  const sessao = validarSessao(token);
  cobrancaId = String(cobrancaId || '').trim();

  let empresaDaSessao = null;
  if (sessao.perfil === 'admin') exigirTela_(token, 'cobrancas');
  if (sessao.perfil !== 'admin') {
    const acesso = validarUsuarioEmpresa_(token);
    if (!configDaEmpresa_(acesso.empresa).cobrancas) throw new Error(MENSAGEM_COBRANCA_EMPRESA_DESLIGADA);
    empresaDaSessao = acesso.sessao.empresa_id;
  }

  const fuso = Session.getScriptTimeZone();
  const hoje = hojeTexto_(fuso);
  const cobranca = lerCobrancas_().lista.find(c => c.cobranca_id === cobrancaId);

  if (!cobranca || (empresaDaSessao && (cobranca.empresa_id !== empresaDaSessao || cobranca.status === 'CANCELADA'))) {
    throw new Error('Cobrança não encontrada.');
  }

  // Empresa excluída: os dados vêm do arquivo de empresas excluídas
  const empresa = lerEmpresas_().lista.find(e => e.empresa_id === cobranca.empresa_id) ||
    lerEmpresasExcluidas_().find(e => e.empresa_id === cobranca.empresa_id) || null;
  const nomes = {};
  if (empresa) nomes[empresa.empresa_id] = empresa.nome_empresa;

  const idsPedidos = {};
  lerPedidos_().lista.forEach(p => { if (p.cobranca_id === cobrancaId) idsPedidos[p.pedido_id] = true; });

  const consumo = montarRelatorio_(cobranca.periodo_inicio, cobranca.periodo_fim, cobranca.empresa_id, idsPedidos);
  delete consumo.itens;

  const pagamentos = lerPagamentos_().lista
    .filter(p => p.cobranca_id === cobrancaId)
    .sort((a, b) => a.data_pagamento.localeCompare(b.data_pagamento) || (a.registrado_em || 0) - (b.registrado_em || 0))
    .map(p => ({
      pagamento_id: p.pagamento_id,
      data_pagamento: p.data_pagamento,
      valor_pago: p.valor_pago,
      forma_pagamento: p.forma_pagamento,
      forma_texto: FORMAS_PAGAMENTO[p.forma_pagamento] || p.forma_pagamento || '—',
      comprovante: p.comprovante,
      observacoes: p.observacoes
    }));

  return {
    cobranca: cobrancaParaNavegador_(cobranca, nomes, hoje),
    empresa: empresa ? {
      nome_empresa: empresa.nome_empresa,
      cnpj: empresa.cnpj,
      telefone: empresa.telefone,
      email: empresa.email,
      endereco: empresa.endereco
    } : null,
    consumo: consumo,
    pagamentos: pagamentos,
    instrucoes_pagamento: instrucoesPagamento_(),
    gerado_em: new Date().getTime()
  };
}

// ----------------------------------------------------------------
// RESTAURANTE: ALTERAR, CANCELAR, PAGAMENTOS
// ----------------------------------------------------------------

// Mudar vencimento e observação
// dados = { cobranca_id, vencimento, observacoes }
function editarCobranca(token, dados) {
  const sessao = exigirFuncao_(token, 'cobrancas_gerar');
  dados = dados || {};

  const vencimento = validarDataFormulario_(dados.vencimento);
  const observacoes = limparTexto_(dados.observacoes, 300, 'A observação');
  const cobrancaId = String(dados.cobranca_id || '').trim();

  return comBloqueio_(() => {
    const cobrancas = lerCobrancas_();
    const cobranca = cobrancas.lista.find(c => c.cobranca_id === cobrancaId);

    if (!cobranca) throw new Error('Cobrança não encontrada.');
    if (cobranca.status === 'CANCELADA') throw new Error('Esta cobrança foi cancelada.');
    if (vencimento < cobranca.data_emissao) throw new Error('O vencimento não pode ser antes da emissão (' + formatarDataBR_(cobranca.data_emissao) + ').');

    cobrancas.aba.getRange(cobranca.linha, COLUNAS_COBRANCAS.VENCIMENTO).setValue(converterDataFormulario(vencimento));
    cobrancas.aba.getRange(cobranca.linha, COLUNAS_COBRANCAS.OBSERVACOES).setValue(textoPlanilha_(observacoes));
    cobrancas.aba.getRange(cobranca.linha, COLUNAS_COBRANCAS.ATUALIZADO).setValue(new Date());

    registrarLog_(null, sessao, cobranca.empresa_id, 'EDITAR_COBRANCA',
      'Cobrança nº ' + numeroCobranca_(cobranca.numero) + ': vencimento ' + formatarDataBR_(vencimento));

    return {
      sucesso: true,
      mensagem: 'Cobrança nº ' + numeroCobranca_(cobranca.numero) + ' atualizada.',
      painel: montarPainelCobrancas_()
    };
  });
}

// ----------------------------------------------------------------
// DESCONTOS
// Em reais (VALOR) ou porcentagem (PERCENTUAL) sobre o valor dos
// pedidos. O desconto não pode deixar o valor abaixo do que já foi
// pago. Desconto 0 remove o desconto. Sempre com motivo.
// ----------------------------------------------------------------
function lerPedidoDesconto_(dados) {
  const bruto = String(dados.desconto_valor === undefined || dados.desconto_valor === null ? '' : dados.desconto_valor).trim();
  if (!bruto) return null;

  const tipo = String(dados.desconto_tipo || 'VALOR').trim().toUpperCase() === 'PERCENTUAL' ? 'PERCENTUAL' : 'VALOR';
  const numero = converterNumeroDesconto_(bruto);
  if (!numero) return null;

  const motivo = limparTexto_(dados.desconto_motivo, 200, 'O motivo do desconto');
  if (motivo.length < 3) throw new Error('Informe o motivo do desconto.');

  if (tipo === 'PERCENTUAL' && numero > 100) throw new Error('O desconto não pode passar de 100%.');
  return { tipo: tipo, numero: numero, motivo: motivo };
}

function converterNumeroDesconto_(texto) {
  let limpo = String(texto).replace(/[R$%\s]/g, '');
  if (limpo.indexOf(',') !== -1) limpo = limpo.replace(/\./g, '').replace(',', '.');
  const numero = Number(limpo);
  if (!isFinite(numero) || numero < 0) throw new Error('Informe um desconto válido.');
  return Math.round(numero * 100) / 100;
}

function calcularDesconto_(pedido, valorTotal, jaPago) {
  const desconto = pedido.tipo === 'PERCENTUAL'
    ? arredondar_(valorTotal * pedido.numero / 100)
    : arredondar_(pedido.numero);

  if (desconto > valorTotal + 0.004) {
    throw new Error('O desconto (' + formatarMoeda_(desconto) + ') é maior que o valor da cobrança (' + formatarMoeda_(valorTotal) + ').');
  }
  if (valorTotal - desconto < jaPago - 0.004) {
    throw new Error('Com esse desconto o valor ficaria menor do que já foi pago (' + formatarMoeda_(jaPago) + ').');
  }
  return desconto;
}

// Aplicar, trocar ou remover o desconto de uma cobrança em aberto
// dados = { cobranca_id, desconto_tipo, desconto_valor, desconto_motivo }
function aplicarDescontoCobranca(token, dados) {
  const sessao = exigirFuncao_(token, 'cobrancas_descontos');
  dados = dados || {};
  const cobrancaId = String(dados.cobranca_id || '').trim();
  const pedido = lerPedidoDesconto_(dados);

  return comBloqueio_(() => {
    const cobrancas = lerCobrancas_();
    const cobranca = cobrancas.lista.find(c => c.cobranca_id === cobrancaId);

    if (!cobranca) throw new Error('Cobrança não encontrada.');
    if (cobranca.status === 'CANCELADA') throw new Error('Esta cobrança foi cancelada.');

    const jaPago = arredondar_(lerPagamentos_().lista
      .filter(p => p.cobranca_id === cobrancaId)
      .reduce((s, p) => s + p.valor_pago, 0));

    const desconto = pedido ? calcularDesconto_(pedido, cobranca.valor_total, jaPago) : 0;

    cobrancas.aba.getRange(cobranca.linha, COLUNAS_COBRANCAS.DESCONTO, 1, 2)
      .setValues([[desconto, desconto ? textoPlanilha_(pedido.motivo) : '']]);

    cobranca.desconto = desconto;
    cobranca.valor_liquido = arredondar_(cobranca.valor_total - desconto);
    const resultado = atualizarSaldoCobranca_(cobrancas, cobranca);

    registrarLog_(null, sessao, cobranca.empresa_id, desconto ? 'DESCONTO_COBRANCA' : 'REMOVER_DESCONTO_COBRANCA',
      'Cobrança nº ' + numeroCobranca_(cobranca.numero) + ': ' + (desconto
        ? 'desconto de ' + formatarMoeda_(desconto) + (pedido.tipo === 'PERCENTUAL' ? ' (' + pedido.numero + '%)' : '') + ' — ' + pedido.motivo
        : 'desconto removido'));

    return {
      sucesso: true,
      mensagem: desconto
        ? 'Desconto de ' + formatarMoeda_(desconto) + ' aplicado. Valor a pagar: ' + formatarMoeda_(cobranca.valor_liquido) + '.' +
          (resultado.status === 'PAGA' ? ' A cobrança ficou quitada.' : '')
        : 'Desconto removido. Valor a pagar: ' + formatarMoeda_(cobranca.valor_liquido) + '.',
      painel: montarPainelCobrancas_()
    };
  });
}

// Cancelar (libera os pedidos para uma nova cobrança)
function cancelarCobranca(token, cobrancaId, motivo) {
  const sessao = exigirFuncao_(token, 'cobrancas_gerar');
  cobrancaId = String(cobrancaId || '').trim();
  motivo = limparTexto_(motivo, 300, 'O motivo');

  if (motivo.length < 3) throw new Error('Informe o motivo do cancelamento.');

  return comBloqueio_(() => {
    const cobrancas = lerCobrancas_();
    const cobranca = cobrancas.lista.find(c => c.cobranca_id === cobrancaId);

    if (!cobranca) throw new Error('Cobrança não encontrada.');
    if (cobranca.status === 'CANCELADA') throw new Error('Esta cobrança já foi cancelada.');

    const pagamentos = lerPagamentos_().lista.filter(p => p.cobranca_id === cobrancaId);
    if (pagamentos.length) {
      throw new Error('Esta cobrança tem ' + pagamentos.length + ' pagamento(s) registrado(s). Exclua os pagamentos antes de cancelar.');
    }

    cobrancas.aba.getRange(cobranca.linha, COLUNAS_COBRANCAS.STATUS).setValue('CANCELADA');
    cobrancas.aba.getRange(cobranca.linha, COLUNAS_COBRANCAS.ATUALIZADO).setValue(new Date());
    cobrancas.aba.getRange(cobranca.linha, COLUNAS_COBRANCAS.MOTIVO_CANCELAMENTO).setValue(textoPlanilha_(motivo));

    const pedidos = lerPedidos_();
    let liberados = 0;
    pedidos.lista.forEach(p => {
      if (p.cobranca_id !== cobrancaId) return;
      pedidos.aba.getRange(p.linha, COLUNA_COBRANCA_PEDIDO).setValue('');
      liberados++;
    });

    marcarPedidosAlterados_();

    registrarLog_(null, sessao, cobranca.empresa_id, 'CANCELAR_COBRANCA',
      'Cobrança nº ' + numeroCobranca_(cobranca.numero) + ' cancelada: ' + motivo);

    return {
      sucesso: true,
      mensagem: 'Cobrança nº ' + numeroCobranca_(cobranca.numero) + ' cancelada. ' + liberados +
        ' pedido(s) liberado(s) para uma nova cobrança.',
      painel: montarPainelCobrancas_()
    };
  });
}

// Recalcula valor pago e situação de uma cobrança
function atualizarSaldoCobranca_(cobrancas, cobranca) {
  const pago = arredondar_(lerPagamentos_().lista
    .filter(p => p.cobranca_id === cobranca.cobranca_id)
    .reduce((s, p) => s + p.valor_pago, 0));

  const status = statusPeloPagamento_(cobranca.valor_liquido, pago);

  cobrancas.aba.getRange(cobranca.linha, COLUNAS_COBRANCAS.STATUS).setValue(status);
  cobrancas.aba.getRange(cobranca.linha, COLUNAS_COBRANCAS.VALOR_PAGO).setValue(pago);
  cobrancas.aba.getRange(cobranca.linha, COLUNAS_COBRANCAS.ATUALIZADO).setValue(new Date());

  return { pago: pago, status: status };
}

// Registrar pagamento (total ou parcial)
// dados = { cobranca_id, data, valor, forma, comprovante, observacoes }
function registrarPagamento(token, dados) {
  const sessao = exigirFuncao_(token, 'cobrancas_pagamentos');
  dados = dados || {};

  const fuso = Session.getScriptTimeZone();
  const data = validarDataFormulario_(dados.data);
  const valor = converterValor_(dados.valor);
  const forma = String(dados.forma || '').trim().toUpperCase();
  const comprovante = limparTexto_(dados.comprovante, 120, 'O comprovante');
  const observacoes = limparTexto_(dados.observacoes, 300, 'A observação');
  const cobrancaId = String(dados.cobranca_id || '').trim();

  if (!FORMAS_PAGAMENTO[forma]) throw new Error('Escolha a forma de pagamento.');
  if (data > hojeTexto_(fuso)) throw new Error('A data do pagamento não pode ser no futuro.');

  return comBloqueio_(() => {
    const cobrancas = lerCobrancas_();
    const cobranca = cobrancas.lista.find(c => c.cobranca_id === cobrancaId);

    if (!cobranca) throw new Error('Cobrança não encontrada.');
    if (cobranca.status === 'CANCELADA') throw new Error('Esta cobrança foi cancelada.');

    const jaPago = arredondar_(lerPagamentos_().lista
      .filter(p => p.cobranca_id === cobrancaId)
      .reduce((s, p) => s + p.valor_pago, 0));
    const saldo = arredondar_(cobranca.valor_liquido - jaPago);

    if (saldo <= 0) throw new Error('Esta cobrança já está paga.');
    if (valor > saldo + 0.004) {
      throw new Error('O valor é maior que o saldo em aberto (' + formatarMoeda_(saldo) + ').');
    }

    obterAba_('PAGAMENTOS').appendRow([
      'PAG-' + Utilities.getUuid(),
      cobrancaId,
      cobranca.empresa_id,
      converterDataFormulario(data),
      valor,
      forma,
      textoPlanilha_(comprovante),
      textoPlanilha_(observacoes),
      sessao.usuario_id,
      new Date()
    ]);

    const resultado = atualizarSaldoCobranca_(cobrancas, cobranca);

    registrarLog_(null, sessao, cobranca.empresa_id, 'REGISTRAR_PAGAMENTO',
      'Cobrança nº ' + numeroCobranca_(cobranca.numero) + ': ' + formatarMoeda_(valor) + ' (' +
      FORMAS_PAGAMENTO[forma] + ') em ' + formatarDataBR_(data));

    return {
      sucesso: true,
      mensagem: resultado.status === 'PAGA'
        ? 'Pagamento registrado. A cobrança nº ' + numeroCobranca_(cobranca.numero) + ' está quitada!'
        : 'Pagamento registrado. Falta ' + formatarMoeda_(cobranca.valor_liquido - resultado.pago) + '.',
      painel: montarPainelCobrancas_()
    };
  });
}

// Excluir um pagamento lançado por engano
function excluirPagamento(token, pagamentoId) {
  const sessao = exigirFuncao_(token, 'cobrancas_pagamentos');
  pagamentoId = String(pagamentoId || '').trim();

  return comBloqueio_(() => {
    const pagamentos = lerPagamentos_();
    const pagamento = pagamentos.lista.find(p => p.pagamento_id === pagamentoId);
    if (!pagamento) throw new Error('Pagamento não encontrado.');

    const cobrancas = lerCobrancas_();
    const cobranca = cobrancas.lista.find(c => c.cobranca_id === pagamento.cobranca_id);

    pagamentos.aba.deleteRow(pagamento.linha);

    if (cobranca && cobranca.status !== 'CANCELADA') atualizarSaldoCobranca_(cobrancas, cobranca);

    registrarLog_(null, sessao, pagamento.empresa_id, 'EXCLUIR_PAGAMENTO',
      'Pagamento de ' + formatarMoeda_(pagamento.valor_pago) + ' de ' + formatarDataBR_(pagamento.data_pagamento) +
      ' excluído' + (cobranca ? ' (cobrança nº ' + numeroCobranca_(cobranca.numero) + ')' : ''));

    return {
      sucesso: true,
      mensagem: 'Pagamento excluído.',
      painel: montarPainelCobrancas_()
    };
  });
}

// ----------------------------------------------------------------
// EMPRESA: MINHAS COBRANÇAS
// ----------------------------------------------------------------
function listarCobrancasEmpresa(token) {
  const acesso = validarUsuarioEmpresa_(token);
  if (!configDaEmpresa_(acesso.empresa).cobrancas) throw new Error(MENSAGEM_COBRANCA_EMPRESA_DESLIGADA);

  const empresaId = acesso.sessao.empresa_id;
  const fuso = Session.getScriptTimeZone();
  const hoje = hojeTexto_(fuso);
  const nomes = {};
  nomes[empresaId] = acesso.nome_empresa || '';

  const lista = lerCobrancas_().lista
    .filter(c => c.empresa_id === empresaId && c.status !== 'CANCELADA')
    .map(c => cobrancaParaNavegador_(c, nomes, hoje))
    .sort((a, b) => b.numero - a.numero);

  const pendentes = lerPedidos_().lista.filter(p =>
    p.empresa_id === empresaId && pedidoCobravel_(p) && !p.cobranca_id && p.data_entrega <= hoje
  );

  const totais = { em_aberto: 0, vencido: 0, a_faturar: 0, quentinhas_a_faturar: 0, desde: '' };

  lista.forEach(c => {
    if (c.status !== 'ABERTA' && c.status !== 'PARCIAL') return;
    totais.em_aberto += c.saldo;
    if (c.vencida) totais.vencido += c.saldo;
  });

  pendentes.forEach(p => {
    totais.a_faturar += p.valor_total;
    totais.quentinhas_a_faturar += p.quantidade_total;
    if (!totais.desde || p.data_entrega < totais.desde) totais.desde = p.data_entrega;
  });

  totais.em_aberto = arredondar_(totais.em_aberto);
  totais.vencido = arredondar_(totais.vencido);
  totais.a_faturar = arredondar_(totais.a_faturar);

  return {
    hoje: hoje,
    totais: totais,
    cobrancas: lista,
    instrucoes_pagamento: instrucoesPagamento_()
  };
}
