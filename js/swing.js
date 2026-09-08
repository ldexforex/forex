import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, addDoc } from "firebase/firestore";
import { db } from "./firebase-config.js";

const ativosPadraoSwing = ['PETR4', 'VALE3', 'EUR/USD', 'BTC/USD', 'AAPL'];
export let ativosSwing = [...ativosPadraoSwing];
export let swingTrades = [];

let ultimaExclusaoSwing = null;
let userUid = null;

const ctxSwingLinha = document.getElementById('graficoSwingLinha').getContext('2d');
let graficoSwingLinha = new Chart(ctxSwingLinha, {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'Lucro/Prejuízo Acumulado ($)',
      data: [],
      borderColor: '#00b4d8',
      backgroundColor: 'rgba(0, 180, 216, 0.15)',
      fill: true,
      tension: 0.2,
      borderWidth: 2,
      pointRadius: 3,
      pointBackgroundColor: '#00b4d8'
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#8d8d99' }, grid: { color: '#29292e' } },
      y: { ticks: { color: '#8d8d99' }, grid: { color: '#29292e' } }
    }
  }
});

export function carregarDadosSwing(uid) {
  userUid = uid;
  return new Promise((resolve) => {
    let settingsLoaded = false;
    let opsLoaded = false;
    let initialLoadDone = false;

    function checkLoad() {
      if (settingsLoaded && opsLoaded && !initialLoadDone) {
        initialLoadDone = true;
        resolve();
      }
    }

    onSnapshot(doc(db, "users", userUid, "settings", "swing"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.ativosSwing) ativosSwing = data.ativosSwing;
      }
      if (initialLoadDone) {
        atualizarSelectsAtivos();
      }
      settingsLoaded = true;
      checkLoad();
    });

    onSnapshot(collection(db, "users", userUid, "swingTrades"), (querySnapshot) => {
      swingTrades = [];
      querySnapshot.forEach((doc) => {
        swingTrades.push({ id: doc.id, ...doc.data() });
      });
      
      swingTrades.sort((a, b) => new Date(b.data) - new Date(a.data));
      
      if (initialLoadDone) {
        window.filtrarSwingTrades();
      }
      opsLoaded = true;
      checkLoad();
    });
  });
}

export function iniciarSwingUI() {
  atualizarSelectsAtivos();
  window.filtrarSwingTrades();
}

function atualizarSelectsAtivos() {
  const selectForm = document.getElementById('swingAtivo');
  const selectExcluir = document.getElementById('selectExcluirAtivoSwing');
  
  selectForm.innerHTML = '';
  selectExcluir.innerHTML = '';

  if (ativosSwing.length === 0) {
    selectForm.innerHTML = '<option value="">Sem ativos</option>';
    selectExcluir.innerHTML = '<option value="">Sem ativos</option>';
    return;
  }

  ativosSwing.forEach(ativo => {
    const opt1 = document.createElement('option');
    opt1.value = ativo;
    opt1.textContent = ativo;
    selectForm.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = ativo;
    opt2.textContent = ativo;
    selectExcluir.appendChild(opt2);
  });
}

document.getElementById('btnSalvarAtivoSwing').addEventListener('click', async function() {
  const input = document.getElementById('novoAtivoSwing');
  const novoAtivo = input.value.trim().toUpperCase();

  if (novoAtivo !== '' && !ativosSwing.includes(novoAtivo)) {
    ativosSwing.push(novoAtivo);
    await setDoc(doc(db, "users", userUid, "settings", "swing"), { ativosSwing }, { merge: true });
    atualizarSelectsAtivos();
    document.getElementById('swingAtivo').value = novoAtivo;
    input.value = '';
  }
});

window.excluirAtivoSwingSelecionado = async function() {
  const select = document.getElementById('selectExcluirAtivoSwing');
  const ativoParaRemover = select.value;
  if (!ativoParaRemover) return;

  if (confirm(`Deseja remover "${ativoParaRemover}" da lista?`)) {
    ativosSwing = ativosSwing.filter(a => a !== ativoParaRemover);
    await setDoc(doc(db, "users", userUid, "settings", "swing"), { ativosSwing }, { merge: true });
    atualizarSelectsAtivos();
  }
};

document.getElementById('formSwingTrade').addEventListener('submit', async function(e) {
  e.preventDefault();

  const resultadoTipoVal = document.getElementById('swingResultadoTipo').value;
  const valorResultadoBruto = Math.abs(parseFloat(document.getElementById('swingValorResultado').value) || 0);

  let estadoVal = 'Em Aberto';
  let resultadoFinal = 0;

  if (resultadoTipoVal !== 'Em Aberto') {
    estadoVal = 'Encerrado';
    resultadoFinal = resultadoTipoVal === 'Ganho' ? valorResultadoBruto : (resultadoTipoVal === 'Perda' ? -valorResultadoBruto : 0);
  }

  const novoSwing = {
    data: document.getElementById('swingData').value,
    ativo: document.getElementById('swingAtivo').value,
    tipo: document.getElementById('swingTipo').value,
    estado: estadoVal,
    resultadoTipo: resultadoTipoVal,
    resultado: resultadoFinal
  };

  await addDoc(collection(db, "users", userUid, "swingTrades"), novoSwing);
  
  this.reset();
  document.getElementById('swingData').valueAsDate = new Date();
});

