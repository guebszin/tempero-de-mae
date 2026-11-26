// ================================================================
// CARDAPIOS.gs
// Cardápio semanal (segunda a domingo), montado pelo restaurante.
// Cada dia pode ser fechado (feriado, folga): sem cardápio e sem pedidos.
// Sábado e domingo começam fechados; o restaurante abre quando atender.
// Cada dia tem 4 grupos: acompanhamentos, saladas, guarnições e
// proteínas (o funcionário escolhe uma), mais uma opção extra gratuita.
// A semana fica em RASCUNHO até ser PUBLICADA; só então as empresas veem.
// ================================================================

// Posição das colunas da aba CARDAPIOS (1 = coluna A)
const COLUNAS_CARDAPIOS = {
  ID: 1,
  DATA: 2,
  DIA: 3,
  ACOMPANHAMENTOS: 4,
  SALADAS: 5,
  GUARNICOES: 6,
  PROTEINAS: 7,
  EXTRA: 8,
  OBSERVACOES: 9,
  STATUS: 10,
  FECHADO: 11      // SIM = fechado · NAO = aberto · vazio = padrão do dia
};

const DIAS_SEMANA_CARDAPIO = 7;   // segunda a domingo

const GRUPOS_CARDAPIO = ['acompanhamentos', 'saladas', 'guarnicoes', 'proteinas'];

const NOMES_GRUPOS_CARDAPIO = {
  acompanhamentos: 'Acompanhamento',
  saladas: 'Salada',
  guarnicoes: 'Guarnição',
  proteinas: 'Proteína'
};

const NOMES_DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

// Sugestões iniciais, antes de existir histórico de cardápios
const ITENS_SUGERIDOS = {
  acompanhamentos: ['Arroz', 'Feijão', 'Macarrão', 'Farofa'],
  saladas: ['Alface', 'Tomate', 'Pepino'],
  guarnicoes: [],
  proteinas: []
};

const MAXIMO_ITENS_GRUPO = 15;

// ----------------------------------------------------------------
// LEITURA
// ----------------------------------------------------------------

// LER TODOS OS CARDÁPIOS (do cache, quando possível)
function lerCardapios_() {
  const fuso = Session.getScriptTimeZone();
  const dados = lerAba_('CARDAPIOS');
  const lista = [];

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];
    if (!linha[0]) continue;

    lista.push({
      linha: i + 1,
      cardapio_id: String(linha[0]),
      data: dataParaTexto_(linha[1], fuso),
      acompanhamentos: separarItens_(linha[3]),
      saladas: separarItens_(linha[4]),
      guarnicoes: separarItens_(linha[5]),
      proteinas: separarItens_(linha[6]),
      opcao_extra: String(linha[7] || '').trim(),
      observacoes: String(linha[8] || '').trim(),
      status: String(linha[9]).trim().toUpperCase() === 'PUBLICADO' ? 'PUBLICADO' : 'RASCUNHO',
      marca_fechado: String(linha[10] || '').trim().toUpperCase()
    });
    lista[lista.length - 1].fechado = diaFechado_(lista[lista.length - 1], lista[lista.length - 1].data);
  }

  return {
    get aba() { return obterAba_('CARDAPIOS'); },
    lista: lista
  };
}

// Os itens de cada grupo ficam na mesma célula, um por linha
function separarItens_(texto) {
  return String(texto || '')
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);
}

// ----------------------------------------------------------------
// DATAS
// ----------------------------------------------------------------

function textoDeData_(data) {
  return data.getFullYear() + '-' +
    String(data.getMonth() + 1).padStart(2, '0') + '-' +
    String(data.getDate()).padStart(2, '0');
}

function somarDiasTexto_(texto, dias) {
  const data = converterDataFormulario(texto);
  data.setDate(data.getDate() + dias);
  return textoDeData_(data);
}

// Segunda-feira da semana de uma data (aaaa-mm-dd)
function segundaDaSemana_(texto) {
  const data = converterDataFormulario(texto);
  const diaSemana = data.getDay(); // 0 = domingo
  data.setDate(data.getDate() + (diaSemana === 0 ? -6 : 1 - diaSemana));
  return textoDeData_(data);
}

function nomeDoDia_(texto) {
  return NOMES_DIAS[converterDataFormulario(texto).getDay()];
}

