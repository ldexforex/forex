import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, addDoc } from "firebase/firestore";
import { db } from "./firebase-config.js";

const catalogoMesasPadrao = ['Hantec Trader', 'FTMO', 'MyForexFunds', 'FundedNext'];
export let catalogoMesas = [...catalogoMesasPadrao];
export let mesas = [];

let mesaEmEdicaoIndex = null;
let ultimaExclusaoMesas = null;
let userUid = null;

export function carregarDadosMesas(uid) {
  userUid = uid;
  return new Promise((resolve) => {
    let settingsLoaded = false;
    let mesasLoaded = false;
    let initialLoadDone = false;

    function checkLoad() {
      if (settingsLoaded && mesasLoaded && !initialLoadDone) {
        initialLoadDone = true;
        resolve();
      }
    }

    onSnapshot(doc(db, "users", userUid, "settings", "mesas"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.catalogoMesas) catalogoMesas = data.catalogoMesas;
      }
      if (initialLoadDone) {
        renderizarOpcoesMesa();
      }
      settingsLoaded = true;
      checkLoad();
    });

    onSnapshot(collection(db, "users", userUid, "mesas"), (querySnapshot) => {
      mesas = [];
      querySnapshot.forEach((doc) => {
        mesas.push({ id: doc.id, ...doc.data() });
      });
      if (initialLoadDone) {
        window.renderizarMesas();
      }
      mesasLoaded = true;
      checkLoad();
    });
  });
}

export function iniciarMesasUI() {
  renderizarOpcoesMesa();
  window.verificarOpcaoMetaForm();
  window.renderizarMesas();
}

function renderizarOpcoesMesa() {
  const select = document.getElementById('nomeMesa');
  select.innerHTML = '';

  if (catalogoMesas.length === 0) {
    const optVazia = document.createElement('option');
    optVazia.value = '';
    optVazia.textContent = 'Nenhuma mesa cadastrada. Adicione ao lado.';
    select.appendChild(optVazia);
    return;
  }

  catalogoMesas.forEach(nome => {
    const opt = document.createElement('option');
    opt.value = nome;
    opt.textContent = nome;
    select.appendChild(opt);
  });
}

window.adicionarNovaMesaCatalogo = async function() {
  const nomeNova = prompt("Digite o nome da nova mesa proprietária:");
  if (nomeNova && nomeNova.trim() !== '') {
    const nomeFormatado = nomeNova.trim();
    if (!catalogoMesas.includes(nomeFormatado)) {
      catalogoMesas.push(nomeFormatado);
      await setDoc(doc(db, "users", userUid, "settings", "mesas"), { catalogoMesas }, { merge: true });
      renderizarOpcoesMesa();
      document.getElementById('nomeMesa').value = nomeFormatado;
    } else {
      alert('Esta mesa já existe na lista.');
    }
  }
};

window.excluirMesaCatalogoSelecionada = async function() {
  const select = document.getElementById('nomeMesa');
  const selecionado = select.value;
  if (!selecionado) return alert('Nenhuma mesa selecionada para excluir.');

  if (confirm(`Deseja remover "${selecionado}" da lista de opções?`)) {
    catalogoMesas = catalogoMesas.filter(m => m !== selecionado);
    await setDoc(doc(db, "users", userUid, "settings", "mesas"), { catalogoMesas }, { merge: true });
    renderizarOpcoesMesa();
  }
};

window.verificarOpcaoMetaForm = function() {
  const fase = document.getElementById('faseMesa').value;
  const modoMetaSelect = document.getElementById('modoMetaMesa');
  const inputMeta = document.getElementById('metaFaseMesa');

  if (fase === 'Conta Real (Financiada)') {
    modoMetaSelect.style.display = 'block';
    window.alternarCampoMetaForm();
  } else {
    modoMetaSelect.style.display = 'none';
    inputMeta.style.display = 'block';
    inputMeta.required = true;
    inputMeta.placeholder = 'Meta da Fase ($)';
  }
};

window.alternarCampoMetaForm = function() {
  const modo = document.getElementById('modoMetaMesa').value;
  const inputMeta = document.getElementById('metaFaseMesa');

  if (modo === 'sem_meta') {
    inputMeta.style.display = 'none';
    inputMeta.required = false;
    inputMeta.value = '';
  } else {
    inputMeta.style.display = 'block';
    inputMeta.required = true;
    inputMeta.placeholder = 'Meta da Conta Real ($)';
  }
};

