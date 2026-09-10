import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, addDoc } from "firebase/firestore";
import { db } from "./firebase-config.js";

const listaPadraoAtivos = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'XAU/USD'];
export let capitalInicial = 0;
export let operacoes = [];
export let ativos = [...listaPadraoAtivos];

let saldoCalculadoAtual = 0;
let indiceEdicao = null;
let ultimaExclusaoDiario = null;
let userUid = null;

export function carregarDadosDiario(uid) {
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

    onSnapshot(doc(db, "users", userUid, "settings", "diario"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.capitalInicial !== undefined) capitalInicial = data.capitalInicial;
        if (data.ativos) ativos = data.ativos;
      }
      
      if (initialLoadDone) {
        atualizarSeletor();
        bomSaldoGeral();
      }
      settingsLoaded = true;
      checkLoad();
    }, (error) => console.error("Erro no onSnapshot settings diario:", error));

    onSnapshot(collection(db, "users", userUid, "operacoes"), (querySnapshot) => {
      operacoes = [];
      querySnapshot.forEach((doc) => {
        operacoes.push({ id: doc.id, ...doc.data() });
      });
      
      operacoes.sort((a, b) => new Date(b.data) - new Date(a.data));
      
      if (initialLoadDone) {
        bomSaldoGeral();
        window.filtrarPorMesEAno();
      }
      opsLoaded = true;
      checkLoad();
    }, (error) => console.error("Erro no onSnapshot operacoes:", error));
  });
}

export function iniciarUI() {
  const inputCapital = document.getElementById('capitalInicial');
  const inputHora = document.getElementById('hora');
  
  if (capitalInicial > 0) inputCapital.value = capitalInicial;
  
  const hoje = new Date();
  document.getElementById('filtroMes').value = String(hoje.getMonth() + 1).padStart(2, '0');
  document.getElementById('filtroAno').value = hoje.getFullYear();
  inputHora.value = hoje.toTimeString().substring(0, 5);

  atualizarSeletor();
  bomSaldoGeral();
  filtrarPorMesEAno();
}

const displaySaldo = document.getElementById('saldoAtual');
const selectPar = document.getElementById('par');
const selectTipoResultado = document.getElementById('tipoResultado');
const tabela = document.getElementById('tabelaCorpo');
const inputValor = document.getElementById('valor');
const inputData = document.getElementById('data');
const inputHora = document.getElementById('hora');
const btnSalvarOperacao = document.getElementById('btnSalvarOperacao');
const btnCancelarEdicao = document.getElementById('btnCancelarEdicao');
const tituloFormulario = document.getElementById('tituloFormulario');

const ctxLinha = document.getElementById('graficoLinha').getContext('2d');
let graficoLinha = new Chart(ctxLinha, {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'Resultado Acumulado ($)',
      data: [],
      borderColor: '#00b4d8',
      backgroundColor: 'rgba(0, 180, 216, 0.1)',
      fill: true,
      tension: 0.2,
      borderWidth: 2,
      pointRadius: 2,
      pointBackgroundColor: '#00b4d8'
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false },
      y: { ticks: { color: '#8d8d99' }, grid: { color: '#29292e' } }
    }
  }
});

