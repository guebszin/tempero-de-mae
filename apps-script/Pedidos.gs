// ================================================================
// PEDIDOS.gs
// Pedido do dia de cada empresa.
// Regras:
// - O pedido só existe para o próprio dia (não dá para pedir a semana).
// - A empresa envia e altera até o horário limite (padrão 09:00).
// - Cada pessoa escolhe 1 proteína e, se quiser, a opção extra (sem custo).
// - Só funcionários com "pode personalizar" podem remover itens e
//   deixar observação. Quentinhas avulsas têm nome livre.
// - O preço do dia fica gravado em cada item (reajustes não afetam).
// - O restaurante confirma ou recusa cada pedido.
// - O restaurante também registra pedidos de clientes não cadastrados
//   (empresa_id vazio, nome e telefone do cliente no próprio pedido).
// ================================================================

const COLUNAS_PEDIDOS = {
  ID: 1,
  EMPRESA: 2,
  DATA_PEDIDO: 3,
  DATA_ENTREGA: 4,
  USUARIO: 5,
  STATUS: 6,
  OBSERVACOES: 7,
  VALOR: 8,
  QUANTIDADE: 9,
  ATUALIZADO: 10,
  CONFIRMADO: 11,
  RESPOSTA: 12,
  CLIENTE: 13,
  TELEFONE: 14
};

const TOTAL_COLUNAS_PEDIDOS = 14;

const TOTAL_COLUNAS_ITENS = 14;
const MENSAGEM_PEDIDO_COBRADO = 'Este pedido já entrou numa cobrança e não pode mais ser alterado. Fale com o restaurante.';
const HORARIO_LIMITE_PADRAO = '09:00';
const MAXIMO_ITENS_PEDIDO = 300;

// ----------------------------------------------------------------
// CONFIGURAÇÕES (aba CONFIG)
// ----------------------------------------------------------------
function lerConfiguracao_(chave, padrao) {
  const dados = lerAba_('CONFIG');

  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]).trim() !== chave) continue;

    const valor = dados[i][1];

    if (valor instanceof Date) {
      return Utilities.formatDate(valor, Session.getScriptTimeZone(), 'HH:mm');
    }

    return String(valor === null || valor === undefined ? '' : valor).trim() || padrao;
  }

  return padrao;
}

function horarioLimite_() {
  const valor = lerConfiguracao_('HORARIO_LIMITE_PEDIDO', HORARIO_LIMITE_PADRAO);
  const partes = valor.match(/^(\d{1,2}):(\d{2})$/);
  if (!partes) return HORARIO_LIMITE_PADRAO;
  return String(partes[1]).padStart(2, '0') + ':' + partes[2];
}

// ALTERAR O HORÁRIO LIMITE (restaurante)
function salvarHorarioLimite(token, valor) {
  const sessao = exigirFuncao_(token, 'pedidos_horario');
  const texto = String(valor || '').trim();
  const partes = texto.match(/^(\d{1,2}):(\d{2})$/);

  if (!partes || Number(partes[1]) > 23 || Number(partes[2]) > 59) {
    throw new Error('Informe um horário válido, por exemplo 09:00.');
  }

  const horario = String(partes[1]).padStart(2, '0') + ':' + partes[2];

  return comBloqueio_(() => {
    const aba = obterAba_('CONFIG');
    const dados = aba.getDataRange().getValues();
    let linha = 0;

    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === 'HORARIO_LIMITE_PEDIDO') linha = i + 1;
    }

    if (linha) {
      aba.getRange(linha, 2).setValue("'" + horario);
    } else {
      aba.appendRow([
        'HORARIO_LIMITE_PEDIDO',
        "'" + horario,
        'Horário limite para as empresas enviarem ou alterarem o pedido do dia (HH:MM)'
      ]);
    }

    registrarLog_(null, sessao, '', 'ALTERAR_HORARIO_LIMITE', 'Horário limite dos pedidos: ' + horario);

    return {
      sucesso: true,
      mensagem: 'Agora os pedidos podem ser enviados até ' + horario + '.',
      horario: horario
    };
  });
}

// ----------------------------------------------------------------
// PRAZO
// ----------------------------------------------------------------
function prazoPedido_(dataTexto) {
  const fuso = Session.getScriptTimeZone();
  const agora = new Date();
  const hoje = Utilities.formatDate(agora, fuso, 'yyyy-MM-dd');
  const hora = Utilities.formatDate(agora, fuso, 'HH:mm');
  const limite = horarioLimite_();
  const diaSemana = converterDataFormulario(dataTexto).getDay();

  let aberto = true;
  let motivo = '';

  if (dataTexto !== hoje) {
    aberto = false;
    motivo = dataTexto < hoje
      ? 'Este dia já passou.'
      : 'O pedido só é liberado no próprio dia.';
  } else if (diaSemana === 0 || diaSemana === 6) {
    aberto = false;
    motivo = 'Não há atendimento aos fins de semana.';
  } else if (hora >= limite) {
    aberto = false;
    motivo = 'Os pedidos de hoje foram encerrados às ' + limite + '.';
  }

  return {
    data: dataTexto,
    hoje: hoje,
    hora_atual: hora,
    limite: limite,
    aberto: aberto,
    motivo: motivo,
    agora_ms: agora.getTime()
  };
}

// ----------------------------------------------------------------
// LEITURA
// ----------------------------------------------------------------
function milissegundos_(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor.getTime();
  const data = new Date(valor);
  return isNaN(data.getTime()) ? null : data.getTime();
}