window.verificarOpcaoMetaModal = function() {
  const fase = document.getElementById('modalNovaFase').value;
  const modoMetaSelect = document.getElementById('modalModoMeta');

  if (fase === 'Conta Real (Financiada)') {
    modoMetaSelect.style.display = 'block';
    window.alternarCampoMetaModal();
  } else {
    modoMetaSelect.style.display = 'none';
    document.getElementById('containerModalInputMeta').style.display = 'block';
  }
};

window.alternarCampoMetaModal = function() {
  const modo = document.getElementById('modalModoMeta').value;
  const container = document.getElementById('containerModalInputMeta');

  if (modo === 'sem_meta') {
    container.style.display = 'none';
    document.getElementById('modalNovaMeta').value = '';
  } else {
    container.style.display = 'block';
  }
};

const containerMesas = document.getElementById('listaMesas');

window.renderizarMesas = function() {
  containerMesas.innerHTML = '';
  if (mesas.length === 0) {
    containerMesas.innerHTML = '<p style="color: #8d8d99;">Nenhuma mesa proprietária cadastrada.</p>';
    return;
  }

  mesas.forEach((m, index) => {
    const card = document.createElement('div');
    card.className = 'card-mesa';

    const lucroFaseAtual = m.saldoAtualFase || 0;
    const classeLucro = lucroFaseAtual >= 0 ? 'ganho' : 'perda';
    const temMeta = m.metaFase && m.metaFase > 0;
    const faltante = temMeta ? m.metaFase - lucroFaseAtual : 0;
    
    let pctProgresso = 0;
    if (temMeta) {
      pctProgresso = (lucroFaseAtual / m.metaFase) * 100;
      if (pctProgresso < 0) pctProgresso = 0;
      if (pctProgresso > 100) pctProgresso = 100;
    }

    let historicoHTML = '';
    if (m.historicoFaseAtual && m.historicoFaseAtual.length > 0) {
      historicoHTML = m.historicoFaseAtual.map((h, hIdx) => `
        <div class="historico-item">
          <span>${h.data} - <strong class="${h.resultado === 'Ganho' ? 'ganho' : (h.resultado === 'Perda' ? 'perda' : 'zero')}">${h.resultado}</strong></span>
          <span>${h.valor >= 0 ? '+' : ''}$ ${h.valor.toFixed(2)}
            <a href="#" style="color:#f75a68; text-decoration:none; margin-left:5px;" onclick="excluirTradeMesa(${index}, ${hIdx}); return false;">✕</a>
          </span>
        </div>
      `).join('');
    } else {
      historicoHTML = '<span style="color:#8d8d99;">Nenhuma operação nesta fase ativa.</span>';
    }

    const metaAtingida = temMeta && faltante <= 0;
    const temFasesAnteriores = m.historicoPassado && m.historicoPassado.length > 0;

    card.innerHTML = `
      <h4>${m.nome}</h4>
      <span class="badge-fase">${m.fase}</span>

      <div class="info-mesa"><strong>Capital da Conta:</strong> $${parseFloat(m.capital).toFixed(2)}</div>
      <div class="info-mesa"><strong>Lucro/Resultado na Fase:</strong> <span class="${classeLucro}">${lucroFaseAtual >= 0 ? '+' : ''}$ ${lucroFaseAtual.toFixed(2)}</span></div>
      
      ${temMeta ? `
        <div class="info-mesa"><strong>Meta da Fase:</strong> $${parseFloat(m.metaFase).toFixed(2)}</div>
        <div class="info-mesa"><strong>Falta p/ Meta:</strong> <span style="color: ${metaAtingida ? '#04d361' : '#00b4d8'}">${metaAtingida ? 'Meta Atingida! 🎉' : '$ ' + faltante.toFixed(2)}</span></div>
        <div class="progresso-container" title="${pctProgresso.toFixed(1)}% concluído">
          <div class="progresso-barra" style="width: ${pctProgresso.toFixed(1)}%;"></div>
        </div>
      ` : `
        <div class="info-mesa" style="color: #8d8d99; font-style: italic; margin-top: 5px;">Modo Conta Real Sem Meta (Foco em Acúmulo de Pagamento/Lucros)</div>
      `}

      ${(metaAtingida || m.fase !== 'Conta Real (Financiada)') ? `
        <button type="button" style="width: 100%; margin: 8px 0; background-color: #00b4d8; color: #121214;" onclick="abrirModalFase(${index})">
          🚀 ${m.fase === 'Conta Real (Financiada)' ? 'Atualizar/Mudar de Estágio' : 'Concluir e Ir p/ Próxima Fase'}
        </button>
      ` : ''}

      <div class="painel-mesa-operacao">
        <h5>Registrador Operação na Fase Atual:</h5>
        <div style="display: flex; gap: 5px; margin-bottom: 5px;">
          <select id="tipoResMesa_${index}" style="padding: 5px; font-size: 12px; flex: 1;">
            <option value="Ganho">Ganho (+)</option>
            <option value="Perda">Perda (-)</option>
            <option value="Zero a Zero">Zero a Zero</option>
          </select>
          <input type="number" id="valMesa_${index}" placeholder="Valor ($)" step="0.01" style="padding: 5px; font-size: 12px; width: 90px;">
          <button type="button" style="padding: 5px 10px; font-size: 12px;" onclick="adicionarTradeMesa(${index})">+</button>
        </div>
      </div>

      <div class="historico-mesa-lista">
        ${historicoHTML}
      </div>

      ${temFasesAnteriores ? `
        <button type="button" class="btn-secundario" style="width: 100%; margin-top: 10px; font-size: 12px;" onclick="verHistoricoAnterior(${index})">
          📜 Ver Histórico de Fases Anteriores
        </button>
      ` : ''}

      <div style="margin-top: 15px; text-align: right;">
        <button type="button" class="btn-acao btn-excluir" onclick="excluirMesa(${index})">Remover Mesa</button>
      </div>
    `;
    containerMesas.appendChild(card);
  });
};