window.renderizarSwingTrades = function(lista) {
  const tbody = document.getElementById('tabelaSwingCorpo');
  tbody.innerHTML = '';

  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#8d8d99;">Nenhuma operação encontrada no histórico.</td></tr>';
    graficoSwingLinha.data.labels = ['Início'];
    graficoSwingLinha.data.datasets[0].data = [0];
    graficoSwingLinha.update();
    return;
  }

  let listaOrdenadaCronologica = [...lista].sort((a, b) => new Date(a.data) - new Date(b.data));
  let acumulado = 0;
  let labelsGrafico = ['Início'];
  let dadosGrafico = [0];

  listaOrdenadaCronologica.forEach((st) => {
    if (st.estado === 'Encerrado') acumulado += st.resultado;
    labelsGrafico.push(`${st.ativo} (${st.data.split('-').slice(1).join('/')})`);
    dadosGrafico.push(acumulado);
  });

  graficoSwingLinha.data.labels = labelsGrafico;
  graficoSwingLinha.data.datasets[0].data = dadosGrafico;
  graficoSwingLinha.update();

  lista.forEach((st) => {
    const indexOriginal = swingTrades.indexOf(st);
    const tr = document.createElement('tr');
    
    let textoResultado = '<span class="em-aberto">Em Aberto</span>';

    if (st.estado === 'Encerrado') {
      if (st.resultado > 0) textoResultado = `<span class="ganho">+$ ${st.resultado.toFixed(2)}</span>`;
      else if (st.resultado < 0) textoResultado = `<span class="perda">-$ ${Math.abs(st.resultado).toFixed(2)}</span>`;
      else textoResultado = `<span class="zero">$ 0,00</span>`;
    }

    const estadoBadge = st.estado === 'Em Aberto' 
      ? '<span class="em-aberto">⏳ Em Aberto</span>' 
      : '<span style="color: #00b4d8;">✓ Encerrado</span>';
    
    tr.innerHTML = `
      <td>${st.data}</td>
      <td><strong>${st.ativo}</strong></td>
      <td>${st.tipo}</td>
      <td>${estadoBadge}</td>
      <td>${textoResultado}</td>
      <td class="col-acoes">
        ${st.estado === 'Em Aberto' ? `
          <div class="box-encerrar-swing" style="flex-direction: column; align-items: flex-start; gap: 4px;">
            <div style="display: flex; gap: 4px;">
              <select id="selResultadoSwing_${indexOriginal}">
                <option value="Ganho">Ganho</option>
                <option value="Perda">Perda</option>
                <option value="Zero a Zero">Zero a Zero</option>
              </select>
              <input type="number" id="valResultadoSwing_${indexOriginal}" placeholder="Lucro/Prej ($)" step="0.01" style="width: 85px;">
              <button type="button" class="btn-acao btn-ganho" onclick="encerrarOperacaoSwingNaTabela(${indexOriginal})">Concluir</button>
            </div>
          </div>
        ` : ''}
        <button type="button" class="btn-acao btn-excluir" onclick="excluirSwingTrade(${indexOriginal})">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
};

window.encerrarOperacaoSwingNaTabela = async function(index) {
  const selectTipo = document.getElementById(`selResultadoSwing_${index}`);
  const inputValor = document.getElementById(`valResultadoSwing_${index}`);
  if (!selectTipo || !inputValor) return;

  const tipo = selectTipo.value;
  const valorBruto = Math.abs(parseFloat(inputValor.value) || 0);
  const trade = swingTrades[index];
  
  const estado = 'Encerrado';
  const resultadoTipo = tipo;
  const resultado = tipo === 'Ganho' ? valorBruto : (tipo === 'Perda' ? -valorBruto : 0);

  await updateDoc(doc(db, "users", userUid, "swingTrades", trade.id), { estado, resultadoTipo, resultado });
};

window.excluirSwingTrade = async function(index) {
  if (confirm('Deseja excluir esta operação do histórico de Swing Trade?')) {
    const trade = swingTrades[index];
    ultimaExclusaoSwing = { index, trade };
    document.getElementById('btnDesfazerSwing').disabled = false;

    await deleteDoc(doc(db, "users", userUid, "swingTrades", trade.id));
  }
};

window.desfazerExclusaoSwing = async function() {
  if (!ultimaExclusaoSwing) return;
  const t = ultimaExclusaoSwing.trade;
  
  await setDoc(doc(db, "users", userUid, "swingTrades", t.id), {
    data: t.data, ativo: t.ativo, tipo: t.tipo, estado: t.estado, resultadoTipo: t.resultadoTipo, resultado: t.resultado
  });
  
  ultimaExclusaoSwing = null;
  document.getElementById('btnDesfazerSwing').disabled = true;
};

window.filtrarSwingTrades = function() {
  const mes = document.getElementById('filtroMesSwing').value;
  const ano = document.getElementById('filtroAnoSwing').value;
  
  if (!ano) {
    window.renderizarSwingTrades(swingTrades);
    return;
  }

  const busca = `${ano}-${mes}`;
  const filtrados = swingTrades.filter(st => st.data.startsWith(busca));
  window.renderizarSwingTrades(filtrados);
};
document.querySelector('#filtroMesSwing').parentElement.querySelector('button.btn-secundario').addEventListener('click', window.filtrarSwingTrades);

window.exportarHistoricoSwingPDF = function() {
  const elemento = document.getElementById('cardHistoricoSwing');
  const acoes = elemento.querySelectorAll('.col-acoes');
  const painelBusca = elemento.querySelector('.painel-busca');
  
  acoes.forEach(el => el.style.display = 'none');
  if (painelBusca) painelBusca.style.display = 'none';

  html2pdf().from(elemento).save().then(() => {
    acoes.forEach(el => el.style.display = '');
    if (painelBusca) painelBusca.style.display = '';
  });
};

window.swingTradesGlobal = swingTrades;
