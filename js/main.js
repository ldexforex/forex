import { carregarDadosDiario, iniciarUI } from './diario.js';
import { carregarDadosSwing, iniciarSwingUI } from './swing.js';
import { carregarDadosMesas, iniciarMesasUI } from './mesas.js';
import { auth, provider } from './firebase-config.js';
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";

let isAppInitialized = false;

async function initApp(uid) {
  if (isAppInitialized) return;
  
  try {
    // Esconder auth e mostrar loading interno
    document.getElementById('authOverlay').style.display = 'none';
    document.getElementById('loadingOverlay').style.display = 'flex';

    await Promise.all([
      carregarDadosDiario(uid),
      carregarDadosSwing(uid),
      carregarDadosMesas(uid)
    ]);

    const hoje = new Date();
    document.getElementById('swingData').valueAsDate = hoje;
    document.getElementById('filtroMesSwing').value = String(hoje.getMonth() + 1).padStart(2, '0');
    document.getElementById('filtroAnoSwing').value = hoje.getFullYear();

    iniciarUI();
    iniciarSwingUI();
    iniciarMesasUI();

    document.getElementById('loadingOverlay').style.display = 'none';
    isAppInitialized = true;

  } catch (error) {
    console.error("Erro na inicialização:", error);
    alert("Erro ao carregar dados do servidor.");
  }
}

// Monitorador de Estado de Autenticação
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Usuário logado
    initApp(user.uid);
  } else {
    // Ninguém logado, mostrar tela de login
    document.getElementById('loadingOverlay').style.display = 'none';
    document.getElementById('authOverlay').style.display = 'flex';
    isAppInitialized = false;
  }
});

// Ações de Botões
document.getElementById('btnGoogleLogin').addEventListener('click', () => {
  signInWithPopup(auth, provider).catch((error) => {
    console.error("Erro no login:", error);
    alert("Houve um erro ao tentar fazer login com o Google.");
  });
});

document.getElementById('btnSair').addEventListener('click', () => {
  signOut(auth).then(() => {
    // Ao sair, recarrega a página para limpar o estado em memória (arrays locais)
    window.location.reload();
  });
});
