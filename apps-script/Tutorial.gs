// ================================================================
// TUTORIAL.gs
// Tutorial de boas-vindas: aparece sozinho no primeiro acesso de cada
// usuário (restaurante ou responsável da empresa). Depois de visto ou
// pulado, só abre de novo pelo menu da conta ("Rever tutorial").
// A marca fica nas propriedades do script, por usuário. No modo teste
// a chave leva o prefixo do teste e é apagada ao sair do teste.
// ================================================================
const CHAVE_TUTORIAL = 'tutorial_visto_';

function chaveTutorial_(usuarioId) {
  return prefixoBanco_() + CHAVE_TUTORIAL + usuarioId;
}

// O usuário já viu (ou pulou) o tutorial?
function tutorialVisto_(sessao) {
  try {
    return !!PropertiesService.getScriptProperties().getProperty(chaveTutorial_(sessao.usuario_id));
  } catch (erro) {
    return true;   // na dúvida, não incomoda
  }
}

function marcarTutorialVisto(token) {
  const sessao = validarSessao(token);
  PropertiesService.getScriptProperties().setProperty(chaveTutorial_(sessao.usuario_id), String(Date.now()));
  return { sucesso: true };
}
