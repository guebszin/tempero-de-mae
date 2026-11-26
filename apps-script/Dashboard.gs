// ================================================================
// DASHBOARD.gs
// Resumo em gráficos para o dono do restaurante (ou para quem ele
// liberar em Sistema › Acessos). Tudo calculado sobre os pedidos
// enviados e confirmados do período (cancelados e recusados não entram).
// ================================================================
const PERIODOS_DASHBOARD = {
  SETE_DIAS: 'Últimos 7 dias',
  ESTE_MES: 'Este mês',
  MES_PASSADO: 'Mês passado',
  ESTE_ANO: 'Este ano'
};

const FATIAS_DASHBOARD = 5;   // as 5 maiores + "Outras"

function obterDashboard(token, periodo) {
  exigirTela_(token, 'dashboard');

  periodo = PERIODOS_DASHBOARD[periodo] ? periodo : 'ESTE_MES';
  const fuso = Session.getScriptTimeZone();
  const hoje = hojeTexto_(fuso);
  const intervalo = intervaloDashboard_(periodo, hoje);

  const relatorio = montarRelatorio_(intervalo.inicio, intervalo.fim, '', null);
  const empresas = relatorio.por_empresa;

  return {
    periodo: periodo,
    periodos: PERIODOS_DASHBOARD,
    inicio: intervalo.inicio,
    fim: intervalo.fim,
    totais: {
      quentinhas: relatorio.totais.quentinhas,
      valor: relatorio.totais.valor,
      pedidos: relatorio.totais.pedidos,
      dias: relatorio.totais.dias,
      ticket: relatorio.totais.quentinhas ? arredondar_(relatorio.totais.valor / relatorio.totais.quentinhas) : 0
    },
    quentinhas_por_empresa: agruparFatias_(empresas.map(e => ({ nome: e.nome, valor: e.quentinhas }))),
    faturamento_por_empresa: agruparFatias_(empresas.map(e => ({ nome: e.nome, valor: e.valor }))),
    proteinas: agruparFatias_(relatorio.por_proteina.map(p => ({ nome: p.nome, valor: p.quentinhas }))),
    situacao: moduloCobrancasAtivo_() ? situacaoDoValor_(intervalo.inicio, intervalo.fim, hoje) : null
  };
}

function intervaloDashboard_(periodo, hoje) {
  const [ano, mes, dia] = hoje.split('-').map(Number);
  const texto = d => Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
  const data = (a, m, d) => new Date(Date.UTC(a, m - 1, d));

  if (periodo === 'SETE_DIAS') return { inicio: texto(data(ano, mes, dia - 6)), fim: hoje };
  if (periodo === 'MES_PASSADO') return { inicio: texto(data(ano, mes - 1, 1)), fim: texto(data(ano, mes, 0)) };
  if (periodo === 'ESTE_ANO') return { inicio: ano + '-01-01', fim: hoje };
  return { inicio: texto(data(ano, mes, 1)), fim: hoje };
}

// As maiores fatias, o resto somado em "Outras" (cores fixas por posição)
function agruparFatias_(lista) {
  const ordenada = lista.filter(x => x.valor > 0).sort((a, b) => b.valor - a.valor);
  if (ordenada.length <= FATIAS_DASHBOARD + 1) return ordenada.map(x => ({ nome: x.nome, valor: arredondar_(x.valor) }));

  const principais = ordenada.slice(0, FATIAS_DASHBOARD).map(x => ({ nome: x.nome, valor: arredondar_(x.valor) }));
  const resto = ordenada.slice(FATIAS_DASHBOARD);
  principais.push({
    nome: 'Outras (' + resto.length + ')',
    valor: arredondar_(resto.reduce((s, x) => s + x.valor, 0)),
    outras: true
  });
  return principais;
}

// Para onde foi o valor dos pedidos de empresas do período:
// recebido, a receber, vencido, desconto ou ainda não cobrado.
// Cada pedido leva a parte proporcional da cobrança em que entrou.
function situacaoDoValor_(inicio, fim, hoje) {
  const cobrancas = {};
  lerCobrancas_().lista.forEach(c => { cobrancas[c.cobranca_id] = c; });

  const soma = { recebido: 0, a_receber: 0, vencido: 0, desconto: 0, nao_cobrado: 0 };

  lerPedidos_().lista.forEach(p => {
    if (!pedidoCobravel_(p) || p.data_entrega < inicio || p.data_entrega > fim) return;

    const c = p.cobranca_id ? cobrancas[p.cobranca_id] : null;
    if (!c || c.status === 'CANCELADA' || !c.valor_total) {
      soma.nao_cobrado += p.valor_total;
      return;
    }

    const parte = p.valor_total / c.valor_total;
    const saldo = Math.max(0, c.valor_liquido - c.valor_pago);
    soma.recebido += parte * Math.min(c.valor_pago, c.valor_liquido);
    soma.desconto += parte * c.desconto;
    if (c.data_vencimento && c.data_vencimento < hoje) soma.vencido += parte * saldo;
    else soma.a_receber += parte * saldo;
  });

  return [
    { chave: 'recebido', nome: 'Recebido', valor: arredondar_(soma.recebido) },
    { chave: 'a_receber', nome: 'A receber (no prazo)', valor: arredondar_(soma.a_receber) },
    { chave: 'vencido', nome: 'Vencido', valor: arredondar_(soma.vencido) },
    { chave: 'nao_cobrado', nome: 'Ainda não cobrado', valor: arredondar_(soma.nao_cobrado) },
    { chave: 'desconto', nome: 'Descontos', valor: arredondar_(soma.desconto) }
  ].filter(x => x.valor > 0);
}