function fimDeSemana_(texto) {
  const dia = converterDataFormulario(texto).getDay();
  return dia === 0 || dia === 6;
}

// Dia fechado? Marcação do restaurante; sem marcação, sábado e domingo
// ficam fechados e os outros dias abertos.
function diaFechado_(cardapio, dataTexto) {
  const marca = cardapio ? cardapio.marca_fechado : '';
  if (marca === 'SIM') return true;
  if (marca === 'NAO') return false;
  return fimDeSemana_(dataTexto);
}

// O dia está fechado? (consulta a planilha; usado nos pedidos)
function diaFechadoNaData_(dataTexto) {
  const cardapio = lerCardapios_().lista.find(c => c.data === dataTexto) || null;
  return { fechado: diaFechado_(cardapio, dataTexto), observacoes: cardapio ? cardapio.observacoes : '' };
}

// ----------------------------------------------------------------
// MONTAGEM DA SEMANA
// ----------------------------------------------------------------

function diaTemConteudo_(dia) {
  return GRUPOS_CARDAPIO.some(grupo => dia[grupo] && dia[grupo].length > 0);
}

function diaParaNavegador_(cardapio, dataTexto) {
  return {
    data: dataTexto,
    dia_semana: nomeDoDia_(dataTexto),
    existe: !!cardapio,
    acompanhamentos: cardapio ? cardapio.acompanhamentos : [],
    saladas: cardapio ? cardapio.saladas : [],
    guarnicoes: cardapio ? cardapio.guarnicoes : [],
    proteinas: cardapio ? cardapio.proteinas : [],
    opcao_extra: cardapio ? cardapio.opcao_extra : '',
    observacoes: cardapio ? cardapio.observacoes : '',
    status: cardapio ? cardapio.status : 'RASCUNHO',
    fechado: diaFechado_(cardapio, dataTexto)
  };
}

// Situação de uma semana: VAZIA, RASCUNHO ou PUBLICADO
function situacaoDaSemana_(dias) {
  const preenchidos = dias.filter(dia => dia.existe && !dia.fechado && (diaTemConteudo_(dia) || dia.observacoes));

  if (!preenchidos.length) return 'VAZIA';
  if (preenchidos.some(dia => dia.status === 'PUBLICADO')) return 'PUBLICADO';
  return 'RASCUNHO';
}

// Monta os 7 dias (segunda a domingo) de uma semana
function montarSemana_(segunda, somentePublicados) {
  const lista = lerCardapios_().lista;
  const domingo = somarDiasTexto_(segunda, DIAS_SEMANA_CARDAPIO - 1);
  const dias = [];

  for (let i = 0; i < DIAS_SEMANA_CARDAPIO; i++) {
    const dataTexto = somarDiasTexto_(segunda, i);
    let cardapio = lista.find(c => c.data === dataTexto) || null;

    // Empresas: rascunho não aparece, mas "fechado" sim (é um aviso)
    if (somentePublicados && cardapio && cardapio.status !== 'PUBLICADO') {
      cardapio = cardapio.fechado
        ? { acompanhamentos: [], saladas: [], guarnicoes: [], proteinas: [], opcao_extra: '',
            observacoes: cardapio.observacoes, status: 'RASCUNHO', marca_fechado: 'SIM' }
        : null;
    }

    const dia = diaParaNavegador_(cardapio, dataTexto);

    // Dia fechado: as empresas não veem o cardápio guardado
    if (somentePublicados && dia.fechado) {
      GRUPOS_CARDAPIO.forEach(grupo => { dia[grupo] = []; });
      dia.opcao_extra = '';
    }

    dias.push(dia);
  }

  return {
    segunda: segunda,
    domingo: domingo,
    status: situacaoDaSemana_(dias),
    versao: assinaturaSemana_(dias),
    dias: dias
  };
}

// "Impressão digital" do conteúdo da semana. Se duas telas estiverem
// editando a mesma semana, a que estiver desatualizada não sobrescreve
// o que a outra salvou.
function assinaturaSemana_(dias) {
  const conteudo = dias.map(dia => [
    (dia.acompanhamentos || []).join('|'),
    (dia.saladas || []).join('|'),
    (dia.guarnicoes || []).join('|'),
    (dia.proteinas || []).join('|'),
    dia.opcao_extra || '',
    dia.observacoes || '',
    dia.fechado ? 'F' : ''
  ].join('¦'));

  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(conteudo))
  ).slice(0, 16);
}