const ctxCirculo = document.getElementById('graficoCirculo').getContext('2d');
let graficoCirculo = new Chart(ctxCirculo, {
  type: 'bar',
  data: {
    labels: [],
    datasets: [
      { label: 'Ganhos', data: [], backgroundColor: '#04d361', borderRadius: 4 },
      { label: 'Perdas', data: [], backgroundColor: '#f75a68', borderRadius: 4 }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top', labels: { color: '#e1e1e6' } } },
    scales: {
      x: { ticks: { color: '#e1e1e6' }, grid: { display: false } },
      y: { ticks: { color: '#8d8d99', stepSize: 1 }, grid: { color: '#29292e' }, beginAtZero: true }
    }
  }
});

function atualizarSeletor() {
  selectPar.innerHTML = '';
  const selectExcluir = document.getElementById('selectExcluirAtivo');
  if (selectExcluir) selectExcluir.innerHTML = '';

  if (ativos.length === 0) {
    selectPar.innerHTML = '<option value="">Sem ativos</option>';
    if (selectExcluir) selectExcluir.innerHTML = '<option value="">Sem ativos</option>';
    return;
  }

  ativos.forEach(item => {
    let opt = document.createElement('option');
    opt.value = item;
    opt.textContent = item;
    selectPar.appendChild(opt);

    if (selectExcluir) {
      let opt2 = document.createElement('option');
      opt2.value = item;
      opt2.textContent = item;
      selectExcluir.appendChild(opt2);
    }
  });
}

window.excluirAtivoSelecionado = async function() {
  const select = document.getElementById('selectExcluirAtivo');
  if (!select) return;
  const ativoParaRemover = select.value;
  if (!ativoParaRemover) return;

  if (confirm(`Deseja excluir o ativo "${ativoParaRemover}" da lista?`)) {
    ativos = ativos.filter(a => a !== ativoParaRemover);
    await setDoc(doc(db, "users", userUid, "settings", "diario"), { ativos, capitalInicial }, { merge: true });
    atualizarSeletor();
  }
};

function bomSaldoGeral() {
  saldoCalculadoAtual = capitalInicial;
  operacoes.forEach(op => { saldoCalculadoAtual += op.valor; });
  displaySaldo.textContent = `$ ${saldoCalculadoAtual.toFixed(2)}`;
  atualizarCalculadoraRisco();
}

const inputRiscoPct = document.getElementById('riscoPct');
function atualizarCalculadoraRisco() {
  const pct = parseFloat(inputRiscoPct.value);
  if (!isNaN(pct) && saldoCalculadoAtual > 0) {
    const vRisco = (saldoCalculadoAtual * (pct / 100));
    document.getElementById('riscoValorVal').textContent = `$ ${vRisco.toFixed(2)}`;
    document.getElementById('riscoGainVal').textContent = `$ ${(saldoCalculadoAtual + vRisco).toFixed(2)}`;
    document.getElementById('riscoLossVal').textContent = `$ ${(saldoCalculadoAtual - vRisco).toFixed(2)}`;
  } else {
    document.getElementById('riscoValorVal').textContent = '$ 0,00';
    document.getElementById('riscoGainVal').textContent = '$ 0,00';
    document.getElementById('riscoLossVal').textContent = '$ 0,00';
  }
}
inputRiscoPct.addEventListener('input', atualizarCalculadoraRisco);

function renderizarDados(listaParaExibir, tituloCustom = "Resumo Mensal") {
  tabela.innerHTML = '';
  let g = 0, p = 0, z = 0, totalMes = 0;
  let labelsGrafico = ['Início'];
  let dadosGrafico = [0];
  let acumulado = 0;

  // Grafico looks better if sorted chronological
  let listaGrafico = [...listaParaExibir].sort((a,b) => new Date(a.data) - new Date(b.data));
  listaGrafico.forEach(op => {
    acumulado += op.valor;
    labelsGrafico.push(`Op (${op.data})`);
    dadosGrafico.push(acumulado);
  });

  listaParaExibir.forEach((op) => {
    let indexOriginal = operacoes.indexOf(op);
    totalMes += op.valor;
    
    let classeCor = 'zero';
    if (op.resultado === 'Ganho') { classeCor = 'ganho'; g++; }
    else if (op.resultado === 'Perda') { classeCor = 'perda'; p++; }
    else { z++; }

    let tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${op.data}</td>
      <td>${op.hora || '--:--'}</td>
      <td>${op.par}</td>
      <td>${op.mercado || '-'}</td>
      <td class="${classeCor}">${op.resultado}</td>
      <td class="${classeCor}">${op.valor >= 0 ? '+' : ''}$ ${op.valor.toFixed(2)}</td>
      <td class="col-acoes">
        <button type="button" class="btn-acao btn-editar" onclick="prepararEdicao(${indexOriginal})">Editar</button>
        <button type="button" class="btn-acao btn-excluir" onclick="excluirOperacao(${indexOriginal})">Excluir</button>
      </td>
    `;
    tabela.appendChild(tr);
  });

  document.getElementById('tituloResumo').textContent = tituloCustom;
  document.getElementById('qtdGanhos').textContent = g;
  document.getElementById('qtdPerdas').textContent = p;
  document.getElementById('qtdZeros').textContent = z;
  
  const elTotalMes = document.getElementById('resultadoMesVal');
  elTotalMes.textContent = `${totalMes >= 0 ? '+' : ''}$ ${totalMes.toFixed(2)}`;
  elTotalMes.className = totalMes > 0 ? 'ganho' : (totalMes < 0 ? 'perda' : 'zero');

  graficoLinha.data.labels = labelsGrafico;
  graficoLinha.data.datasets[0].data = dadosGrafico;
  graficoLinha.update();

  let estatisticasHorarios = {};
  listaParaExibir.forEach(op => {
    let horaFormatada = op.hora ? op.hora.split(':')[0] + ':00h' : 'Sem Hora';
    if (!estatisticasHorarios[horaFormatada]) {
      estatisticasHorarios[horaFormatada] = { ganhos: 0, perdas: 0 };
    }
    if (op.resultado === 'Ganho') estatisticasHorarios[horaFormatada].ganhos += 1;
    else if (op.resultado === 'Perda') estatisticasHorarios[horaFormatada].perdas += 1;
  });

  const tbodyHorarios = document.getElementById('tabelaHorariosCorpo');
  tbodyHorarios.innerHTML = '';
  let horasOrdenadas = Object.keys(estatisticasHorarios).sort();

  if (horasOrdenadas.length === 0) {
    tbodyHorarios.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#8d8d99;">Sem dados</td></tr>';
  } else {
    horasOrdenadas.forEach(hora => {
      let stat = estatisticasHorarios[hora];
      let tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${hora}</strong></td><td class="ganho">${stat.ganhos}</td><td class="perda">${stat.perdas}</td>`;
      tbodyHorarios.appendChild(tr);
    });
  }

  graficoCirculo.data.labels = horasOrdenadas.length > 0 ? horasOrdenadas : ['Sem dados'];
  graficoCirculo.data.datasets[0].data = horasOrdenadas.length > 0 ? horasOrdenadas.map(h => estatisticasHorarios[h].ganhos) : [0];
  graficoCirculo.data.datasets[1].data = horasOrdenadas.length > 0 ? horasOrdenadas.map(h => estatisticasHorarios[h].perdas) : [0];
  graficoCirculo.update();
}

