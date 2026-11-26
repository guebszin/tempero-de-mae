// ================================================================
// CONFIG.gs
// Configurações gerais, abertura do aplicativo e funções auxiliares
// usadas por todos os outros arquivos.
// ================================================================

const CONFIG = {
  PLANILHA_ID: '1fHbKGWtrLQT4jaPleySWooS7wdwTDugfAV8AvigqK70',
  DURACAO_SESSAO_SEGUNDOS: 21600,   // 6 horas (máximo permitido pelo Google)
  MAX_TENTATIVAS_LOGIN: 5,          // tentativas erradas antes de bloquear
  BLOQUEIO_LOGIN_SEGUNDOS: 900,     // 15 minutos de bloqueio
  TAMANHO_MINIMO_SENHA: 6,
  DIAS_LOGIN_SALVO: 30              // "Manter conectado": dias sem precisar digitar a senha
};

const ESTRUTURA = {
  EMPRESAS: ['empresa_id', 'nome_empresa', 'cnpj', 'telefone', 'email', 'endereco', 'status', 'data_cadastro', 'ciclo_cobranca', 'dias_vencimento', 'configuracoes'],
  USUARIOS: ['usuario_id', 'empresa_id', 'nome', 'email', 'senha_hash', 'perfil', 'status', 'data_cadastro', 'login', 'permissoes'],
  FUNCIONARIOS: ['funcionario_id', 'empresa_id', 'nome', 'matricula', 'setor', 'telefone', 'pode_alterar_quentinha', 'status'],
  CARDAPIOS: ['cardapio_id', 'data', 'dia_semana', 'acompanhamentos', 'saladas', 'guarnicoes', 'proteinas', 'opcao_extra', 'observacoes', 'status', 'fechado'],
  PEDIDOS: ['pedido_id', 'empresa_id', 'data_pedido', 'data_entrega', 'usuario_id', 'status', 'observacoes', 'valor_total', 'quantidade_total', 'atualizado_em', 'confirmado_em', 'resposta_restaurante', 'cliente_nome', 'cliente_telefone', 'cobranca_id'],
  ITENS_PEDIDOS: ['item_id', 'pedido_id', 'empresa_id', 'funcionario_id', 'cardapio_id', 'tipo_quentinha', 'quantidade', 'preco_unitario', 'subtotal', 'observacoes', 'nome', 'proteina', 'opcao_extra', 'itens_removidos'],
  COBRANCAS: ['cobranca_id', 'empresa_id', 'periodo_inicio', 'periodo_fim', 'data_emissao', 'data_vencimento', 'valor_total', 'status', 'observacoes', 'numero', 'quantidade_total', 'quantidade_pedidos', 'valor_pago', 'criado_por', 'atualizado_em', 'motivo_cancelamento', 'desconto', 'motivo_desconto'],
  PAGAMENTOS: ['pagamento_id', 'cobranca_id', 'empresa_id', 'data_pagamento', 'valor_pago', 'forma_pagamento', 'comprovante', 'observacoes', 'registrado_por', 'registrado_em'],
  LOGS: ['log_id', 'usuario_id', 'empresa_id', 'acao', 'descricao', 'data_hora'],
  CONFIG: ['chave', 'valor', 'descricao'],
  PRECOS: ['preco_id', 'empresa_id', 'tipo_quentinha', 'valor_unitario', 'data_inicio', 'data_fim', 'status'],
  EMPRESAS_EXCLUIDAS: ['empresa_id', 'nome_empresa', 'cnpj', 'telefone', 'email', 'endereco', 'excluida_em', 'excluida_por', 'funcionarios', 'resumo'],
  FUNCIONARIOS_EXCLUIDOS: ['funcionario_id', 'empresa_id', 'nome', 'matricula', 'setor', 'excluido_em', 'excluido_por', 'quentinhas'],
  PRAZOS_EXTRAS: ['solicitacao_id', 'empresa_id', 'data', 'solicitado_em', 'solicitado_por', 'mensagem', 'status', 'respondido_em', 'respondido_por', 'liberado_ate', 'resposta']
};

