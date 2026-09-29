import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, addDoc } from "firebase/firestore";
import { db } from "./firebase-config.js";

const listaPadraoAtivos = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'XAU/USD'];
export let capitalInicial = 0;
export let capitalInicialUSD = 0;
export let capitalInicialBRL = 0;
export let operacoes = [];
export let ativos = [...listaPadraoAtivos];

let saldoCalculadoUSD = 0;
let saldoCalculadoBRL = 0;
let saldoCalculadoAtual = 0;
let indiceEdicao = null;
let ultimaExclusaoDiario = null;
let userUid = null;

export function formatarSaldo(valor, mercado) {
  const sinal = valor < 0 ? '-' : '';
  const abs = Math.abs(valor);
  if (mercado === 'FOREX') {
    return `${sinal}$ ${abs.toFixed(2)}`;
  } else {
    return `${sinal}R$ ${abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export function formatarMoeda(valor, mercado) {
  const sinal = valor >= 0 ? '+' : '-';
  const abs = Math.abs(valor);
  if (mercado === 'FOREX') {
    return `${sinal}$ ${abs.toFixed(2)}`;
  } else {
    return `${sinal}R$ ${abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

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
        if (data.capitalInicialUSD !== undefined) {
          capitalInicialUSD = parseFloat(data.capitalInicialUSD) || 0;
        } else if (data.capitalInicial !== undefined) {
          capitalInicialUSD = parseFloat(data.capitalInicial) || 0;
        }
        if (data.capitalInicialBRL !== undefined) {
          capitalInicialBRL = parseFloat(data.capitalInicialBRL) || 0;
        }
        capitalInicial = capitalInicialUSD;
        if (data.ativos) ativos = data.ativos;
      }
      
      if (initialLoadDone) {
        const inputCapUSD = document.getElementById('capitalInicialUSD');
        const inputCapBRL = document.getElementById('capitalInicialBRL');
        if (inputCapUSD && capitalInicialUSD > 0) inputCapUSD.value = capitalInicialUSD;
        if (inputCapBRL && capitalInicialBRL > 0) inputCapBRL.value = capitalInicialBRL;

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
  const inputCapUSD = document.getElementById('capitalInicialUSD');
  const inputCapBRL = document.getElementById('capitalInicialBRL');
  const inputHora = document.getElementById('hora');
  
  if (inputCapUSD && capitalInicialUSD > 0) inputCapUSD.value = capitalInicialUSD;
  if (inputCapBRL && capitalInicialBRL > 0) inputCapBRL.value = capitalInicialBRL;
  
  const hoje = new Date();
  document.getElementById('filtroMes').value = String(hoje.getMonth() + 1).padStart(2, '0');
  document.getElementById('filtroAno').value = hoje.getFullYear();
  inputHora.value = hoje.toTimeString().substring(0, 5);

  atualizarPlaceholderMoeda();
  atualizarSeletor();
  bomSaldoGeral();
  filtrarPorMesEAno();
}

const displaySaldoUSD = document.getElementById('saldoAtualUSD');
const displaySaldoBRL = document.getElementById('saldoAtualBRL');
const selectPar = document.getElementById('par');
const selectMercado = document.getElementById('mercado');
const selectTipoResultado = document.getElementById('tipoResultado');
const tabela = document.getElementById('tabelaCorpo');
const inputValor = document.getElementById('valor');
const inputData = document.getElementById('data');
const inputHora = document.getElementById('hora');
const btnSalvarOperacao = document.getElementById('btnSalvarOperacao');
const btnCancelarEdicao = document.getElementById('btnCancelarEdicao');
const tituloFormulario = document.getElementById('tituloFormulario');
const selectRiscoMercado = document.getElementById('riscoMercado');
const inputRiscoPct = document.getElementById('riscoPct');

function atualizarPlaceholderMoeda() {
  if (!selectMercado || !inputValor) return;
  if (selectMercado.value === 'FOREX') {
    inputValor.placeholder = "Valor ($)";
  } else {
    inputValor.placeholder = "Valor (R$)";
  }
}
if (selectMercado) {
  selectMercado.addEventListener('change', atualizarPlaceholderMoeda);
}

const ctxLinha = document.getElementById('graficoLinha').getContext('2d');
let graficoLinha = new Chart(ctxLinha, {
  type: 'line',
  data: {
    labels: [],
    datasets: []
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
        labels: { color: '#e1e1e6' }
      }
    },
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
    await setDoc(doc(db, "users", userUid, "settings", "diario"), {
      capitalInicialUSD,
      capitalInicialBRL,
      capitalInicial: capitalInicialUSD,
      ativos
    }, { merge: true });
    atualizarSeletor();
  }
};

function bomSaldoGeral() {
  saldoCalculadoUSD = capitalInicialUSD;
  saldoCalculadoBRL = capitalInicialBRL;

  operacoes.forEach(op => {
    const mercado = op.mercado || 'B3';
    if (mercado === 'FOREX') {
      saldoCalculadoUSD += op.valor;
    } else {
      saldoCalculadoBRL += op.valor;
    }
  });

  saldoCalculadoAtual = saldoCalculadoUSD;

  if (displaySaldoUSD) displaySaldoUSD.textContent = formatarSaldo(saldoCalculadoUSD, 'FOREX');
  if (displaySaldoBRL) displaySaldoBRL.textContent = formatarSaldo(saldoCalculadoBRL, 'B3');

  const elSaldoLegacy = document.getElementById('saldoAtual');
  if (elSaldoLegacy) elSaldoLegacy.textContent = formatarSaldo(saldoCalculadoUSD, 'FOREX');

  atualizarCalculadoraRisco();
}

function atualizarCalculadoraRisco() {
  const pct = parseFloat(inputRiscoPct.value);
  const mercado = selectRiscoMercado ? selectRiscoMercado.value : 'FOREX';
  const saldoBase = mercado === 'FOREX' ? saldoCalculadoUSD : saldoCalculadoBRL;

  const lblValor = document.getElementById('lblRiscoValor');
  const lblGain = document.getElementById('lblRiscoGain');
  const lblLoss = document.getElementById('lblRiscoLoss');
  const simbolo = mercado === 'FOREX' ? '$' : 'R$';

  if (lblValor) lblValor.textContent = `Valor em Risco (${simbolo}):`;
  if (lblGain) lblGain.textContent = `Se der Lucro (1:1) (${simbolo}):`;
  if (lblLoss) lblLoss.textContent = `Se der Loss (1:1) (${simbolo}):`;

  if (!isNaN(pct) && saldoBase > 0) {
    const vRisco = saldoBase * (pct / 100);
    document.getElementById('riscoValorVal').textContent = formatarSaldo(vRisco, mercado);
    document.getElementById('riscoGainVal').textContent = formatarSaldo(saldoBase + vRisco, mercado);
    document.getElementById('riscoLossVal').textContent = formatarSaldo(saldoBase - vRisco, mercado);
  } else {
    const zeroFmt = mercado === 'FOREX' ? '$ 0.00' : 'R$ 0,00';
    document.getElementById('riscoValorVal').textContent = zeroFmt;
    document.getElementById('riscoGainVal').textContent = zeroFmt;
    document.getElementById('riscoLossVal').textContent = zeroFmt;
  }
}
if (inputRiscoPct) inputRiscoPct.addEventListener('input', atualizarCalculadoraRisco);
if (selectRiscoMercado) selectRiscoMercado.addEventListener('change', atualizarCalculadoraRisco);

function renderizarDados(listaParaExibir, tituloCustom = "Resumo Mensal") {
  tabela.innerHTML = '';
  let g = 0, p = 0, z = 0;
  let totalUSD = 0;
  let totalBRL = 0;

  const mercadoFiltro = document.getElementById('filtroMercado') ? document.getElementById('filtroMercado').value : 'Todos';

  listaParaExibir.forEach((op) => {
    let indexOriginal = operacoes.indexOf(op);
    const opMercado = op.mercado || 'B3';

    if (opMercado === 'FOREX') {
      totalUSD += op.valor;
    } else {
      totalBRL += op.valor;
    }
    
    let classeCor = 'zero';
    if (op.resultado === 'Ganho') { classeCor = 'ganho'; g++; }
    else if (op.resultado === 'Perda') { classeCor = 'perda'; p++; }
    else { z++; }

    let tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${op.data}</td>
      <td>${op.hora || '--:--'}</td>
      <td>${op.par}</td>
      <td><strong>${opMercado}</strong></td>
      <td class="${classeCor}">${op.resultado}</td>
      <td class="${classeCor}">${formatarMoeda(op.valor, opMercado)}</td>
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
  
  const boxUSD = document.getElementById('boxResultadoUSD');
  const boxBRL = document.getElementById('boxResultadoBRL');
  const elUSD = document.getElementById('resultadoMesValUSD');
  const elBRL = document.getElementById('resultadoMesValBRL');

  if (elUSD) {
    elUSD.textContent = formatarMoeda(totalUSD, 'FOREX');
    elUSD.className = totalUSD > 0 ? 'ganho' : (totalUSD < 0 ? 'perda' : 'zero');
  }
  if (elBRL) {
    elBRL.textContent = formatarMoeda(totalBRL, 'B3');
    elBRL.className = totalBRL > 0 ? 'ganho' : (totalBRL < 0 ? 'perda' : 'zero');
  }

  if (boxUSD && boxBRL) {
    if (mercadoFiltro === 'FOREX') {
      boxUSD.style.display = 'block';
      boxBRL.style.display = 'none';
    } else if (mercadoFiltro === 'B3') {
      boxUSD.style.display = 'none';
      boxBRL.style.display = 'block';
    } else {
      boxUSD.style.display = 'block';
      boxBRL.style.display = 'block';
    }
  }

  // Gráfico de Linha: Evolução
  let listaGrafico = [...listaParaExibir].sort((a,b) => new Date(a.data) - new Date(b.data));

  if (listaGrafico.length === 0) {
    graficoLinha.data.labels = ['Sem dados'];
    graficoLinha.data.datasets = [{
      label: 'Acumulado',
      data: [0],
      borderColor: '#00b4d8',
      backgroundColor: 'rgba(0, 180, 216, 0.1)',
      fill: true
    }];
    graficoLinha.options.plugins.legend.display = false;
  } else if (mercadoFiltro === 'FOREX') {
    let labelsGrafico = ['Início'];
    let dadosGrafico = [0];
    let acumulado = 0;
    listaGrafico.forEach(op => {
      acumulado += op.valor;
      labelsGrafico.push(`Op (${op.data})`);
      dadosGrafico.push(acumulado);
    });
    graficoLinha.data.labels = labelsGrafico;
    graficoLinha.data.datasets = [{
      label: 'FOREX Acumulado ($)',
      data: dadosGrafico,
      borderColor: '#00b4d8',
      backgroundColor: 'rgba(0, 180, 216, 0.1)',
      fill: true,
      tension: 0.2,
      borderWidth: 2,
      pointRadius: 2,
      pointBackgroundColor: '#00b4d8'
    }];
    graficoLinha.options.plugins.legend.display = false;
  } else if (mercadoFiltro === 'B3') {
    let labelsGrafico = ['Início'];
    let dadosGrafico = [0];
    let acumulado = 0;
    listaGrafico.forEach(op => {
      acumulado += op.valor;
      labelsGrafico.push(`Op (${op.data})`);
      dadosGrafico.push(acumulado);
    });
    graficoLinha.data.labels = labelsGrafico;
    graficoLinha.data.datasets = [{
      label: 'B3 Acumulado (R$)',
      data: dadosGrafico,
      borderColor: '#04d361',
      backgroundColor: 'rgba(4, 211, 97, 0.1)',
      fill: true,
      tension: 0.2,
      borderWidth: 2,
      pointRadius: 2,
      pointBackgroundColor: '#04d361'
    }];
    graficoLinha.options.plugins.legend.display = false;
  } else {
    // Todos os mercados: traçar curvas independentes para FOREX e B3
    let labelsGrafico = ['Início'];
    let dadosUSD = [0];
    let dadosBRL = [0];
    let accUSD = 0;
    let accBRL = 0;

    listaGrafico.forEach(op => {
      const opMercado = op.mercado || 'B3';
      if (opMercado === 'FOREX') {
        accUSD += op.valor;
      } else {
        accBRL += op.valor;
      }
      labelsGrafico.push(`${op.data} (${opMercado})`);
      dadosUSD.push(accUSD);
      dadosBRL.push(accBRL);
    });

    graficoLinha.data.labels = labelsGrafico;
    graficoLinha.data.datasets = [
      {
        label: 'FOREX ($)',
        data: dadosUSD,
        borderColor: '#00b4d8',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.2,
        borderWidth: 2,
        pointRadius: 2,
        pointBackgroundColor: '#00b4d8'
      },
      {
        label: 'B3 (R$)',
        data: dadosBRL,
        borderColor: '#04d361',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.2,
        borderWidth: 2,
        pointRadius: 2,
        pointBackgroundColor: '#04d361'
      }
    ];
    graficoLinha.options.plugins.legend.display = true;
  }
  graficoLinha.update();

  // Gráfico e Tabela de Horários
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
    const opMercado = op.mercado || 'B3';
    const mercadoMatch = (mercado === 'Todos') || (opMercado === mercado);
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
    data: op.data,
    hora: op.hora,
    par: op.par,
    mercado: op.mercado || 'B3',
    resultado: op.resultado,
    valor: op.valor
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
  atualizarPlaceholderMoeda();
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
  atualizarPlaceholderMoeda();
  tituloFormulario.textContent = "Registrador Nova Operação";
  btnSalvarOperacao.textContent = "Salvar Operação";
  btnCancelarEdicao.style.display = "none";
};
btnCancelarEdicao.addEventListener('click', window.cancelarEdicao);

document.getElementById('btnSalvarCapital').addEventListener('click', async function() {
  const inputCapUSD = document.getElementById('capitalInicialUSD');
  const inputCapBRL = document.getElementById('capitalInicialBRL');
  
  capitalInicialUSD = parseFloat(inputCapUSD ? inputCapUSD.value : 0) || 0;
  capitalInicialBRL = parseFloat(inputCapBRL ? inputCapBRL.value : 0) || 0;
  capitalInicial = capitalInicialUSD;

  await setDoc(doc(db, "users", userUid, "settings", "diario"), {
    capitalInicialUSD,
    capitalInicialBRL,
    capitalInicial: capitalInicialUSD,
    ativos
  }, { merge: true });

  bomSaldoGeral();
});

document.getElementById('btnSalvarAtivo').addEventListener('click', async function() {
  let txt = document.getElementById('novoAtivo').value.trim().toUpperCase();
  if (txt !== '' && !ativos.includes(txt)) {
    ativos.push(txt);
    await setDoc(doc(db, "users", userUid, "settings", "diario"), {
      capitalInicialUSD,
      capitalInicialBRL,
      capitalInicial: capitalInicialUSD,
      ativos
    }, { merge: true });
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