// Itens mais usados em cada grupo (para marcar com um clique)
function itensFrequentes_() {
  const lista = lerCardapios_().lista;
  const resultado = {};

  GRUPOS_CARDAPIO.forEach(grupo => {
    const contagem = {};
    const nomes = {};

    lista.forEach(cardapio => {
      cardapio[grupo].forEach(item => {
        const chave = normalizarNome_(item);
        contagem[chave] = (contagem[chave] || 0) + 1;
        nomes[chave] = nomes[chave] || item;
      });
    });

    const ordenados = Object.keys(contagem)
      .sort((a, b) => contagem[b] - contagem[a] || nomes[a].localeCompare(nomes[b], 'pt-BR'))
      .slice(0, 25)
      .map(chave => nomes[chave]);

    ITENS_SUGERIDOS[grupo].forEach(item => {
      if (!contagem[normalizarNome_(item)]) ordenados.push(item);
    });

    resultado[grupo] = ordenados;
  });

  return resultado;
}

// ----------------------------------------------------------------
// RESTAURANTE
// ----------------------------------------------------------------

// ABRIR UMA SEMANA PARA EDIÇÃO (data = qualquer dia da semana)
function obterSemanaCardapio(token, data) {
  exigirTela_(token, 'cardapios');

  const fuso = Session.getScriptTimeZone();
  const referencia = data ? validarDataFormulario_(data) : hojeTexto_(fuso);
  const semana = montarSemana_(segundaDaSemana_(referencia), false);

  semana.itens_frequentes = itensFrequentes_();
  return semana;
}

// LIMPAR A LISTA DE ITENS DE UM GRUPO
function limparItensCardapio_(itens, nomeGrupo) {
  if (!Array.isArray(itens)) itens = [];

  const vistos = {};
  const limpos = [];

  itens.forEach(item => {
    const texto = limparTexto_(item, 80, 'Cada item de ' + nomeGrupo.toLowerCase());
    const chave = normalizarNome_(texto);

    if (texto && !vistos[chave]) {
      vistos[chave] = true;
      limpos.push(texto);
    }
  });

  if (limpos.length > MAXIMO_ITENS_GRUPO) {
    throw new Error(nomeGrupo + ' pode ter no máximo ' + MAXIMO_ITENS_GRUPO + ' itens por dia.');
  }

  return limpos;
}

// SALVAR A SEMANA (usado pelo salvamento automático)
// Mantém a situação da semana: se já estava publicada, continua publicada.
// versaoEsperada: a versão que a tela carregou. Se a semana mudou
// desde então (outra aba ou aparelho), o salvamento é recusado.
function salvarSemanaCardapio(token, segunda, dias, versaoEsperada) {
  exigirTela_(token, 'cardapios');

  segunda = segundaDaSemana_(validarDataFormulario_(segunda));
  const domingo = somarDiasTexto_(segunda, DIAS_SEMANA_CARDAPIO - 1);

  // 7 dias (segunda a domingo). Aceita também 5 (segunda a sexta, telas
  // abertas antes da atualização): nesse caso sábado e domingo não mudam.
  if (!Array.isArray(dias) || (dias.length !== DIAS_SEMANA_CARDAPIO && dias.length !== 5)) {
    throw new Error('O sistema foi atualizado (agora o cardápio vai de segunda a domingo). Recarregue a página (tecla F5) para continuar.');
  }

  const limpos = dias.map((dia, indice) => {
    dia = dia || {};
    const limpo = { data: somarDiasTexto_(segunda, indice) };

    GRUPOS_CARDAPIO.forEach(grupo => {
      limpo[grupo] = limparItensCardapio_(dia[grupo], NOMES_GRUPOS_CARDAPIO[grupo]);
    });

    limpo.opcao_extra = limparTexto_(dia.opcao_extra, 80, 'A opção extra');
    limpo.observacoes = limparTexto_(dia.observacoes, 200, 'A observação');
    return limpo;
  });

  return comBloqueio_(() => {
    const cardapios = lerCardapios_();
    const daSemana = cardapios.lista.filter(c => c.data >= segunda && c.data <= domingo);
    const situacao = daSemana.some(c => c.status === 'PUBLICADO') ? 'PUBLICADO' : 'RASCUNHO';
    const aba = cardapios.aba;

    if (versaoEsperada) {
      const atuais = limpos.map(dia => diaParaNavegador_(daSemana.find(c => c.data === dia.data) || null, dia.data));

      if (assinaturaSemana_(atuais) !== versaoEsperada) {
        throw new Error('Este cardápio foi alterado em outra tela ou aparelho. Carregamos a versão mais nova: confira e refaça sua última alteração.');
      }
    }

    const gravados = [];

    limpos.forEach(dia => {
      const atual = daSemana.find(c => c.data === dia.data);

      const valores = [
        textoPlanilha_(dia.acompanhamentos.join('\n')),
        textoPlanilha_(dia.saladas.join('\n')),
        textoPlanilha_(dia.guarnicoes.join('\n')),
        textoPlanilha_(dia.proteinas.join('\n')),
        textoPlanilha_(dia.opcao_extra),
        textoPlanilha_(dia.observacoes)
      ];

      // O "fechado" não muda aqui (tem botão próprio): só entra na conta da versão
      const fechado = diaFechado_(atual || null, dia.data);

      if (atual) {
        aba.getRange(atual.linha, COLUNAS_CARDAPIOS.ACOMPANHAMENTOS, 1, 6).setValues([valores]);
        gravados.push(Object.assign({}, dia, { fechado: fechado }));
      } else if (diaTemConteudo_(dia) || dia.observacoes) {
        aba.appendRow(
          ['CAR-' + Utilities.getUuid(), converterDataFormulario(dia.data), nomeDoDia_(dia.data)]
            .concat(valores)
            .concat([situacao, ''])
        );
        gravados.push(Object.assign({}, dia, { fechado: fechado }));
      } else {
        gravados.push({ data: dia.data, fechado: fechado });   // dia continua sem linha na planilha
      }
    });

    return {
      sucesso: true,
      segunda: segunda,
      status: situacao,
      versao: assinaturaSemana_(gravados)
    };
  });
}

