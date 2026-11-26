// ================================================================
// PRECOS.gs
// Preços por empresa, com vigência (início e fim) e histórico.
// ================================================================

// Posição das colunas da aba PRECOS (1 = coluna A)
const COLUNAS_PRECOS = {
  ID: 1,
  EMPRESA: 2,
  TIPO: 3,
  VALOR: 4,
  INICIO: 5,
  FIM: 6,
  STATUS: 7
};

// LER TODOS OS PREÇOS DA PLANILHA
// (do cache, quando possível)
// O fuso do script deve ser igual ao da planilha (verificarEstrutura confere).
function lerPrecos_() {
  const fuso = Session.getScriptTimeZone();
  const dados = lerAba_('PRECOS');
  const lista = [];

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];
    if (!linha[0]) continue;

    lista.push({
      linha: i + 1,
      preco_id: String(linha[0]),
      empresa_id: String(linha[1]),
      tipo_quentinha: String(linha[2] || 'Normal'),
      valor_unitario: Number(linha[3]) || 0,
      data_inicio: dataParaTexto_(linha[4], fuso),
      data_fim: dataParaTexto_(linha[5], fuso),
      ativo: String(linha[6]).trim().toUpperCase() === 'ATIVO'
    });
  }

  return {
    get aba() { return obterAba_('PRECOS'); },
    fuso: fuso,
    lista: lista
  };
}

// VERIFICAR SE DOIS PERÍODOS SE SOBREPÕEM (datas iguais também contam)
function periodosSobrepostos_(inicioA, fimA, inicioB, fimB) {
  return (
    inicioA <= (fimB || DATA_SEM_FIM) &&
    inicioB <= (fimA || DATA_SEM_FIM)
  );
}

// PROCURAR PREÇO ATIVO QUE CONFLITE COM O PERÍODO INFORMADO
function buscarConflitoPreco_(lista, empresaId, inicio, fim, ignorarPrecoId) {
  return lista.find(preco =>
    preco.ativo &&
    preco.empresa_id === empresaId &&
    preco.preco_id !== ignorarPrecoId &&
    preco.data_inicio &&
    periodosSobrepostos_(inicio, fim, preco.data_inicio, preco.data_fim)
  ) || null;
}

// PREÇO VIGENTE DE UMA EMPRESA EM UMA DATA (aaaa-mm-dd)
// Será usado também pelo módulo de pedidos.
function precoVigente_(lista, empresaId, dataTexto) {
  return lista.find(preco =>
    preco.ativo &&
    preco.empresa_id === empresaId &&
    preco.data_inicio &&
    preco.data_inicio <= dataTexto &&
    (!preco.data_fim || preco.data_fim >= dataTexto)
  ) || null;
}

// MONTAR MENSAGEM DE CONFLITO
function mensagemConflito_(preco) {
  return 'Já existe um preço ativo de ' + formatarMoeda_(preco.valor_unitario) +
    ' para essa empresa, de ' + formatarDataBR_(preco.data_inicio) +
    ' até ' + formatarDataBR_(preco.data_fim) + '.';
}

// CADASTRAR PREÇO
function salvarPreco(token, dados) {
  const sessao = exigirFuncao_(token, 'precos_editar');

  if (!dados) {
    throw new Error('Dados do preço não informados.');
  }

  const empresaId = String(dados.empresa_id || '').trim();

  if (!empresaId) {
    throw new Error('Selecione uma empresa.');
  }

  const valor = converterValor_(dados.valor_unitario);
  const inicio = validarDataFormulario_(dados.data_inicio);
  const fim = dados.data_fim ? validarDataFormulario_(dados.data_fim) : '';

  if (fim && fim < inicio) {
    throw new Error('A data final não pode ser anterior à data inicial.');
  }

  return comBloqueio_(() => {
    const planilha = abrirPlanilha_();

    const empresa = lerEmpresas_(planilha).lista.find(e =>
      e.empresa_id === empresaId && e.status === 'ATIVO'
    );

    if (!empresa) {
      throw new Error('Empresa não encontrada ou inativa.');
    }

    const precos = lerPrecos_(planilha);
    const conflito = buscarConflitoPreco_(precos.lista, empresaId, inicio, fim, null);

    if (conflito) {
      throw new Error(
        mensagemConflito_(conflito) +
        ' Para reajustar, encerre esse período e cadastre o novo preço a partir do dia seguinte.'
      );
    }

    const precoId = 'PRE-' + Utilities.getUuid();

    precos.aba.appendRow([
      precoId,
      empresaId,
      'Normal',
      valor,
      converterDataFormulario(inicio),
      fim ? converterDataFormulario(fim) : '',
      'ATIVO'
    ]);

    registrarLog_(planilha, sessao, empresaId, 'CRIAR_PRECO',
      'Preço ' + formatarMoeda_(valor) + ' de ' + formatarDataBR_(inicio) +
      ' até ' + formatarDataBR_(fim) + ' (' + precoId + ')');

    return {
      sucesso: true,
      mensagem: 'Preço de ' + formatarMoeda_(valor) + ' cadastrado para ' + empresa.nome_empresa + '.',
      preco_id: precoId,
      empresa_id: empresaId,
      precos: montarListaPrecos_(empresaId),
      empresa: resumoEmpresa_(empresaId)
    };
  });
}