function lerPedidos_() {
  const fuso = Session.getScriptTimeZone();
  const dados = lerAba_('PEDIDOS');
  const lista = [];

  for (let i = 1; i < dados.length; i++) {
    const l = dados[i];
    if (!l[0]) continue;

    lista.push({
      linha: i + 1,
      pedido_id: String(l[0]),
      empresa_id: String(l[1]),
      criado_em: milissegundos_(l[2]),
      data_entrega: dataParaTexto_(l[3], fuso),
      usuario_id: String(l[4] || ''),
      status: String(l[5] || '').trim().toUpperCase() || 'ENVIADO',
      observacoes: String(l[6] || '').trim(),
      valor_total: Number(l[7]) || 0,
      quantidade_total: Number(l[8]) || 0,
      atualizado_em: milissegundos_(l[9]),
      confirmado_em: milissegundos_(l[10]),
      resposta_restaurante: String(l[11] || '').trim(),
      cliente_nome: String(l[12] || '').trim(),
      cliente_telefone: String(l[13] || '').trim(),
      cobranca_id: String(l[14] || '').trim()
    });
  }

  return {
    get aba() { return obterAba_('PEDIDOS'); },
    lista: lista
  };
}

// Linhas da aba ITENS_PEDIDOS que pertencem a um pedido
// (usa a busca do Google, sem ler a aba inteira)
function linhasDoPedido_(abaItens, pedidoId) {
  const ultima = abaItens.getLastRow();
  if (ultima < 2) return [];

  return abaItens.getRange(2, 2, ultima - 1, 1)
    .createTextFinder(pedidoId)
    .matchEntireCell(true)
    .findAll()
    .map(celula => celula.getRow());
}

// Quem não escolhe a proteína recebe a "quentinha do dia" (gravada vazia)
function itemParaNavegador_(l) {
  const proteina = String(l[11] || '').trim();
  return {
    item_id: String(l[0]),
    funcionario_id: String(l[3] || ''),
    avulsa: !l[3],
    preco_unitario: Number(l[7]) || 0,
    observacao: String(l[9] || '').trim(),
    nome: String(l[10] || '').trim(),
    proteina: proteina || QUENTINHA_DO_DIA,
    padrao: !proteina,
    opcao_extra: String(l[12] || '').trim(),
    itens_removidos: separarItens_(l[13])
  };
}

// Itens de um pedido, em ordem alfabética (funcionários primeiro, avulsas depois)
function itensDoPedido_(pedidoId) {
  const aba = abrirPlanilha_().getSheetByName('ITENS_PEDIDOS');
  const linhas = linhasDoPedido_(aba, pedidoId);
  if (!linhas.length) return [];

  const primeira = Math.min.apply(null, linhas);
  const ultima = Math.max.apply(null, linhas);
  const valores = aba.getRange(primeira, 1, ultima - primeira + 1, TOTAL_COLUNAS_ITENS).getValues();

  return valores
    .filter(l => String(l[1]) === pedidoId)
    .map(itemParaNavegador_)
    .sort((a, b) =>
      (a.avulsa === b.avulsa ? 0 : a.avulsa ? 1 : -1) ||
      a.nome.localeCompare(b.nome, 'pt-BR')
    );
}

function pedidoParaNavegador_(pedido, itens, nomeEmpresa) {
  return {
    pedido_id: pedido.pedido_id,
    empresa_id: pedido.empresa_id,
    nome_empresa: pedido.empresa_id ? (nomeEmpresa || '') : pedido.cliente_nome,
    cliente_avulso: !pedido.empresa_id,
    cliente_telefone: pedido.cliente_telefone,
    data_entrega: pedido.data_entrega,
    status: pedido.status,
    observacoes: pedido.observacoes,
    valor_total: pedido.valor_total,
    quantidade_total: pedido.quantidade_total,
    criado_em: pedido.criado_em,
    atualizado_em: pedido.atualizado_em,
    confirmado_em: pedido.confirmado_em,
    resposta_restaurante: pedido.resposta_restaurante,
    cobrado: !!pedido.cobranca_id,
    alterado_apos_confirmacao: !!(pedido.confirmado_em && pedido.atualizado_em &&
      pedido.atualizado_em > pedido.confirmado_em && pedido.status === 'ENVIADO'),
    itens: itens || []
  };
}

// Cardápio publicado de um dia
function cardapioPublicadoDoDia_(dataTexto) {
  return lerCardapios_().lista.find(c =>
    c.data === dataTexto && c.status === 'PUBLICADO'
  ) || null;
}