// Usada para representar "sem data final" nas comparações de período
const DATA_SEM_FIM = '9999-12-31';

// ABRIR A APLICAÇÃO
function doGet(e) {
  if (e && e.parameter && e.parameter.setup === '1') {
    return HtmlService.createHtmlOutputFromFile('Setup')
      .setTitle('Configuração inicial');
  }

  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Tempero de Mãe')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

// INCLUIR UM ARQUIVO HTML DENTRO DE OUTRO (Estilos, Script...)
function incluir(nomeArquivo) {
  return HtmlService.createHtmlOutputFromFile(nomeArquivo).getContent();
}

// VERIFICAR ESTRUTURA DA PLANILHA (executar pelo editor)
function verificarEstrutura() {
  const planilha = abrirPlanilha_();
  const problemas = [];

  Object.entries(ESTRUTURA).forEach(([nome, cabecalhos]) => {
    const aba = planilha.getSheetByName(nome);

    if (!aba) {
      problemas.push('Aba ausente: ' + nome);
      return;
    }

    const atuais = aba.getRange(1, 1, 1, cabecalhos.length)
      .getDisplayValues()[0];

    cabecalhos.forEach((campo, indice) => {
      if (atuais[indice] !== campo) {
        problemas.push(nome + ': coluna ' + (indice + 1) +
          ' deveria ser ' + campo);
      }
    });
  });

  const fusoScript = Session.getScriptTimeZone();
  const fusoPlanilha = planilha.getSpreadsheetTimeZone();

  if (fusoScript !== fusoPlanilha) {
    problemas.push(
      'Fuso horário diferente: script = ' + fusoScript +
      ', planilha = ' + fusoPlanilha +
      '. Ajuste os dois para America/Sao_Paulo.'
    );
  }

  if (problemas.length) {
    Logger.log(problemas.join('\n'));
    return;
  }

  Logger.log('SUCESSO! Estrutura da planilha verificada. Fuso horário: ' + fusoScript);
}

// ================================================================
// FUNÇÕES AUXILIARES
// (funções terminadas em _ não podem ser chamadas pelo navegador)
// ================================================================

// ABRIR A PLANILHA (uma vez por execução)
let planilhaAberta_ = null;

function abrirPlanilha_() {
  if (!planilhaAberta_) {
    planilhaAberta_ = SpreadsheetApp.openById(CONFIG.PLANILHA_ID);
  }
  return planilhaAberta_;
}

// EXECUTAR UMA GRAVAÇÃO COM BLOQUEIO
// - Evita que duas pessoas gravem ao mesmo tempo.
// - Durante a gravação, tudo é lido direto da planilha (nunca do cache).
// - No final, o cache é invalidado para todos verem os dados novos.
function comBloqueio_(funcao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  const anterior = emGravacao_;
  emGravacao_ = true;
  limparMemoriaExecucao_(); // dentro do bloqueio, tudo é lido de novo

  try {
    return funcao();
  } finally {
    emGravacao_ = anterior;

    if (!anterior) {
      if (planilhaAberta_) SpreadsheetApp.flush();
      invalidarCacheAbas_();
      limparMemoriaExecucao_();
    }

    lock.releaseLock();
  }
}

// ================================================================
// CACHE DE LEITURA DAS ABAS
// As abas mais consultadas ficam guardadas na memória do Google por
// alguns minutos. Isso evita abrir a planilha a cada clique.
// Cada gravação feita pelo sistema troca a "versão" dos dados, e o
// cache antigo deixa de ser usado na mesma hora.
// Alterações feitas DIRETO NA PLANILHA aparecem em até 5 minutos
// (ou na hora, executando a função limparCache pelo editor).
// ================================================================
const ABAS_EM_CACHE = ['EMPRESAS', 'USUARIOS', 'PRECOS', 'FUNCIONARIOS', 'CARDAPIOS', 'PEDIDOS', 'CONFIG', 'COBRANCAS', 'PAGAMENTOS', 'EMPRESAS_EXCLUIDAS', 'FUNCIONARIOS_EXCLUIDOS'];
const CACHE_ABAS_SEGUNDOS = 300;
const TAMANHO_PARTE_CACHE = 90000;  // o Google aceita até 100 KB por item
const MAXIMO_PARTES_CACHE = 60;      // abas muito grandes não vão para o cache

let emGravacao_ = false;
let versaoDadosAtual_ = null;

// Abas já lidas nesta execução (evita ler a mesma aba duas vezes)
let memoriaExecucao_ = {};

function limparMemoriaExecucao_() {
  memoriaExecucao_ = {};
}

// VERSÃO ATUAL DOS DADOS
function versaoDados_() {
  if (versaoDadosAtual_) return versaoDadosAtual_;

  const cache = CacheService.getScriptCache();
  let versao = cache.get(prefixoBanco_() + 'versao_dados');

  if (!versao) {
    versao = novaVersao_();
    cache.put(prefixoBanco_() + 'versao_dados', versao, 21600);
  }

  versaoDadosAtual_ = versao;
  return versao;
}

function novaVersao_() {
  return new Date().getTime().toString(36) + Utilities.getUuid().slice(0, 8);
}

// INVALIDAR O CACHE (depois de qualquer gravação)
function invalidarCacheAbas_() {
  const versao = novaVersao_();
  CacheService.getScriptCache().put(prefixoBanco_() + 'versao_dados', versao, 21600);
  versaoDadosAtual_ = versao;
}

// LIMPAR O CACHE MANUALMENTE (executar pelo editor após editar a planilha à mão)
function limparCache() {
  invalidarCacheAbas_();
  Logger.log('Cache limpo. O sistema vai ler a planilha novamente.');
}

function chaveCacheAba_(nomeAba) {
  return prefixoBanco_() + 'aba_' + versaoDados_() + '_' + nomeAba;
}

function lerCacheAba_(nomeAba) {
  try {
    const cache = CacheService.getScriptCache();
    const chave = chaveCacheAba_(nomeAba);
    const partes = Number(cache.get(chave) || 0);

    if (!partes) return null;

    const chaves = [];
    for (let i = 0; i < partes; i++) chaves.push(chave + '_' + i);

    const obtidos = cache.getAll(chaves);
    let texto = '';

    for (let i = 0; i < chaves.length; i++) {
      if (obtidos[chaves[i]] === undefined) return null;
      texto += obtidos[chaves[i]];
    }

    return JSON.parse(texto, function(chaveJson, valor) {
      return (valor && typeof valor === 'object' && valor.__d !== undefined)
        ? new Date(valor.__d)
        : valor;
    });
  } catch (erro) {
    return null;
  }
}

function gravarCacheAba_(nomeAba, valores) {
  try {
    const convertidos = valores.map(linha => linha.map(celula =>
      celula instanceof Date ? { __d: celula.getTime() } : celula
    ));

    const texto = JSON.stringify(convertidos);
    const quantidade = Math.ceil(texto.length / TAMANHO_PARTE_CACHE);

    if (quantidade > MAXIMO_PARTES_CACHE) return;

    const chave = chaveCacheAba_(nomeAba);
    const partes = {};

    for (let i = 0; i < quantidade; i++) {
      partes[chave + '_' + i] = texto.slice(i * TAMANHO_PARTE_CACHE, (i + 1) * TAMANHO_PARTE_CACHE);
    }

    const cache = CacheService.getScriptCache();
    cache.putAll(partes, CACHE_ABAS_SEGUNDOS);
    cache.put(chave, String(quantidade), CACHE_ABAS_SEGUNDOS);
  } catch (erro) {
    Logger.log('Não foi possível guardar ' + nomeAba + ' no cache: ' + erro.message);
  }
}

// LER TODOS OS VALORES DE UMA ABA (do cache, quando possível)
function lerAba_(nomeAba) {
  if (memoriaExecucao_[nomeAba]) return memoriaExecucao_[nomeAba];

  const usarCache = !emGravacao_ && ABAS_EM_CACHE.indexOf(nomeAba) !== -1;

  if (usarCache) {
    const guardado = lerCacheAba_(nomeAba);
    if (guardado) {
      memoriaExecucao_[nomeAba] = guardado;
      return guardado;
    }
  }

  // A versão é lida ANTES da planilha: se alguém gravar no meio do caminho,
  // este resultado fica guardado numa versão que ninguém mais usa.
  if (usarCache) versaoDados_();

  const aba = abrirPlanilha_().getSheetByName(nomeAba);

  if (!aba) {
    throw new Error('A aba ' + nomeAba + ' não foi encontrada na planilha.');
  }

  const valores = aba.getDataRange().getValues();

  if (usarCache) gravarCacheAba_(nomeAba, valores);

  memoriaExecucao_[nomeAba] = valores;
  return valores;
}

// OBTER A ABA PARA GRAVAR
// Toda gravação passa por aqui: a memória da execução é apagada para que
// as próximas leituras já vejam o dado novo.
function obterAba_(nomeAba) {
  limparMemoriaExecucao_();

  const aba = abrirPlanilha_().getSheetByName(nomeAba);

  if (!aba) {
    throw new Error('A aba ' + nomeAba + ' não foi encontrada na planilha.');
  }

  return aba;
}

// PREPARAR TEXTO DIGITADO PARA GRAVAR NA PLANILHA
// O apóstrofo inicial faz o Sheets guardar como texto puro:
// mantém zeros à esquerda, não transforma telefone em número e
// impede que algo começando com "=" vire fórmula.
// O apóstrofo não aparece na célula nem na leitura pelo script.
function textoPlanilha_(valor) {
  const texto = String(valor === null || valor === undefined ? '' : valor).trim();
  return texto ? "'" + texto : '';
}

// LIMPAR TEXTO (espaços duplicados e tamanho máximo)
function limparTexto_(valor, tamanhoMaximo, nomeCampo) {
  const texto = String(valor === null || valor === undefined ? '' : valor)
    .trim()
    .replace(/\s+/g, ' ');

  if (tamanhoMaximo && texto.length > tamanhoMaximo) {
    throw new Error(nomeCampo + ' pode ter no máximo ' + tamanhoMaximo + ' caracteres.');
  }

  return texto;
}

// VALIDAR E-MAIL
function validarEmail_(valor) {
  const email = String(valor || '').trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Informe um e-mail válido.');
  }

  return email;
}