function filtrarPorMesEAno() {
  const mes = document.getElementById('filtroMes').value;
  const ano = document.getElementById('filtroAno').value;
  const mercado = document.getElementById('filtroMercado') ? document.getElementById('filtroMercado').value : 'Todos';
  if (!ano) return;
  const chaveBusca = `${ano}-${mes}`;
  const filtradas = operacoes.filter(op => {
    const dataMatch = op.data.startsWith(chaveBusca);
    const mercadoMatch = (mercado === 'Todos') || (op.mercado === mercado) || (!op.mercado && mercado === 'B3');
    return dataMatch && mercadoMatch;
  });
  const nomeMes = document.getElementById('filtroMes').options[document.getElementById('filtroMes').selectedIndex].text;
  let tituloMercado = mercado === 'Todos' ? '' : ` (${mercado})`;
  renderizarDados(filtradas, `Resumo - ${nomeMes} / ${ano}${tituloMercado}`);
}
window.filtrarPorMesEAno = filtrarPorMesEAno;
document.getElementById('btnPesquisar').addEventListener('click', filtrarPorMesEAno);

document.getElementById('btnVerTodos').addEventListener('click', function() {
  if (document.getElementById('filtroMercado')) document.getElementById('filtroMercado').value = 'Todos';
  renderizarDados(operacoes, "Resumo Geral");
});

