
(function(){
  // Compatibilidade das suítes antigas: empresa criada com senha e e-mail de login
  var origCriar=criarEmpresa, origAuth=autenticarUsuario;
  window.criarEmpresa=function(tk,d){
    if(!d||!d.senha||d.login) return origCriar(tk,d);
    d=Object.assign({},d,{login:'compat.'+String(d.email).split('@')[0].replace(/[^a-z0-9]/gi,'').toLowerCase()});
    var r=origCriar(tk,d); __novaExecucao();
    concluirConvite(r.convite.link.split('convite=')[1], d.senha, false); __novaExecucao();
    comBloqueio_(function(){ var e=lerEmpresas_().lista.find(function(x){return x.empresa_id===r.empresa_id;}); obterAba_('EMPRESAS').getRange(e.linha,11).setValue(JSON.stringify({escolha:'TODOS'})); });
    __novaExecucao();
    return r;
  };
  // Administrador criado com e-mail e senha (antes do convite)
  var origCriarAdm=criarAdministrador;
  window.criarAdministrador=function(tk,d){
    if(!d||!d.senha||d.login) return origCriarAdm(tk,d);
    d=Object.assign({},d,{login:'adm.'+String(d.email).split('@')[0].replace(/[^a-z0-9]/gi,'').toLowerCase()});
    var r=origCriarAdm(tk,d); __novaExecucao();
    concluirConvite(r.convite.link.split('convite=')[1], d.senha, false); __novaExecucao();
    return r;
  };
  window.autenticarUsuario=function(id,s,l){
    id=String(id||'').trim().toLowerCase();
    if(id.indexOf('@')!==-1){ var u=lerUsuarios_().lista.find(function(x){return x.perfil==='empresa'&&x.email===id&&x.login.indexOf('compat.')===0;}); if(u) id=u.login; }
    return origAuth(id,s,l);
  };
})();
