// ================================================================
// FUNCIONARIOS.gs
// Funcionários de cada empresa. O restaurante cadastra, edita e
// define quem pode personalizar a quentinha; a empresa apenas consulta.
// ================================================================

// Posição das colunas da aba FUNCIONARIOS (1 = coluna A)
const COLUNAS_FUNCIONARIOS = {
  ID: 1,
  EMPRESA: 2,
  NOME: 3,
  MATRICULA: 4,
  SETOR: 5,
  TELEFONE: 6,
  PODE_ALTERAR: 7,
  STATUS: 8
};

// LER TODOS OS FUNCIONÁRIOS DA PLANILHA
// (do cache, quando possível)
function lerFuncionarios_() {
  const dados = lerAba_('FUNCIONARIOS');
  const lista = [];

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];
    if (!linha[0]) continue;

    lista.push({
      linha: i + 1,
      funcionario_id: String(linha[0]),
      empresa_id: String(linha[1]),
      nome: String(linha[2]).trim(),
      matricula: String(linha[3]).trim(),
      setor: String(linha[4]).trim(),
      telefone: String(linha[5]).trim(),
      pode_alterar_quentinha: String(linha[6]).trim().toUpperCase() === 'SIM',
      status: String(linha[7]).trim().toUpperCase() === 'ATIVO' ? 'ATIVO' : 'INATIVO'
    });
  }

  return {
    get aba() { return obterAba_('FUNCIONARIOS'); },
    lista: lista
  };
}

// PREPARAR FUNCIONÁRIO PARA ENVIAR AO NAVEGADOR
function funcionarioParaNavegador_(funcionario) {
  return {
    funcionario_id: funcionario.funcionario_id,
    empresa_id: funcionario.empresa_id,
    nome: funcionario.nome,
    matricula: funcionario.matricula,
    setor: funcionario.setor,
    telefone: funcionario.telefone,
    pode_alterar_quentinha: funcionario.pode_alterar_quentinha,
    status: funcionario.status
  };
}

// LISTAR FUNCIONÁRIOS
// Empresa: somente os próprios. Restaurante: da empresa selecionada.
function listarFuncionarios(token, empresaIdFiltro) {
  const sessao = validarSessao(token);
  let empresaId;

  if (sessao.perfil === 'admin') {
    empresaId = String(empresaIdFiltro || '').trim();
    if (!empresaId) return [];
  } else {
    empresaId = validarUsuarioEmpresa_(token).sessao.empresa_id;
  }

  return funcionariosDaEmpresa_(empresaId);
}

