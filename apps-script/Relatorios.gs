// ================================================================
// RELATORIOS.gs
// Consumo de quentinhas por período: por empresa, por dia, por
// funcionário e por proteína. O valor usado é o preço gravado em cada
// quentinha no dia do pedido (reajustes não mudam relatórios antigos).
// Entram pedidos confirmados e os que ainda aguardam confirmação;
// cancelados e recusados ficam de fora.
// ================================================================

const MAXIMO_DIAS_RELATORIO = 366;
const FILTRO_CLIENTES_SEM_CADASTRO = 'CLIENTES';

// GERAR O RELATÓRIO (restaurante)
// filtros = { inicio: 'aaaa-mm-dd', fim: 'aaaa-mm-dd', empresa: '' | 'CLIENTES' | empresa_id }
function gerarRelatorio(token, filtros) {
  exigirTela_(token, 'relatorios');
  filtros = filtros || {};

  const inicio = validarDataFormulario_(filtros.inicio);
  const fim = validarDataFormulario_(filtros.fim);

  if (fim < inicio) throw new Error('A data final precisa ser igual ou depois da data inicial.');

  const dias = Math.round((converterDataFormulario(fim) - converterDataFormulario(inicio)) / 86400000) + 1;
  if (dias > MAXIMO_DIAS_RELATORIO) throw new Error('Escolha um período de até 1 ano.');

  const empresa = String(filtros.empresa || '').trim();

  if (empresa && empresa !== FILTRO_CLIENTES_SEM_CADASTRO &&
      !lerEmpresas_().lista.some(e => e.empresa_id === empresa) &&
      !lerEmpresasExcluidas_().some(e => e.empresa_id === empresa)) {
    throw new Error('Empresa não encontrada.');
  }

  return montarRelatorio_(inicio, fim, empresa);
}