// VALIDAR TELEFONE (opcional)
function validarTelefone_(valor) {
  const telefone = String(valor || '').trim();

  if (telefone && !/^[0-9\s()+-]{8,20}$/.test(telefone)) {
    throw new Error('Telefone inválido. Use apenas números, espaços, parênteses, + ou -.');
  }

  return telefone;
}

// VALIDAR CNPJ (opcional) — confere os dígitos verificadores
function validarCnpj_(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return '';

  const numeros = texto.replace(/\D/g, '');

  if (numeros.length !== 14 || /^(\d)\1+$/.test(numeros)) {
    throw new Error('CNPJ inválido. Confira os números digitados.');
  }

  const calcularDigito = (base) => {
    let pesos = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    const soma = base.split('').reduce((total, digito, i) =>
      total + Number(digito) * pesos[i], 0);

    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const digito1 = calcularDigito(numeros.slice(0, 12));
  const digito2 = calcularDigito(numeros.slice(0, 12) + digito1);

  if (numeros.slice(12) !== String(digito1) + String(digito2)) {
    throw new Error('CNPJ inválido. Confira os números digitados.');
  }

  return numeros.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

// CONVERTER VALOR EM REAIS ("18,50", "1.234,56" ou "18.5") EM NÚMERO
function converterValor_(valor) {
  let texto = String(valor === null || valor === undefined ? '' : valor)
    .trim()
    .replace(/[R$\s]/g, '');

  if (texto.indexOf(',') !== -1) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  }

  const numero = Number(texto);

  if (!texto || !isFinite(numero) || numero <= 0) {
    throw new Error('Informe um valor válido maior que zero.');
  }

  return Math.round(numero * 100) / 100;
}

// CONVERTER DATA DO FORMULÁRIO (aaaa-mm-dd) EM Date
function converterDataFormulario(valor) {
  const texto = String(valor || '').trim();
  const partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!partes) {
    throw new Error('Informe uma data válida.');
  }

  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const data = new Date(ano, mes - 1, dia);

  if (
    data.getFullYear() !== ano ||
    data.getMonth() !== mes - 1 ||
    data.getDate() !== dia
  ) {
    throw new Error('A data informada não existe.');
  }

  data.setHours(0, 0, 0, 0);
  return data;
}

