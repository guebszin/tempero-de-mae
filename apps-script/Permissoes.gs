// ================================================================
// PERMISSOES.gs
// O proprietário escolhe, para cada administrador, quais abas ele vê
// e quais funções sensíveis pode usar. Tudo é conferido aqui no
// servidor (esconder o botão na tela não basta).
// - O proprietário sempre pode tudo.
// - Administradores antigos (sem permissões gravadas) continuam com
//   acesso a tudo, menos ao Dashboard, até o proprietário mudar.
// - As permissões ficam na coluna "permissoes" da aba USUARIOS (JSON)
//   e valem na hora: são lidas de novo a cada chamada.
// ================================================================
const TELAS_PERMISSAO = [
  { chave: 'dashboard', titulo: 'Dashboard', descricao: 'Gráficos com o resumo do restaurante', padrao: false },
  { chave: 'empresas', titulo: 'Empresas', descricao: 'Cadastrar, editar, inativar e enviar convites', padrao: true },
  { chave: 'precos', titulo: 'Preços', descricao: 'Ver os preços de cada empresa', padrao: true },
  { chave: 'funcionarios', titulo: 'Funcionários', descricao: 'Cadastrar e editar funcionários das empresas', padrao: true },
  { chave: 'cardapios', titulo: 'Cardápios', descricao: 'Montar e publicar o cardápio da semana', padrao: true },
  { chave: 'pedidos', titulo: 'Pedidos', descricao: 'Ver, confirmar e recusar pedidos; lançar clientes', padrao: true },
  { chave: 'cobrancas', titulo: 'Cobranças', descricao: 'Ver as cobranças e o que falta cobrar', padrao: true },
  { chave: 'relatorios', titulo: 'Relatórios', descricao: 'Relatórios e exportação para Excel', padrao: true }
];

const FUNCOES_PERMISSAO = [
  { chave: 'precos_editar', tela: 'precos', titulo: 'Cadastrar e alterar preços', padrao: true },
  { chave: 'empresas_excluir', tela: 'empresas', titulo: 'Excluir empresas (sem histórico)', padrao: true },
  { chave: 'pedidos_horario', tela: 'pedidos', titulo: 'Alterar o horário limite dos pedidos', padrao: true },
  { chave: 'cobrancas_gerar', tela: 'cobrancas', titulo: 'Gerar, editar e cancelar cobranças', padrao: true },
  { chave: 'cobrancas_pagamentos', tela: 'cobrancas', titulo: 'Registrar e excluir pagamentos', padrao: true },
  { chave: 'cobrancas_descontos', tela: 'cobrancas', titulo: 'Aplicar descontos nas cobranças', padrao: true }
];

const MENSAGEM_SEM_PERMISSAO = 'Seu acesso não permite isto. Peça ao proprietário para liberar.';

// Tudo liberado (proprietário)
function permissoesTotais_() {
  const telas = {};
  const funcoes = {};
  TELAS_PERMISSAO.forEach(t => { telas[t.chave] = true; });
  FUNCOES_PERMISSAO.forEach(f => { funcoes[f.chave] = true; });
  return { telas: telas, funcoes: funcoes };
}

// Completa e limpa o que veio (da planilha ou do formulário)
function normalizarPermissoes_(bruto) {
  bruto = bruto || {};
  const telasBrutas = bruto.telas || {};
  const funcoesBrutas = bruto.funcoes || {};
  const telas = {};
  const funcoes = {};

  TELAS_PERMISSAO.forEach(t => {
    telas[t.chave] = Object.prototype.hasOwnProperty.call(telasBrutas, t.chave) ? telasBrutas[t.chave] === true : t.padrao;
  });

  // Função de uma aba sem acesso fica desligada
  FUNCOES_PERMISSAO.forEach(f => {
    const valor = Object.prototype.hasOwnProperty.call(funcoesBrutas, f.chave) ? funcoesBrutas[f.chave] === true : f.padrao;
    funcoes[f.chave] = valor && telas[f.tela];
  });

  return { telas: telas, funcoes: funcoes };
}

function permissoesDoUsuario_(usuario) {
  if (!usuario || usuario.perfil !== 'admin') return null;
  if (ehProprietario_(usuario.email)) return permissoesTotais_();
  return normalizarPermissoes_(lerJson_(usuario.permissoes_texto));
}

// Permissões atuais de quem está na sessão (lidas da planilha)
function permissoesDaSessao_(sessao) {
  if (!sessao || sessao.perfil !== 'admin') return null;
  if (sessao.permissoes) return sessao.permissoes;
  const usuario = lerUsuarios_().lista.find(u => u.usuario_id === sessao.usuario_id);
  return permissoesDoUsuario_(usuario);
}

// EXIGIR ACESSO A UMA ABA
function exigirTela_(token, tela) {
  const sessao = validarAdministrador(token);
  const permissoes = permissoesDaSessao_(sessao);

  if (!permissoes || !permissoes.telas[tela]) throw new Error(MENSAGEM_SEM_PERMISSAO);
  return sessao;
}

// EXIGIR UMA FUNÇÃO (e a aba dela)
function exigirFuncao_(token, funcao) {
  const definicao = FUNCOES_PERMISSAO.find(f => f.chave === funcao);
  const sessao = exigirTela_(token, definicao ? definicao.tela : funcao);
  const permissoes = permissoesDaSessao_(sessao);

  if (!permissoes.funcoes[funcao]) throw new Error(MENSAGEM_SEM_PERMISSAO);
  return sessao;
}

// Sem levantar erro (para montar respostas)
function sessaoPode_(sessao, funcao) {
  const permissoes = permissoesDaSessao_(sessao);
  return !!(permissoes && permissoes.funcoes[funcao]);
}

// Lista para a tela de Acessos
function catalogoPermissoes_() {
  return {
    telas: TELAS_PERMISSAO.map(t => ({ chave: t.chave, titulo: t.titulo, descricao: t.descricao, padrao: t.padrao })),
    funcoes: FUNCOES_PERMISSAO.map(f => ({ chave: f.chave, tela: f.tela, titulo: f.titulo, padrao: f.padrao }))
  };
}