// PUBLICAR OU VOLTAR PARA RASCUNHO
function publicarSemanaCardapio(token, segunda, publicar) {
  const sessao = exigirTela_(token, 'cardapios');
  segunda = segundaDaSemana_(validarDataFormulario_(segunda));
  const domingo = somarDiasTexto_(segunda, DIAS_SEMANA_CARDAPIO - 1);
  const novoStatus = publicar === true ? 'PUBLICADO' : 'RASCUNHO';

  return comBloqueio_(() => {
    const cardapios = lerCardapios_();
    const daSemana = cardapios.lista.filter(c => c.data >= segunda && c.data <= domingo);
    const preenchidos = daSemana.filter(c => !c.fechado && (diaTemConteudo_(c) || c.observacoes));

    if (publicar && !preenchidos.length) {
      throw new Error('A semana está vazia. Monte o cardápio antes de publicar.');
    }

    if (publicar) {
      const semProteina = preenchidos.filter(c => diaTemConteudo_(c) && !c.proteinas.length);

      if (semProteina.length) {
        throw new Error(
          'Informe pelo menos uma proteína em: ' +
          semProteina.map(c => nomeDoDia_(c.data)).join(', ') + '.'
        );
      }
    }

    const aba = cardapios.aba;

    daSemana.forEach(cardapio => {
      if (cardapio.status !== novoStatus) {
        aba.getRange(cardapio.linha, COLUNAS_CARDAPIOS.STATUS).setValue(novoStatus);
      }
    });

    registrarLog_(null, sessao, '', publicar ? 'PUBLICAR_CARDAPIO' : 'DESPUBLICAR_CARDAPIO',
      'Cardápio da semana de ' + formatarDataBR_(segunda) + ' a ' + formatarDataBR_(domingo) +
      (publicar ? ' publicado' : ' voltou para rascunho'));

    const semana = montarSemana_(segunda, false);
    semana.itens_frequentes = itensFrequentes_();

    return {
      sucesso: true,
      mensagem: publicar
        ? 'Cardápio publicado. As empresas já podem ver.'
        : 'Cardápio voltou para rascunho. As empresas não o veem mais.',
      semana: semana
    };
  });
}

