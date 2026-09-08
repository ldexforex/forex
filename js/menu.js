window.alternarSidebar = function() {
  document.getElementById('sidebar').classList.toggle('expandida');
}

window.navegarPara = function(secao, elemento) {
  document.querySelectorAll('.pagina-secao').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.sidebar-menu a').forEach(el => el.classList.remove('active'));
  
  document.getElementById(`secao-${secao}`).classList.add('active');
  elemento.classList.add('active');
}
