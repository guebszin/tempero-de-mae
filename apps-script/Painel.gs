// ================================================================
// PAINEL.gs
// Resumos das telas iniciais e dados carregados junto com o login.
// ================================================================

// DADOS QUE JÁ VÃO JUNTO COM O LOGIN
// Assim, as primeiras telas abrem sem precisar ir ao servidor de novo.
function carregarDadosIniciais_(sessao) {
  try {
    if (sessao.perfil === 'admin') {
      return {
        empresas: montarListaEmpresas_(),
        resumo: montarResumoAdmin_()
      };
    }

    return {
      funcionarios: funcionariosDaEmpresa_(sessao.empresa_id),
      resumo: montarResumoEmpresa_(sessao)
    };
  } catch (erro) {
    // Se algo falhar aqui, o login continua; as telas buscam os dados depois.
    Logger.log('Falha ao carregar dados iniciais: ' + erro.message);
    return null;
  }
}

// RESUMO DO RESTAURANTE
function obterResumoAdmin(token) {
  validarAdministrador(token);
  return montarResumoAdmin_();
}

function montarResumoAdmin_() {
  const empresas = lerEmpresas_().lista;
  const precos = lerPrecos_();
  const funcionarios = lerFuncionarios_().lista;

  const hoje = hojeTexto_(precos.fuso);
  const limite = hojeTexto_(precos.fuso, 15);

  const ativas = empresas.filter(e => e.status === 'ATIVO');
  const idsAtivas = {};
  ativas.forEach(e => { idsAtivas[e.empresa_id] = e; });

  const funcionariosAtivos = funcionarios.filter(f =>
    f.status === 'ATIVO' && idsAtivas[f.empresa_id]
  ).length;

  // Empresas ativas sem preço para hoje (não poderão fazer pedidos)
  const semPreco = ativas
    .filter(e => !precoVigente_(precos.lista, e.empresa_id, hoje))
    .map(e => ({ empresa_id: e.empresa_id, nome_empresa: e.nome_empresa }));

  // Preços que terminam nos próximos 15 dias sem reajuste já cadastrado
  const vencendo = precos.lista
    .filter(p =>
      p.ativo &&
      idsAtivas[p.empresa_id] &&
      p.data_fim &&
      p.data_fim >= hoje &&
      p.data_fim <= limite &&
      !precoVigente_(
        precos.lista.filter(outro => outro.preco_id !== p.preco_id),
        p.empresa_id,
        proximoDiaTexto_(p.data_fim)
      )
    )
    .map(p => ({
      empresa_id: p.empresa_id,
      nome_empresa: idsAtivas[p.empresa_id].nome_empresa,
      valor_unitario: p.valor_unitario,
      data_fim: p.data_fim,
      proximo_dia: proximoDiaTexto_(p.data_fim)
    }));

  return {
    empresas_ativas: ativas.length,
    empresas_inativas: empresas.length - ativas.length,
    funcionarios_ativos: funcionariosAtivos,
    empresas_com_preco: ativas.length - semPreco.length,
    sem_preco: semPreco,
    vencendo: vencendo,
    cardapio: resumoCardapioAdmin_(),
    pedidos: resumoPedidosAdmin_()
  };
}

// RESUMO DA EMPRESA
function obterResumoEmpresa(token) {
  const acesso = validarUsuarioEmpresa_(token);
  return montarResumoEmpresa_(acesso.sessao, acesso.nome_empresa);
}

function montarResumoEmpresa_(sessao, nomeEmpresa) {
  const empresaId = sessao.empresa_id;

  const funcionarios = lerFuncionarios_().lista.filter(f =>
    f.empresa_id === empresaId && f.status === 'ATIVO'
  );

  const precos = lerPrecos_();
  const hoje = hojeTexto_(precos.fuso);
  const preco = precoVigente_(precos.lista, empresaId, hoje);
  const config = configDaEmpresaPorId_(empresaId);

  return {
    nome_empresa: nomeEmpresa || sessao.nome_empresa || '',
    responsavel: sessao.nome,
    funcionarios_ativos: funcionarios.length,
    autorizados_alterar: funcionarios.filter(f => f.pode_alterar_quentinha).length,
    escolha: config.escolha,
    mostrar_precos: config.mostrar_precos,
    preco_vigente: preco && config.mostrar_precos ? {
      valor_unitario: preco.valor_unitario,
      data_inicio: preco.data_inicio,
      data_fim: preco.data_fim
    } : null,
    cardapio_destaque: cardapioEmDestaque_(),
    pedido_hoje: resumoPedidoEmpresa_(empresaId)
  };
}