// ABRIR OU FECHAR UM DIA (feriado, folga, sábado/domingo com atendimento)
// Fechado: as empresas veem "fechado" e não conseguem pedir. O cardápio
// que já estava montado fica guardado e volta se o dia for reaberto.
function definirDiaFechado(token, data, fechado) {
  const sessao = exigirTela_(token, 'cardapios');
  const dataTexto = validarDataFormulario_(data);
  fechado = fechado === true;

  return comBloqueio_(() => {
    const cardapios = lerCardapios_();
    const atual = cardapios.lista.find(c => c.data === dataTexto) || null;

    if (fechado) {
      const ativos = lerPedidos_().lista.filter(p =>
        p.data_entrega === dataTexto && (p.status === 'ENVIADO' || p.status === 'CONFIRMADO')
      );

      if (ativos.length) {
        throw new Error('Já existe' + (ativos.length > 1 ? 'm ' + ativos.length + ' pedidos' : ' 1 pedido') +
          ' para ' + nomeDoDia_(dataTexto).toLowerCase() + '. Recuse ou cancele antes de fechar o dia.');
      }
    }

    const marca = fechado ? 'SIM' : 'NAO';

    if (atual) {
      cardapios.aba.getRange(atual.linha, COLUNAS_CARDAPIOS.FECHADO).setValue(marca);
    } else {
      const segunda = segundaDaSemana_(dataTexto);
      const domingo = somarDiasTexto_(segunda, DIAS_SEMANA_CARDAPIO - 1);
      const publicada = cardapios.lista.some(c => c.data >= segunda && c.data <= domingo && c.status === 'PUBLICADO');

      cardapios.aba.appendRow([
        'CAR-' + Utilities.getUuid(), converterDataFormulario(dataTexto), nomeDoDia_(dataTexto),
        '', '', '', '', '', '', publicada ? 'PUBLICADO' : 'RASCUNHO', marca
      ]);
    }

    marcarPedidosAlterados_();
    registrarLog_(null, sessao, '', fechado ? 'FECHAR_DIA' : 'ABRIR_DIA',
      nomeDoDia_(dataTexto) + ', ' + formatarDataBR_(dataTexto) + (fechado ? ': fechado' : ': aberto'));

    const semana = montarSemana_(segundaDaSemana_(dataTexto), false);
    semana.itens_frequentes = itensFrequentes_();

    return {
      sucesso: true,
      mensagem: fechado
        ? nomeDoDia_(dataTexto) + ' fechado: as empresas não poderão pedir neste dia.'
        : nomeDoDia_(dataTexto) + ' aberto: monte o cardápio para as empresas pedirem.',
      semana: semana
    };
  });
}

// ----------------------------------------------------------------
// EMPRESAS (somente semanas publicadas)
// ----------------------------------------------------------------
function obterCardapioEmpresa(token, data) {
  validarUsuarioEmpresa_(token);

  const fuso = Session.getScriptTimeZone();
  const hoje = hojeTexto_(fuso);
  const referencia = data ? validarDataFormulario_(data) : hoje;
  const semana = montarSemana_(segundaDaSemana_(referencia), true);

  semana.hoje = hoje;
  return semana;
}

// ----------------------------------------------------------------
// RESUMOS (telas iniciais)
// ----------------------------------------------------------------

// Situação da semana atual e da próxima (painel do restaurante)
function resumoCardapioAdmin_() {
  const fuso = Session.getScriptTimeZone();
  const hoje = hojeTexto_(fuso);
  const segundaAtual = segundaDaSemana_(hoje);
  const segundaProxima = somarDiasTexto_(segundaAtual, 7);

  return {
    hoje: hoje,
    dia_semana: converterDataFormulario(hoje).getDay(), // 0 = domingo
    segunda_atual: segundaAtual,
    segunda_proxima: segundaProxima,
    semana_atual: montarSemana_(segundaAtual, false).status,
    proxima_semana: montarSemana_(segundaProxima, false).status
  };
}

// Cardápio de hoje (ou o próximo dia com cardápio publicado)
function cardapioEmDestaque_() {
  const fuso = Session.getScriptTimeZone();
  const hoje = hojeTexto_(fuso);
  const publicados = lerCardapios_().lista
    .filter(c => c.status === 'PUBLICADO' && !c.fechado && c.data >= hoje && (diaTemConteudo_(c) || c.observacoes))
    .sort((a, b) => a.data.localeCompare(b.data));

  const proximo = publicados.find(c => c.data <= somarDiasTexto_(hoje, 7));

  if (!proximo) return null;

  return {
    e_hoje: proximo.data === hoje,
    dia: diaParaNavegador_(proximo, proximo.data)
  };
}