// ENCERRAR (OU ALTERAR A DATA FINAL DE) UM PREÇO
function encerrarPreco(token, precoId, dataFim) {
  const sessao = exigirFuncao_(token, 'precos_editar');

  precoId = String(precoId || '').trim();

  if (!precoId) {
    throw new Error('Preço não informado.');
  }

  if (!dataFim) {
    throw new Error('Informe a data final da vigência.');
  }

  const fim = validarDataFormulario_(dataFim);

  return comBloqueio_(() => {
    const planilha = abrirPlanilha_();
    const precos = lerPrecos_(planilha);
    const preco = precos.lista.find(p => p.preco_id === precoId);

    if (!preco) {
      throw new Error('Preço não encontrado.');
    }

    if (!preco.ativo) {
      throw new Error('Este preço está inativo e não pode ser alterado.');
    }

    if (!preco.data_inicio) {
      throw new Error('Este preço está com a data de início inválida na planilha. Corrija a aba PRECOS.');
    }

    if (fim < preco.data_inicio) {
      throw new Error(
        'A data final não pode ser anterior ao início da vigência (' +
        formatarDataBR_(preco.data_inicio) + ').'
      );
    }

    const conflito = buscarConflitoPreco_(
      precos.lista,
      preco.empresa_id,
      preco.data_inicio,
      fim,
      preco.preco_id
    );

    if (conflito) {
      throw new Error(
        mensagemConflito_(conflito) +
        ' A nova data final se sobreporia a esse período.'
      );
    }

    precos.aba
      .getRange(preco.linha, COLUNAS_PRECOS.FIM)
      .setValue(converterDataFormulario(fim));

    registrarLog_(planilha, sessao, preco.empresa_id, 'ENCERRAR_PRECO',
      'Preço ' + preco.preco_id + ': fim alterado de ' +
      formatarDataBR_(preco.data_fim) + ' para ' + formatarDataBR_(fim));

    // Verifica se já existe um preço cadastrado a partir do dia seguinte
    const diaSeguinte = proximoDiaTexto_(fim);
    const outrosPrecos = precos.lista.filter(p => p.preco_id !== preco.preco_id);
    const temSucessor = !!precoVigente_(outrosPrecos, preco.empresa_id, diaSeguinte);

    return {
      sucesso: true,
      mensagem: 'Vigência encerrada em ' + formatarDataBR_(fim) + '.',
      empresa_id: preco.empresa_id,
      data_fim: fim,
      proximo_dia: diaSeguinte,
      tem_sucessor: temSucessor,
      precos: montarListaPrecos_(preco.empresa_id),
      empresa: resumoEmpresa_(preco.empresa_id)
    };
  });
}

// INATIVAR UM PREÇO (para corrigir cadastros feitos por engano)
function inativarPreco(token, precoId) {
  const sessao = exigirFuncao_(token, 'precos_editar');

  precoId = String(precoId || '').trim();

  if (!precoId) {
    throw new Error('Preço não informado.');
  }

  return comBloqueio_(() => {
    const planilha = abrirPlanilha_();
    const precos = lerPrecos_(planilha);
    const preco = precos.lista.find(p => p.preco_id === precoId);

    if (!preco) {
      throw new Error('Preço não encontrado.');
    }

    if (!preco.ativo) {
      throw new Error('Este preço já está inativo.');
    }

    precos.aba
      .getRange(preco.linha, COLUNAS_PRECOS.STATUS)
      .setValue('INATIVO');

    registrarLog_(planilha, sessao, preco.empresa_id, 'INATIVAR_PRECO',
      'Preço ' + preco.preco_id + ' de ' + formatarMoeda_(preco.valor_unitario) +
      ' (' + formatarDataBR_(preco.data_inicio) + ' até ' +
      formatarDataBR_(preco.data_fim) + ') inativado');

    return {
      sucesso: true,
      mensagem: 'Preço inativado.',
      empresa_id: preco.empresa_id,
      precos: montarListaPrecos_(preco.empresa_id),
      empresa: resumoEmpresa_(preco.empresa_id)
    };
  });
}

// LISTAR HISTÓRICO DE PREÇOS
function listarPrecos(token, empresaId) {
  exigirTela_(token, 'precos');
  return montarListaPrecos_(String(empresaId || '').trim());
}

// MONTAR O HISTÓRICO (todas as empresas, ou só uma)
function montarListaPrecos_(empresaId) {
  const nomes = {};

  lerEmpresas_().lista.forEach(empresa => {
    nomes[empresa.empresa_id] = empresa.nome_empresa;
  });

  const precos = lerPrecos_();
  const hoje = hojeTexto_(precos.fuso);

  return precos.lista
    .filter(preco => !empresaId || preco.empresa_id === empresaId)
    .map(preco => {
      let situacao;

      if (!preco.ativo) {
        situacao = 'INATIVO';
      } else if (!preco.data_inicio) {
        situacao = 'ERRO';
      } else if (hoje < preco.data_inicio) {
        situacao = 'FUTURO';
      } else if (preco.data_fim && hoje > preco.data_fim) {
        situacao = 'ENCERRADO';
      } else {
        situacao = 'VIGENTE';
      }

      return {
        preco_id: preco.preco_id,
        empresa_id: preco.empresa_id,
        nome_empresa: nomes[preco.empresa_id] || 'Empresa não identificada',
        tipo_quentinha: preco.tipo_quentinha,
        valor_unitario: preco.valor_unitario,
        data_inicio: preco.data_inicio,
        data_fim: preco.data_fim,
        status: situacao
      };
    })
    .sort((a, b) => {
      const empresaComparacao = a.nome_empresa.localeCompare(b.nome_empresa, 'pt-BR');
      if (empresaComparacao !== 0) return empresaComparacao;
      return b.data_inicio.localeCompare(a.data_inicio);
    });
}