// "Ovo frito ou ovo cozido" vira ["Ovo frito", "Ovo cozido"]
function opcoesDoExtra_(texto) {
  return String(texto || '')
    .split(/\s+ou\s+|,|\//i)
    .map(parte => parte.trim())
    .filter(Boolean)
    .map(parte => parte.charAt(0).toUpperCase() + parte.slice(1));
}

// ----------------------------------------------------------------
// EMPRESA
// ----------------------------------------------------------------

// Tudo o que a tela de pedido precisa, numa ida ao servidor
function obterPedidoEmpresa(token) {
  const acesso = validarUsuarioEmpresa_(token);
  return montarEstadoPedidoEmpresa_(acesso.sessao.empresa_id);
}

// Tira os valores de um pedido (empresa configurada para não ver preços)
function pedidoSemValores_(pedido) {
  if (!pedido) return pedido;
  pedido.valor_total = null;
  pedido.itens.forEach(item => { item.preco_unitario = null; });
  return pedido;
}

function montarEstadoPedidoEmpresa_(empresaId) {
  const fuso = Session.getScriptTimeZone();
  const hoje = hojeTexto_(fuso);
  const prazo = prazoPedido_(hoje);
  const cardapio = cardapioPublicadoDoDia_(hoje);
  const preco = precoVigente_(lerPrecos_().lista, empresaId, hoje);
  const config = configDaEmpresaPorId_(empresaId);

  const funcionarios = lerFuncionarios_().lista
    .filter(f => f.empresa_id === empresaId && f.status === 'ATIVO')
    .map(f => {
      const permissoes = permissoesQuentinha_(config, f);
      return {
        funcionario_id: f.funcionario_id,
        nome: f.nome,
        setor: f.setor,
        matricula: f.matricula,
        pode_alterar_quentinha: f.pode_alterar_quentinha,
        escolhe: permissoes.escolhe,
        personaliza: permissoes.personaliza
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const pedidosEmpresa = lerPedidos_().lista
    .filter(p => p.empresa_id === empresaId && p.status !== 'CANCELADO');

  const pedidoHoje = pedidosEmpresa.find(p => p.data_entrega === hoje) || null;

  // Último pedido anterior (para "repetir quem almoçou")
  const anteriores = pedidosEmpresa
    .filter(p => p.data_entrega < hoje)
    .sort((a, b) => b.data_entrega.localeCompare(a.data_entrega));

  let ultimoPedido = null;

  if (anteriores.length) {
    const itens = itensDoPedido_(anteriores[0].pedido_id);
    ultimoPedido = {
      data_entrega: anteriores[0].data_entrega,
      funcionarios: itens.filter(i => !i.avulsa).map(i => i.funcionario_id)
    };
  }

  const pedido = pedidoHoje ? pedidoParaNavegador_(pedidoHoje, itensDoPedido_(pedidoHoje.pedido_id)) : null;

  return {
    prazo: prazo,
    cardapio: cardapio && diaTemConteudo_(cardapio) ? diaParaNavegador_(cardapio, hoje) : null,
    opcoes_extra: cardapio ? opcoesDoExtra_(cardapio.opcao_extra) : [],
    tem_preco: !!preco,
    preco_unitario: preco && config.mostrar_precos ? preco.valor_unitario : null,
    config: {
      escolha: config.escolha,
      mostrar_precos: config.mostrar_precos,
      avulsas: config.avulsas,
      avulsa_escolhe: config.escolha === 'TODOS'
    },
    funcionarios: funcionarios,
    pedido: config.mostrar_precos ? pedido : pedidoSemValores_(pedido),
    ultimo_pedido: ultimoPedido
  };
}

// ENVIAR OU ALTERAR O PEDIDO DE HOJE
function salvarPedidoEmpresa(token, dados) {
  const acesso = validarUsuarioEmpresa_(token);
  const empresaId = acesso.sessao.empresa_id;
  const fuso = Session.getScriptTimeZone();
  const hoje = hojeTexto_(fuso);

  const prazo = prazoPedido_(hoje);
  if (!prazo.aberto) throw new Error(prazo.motivo);

  const cardapio = cardapioPublicadoDoDia_(hoje);

  if (!cardapio || !diaTemConteudo_(cardapio)) {
    throw new Error('O cardápio de hoje ainda não foi publicado pelo restaurante.');
  }

  const config = configDaEmpresa_(acesso.empresa);
  const preco = precoVigente_(lerPrecos_().lista, empresaId, hoje);

  if (!preco) {
    throw new Error(config.mostrar_precos
      ? 'O restaurante ainda não definiu o valor da quentinha da sua empresa. Entre em contato com ele.'
      : 'O restaurante ainda não liberou os pedidos da sua empresa. Entre em contato com ele.');
  }

  dados = dados || {};

  const funcionarios = {};
  lerFuncionarios_().lista.forEach(f => {
    if (f.empresa_id === empresaId && f.status === 'ATIVO') funcionarios[f.funcionario_id] = f;
  });

  const proteinas = {};
  cardapio.proteinas.forEach(p => { proteinas[normalizarNome_(p)] = p; });

  const extras = {};
  opcoesDoExtra_(cardapio.opcao_extra).forEach(e => { extras[normalizarNome_(e)] = e; });

  const removiveis = {};
  cardapio.acompanhamentos.concat(cardapio.saladas, cardapio.guarnicoes)
    .forEach(item => { removiveis[normalizarNome_(item)] = item; });

  const jaPediu = {};
  const itensRecebidos = Array.isArray(dados.itens) ? dados.itens : [];

  if (itensRecebidos.length > MAXIMO_ITENS_PEDIDO) {
    throw new Error('O pedido pode ter no máximo ' + MAXIMO_ITENS_PEDIDO + ' quentinhas.');
  }

  const itens = itensRecebidos.map(item => {
    item = item || {};
    const funcionarioId = String(item.funcionario_id || '').trim();
    let nome;
    let permissoes;

    if (funcionarioId) {
      const funcionario = funcionarios[funcionarioId];

      if (!funcionario) {
        throw new Error('Há um funcionário no pedido que não está mais ativo. Atualize a página.');
      }

      if (jaPediu[funcionarioId]) {
        throw new Error(funcionario.nome + ' aparece mais de uma vez no pedido.');
      }

      jaPediu[funcionarioId] = true;
      nome = funcionario.nome;
      permissoes = permissoesQuentinha_(config, funcionario);
    } else {
      if (!config.avulsas) {
        throw new Error('As quentinhas avulsas não estão liberadas para a sua empresa.');
      }

      nome = limparTexto_(item.nome, 80, 'O nome da quentinha avulsa');

      if (nome.length < 2) {
        throw new Error('Informe o nome de cada quentinha avulsa.');
      }

      permissoes = { escolhe: config.escolha === 'TODOS', personaliza: false };
    }

    // Quem não escolhe recebe a quentinha do dia (proteína e extra ficam vazios)
    let proteina = '';
    let extra = '';

    if (permissoes.escolhe) {
      proteina = proteinas[normalizarNome_(item.proteina)];

      if (!proteina) {
        throw new Error('Escolha a proteína de ' + nome + '.');
      }

      if (item.opcao_extra) {
        extra = extras[normalizarNome_(item.opcao_extra)];
        if (!extra) throw new Error('A opção extra escolhida para ' + nome + ' não está no cardápio de hoje.');
      }
    }

    const removidosRecebidos = Array.isArray(item.itens_removidos) ? item.itens_removidos : [];
    const observacao = limparTexto_(item.observacao, 200, 'A observação de ' + nome);

    if (!permissoes.personaliza && (removidosRecebidos.length || observacao)) {
      throw new Error(nome + ' não tem permissão para personalizar a quentinha.');
    }

    const removidos = [];
    removidosRecebidos.forEach(r => {
      const original = removiveis[normalizarNome_(r)];
      if (original && removidos.indexOf(original) === -1) removidos.push(original);
    });

    return {
      funcionario_id: funcionarioId,
      nome: nome,
      proteina: proteina,
      opcao_extra: extra,
      itens_removidos: removidos,
      observacao: observacao
    };
  });

  if (!itens.length) {
    throw new Error('Selecione pelo menos uma pessoa. Para desistir do pedido de hoje, use "Cancelar pedido".');
  }

  const observacoes = limparTexto_(dados.observacoes, 300, 'A observação do pedido');
  const valorUnitario = preco.valor_unitario;
  const valorTotal = Math.round(itens.length * valorUnitario * 100) / 100;

  return comBloqueio_(() => {
    // O horário é conferido de novo, já dentro do bloqueio
    const prazoAgora = prazoPedido_(hoje);
    if (!prazoAgora.aberto) throw new Error(prazoAgora.motivo);

    const pedidos = lerPedidos_();
    const existente = pedidos.lista.find(p =>
      p.empresa_id === empresaId && p.data_entrega === hoje && p.status !== 'CANCELADO'
    );

    // A tela informa qual versão do pedido ela tinha. Se outra aba ou
    // aparelho mudou o pedido nesse meio-tempo, não sobrescreve.
    if (Object.prototype.hasOwnProperty.call(dados, 'base_atualizado_em')) {
      const base = dados.base_atualizado_em || null;
      const atual = existente ? existente.atualizado_em : null;

      if (base !== atual) {
        throw new Error('O pedido de hoje foi alterado em outra tela ou aparelho. Carregamos a versão mais nova: confira antes de enviar de novo.');
      }
    }

    if (existente && existente.cobranca_id) throw new Error(MENSAGEM_PEDIDO_COBRADO);

    const agora = new Date();
    const abaItens = obterAba_('ITENS_PEDIDOS');
    let pedidoId;

    if (existente) {
      pedidoId = existente.pedido_id;
      excluirLinhas_(abaItens, linhasDoPedido_(abaItens, pedidoId));

      pedidos.aba
        .getRange(existente.linha, COLUNAS_PEDIDOS.USUARIO, 1, 8)
        .setValues([[
          acesso.sessao.usuario_id,
          'ENVIADO',
          textoPlanilha_(observacoes),
          valorTotal,
          itens.length,
          agora,
          existente.confirmado_em ? new Date(existente.confirmado_em) : '',
          ''
        ]]);
    } else {
      pedidoId = 'PED-' + Utilities.getUuid();

      pedidos.aba.appendRow([
        pedidoId,
        empresaId,
        agora,
        converterDataFormulario(hoje),
        acesso.sessao.usuario_id,
        'ENVIADO',
        textoPlanilha_(observacoes),
        valorTotal,
        itens.length,
        agora,
        '',
        ''
      ]);
    }

    const linhas = itens.map(item => [
      'ITM-' + Utilities.getUuid(),
      pedidoId,
      empresaId,
      item.funcionario_id,
      cardapio.cardapio_id,
      'Normal',
      1,
      valorUnitario,
      valorUnitario,
      textoPlanilha_(item.observacao),
      textoPlanilha_(item.nome),
      textoPlanilha_(item.proteina),
      textoPlanilha_(item.opcao_extra),
      textoPlanilha_(item.itens_removidos.join('\n'))
    ]);

    abaItens
      .getRange(abaItens.getLastRow() + 1, 1, linhas.length, TOTAL_COLUNAS_ITENS)
      .setValues(linhas);

    marcarPedidosAlterados_();

    registrarLog_(null, acesso.sessao, empresaId, existente ? 'ALTERAR_PEDIDO' : 'ENVIAR_PEDIDO',
      'Pedido de ' + formatarDataBR_(hoje) + ': ' + itens.length + ' quentinha(s), ' + formatarMoeda_(valorTotal));

    return {
      sucesso: true,
      mensagem: existente
        ? 'Pedido atualizado. O restaurante vai confirmar a alteração.'
        : 'Pedido enviado! Aguarde a confirmação do restaurante.',
      estado: montarEstadoPedidoEmpresa_(empresaId)
    };
  });
}

// CANCELAR O PEDIDO DE HOJE (dentro do prazo)
function cancelarPedidoEmpresa(token) {
  const acesso = validarUsuarioEmpresa_(token);
  const empresaId = acesso.sessao.empresa_id;
  const hoje = hojeTexto_(Session.getScriptTimeZone());

  return comBloqueio_(() => {
    const prazo = prazoPedido_(hoje);
    if (!prazo.aberto) throw new Error(prazo.motivo);

    const pedidos = lerPedidos_();
    const pedido = pedidos.lista.find(p =>
      p.empresa_id === empresaId && p.data_entrega === hoje && p.status !== 'CANCELADO'
    );

    if (!pedido) throw new Error('Não há pedido para cancelar hoje.');
    if (pedido.cobranca_id) throw new Error(MENSAGEM_PEDIDO_COBRADO);

    const abaItens = obterAba_('ITENS_PEDIDOS');
    excluirLinhas_(abaItens, linhasDoPedido_(abaItens, pedido.pedido_id));

    pedidos.aba
      .getRange(pedido.linha, COLUNAS_PEDIDOS.STATUS, 1, 5)
      .setValues([['CANCELADO', pedido.observacoes ? textoPlanilha_(pedido.observacoes) : '', 0, 0, new Date()]]);

    marcarPedidosAlterados_();

    registrarLog_(null, acesso.sessao, empresaId, 'CANCELAR_PEDIDO',
      'Pedido de ' + formatarDataBR_(hoje) + ' cancelado pela empresa');

    return {
      sucesso: true,
      mensagem: 'Pedido de hoje cancelado.',
      estado: montarEstadoPedidoEmpresa_(empresaId)
    };
  });
}

// ----------------------------------------------------------------
// RESTAURANTE
// ----------------------------------------------------------------

// Pedidos de um dia, com a lista de produção
function listarPedidosDia(token, data) {
  exigirTela_(token, 'pedidos');
  const fuso = Session.getScriptTimeZone();
  const dia = data ? validarDataFormulario_(data) : hojeTexto_(fuso);
  return montarPedidosDia_(dia);
}

function montarPedidosDia_(dia) {
  const empresas = lerEmpresas_().lista;
  const nomes = nomesEmpresasComExcluidas_();

  const ordemStatus = { ENVIADO: 0, CONFIRMADO: 1, RECUSADO: 2, CANCELADO: 3 };

  const pedidos = lerPedidos_().lista
    .filter(p => p.data_entrega === dia)
    .map(p => pedidoParaNavegador_(
      p,
      p.status === 'CANCELADO' ? [] : itensDoPedido_(p.pedido_id),
      nomes[p.empresa_id] || 'Empresa não identificada'
    ))
    .sort((a, b) =>
      (ordemStatus[a.status] - ordemStatus[b.status]) ||
      a.nome_empresa.localeCompare(b.nome_empresa, 'pt-BR')
    );

  // Lista de produção: pedidos enviados ou confirmados
  const producao = {
    total: 0,
    confirmadas: 0,
    por_proteina: {},
    extras: {},
    personalizadas: [],
    avulsas: 0,
    clientes: 0
  };

  pedidos
    .filter(p => p.status === 'ENVIADO' || p.status === 'CONFIRMADO')
    .forEach(p => {
      p.itens.forEach(item => {
        producao.total++;
        if (p.status === 'CONFIRMADO') producao.confirmadas++;
        if (p.cliente_avulso) producao.clientes++;
        else if (item.avulsa) producao.avulsas++;
        producao.por_proteina[item.proteina] = (producao.por_proteina[item.proteina] || 0) + 1;
        if (item.opcao_extra) producao.extras[item.opcao_extra] = (producao.extras[item.opcao_extra] || 0) + 1;

        if (item.itens_removidos.length || item.observacao) {
          producao.personalizadas.push({
            nome_empresa: p.nome_empresa,
            nome: item.nome,
            proteina: item.proteina,
            opcao_extra: item.opcao_extra,
            itens_removidos: item.itens_removidos,
            observacao: item.observacao
          });
        }
      });
    });

  const comPedido = {};
  pedidos.forEach(p => { if (p.status !== 'CANCELADO' && p.empresa_id) comPedido[p.empresa_id] = true; });

  const diaSemana = converterDataFormulario(dia).getDay();
  const semPedido = (diaSemana === 0 || diaSemana === 6) ? [] : empresas
    .filter(e => e.status === 'ATIVO' && !comPedido[e.empresa_id])
    .map(e => e.nome_empresa)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const cardapio = cardapioPublicadoDoDia_(dia);

  return {
    data: dia,
    prazo: prazoPedido_(dia),
    cardapio: cardapio && diaTemConteudo_(cardapio) ? diaParaNavegador_(cardapio, dia) : null,
    opcoes_extra: cardapio ? opcoesDoExtra_(cardapio.opcao_extra) : [],
    preco_cliente_avulso: lerConfiguracao_('PRECO_CLIENTE_AVULSO', ''),
    pedidos: pedidos,
    producao: producao,
    sem_pedido: semPedido
  };
}

// CONFIRMAR UM PEDIDO
function confirmarPedido(token, pedidoId) {
  const sessao = exigirTela_(token, 'pedidos');
  pedidoId = String(pedidoId || '').trim();

  return comBloqueio_(() => {
    const pedidos = lerPedidos_();
    const pedido = pedidos.lista.find(p => p.pedido_id === pedidoId);

    if (!pedido) throw new Error('Pedido não encontrado.');
    if (pedido.status !== 'ENVIADO') throw new Error('Só é possível confirmar pedidos que estão aguardando confirmação.');

    pedidos.aba
      .getRange(pedido.linha, COLUNAS_PEDIDOS.STATUS)
      .setValue('CONFIRMADO');
    pedidos.aba
      .getRange(pedido.linha, COLUNAS_PEDIDOS.CONFIRMADO, 1, 2)
      .setValues([[new Date(), '']]);

    marcarPedidosAlterados_();

    registrarLog_(null, sessao, pedido.empresa_id, 'CONFIRMAR_PEDIDO',
      'Pedido ' + pedidoId + ' de ' + formatarDataBR_(pedido.data_entrega) + ' confirmado');

    return {
      sucesso: true,
      mensagem: 'Pedido confirmado.',
      dia: montarPedidosDia_(pedido.data_entrega)
    };
  });
}

// CONFIRMAR TODOS OS PEDIDOS PENDENTES DE UM DIA
function confirmarPedidosPendentes(token, data) {
  const sessao = exigirTela_(token, 'pedidos');
  const dia = validarDataFormulario_(data);

  return comBloqueio_(() => {
    const pedidos = lerPedidos_();
    const pendentes = pedidos.lista.filter(p => p.data_entrega === dia && p.status === 'ENVIADO');

    if (!pendentes.length) throw new Error('Não há pedidos aguardando confirmação.');

    const agora = new Date();
    const aba = pedidos.aba;

    pendentes.forEach(pedido => {
      aba.getRange(pedido.linha, COLUNAS_PEDIDOS.STATUS).setValue('CONFIRMADO');
      aba.getRange(pedido.linha, COLUNAS_PEDIDOS.CONFIRMADO, 1, 2).setValues([[agora, '']]);
    });

    marcarPedidosAlterados_();

    registrarLog_(null, sessao, '', 'CONFIRMAR_PEDIDOS',
      pendentes.length + ' pedido(s) de ' + formatarDataBR_(dia) + ' confirmados de uma vez');

    return {
      sucesso: true,
      mensagem: pendentes.length + ' pedido(s) confirmado(s).',
      dia: montarPedidosDia_(dia)
    };
  });
}

// RECUSAR UM PEDIDO (com motivo, que a empresa vê)
function recusarPedido(token, pedidoId, motivo) {
  const sessao = exigirTela_(token, 'pedidos');
  pedidoId = String(pedidoId || '').trim();
  motivo = limparTexto_(motivo, 300, 'O motivo');

  if (motivo.length < 3) throw new Error('Informe o motivo da recusa. A empresa verá essa mensagem.');

  return comBloqueio_(() => {
    const pedidos = lerPedidos_();
    const pedido = pedidos.lista.find(p => p.pedido_id === pedidoId);

    if (!pedido) throw new Error('Pedido não encontrado.');
    if (!pedido.empresa_id) throw new Error('Pedidos de clientes não cadastrados são cancelados, não recusados.');
    if (pedido.cobranca_id) throw new Error('Este pedido já entrou numa cobrança. Cancele a cobrança antes de recusá-lo.');
    if (pedido.status !== 'ENVIADO' && pedido.status !== 'CONFIRMADO') {
      throw new Error('Este pedido não pode mais ser recusado.');
    }

    pedidos.aba.getRange(pedido.linha, COLUNAS_PEDIDOS.STATUS).setValue('RECUSADO');
    pedidos.aba.getRange(pedido.linha, COLUNAS_PEDIDOS.RESPOSTA).setValue(textoPlanilha_(motivo));

    marcarPedidosAlterados_();

    registrarLog_(null, sessao, pedido.empresa_id, 'RECUSAR_PEDIDO',
      'Pedido ' + pedidoId + ' recusado: ' + motivo);

    return {
      sucesso: true,
      mensagem: 'Pedido recusado. A empresa verá o motivo.',
      dia: montarPedidosDia_(pedido.data_entrega)
    };
  });
}

// ----------------------------------------------------------------
// RESUMOS (telas iniciais)
// ----------------------------------------------------------------
function resumoPedidosAdmin_() {
  const hoje = hojeTexto_(Session.getScriptTimeZone());
  const doDia = lerPedidos_().lista.filter(p => p.data_entrega === hoje && p.status !== 'CANCELADO');
  const validos = doDia.filter(p => p.status === 'ENVIADO' || p.status === 'CONFIRMADO');

  return {
    data: hoje,
    pedidos: validos.length,
    quentinhas: validos.reduce((total, p) => total + p.quantidade_total, 0),
    pendentes: doDia.filter(p => p.status === 'ENVIADO').length,
    prazo: prazoPedido_(hoje)
  };
}

function resumoPedidoEmpresa_(empresaId) {
  const hoje = hojeTexto_(Session.getScriptTimeZone());
  const pedido = lerPedidos_().lista.find(p =>
    p.empresa_id === empresaId && p.data_entrega === hoje && p.status !== 'CANCELADO'
  );

  return {
    data: hoje,
    prazo: prazoPedido_(hoje),
    cardapio_publicado: !!cardapioPublicadoDoDia_(hoje),
    pedido_id: pedido ? pedido.pedido_id : '',
    status: pedido ? pedido.status : '',
    quantidade: pedido ? pedido.quantidade_total : 0,
    atualizado_em: pedido ? pedido.atualizado_em : null,
    confirmado_em: pedido ? pedido.confirmado_em : null,
    resposta_restaurante: pedido ? pedido.resposta_restaurante : ''
  };
}

// ----------------------------------------------------------------
// PEDIDOS DE CLIENTES NÃO CADASTRADOS (registrados pelo restaurante)
// ----------------------------------------------------------------

// REGISTRAR OU ALTERAR
// dados = { pedido_id?, data, cliente_nome, cliente_telefone, valor_unitario,
//           observacoes, itens: [{ proteina, opcao_extra, quantidade, observacao }] }
function salvarPedidoCliente(token, dados) {
  const sessao = exigirTela_(token, 'pedidos');
  dados = dados || {};

  const fuso = Session.getScriptTimeZone();
  const hoje = hojeTexto_(fuso);
  const dia = validarDataFormulario_(dados.data);

  if (dia < hoje) throw new Error('Não é possível registrar pedidos em dias que já passaram.');

  const cardapio = cardapioPublicadoDoDia_(dia);

  if (!cardapio || !cardapio.proteinas.length) {
    throw new Error('Publique o cardápio de ' + formatarDataBR_(dia) + ' antes de registrar pedidos.');
  }

  const nomeCliente = limparTexto_(dados.cliente_nome, 80, 'O nome do cliente');
  if (nomeCliente.length < 2) throw new Error('Informe o nome do cliente.');

  const telefone = limparTexto_(dados.cliente_telefone, 20, 'O telefone');
  const valorUnitario = converterValor_(dados.valor_unitario);
  if (valorUnitario > 1000) throw new Error('Confira o valor da quentinha.');

  const observacoes = limparTexto_(dados.observacoes, 300, 'A observação do pedido');

  const proteinas = {};
  cardapio.proteinas.forEach(p => { proteinas[normalizarNome_(p)] = p; });

  const extras = {};
  opcoesDoExtra_(cardapio.opcao_extra).forEach(e => { extras[normalizarNome_(e)] = e; });

  const linhasRecebidas = Array.isArray(dados.itens) ? dados.itens : [];
  const itens = [];

  linhasRecebidas.forEach(linha => {
    linha = linha || {};
    const quantidade = Number(linha.quantidade);

    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAXIMO_ITENS_PEDIDO) {
      throw new Error('Informe quantidades inteiras entre 1 e ' + MAXIMO_ITENS_PEDIDO + '.');
    }

    const proteina = proteinas[normalizarNome_(linha.proteina)];
    if (!proteina) throw new Error('Escolha a proteína de cada linha.');

    let extra = '';
    if (linha.opcao_extra) {
      extra = extras[normalizarNome_(linha.opcao_extra)];
      if (!extra) throw new Error('A opção extra escolhida não está no cardápio deste dia.');
    }

    const observacao = limparTexto_(linha.observacao, 200, 'A observação');

    for (let i = 0; i < quantidade; i++) {
      itens.push({ proteina: proteina, opcao_extra: extra, observacao: observacao });
    }
  });

  if (!itens.length) throw new Error('Adicione pelo menos uma quentinha.');
  if (itens.length > MAXIMO_ITENS_PEDIDO) {
    throw new Error('O pedido pode ter no máximo ' + MAXIMO_ITENS_PEDIDO + ' quentinhas.');
  }

  const valorTotal = Math.round(itens.length * valorUnitario * 100) / 100;
  const pedidoIdRecebido = String(dados.pedido_id || '').trim();

  return comBloqueio_(() => {
    const pedidos = lerPedidos_();
    const agora = new Date();
    const abaItens = obterAba_('ITENS_PEDIDOS');
    let pedidoId;
    let existente = null;

    if (pedidoIdRecebido) {
      existente = pedidos.lista.find(p => p.pedido_id === pedidoIdRecebido);

      if (!existente || existente.empresa_id) throw new Error('Pedido não encontrado.');
      if (existente.status === 'CANCELADO') throw new Error('Este pedido foi cancelado.');
      if (existente.data_entrega < hoje) throw new Error('Não é possível alterar pedidos de dias que já passaram.');

      pedidoId = existente.pedido_id;
      excluirLinhas_(abaItens, linhasDoPedido_(abaItens, pedidoId));

      pedidos.aba
        .getRange(existente.linha, COLUNAS_PEDIDOS.DATA_ENTREGA, 1, TOTAL_COLUNAS_PEDIDOS - COLUNAS_PEDIDOS.DATA_ENTREGA + 1)
        .setValues([[
          converterDataFormulario(dia),
          sessao.usuario_id,
          'CONFIRMADO',
          textoPlanilha_(observacoes),
          valorTotal,
          itens.length,
          agora,
          agora,
          '',
          textoPlanilha_(nomeCliente),
          textoPlanilha_(telefone)
        ]]);
    } else {
      pedidoId = 'PED-' + Utilities.getUuid();

      pedidos.aba.appendRow([
        pedidoId,
        '',
        agora,
        converterDataFormulario(dia),
        sessao.usuario_id,
        'CONFIRMADO',
        textoPlanilha_(observacoes),
        valorTotal,
        itens.length,
        agora,
        agora,
        '',
        textoPlanilha_(nomeCliente),
        textoPlanilha_(telefone)
      ]);
    }

    const linhas = itens.map(item => [
      'ITM-' + Utilities.getUuid(),
      pedidoId,
      '',
      '',
      cardapio.cardapio_id,
      'Normal',
      1,
      valorUnitario,
      valorUnitario,
      textoPlanilha_(item.observacao),
      textoPlanilha_(nomeCliente),
      textoPlanilha_(item.proteina),
      textoPlanilha_(item.opcao_extra),
      ''
    ]);

    abaItens
      .getRange(abaItens.getLastRow() + 1, 1, linhas.length, TOTAL_COLUNAS_ITENS)
      .setValues(linhas);

    // Guarda o último valor usado, para já vir preenchido na próxima vez
    if (lerConfiguracao_('PRECO_CLIENTE_AVULSO', '') !== String(valorUnitario)) {
      const abaConfig = obterAba_('CONFIG');
      const config = abaConfig.getDataRange().getValues();
      let linhaConfig = 0;

      for (let i = 1; i < config.length; i++) {
        if (String(config[i][0]).trim() === 'PRECO_CLIENTE_AVULSO') linhaConfig = i + 1;
      }

      if (linhaConfig) {
        abaConfig.getRange(linhaConfig, 2).setValue(valorUnitario);
      } else {
        abaConfig.appendRow([
          'PRECO_CLIENTE_AVULSO',
          valorUnitario,
          'Último valor usado nos pedidos de clientes não cadastrados'
        ]);
      }
    }

    marcarPedidosAlterados_();

    registrarLog_(null, sessao, '', existente ? 'ALTERAR_PEDIDO_CLIENTE' : 'REGISTRAR_PEDIDO_CLIENTE',
      'Pedido de ' + nomeCliente + ' para ' + formatarDataBR_(dia) + ': ' +
      itens.length + ' quentinha(s), ' + formatarMoeda_(valorTotal));

    const resposta = {
      sucesso: true,
      mensagem: existente ? 'Pedido de ' + nomeCliente + ' atualizado.' : 'Pedido de ' + nomeCliente + ' registrado.',
      dia: montarPedidosDia_(dia)
    };

    // Se a data mudou, a tela também precisa saber do dia antigo
    if (existente && existente.data_entrega !== dia) resposta.dia_anterior = montarPedidosDia_(existente.data_entrega);

    return resposta;
  });
}

// CANCELAR UM PEDIDO DE CLIENTE NÃO CADASTRADO
function cancelarPedidoCliente(token, pedidoId) {
  const sessao = exigirTela_(token, 'pedidos');
  pedidoId = String(pedidoId || '').trim();

  return comBloqueio_(() => {
    const pedidos = lerPedidos_();
    const pedido = pedidos.lista.find(p => p.pedido_id === pedidoId);

    if (!pedido || pedido.empresa_id) throw new Error('Pedido não encontrado.');
    if (pedido.status === 'CANCELADO') throw new Error('Este pedido já foi cancelado.');

    const abaItens = obterAba_('ITENS_PEDIDOS');
    excluirLinhas_(abaItens, linhasDoPedido_(abaItens, pedido.pedido_id));

    pedidos.aba
      .getRange(pedido.linha, COLUNAS_PEDIDOS.STATUS)
      .setValue('CANCELADO');
    pedidos.aba
      .getRange(pedido.linha, COLUNAS_PEDIDOS.VALOR, 1, 3)
      .setValues([[0, 0, new Date()]]);

    marcarPedidosAlterados_();

    registrarLog_(null, sessao, '', 'CANCELAR_PEDIDO_CLIENTE',
      'Pedido de ' + pedido.cliente_nome + ' (' + formatarDataBR_(pedido.data_entrega) + ') cancelado');

    return {
      sucesso: true,
      mensagem: 'Pedido de ' + pedido.cliente_nome + ' cancelado.',
      dia: montarPedidosDia_(pedido.data_entrega)
    };
  });
}

// ----------------------------------------------------------------
// AVISOS AO VIVO
// Cada gravação de pedido troca uma "versão" guardada no cache.
// As telas perguntam essa versão a cada poucos segundos — uma consulta
// leve, que não abre a planilha. Só quando ela muda é que os dados
// novos são enviados.
// ----------------------------------------------------------------
function marcarPedidosAlterados_() {
  CacheService.getScriptCache().put(prefixoBanco_() + 'versao_pedidos', novaVersao_(), 21600);
}

function versaoPedidos_() {
  const cache = CacheService.getScriptCache();
  let versao = cache.get(prefixoBanco_() + 'versao_pedidos');

  if (!versao) {
    versao = novaVersao_();
    cache.put(prefixoBanco_() + 'versao_pedidos', versao, 21600);
  }

  return versao;
}

function novidadesPedidos(token, versaoConhecida) {
  const sessao = validarSessao(token);
  const versao = versaoPedidos_();

  if (versaoConhecida && versaoConhecida === versao) {
    // As permissões e funções ligadas vão sempre: o menu se ajusta sozinho
    return { mudou: false, versao: versao, recursos: recursosDaSessao_(sessao) };
  }

  if (sessao.perfil === 'admin') {
    const hoje = hojeTexto_(Session.getScriptTimeZone());
    const nomes = nomesEmpresasComExcluidas_();
    const vePedidos = !sessao.permissoes || sessao.permissoes.telas.pedidos;

    return {
      mudou: true,
      versao: versao,
      recursos: recursosDaSessao_(sessao),
      resumo: resumoPedidosAdmin_(),
      pedidos: lerPedidos_().lista
        .filter(p => vePedidos && p.data_entrega === hoje)
        .map(p => ({
          pedido_id: p.pedido_id,
          nome: p.empresa_id ? (nomes[p.empresa_id] || 'Empresa') : p.cliente_nome,
          cliente_avulso: !p.empresa_id,
          status: p.status,
          quantidade: p.quantidade_total,
          atualizado_em: p.atualizado_em
        }))
    };
  }

  const acesso = validarUsuarioEmpresa_(token);

  return {
    mudou: true,
    versao: versao,
    recursos: recursosDaSessao_(sessao),
    pedido_hoje: resumoPedidoEmpresa_(acesso.sessao.empresa_id)
  };
}