// idsPedidos (opcional): usa somente estes pedidos (extrato de uma cobrança)
function montarRelatorio_(inicio, fim, filtroEmpresa, idsPedidos) {
  const nomesEmpresas = nomesEmpresasComExcluidas_();

  const pedidos = lerPedidos_().lista.filter(p => {
    if (idsPedidos && !idsPedidos[p.pedido_id]) return false;
    if (p.data_entrega < inicio || p.data_entrega > fim) return false;
    if (p.status !== 'CONFIRMADO' && p.status !== 'ENVIADO') return false;
    if (filtroEmpresa === FILTRO_CLIENTES_SEM_CADASTRO) return !p.empresa_id;
    if (filtroEmpresa) return p.empresa_id === filtroEmpresa;
    return true;
  });

  const resultado = {
    inicio: inicio,
    fim: fim,
    empresa: filtroEmpresa,
    nome_filtro: filtroEmpresa === FILTRO_CLIENTES_SEM_CADASTRO
      ? 'Clientes sem cadastro'
      : (filtroEmpresa ? nomesEmpresas[filtroEmpresa] || '' : 'Todas as empresas'),
    gerado_em: new Date().getTime(),
    totais: { quentinhas: 0, valor: 0, pedidos: pedidos.length, dias: 0, pendentes: 0, alteradas: 0 },
    por_empresa: [],
    por_dia: [],
    por_funcionario: [],
    por_proteina: [],
    itens: []
  };

  if (!pedidos.length) return resultado;

  const pedidoPorId = {};
  pedidos.forEach(p => {
    pedidoPorId[p.pedido_id] = p;
    if (p.status === 'ENVIADO') resultado.totais.pendentes++;
  });

  const funcionarios = funcionariosComExcluidos_();

  // Uma leitura só da aba de itens
  const abaItens = abrirPlanilha_().getSheetByName('ITENS_PEDIDOS');
  const ultima = abaItens.getLastRow();
  const linhas = ultima < 2 ? [] : abaItens.getRange(2, 1, ultima - 1, TOTAL_COLUNAS_ITENS).getValues();

  const empresas = {};
  const diasMapa = {};
  const pessoas = {};
  const proteinas = {};

  linhas.forEach(l => {
    const pedido = pedidoPorId[String(l[1])];
    if (!pedido) return;

    const item = itemParaNavegador_(l);
    const valor = Number(l[8]) || item.preco_unitario;
    const clienteAvulso = !pedido.empresa_id;
    const nomeEmpresa = clienteAvulso ? pedido.cliente_nome : (nomesEmpresas[pedido.empresa_id] || 'Empresa removida');
    const funcionario = item.funcionario_id ? funcionarios[item.funcionario_id] : null;
    const alterada = !!(item.itens_removidos.length || item.observacao);

    resultado.totais.quentinhas++;
    resultado.totais.valor += valor;
    if (alterada) resultado.totais.alteradas++;

    // Por empresa (clientes sem cadastro: um por nome)
    const chaveEmpresa = clienteAvulso ? 'CLI:' + normalizarNome_(pedido.cliente_nome) : pedido.empresa_id;
    if (!empresas[chaveEmpresa]) {
      empresas[chaveEmpresa] = {
        nome: nomeEmpresa,
        cliente_avulso: clienteAvulso,
        quentinhas: 0,
        valor: 0,
        pedidos: {},
        dias: {}
      };
    }
    const grupoEmpresa = empresas[chaveEmpresa];
    grupoEmpresa.quentinhas++;
    grupoEmpresa.valor += valor;
    grupoEmpresa.pedidos[pedido.pedido_id] = true;
    grupoEmpresa.dias[pedido.data_entrega] = true;

    // Por dia
    if (!diasMapa[pedido.data_entrega]) {
      diasMapa[pedido.data_entrega] = { data: pedido.data_entrega, quentinhas: 0, valor: 0, pedidos: {} };
    }
    const grupoDia = diasMapa[pedido.data_entrega];
    grupoDia.quentinhas++;
    grupoDia.valor += valor;
    grupoDia.pedidos[pedido.pedido_id] = true;

    // Por funcionário (avulsas e clientes: pelo nome)
    const chavePessoa = chaveEmpresa + '|' + (item.funcionario_id || 'NOME:' + normalizarNome_(item.nome));
    if (!pessoas[chavePessoa]) {
      pessoas[chavePessoa] = {
        empresa: nomeEmpresa,
        cliente_avulso: clienteAvulso,
        nome: funcionario ? funcionario.nome : item.nome,
        setor: funcionario ? funcionario.setor : '',
        matricula: funcionario ? funcionario.matricula : '',
        avulsa: !item.funcionario_id && !clienteAvulso,
        quentinhas: 0,
        valor: 0,
        alteradas: 0,
        dias: {}
      };
    }
    const grupoPessoa = pessoas[chavePessoa];
    grupoPessoa.quentinhas++;
    grupoPessoa.valor += valor;
    if (alterada) grupoPessoa.alteradas++;
    grupoPessoa.dias[pedido.data_entrega] = true;

    // Por proteína
    proteinas[item.proteina] = (proteinas[item.proteina] || 0) + 1;

    // Lista detalhada (para o Excel)
    resultado.itens.push({
      data: pedido.data_entrega,
      empresa: nomeEmpresa,
      cliente_avulso: clienteAvulso,
      nome: grupoPessoa.nome,
      setor: grupoPessoa.setor,
      matricula: grupoPessoa.matricula,
      proteina: item.proteina,
      opcao_extra: item.opcao_extra,
      alteracao: (item.itens_removidos.length ? 'Sem ' + item.itens_removidos.join(', ').toLowerCase() : '') +
        (item.itens_removidos.length && item.observacao ? ' · ' : '') + item.observacao,
      situacao: pedido.status === 'CONFIRMADO' ? 'Confirmado' : 'Aguardando confirmação',
      valor: arredondar_(valor)
    });
  });

  const contar = objeto => Object.keys(objeto).length;
  const ordenarNome = (a, b) => a.localeCompare(b, 'pt-BR');

  resultado.totais.valor = arredondar_(resultado.totais.valor);
  resultado.totais.dias = contar(diasMapa);

  resultado.por_empresa = Object.keys(empresas).map(chave => {
    const g = empresas[chave];
    return {
      nome: g.nome,
      cliente_avulso: g.cliente_avulso,
      quentinhas: g.quentinhas,
      valor: arredondar_(g.valor),
      pedidos: contar(g.pedidos),
      dias: contar(g.dias),
      preco_medio: arredondar_(g.valor / g.quentinhas)
    };
  }).sort((a, b) => (a.cliente_avulso - b.cliente_avulso) || ordenarNome(a.nome, b.nome));

  resultado.por_dia = Object.keys(diasMapa).sort().map(data => {
    const g = diasMapa[data];
    return {
      data: data,
      dia_semana: nomeDoDia_(data),
      quentinhas: g.quentinhas,
      valor: arredondar_(g.valor),
      pedidos: contar(g.pedidos)
    };
  });

  resultado.por_funcionario = Object.keys(pessoas).map(chave => {
    const g = pessoas[chave];
    return {
      empresa: g.empresa,
      cliente_avulso: g.cliente_avulso,
      nome: g.nome,
      setor: g.setor,
      matricula: g.matricula,
      avulsa: g.avulsa,
      quentinhas: g.quentinhas,
      valor: arredondar_(g.valor),
      alteradas: g.alteradas,
      dias: contar(g.dias)
    };
  }).sort((a, b) =>
    (a.cliente_avulso - b.cliente_avulso) || ordenarNome(a.empresa, b.empresa) ||
    (a.avulsa - b.avulsa) || ordenarNome(a.nome, b.nome)
  );

  resultado.por_proteina = Object.keys(proteinas)
    .map(nome => ({ nome: nome, quentinhas: proteinas[nome] }))
    .sort((a, b) => b.quentinhas - a.quentinhas);

  resultado.itens.sort((a, b) =>
    a.data.localeCompare(b.data) || (a.cliente_avulso - b.cliente_avulso) ||
    ordenarNome(a.empresa, b.empresa) || ordenarNome(a.nome, b.nome)
  );

  return resultado;
}

function arredondar_(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}