// FUNCIONÁRIOS DE UMA EMPRESA, EM ORDEM ALFABÉTICA
function funcionariosDaEmpresa_(empresaId) {
  return lerFuncionarios_().lista
    .filter(funcionario => funcionario.empresa_id === empresaId)
    .map(funcionarioParaNavegador_)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// DADOS ATUALIZADOS DE UM FUNCIONÁRIO (devolvidos depois de cada gravação)
function funcionarioAtualizado_(funcionarioId) {
  const funcionario = lerFuncionarios_().lista.find(f => f.funcionario_id === funcionarioId);
  return funcionario ? funcionarioParaNavegador_(funcionario) : null;
}

// CADASTRAR OU EDITAR FUNCIONÁRIO (somente o restaurante)
function salvarFuncionario(token, dados) {
  const sessao = exigirTela_(token, 'funcionarios');

  if (!dados) {
    throw new Error('Dados do funcionário não informados.');
  }

  const funcionarioId = String(dados.funcionario_id || '').trim();
  const nome = limparTexto_(dados.nome, 120, 'O nome');
  const matricula = limparTexto_(dados.matricula, 30, 'A matrícula');
  const setor = limparTexto_(dados.setor, 60, 'O setor');
  const telefone = validarTelefone_(dados.telefone);
  const podeAlterar = dados.pode_alterar_quentinha === true ||
    String(dados.pode_alterar_quentinha).toUpperCase() === 'SIM';

  if (nome.length < 3) {
    throw new Error('Informe o nome completo do funcionário.');
  }

  return comBloqueio_(() => {
    const funcionarios = lerFuncionarios_();
    let atual = null;
    let empresaId;

    if (funcionarioId) {
      // Na edição, o funcionário continua na mesma empresa
      atual = funcionarios.lista.find(f => f.funcionario_id === funcionarioId);

      if (!atual) {
        throw new Error('Funcionário não encontrado.');
      }

      empresaId = atual.empresa_id;
    } else {
      empresaId = String(dados.empresa_id || '').trim();

      if (!empresaId) {
        throw new Error('Selecione a empresa do funcionário.');
      }

      const empresa = lerEmpresas_().lista.find(e => e.empresa_id === empresaId);

      if (!empresa) {
        throw new Error('Empresa não encontrada.');
      }

      if (empresa.status !== 'ATIVO') {
        throw new Error('Esta empresa está inativa. Reative a empresa antes de cadastrar funcionários.');
      }
    }

    // Matrícula não pode se repetir dentro da mesma empresa
    if (matricula) {
      const repetida = funcionarios.lista.find(f =>
        f.empresa_id === empresaId &&
        f.funcionario_id !== funcionarioId &&
        f.matricula.toLowerCase() === matricula.toLowerCase()
      );

      if (repetida) {
        throw new Error(
          'A matrícula ' + matricula + ' já pertence a ' + repetida.nome +
          (repetida.status === 'INATIVO' ? ' (funcionário inativo)' : '') + '.'
        );
      }
    }

    // NOVO FUNCIONÁRIO
    if (!atual) {
      const novoId = 'FUN-' + Utilities.getUuid();

      funcionarios.aba.appendRow([
        novoId,
        empresaId,
        textoPlanilha_(nome),
        textoPlanilha_(matricula),
        textoPlanilha_(setor),
        textoPlanilha_(telefone),
        podeAlterar ? 'SIM' : 'NAO',
        'ATIVO'
      ]);

      registrarLog_(null, sessao, empresaId, 'CRIAR_FUNCIONARIO',
        'Funcionário cadastrado: ' + nome + ' (' + novoId + ')');

      return {
        sucesso: true,
        mensagem: nome + ' foi cadastrado.',
        funcionario_id: novoId,
        funcionario: funcionarioAtualizado_(novoId)
      };
    }

    // EDIÇÃO
    funcionarios.aba
      .getRange(atual.linha, COLUNAS_FUNCIONARIOS.NOME, 1, 5)
      .setValues([[
        textoPlanilha_(nome),
        textoPlanilha_(matricula),
        textoPlanilha_(setor),
        textoPlanilha_(telefone),
        podeAlterar ? 'SIM' : 'NAO'
      ]]);

    registrarLog_(null, sessao, empresaId, 'EDITAR_FUNCIONARIO',
      'Funcionário atualizado: ' + nome + ' (' + funcionarioId + ')');

    return {
      sucesso: true,
      mensagem: 'Dados de ' + nome + ' atualizados.',
      funcionario_id: funcionarioId,
      funcionario: funcionarioAtualizado_(funcionarioId)
    };
  });
}

// INATIVAR OU REATIVAR FUNCIONÁRIO (somente o restaurante)
// Para apagar de vez, o proprietário usa excluirFuncionario (Limpeza.gs);
// o histórico de pedidos continua nos relatórios.
function alterarStatusFuncionario(token, funcionarioId, ativar) {
  const sessao = exigirTela_(token, 'funcionarios');

  funcionarioId = String(funcionarioId || '').trim();

  if (!funcionarioId) {
    throw new Error('Funcionário não informado.');
  }

  const novoStatus = ativar === true ? 'ATIVO' : 'INATIVO';

  return comBloqueio_(() => {
    const funcionarios = lerFuncionarios_();
    const funcionario = funcionarios.lista.find(f => f.funcionario_id === funcionarioId);

    if (!funcionario) {
      throw new Error('Funcionário não encontrado.');
    }

    if (funcionario.status === novoStatus) {
      throw new Error('O funcionário já está ' + (ativar ? 'ativo.' : 'inativo.'));
    }

    funcionarios.aba
      .getRange(funcionario.linha, COLUNAS_FUNCIONARIOS.STATUS)
      .setValue(novoStatus);

    registrarLog_(null, sessao, funcionario.empresa_id,
      ativar ? 'REATIVAR_FUNCIONARIO' : 'INATIVAR_FUNCIONARIO',
      'Funcionário ' + funcionario.nome + ' (' + funcionarioId + ') agora está ' + novoStatus);

    return {
      sucesso: true,
      mensagem: ativar
        ? funcionario.nome + ' foi reativado.'
        : funcionario.nome + ' foi inativado.',
      funcionario: funcionarioAtualizado_(funcionarioId)
    };
  });
}