document.getElementById('formMesa').addEventListener('submit', async function(e) {
  e.preventDefault();
  const selectMesa = document.getElementById('nomeMesa');
  let nomeMesaFinal = selectMesa.value;

  if (!nomeMesaFinal) return alert("Por favor, adicione ou selecione uma mesa proprietária.");

  const faseSelecionada = document.getElementById('faseMesa').value;
  let valorMeta = 0;

  if (faseSelecionada === 'Conta Real (Financiada)') {
    const modo = document.getElementById('modoMetaMesa').value;
    if (modo === 'com_meta') valorMeta = parseFloat(document.getElementById('metaFaseMesa').value) || 0;
  } else {
    valorMeta = parseFloat(document.getElementById('metaFaseMesa').value) || 0;
  }

  const novaMesa = {
    nome: nomeMesaFinal,
    capital: parseFloat(document.getElementById('capitalMesa').value),
    fase: faseSelecionada,
    metaFase: valorMeta,
    saldoAtualFase: 0,
    historicoFaseAtual: [],
    historicoPassado: []
  };

  await addDoc(collection(db, "users", userUid, "mesas"), novaMesa);
  
  this.reset();
  window.verificarOpcaoMetaForm();
});

window.abrirModalFase = function(index) {
  mesaEmEdicaoIndex = index;
  document.getElementById('modalNovaMeta').value = '';
  window.verificarOpcaoMetaModal();
  document.getElementById('modalFase').style.display = 'flex';
};

window.fecharModalFase = function() {
  document.getElementById('modalFase').style.display = 'none';
  mesaEmEdicaoIndex = null;
};

window.confirmarAvancoFase = async function() {
  if (mesaEmEdicaoIndex === null) return;
  const m = mesas[mesaEmEdicaoIndex];
  const novaFase = document.getElementById('modalNovaFase').value;
  let novaMeta = 0;

  if (novaFase === 'Conta Real (Financiada)') {
    if (document.getElementById('modalModoMeta').value === 'com_meta') {
      novaMeta = parseFloat(document.getElementById('modalNovaMeta').value) || 0;
    }
  } else {
    novaMeta = parseFloat(document.getElementById('modalNovaMeta').value) || 0;
  }

  if (!m.historicoPassado) m.historicoPassado = [];
  m.historicoPassado.push({
    nomeFase: m.fase,
    metaAlcancada: m.metaFase,
    lucroTotalFase: m.saldoAtualFase,
    operacoes: [...(m.historicoFaseAtual || [])]
  });

  await updateDoc(doc(db, "users", userUid, "mesas", m.id), {
    fase: novaFase, metaFase: novaMeta, saldoAtualFase: 0,
    historicoFaseAtual: [], historicoPassado: m.historicoPassado
  });

  window.fecharModalFase();
};