// VALIDAR DATA DO FORMULÁRIO E DEVOLVER TEXTO aaaa-mm-dd
function validarDataFormulario_(valor) {
  converterDataFormulario(valor);
  return String(valor).trim();
}

// CONVERTER VALOR DE UMA CÉLULA DA PLANILHA EM TEXTO aaaa-mm-dd
// Comparar datas como texto nesse formato evita erros de fuso e horário.
function dataParaTexto_(valor, fusoHorario) {
  if (valor === '' || valor === null || valor === undefined) return '';

  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return '';
    return Utilities.formatDate(valor, fusoHorario, 'yyyy-MM-dd');
  }

  const texto = String(valor).trim();

  let partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (partes) return partes[1] + '-' + partes[2] + '-' + partes[3];

  partes = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (partes) return partes[3] + '-' + partes[2] + '-' + partes[1];

  return '';
}

// DATA DE HOJE (ou daqui a N dias) COMO TEXTO aaaa-mm-dd
function hojeTexto_(fusoHorario, diasAMais) {
  const data = new Date();
  if (diasAMais) data.setDate(data.getDate() + diasAMais);
  return Utilities.formatDate(data, fusoHorario, 'yyyy-MM-dd');
}

// DIA SEGUINTE DE UMA DATA aaaa-mm-dd
function proximoDiaTexto_(texto) {
  const data = converterDataFormulario(texto);
  data.setDate(data.getDate() + 1);

  return data.getFullYear() + '-' +
    String(data.getMonth() + 1).padStart(2, '0') + '-' +
    String(data.getDate()).padStart(2, '0');
}

// FORMATAR TEXTO aaaa-mm-dd COMO dd/mm/aaaa
function formatarDataBR_(texto) {
  if (!texto) return 'sem data final';

  const partes = texto.split('-');
  if (partes.length !== 3) return texto;

  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

// FORMATAR VALOR EM REAIS (para mensagens)
function formatarMoeda_(valor) {
  return 'R$ ' + Number(valor || 0).toFixed(2).replace('.', ',');
}

// REGISTRAR AÇÃO NA ABA LOGS
// (o primeiro parâmetro é mantido só por compatibilidade)
function registrarLog_(planilha, sessao, empresaId, acao, descricao) {
  try {
    const aba = abrirPlanilha_().getSheetByName('LOGS');
    if (!aba) return;

    aba.appendRow([
      'LOG-' + Utilities.getUuid(),
      sessao ? sessao.usuario_id : '',
      empresaId || '',
      acao,
      descricao,
      new Date()
    ]);
  } catch (erro) {
    // Uma falha no log não deve impedir a operação principal.
    Logger.log('Falha ao registrar log: ' + erro.message);
  }
}

// ENDEREÇO DO APLICATIVO (para enviar às empresas)
function enderecoAplicativo_() {
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (erro) {
    return '';
  }
}