window.exportarHistoricoPDF = function() {
  const elemento = document.getElementById('cardHistoricoMensal');
  const acoesHeaders = elemento.querySelectorAll('.col-acoes');
  const painelBusca = elemento.querySelector('.painel-busca');
  
  if (!elemento) {
    console.error("Elemento 'cardHistoricoMensal' não encontrado.");
    alert("Erro: Não foi possível encontrar os dados para exportar.");
    return;
  }

  // Solução para o bug do html2canvas gerando PDF em branco quando a tela está rolada
  const originalScrollY = window.scrollY;
  window.scrollTo(0, 0);

  acoesHeaders.forEach(el => el.style.display = 'none');
  if (painelBusca) painelBusca.style.display = 'none';

  const opt = {
    margin: 0.5,
    filename: `Diario_Operacoes_${new Date().toLocaleString()}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { 
      scale: 2, 
      scrollY: 0, 
      windowWidth: document.documentElement.offsetWidth
    },
    jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  };

  try {
    html2pdf().set(opt).from(elemento).save().then(() => {
      acoesHeaders.forEach(el => el.style.display = '');
      if (painelBusca) painelBusca.style.display = '';
      window.scrollTo(0, originalScrollY);
    }).catch((error) => {
      console.error("Erro na promise do html2pdf:", error);
      alert("Ocorreu um erro ao gerar o PDF. Verifique os dados ou consulte o console.");
      acoesHeaders.forEach(el => el.style.display = '');
      if (painelBusca) painelBusca.style.display = '';
      window.scrollTo(0, originalScrollY);
    });
  } catch (error) {
    console.error("Erro fatal ao iniciar a exportação:", error);
    alert("Erro crítico ao iniciar a geração do PDF.");
    acoesHeaders.forEach(el => el.style.display = '');
    if (painelBusca) painelBusca.style.display = '';
    window.scrollTo(0, originalScrollY);
  }
};

window.excluirOperacao = async function(index) {
  if (confirm('Excluir operação?')) {
    const op = operacoes[index];
    ultimaExclusaoDiario = { index, operacao: op };
    document.getElementById('btnDesfazerDiario').disabled = false;

    await deleteDoc(doc(db, "users", userUid, "operacoes", op.id));
    
    if (indiceEdicao === index) window.cancelarEdicao();
  }
};

window.desfazerExclusaoDiario = async function() {
  if (!ultimaExclusaoDiario) return;
  const op = ultimaExclusaoDiario.operacao;
  await setDoc(doc(db, "users", userUid, "operacoes", op.id), {
    data: op.data, hora: op.hora, par: op.par, mercado: op.mercado || 'B3', resultado: op.resultado, valor: op.valor
  });
  
  ultimaExclusaoDiario = null;
  document.getElementById('btnDesfazerDiario').disabled = true;
};

window.prepararEdicao = function(index) {
  const op = operacoes[index];
  indiceEdicao = index;
  inputData.value = op.data;
  inputHora.value = op.hora || '';
  selectPar.value = op.par;
  document.getElementById('mercado').value = op.mercado || 'B3';
  selectTipoResultado.value = op.resultado;
  inputValor.value = Math.abs(op.valor);
  tituloFormulario.textContent = "Editar Operação";
  btnSalvarOperacao.textContent = "Atualizar Operação";
  btnCancelarEdicao.style.display = "inline-block";
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.cancelarEdicao = function() {
  indiceEdicao = null;
  document.getElementById('tradeForm').reset();
  inputHora.value = new Date().toTimeString().substring(0, 5);
  tituloFormulario.textContent = "Registrador Nova Operação";
  btnSalvarOperacao.textContent = "Salvar Operação";
  btnCancelarEdicao.style.display = "none";
};
btnCancelarEdicao.addEventListener('click', window.cancelarEdicao);

document.getElementById('btnSalvarCapital').addEventListener('click', async function() {
  capitalInicial = parseFloat(document.getElementById('capitalInicial').value) || 0;
  await setDoc(doc(db, "users", userUid, "settings", "diario"), { capitalInicial, ativos }, { merge: true });
});

document.getElementById('btnSalvarAtivo').addEventListener('click', async function() {
  let txt = document.getElementById('novoAtivo').value.trim().toUpperCase();
  if (txt !== '' && !ativos.includes(txt)) {
    ativos.push(txt);
    await setDoc(doc(db, "users", userUid, "settings", "diario"), { capitalInicial, ativos }, { merge: true });
    atualizarSeletor();
    selectPar.value = txt;
    document.getElementById('novoAtivo').value = '';
  }
});

document.getElementById('tradeForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  let data = inputData.value;
  let hora = inputHora.value;
  let par = selectPar.value;
  let mercado = document.getElementById('mercado').value;
  let resultado = selectTipoResultado.value;
  let valorBruto = Math.abs(parseFloat(inputValor.value) || 0);
  let valor = resultado === 'Ganho' ? valorBruto : (resultado === 'Perda' ? -valorBruto : 0);

  if (indiceEdicao !== null) {
    const op = operacoes[indiceEdicao];
    await updateDoc(doc(db, "users", userUid, "operacoes", op.id), { data, hora, par, mercado, resultado, valor });
    window.cancelarEdicao();
  } else {
    await addDoc(collection(db, "users", userUid, "operacoes"), { data, hora, par, mercado, resultado, valor });
    inputValor.value = '';
  }
});