window.verHistoricoAnterior = function(index) {
  const m = mesas[index];
  const container = document.getElementById('conteudoHistoricoAnterior');
  container.innerHTML = '';

  if (!m.historicoPassado || m.historicoPassado.length === 0) {
    container.innerHTML = '<p>Nenhum histórico disponível.</p>';
  } else {
    m.historicoPassado.forEach((faseAnt) => {
      let html = `
        <div style="background: #121214; padding: 10px; border-radius: 6px; margin-bottom: 10px; border-left: 3px solid #00b4d8;">
          <strong style="color:#00b4d8;">${faseAnt.nomeFase}</strong><br>
          <small>Resultado Final: <span class="${faseAnt.lucroTotalFase >= 0 ? 'ganho' : 'perda'}">$ ${faseAnt.lucroTotalFase.toFixed(2)}</span> ${faseAnt.metaAlcancada > 0 ? '/ Meta: $ ' + faseAnt.metaAlcancada.toFixed(2) : '(Sem Meta)'}</small>
          <div style="margin-top: 5px; font-size: 11px;">
      `;
      faseAnt.operacoes.forEach(op => {
        html += `<div style="display:flex;justify-content:space-between; padding: 2px 0;">
          <span>${op.data} - ${op.resultado}</span>
          <span class="${op.valor >= 0 ? 'ganho' : 'perda'}">$ ${op.valor.toFixed(2)}</span>
        </div>`;
      });
      html += `</div></div>`;
      container.innerHTML += html;
    });
  }
  document.getElementById('modalHistoricoGeral').style.display = 'flex';
};

window.fecharModalHistorico = function() {
  document.getElementById('modalHistoricoGeral').style.display = 'none';
};

window.adicionarTradeMesa = async function(index) {
  const selectTipo = document.getElementById(`tipoResMesa_${index}`);
  const inputVal = document.getElementById(`valMesa_${index}`);
  const resultado = selectTipo.value;
  const valorBruto = Math.abs(parseFloat(inputVal.value) || 0);

  if (valorBruto === 0 && resultado !== 'Zero a Zero') return;

  const valorFinal = resultado === 'Ganho' ? valorBruto : (resultado === 'Perda' ? -valorBruto : 0);
  if (!mesas[index].historicoFaseAtual) mesas[index].historicoFaseAtual = [];
  
  const m = mesas[index];
  const hojeData = new Date().toISOString().split('T')[0];
  const newHistorico = [{ data: hojeData, resultado: resultado, valor: valorFinal }, ...(m.historicoFaseAtual || [])];
  
  await updateDoc(doc(db, "users", userUid, "mesas", m.id), {
    historicoFaseAtual: newHistorico, saldoAtualFase: m.saldoAtualFase + valorFinal
  });
};

window.excluirTradeMesa = async function(mesaIndex, tradeIndex) {
  const m = mesas[mesaIndex];
  const trade = m.historicoFaseAtual[tradeIndex];
  
  ultimaExclusaoMesas = { tipo: 'trade', mesaIndex, tradeIndex, trade };
  document.getElementById('btnDesfazerMesas').disabled = false;

  const newHistorico = [...m.historicoFaseAtual];
  newHistorico.splice(tradeIndex, 1);
  
  await updateDoc(doc(db, "users", userUid, "mesas", m.id), {
    historicoFaseAtual: newHistorico, saldoAtualFase: m.saldoAtualFase - trade.valor
  });
};

window.excluirMesa = async function(index) {
  if (confirm('Deseja excluir esta mesa?')) {
    const m = mesas[index];
    ultimaExclusaoMesas = { tipo: 'mesa', index, mesa: m };
    document.getElementById('btnDesfazerMesas').disabled = false;

    await deleteDoc(doc(db, "users", userUid, "mesas", m.id));
  }
};

window.desfazerExclusaoMesas = async function() {
  if (!ultimaExclusaoMesas) return;

  if (ultimaExclusaoMesas.tipo === 'mesa') {
    const m = ultimaExclusaoMesas.mesa;
    await setDoc(doc(db, "users", userUid, "mesas", m.id), {
      nome: m.nome, capital: m.capital, fase: m.fase, metaFase: m.metaFase,
      saldoAtualFase: m.saldoAtualFase, historicoFaseAtual: m.historicoFaseAtual, historicoPassado: m.historicoPassado
    });
  } else if (ultimaExclusaoMesas.tipo === 'trade') {
    const { mesaIndex, tradeIndex, trade } = ultimaExclusaoMesas;
    if (mesas[mesaIndex]) {
      const m = mesas[mesaIndex];
      const newHistorico = [...m.historicoFaseAtual];
      newHistorico.splice(tradeIndex, 0, trade);
      await updateDoc(doc(db, "users", userUid, "mesas", m.id), {
        historicoFaseAtual: newHistorico, saldoAtualFase: m.saldoAtualFase + trade.valor
      });
    }
  }

  ultimaExclusaoMesas = null;
  document.getElementById('btnDesfazerMesas').disabled = true;
};
