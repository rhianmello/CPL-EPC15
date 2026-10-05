(function () {
  const cfg = window.EPC15_CONFIG;
  const registry = {};
  Chart.defaults.color = '#8fa4bd';
  Chart.defaults.borderColor = cfg.colors.grid;
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';

  function replace(id, canvasId, config) {
    if (registry[id]) registry[id].destroy();
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    registry[id] = new Chart(canvas, config);
  }

  function percentValue(value) {
    return Number.isFinite(value) ? value * 100 : null;
  }

  function unitProgress(units, canvasId, id) {
    const options = commonOptions('%');
    if (canvasId === 'executive-phases-chart') {
      options.plugins.legend.labels.font = { size: 10 };
      options.plugins.legend.labels.boxHeight = 7;
      options.scales.x.ticks = {
        font: { size: 8 }, autoSkip: false, minRotation: 30, maxRotation: 30, padding: 5
      };
    }
    replace(id, canvasId, {
      type: 'bar',
      data: { labels: units.map(u => u.code), datasets: [
        { label: 'Previsto', data: units.map(u => percentValue(u.planned)), backgroundColor: 'rgba(59,130,246,.78)', borderRadius: 5 },
        { label: 'Realizado', data: units.map(u => percentValue(u.actual)), backgroundColor: 'rgba(34,211,238,.8)', borderRadius: 5 }
      ] },
      options
    });
  }

  function phaseProgress(phases) { unitProgress(phases.map(p => ({ ...p, code: p.phase })), 'phase-chart', 'phase'); }

  function variance(units, label='Desvio') {
    replace('variance', 'variance-chart', {
      type: 'bar',
      data: { labels: units.map(u => u.code), datasets: [{
        label, data: units.map(u => percentValue(u.variance)),
        backgroundColor: units.map(u => !Number.isFinite(u.variance) ? cfg.colors.neutral : u.variance >= 0 ? cfg.colors.green : u.variance >= cfg.status.attention ? cfg.colors.orange : cfg.colors.red), borderRadius: 5
      }] },
      options: commonOptions('%', true)
    });
  }

  function commonOptions(suffix, horizontal) {
    return {
      responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x',
      spanGaps: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { usePointStyle: true, boxWidth: 7 } }, tooltip: { callbacks: { label: ctx => Number.isFinite(ctx.raw) ? `${ctx.dataset.label}: ${ctx.raw.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${suffix}` : `${ctx.dataset.label}: Sem dado` } } },
      scales: { x: { grid: { color: cfg.colors.grid }, ticks: horizontal ? { callback: value => `${value}%` } : {} }, y: { grid: { color: horizontal ? 'transparent' : cfg.colors.grid }, beginAtZero: true, ticks: horizontal ? {} : { callback: value => `${value}%` } } }
    };
  }

  function excelSerial(value) {
    const date=value instanceof Date ? value : new Date(value);
    if(Number.isNaN(date.valueOf())) return null;
    return Math.round((Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()) - Date.UTC(1899,11,30)) / 86400000);
  }

  function normalizeFinancialCurve(curve, options={}) {
    if(!curve?.series?.length) return null;
    const labels=curve.labels || curve.series.find(s=>s.categories?.length)?.categories || [];
    const rawSource=curve.source === 'financial-sheets' || curve.source === 'blplanataq-direct';
    const allRaw=curve.series.flatMap(s=>s.values || []).filter(Number.isFinite);
    if(!allRaw.length) return null;
    const asPercent=rawSource || Math.max(...allRaw.map(v=>Math.abs(v))) <= 1.5;
    const dataSerial=Number.isFinite(Number(curve?.summary?.dataSerial))
      ? Number(curve.summary.dataSerial)
      : excelSerial(options.dataBase);
    const serials=Array.isArray(curve.serials) ? curve.serials : null;

    const series=curve.series.map(s=>({
      ...s,
      values:(s.values || []).map((v,index)=>{
        if(!Number.isFinite(v)) return null;

        // A mesma regra vale para dashboard e apresentação:
        // Real termina na data-base dinâmica da planilha/publicação.
        if(s.key==='real' && Number.isFinite(dataSerial) && serials &&
           Number(serials[index]) > dataSerial) return null;

        const plotted=asPercent ? v*100 : v;

        // Evita fórmula futura/valor inválido gerar salto artificial na curva física.
        if(asPercent && s.key==='real' && (plotted < -0.001 || plotted > 100.001)) return null;
        return plotted;
      })
    }));

    return {labels,series,asPercent,dataSerial};
  }

  function financialCurve(curve) {
    if (registry.unitCurve) { registry.unitCurve.destroy(); delete registry.unitCurve; }
    const normalized=normalizeFinancialCurve(curve);
    if(!normalized) return false;
    const canvas = document.getElementById('unit-curve-chart');
    if (!canvas) return false;

    const {labels,series,asPercent}=normalized;
    const styles = {
      planAttack:{color:'#69a9e7',dash:[],width:1.8,points:0},
      contractual:{color:'#0b2f70',dash:[],width:2.0,points:0},
      real:{color:'#00a651',dash:[],width:2.2,points:0},
      projected:{color:'#f2b700',dash:[7,5],width:2.0,points:0}
    };
    const fallback = ['#60a5fa','#0f172a','#22c55e','#f59e0b','#8b5cf6','#ef4444'];

    const datasets = series.map((s,i) => {
      const st = styles[s.key] || {color:fallback[i%fallback.length],dash:[],width:1.8,points:0};
      return {
        label:s.name,
        data:s.values,
        borderColor:st.color,
        backgroundColor:st.color,
        borderWidth:st.width,
        borderDash:st.dash,
        pointRadius:st.points,
        pointHoverRadius:3,
        tension:.12,
        spanGaps:false
      };
    });

    registry.unitCurve = new Chart(canvas, {
      type:'line',
      data:{labels,datasets},
      options:{
        responsive:true,maintainAspectRatio:false,
        animation:{duration:250},
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{position:'top',align:'start',labels:{color:'#cfe2f5',usePointStyle:false,boxWidth:28,font:{size:10,weight:'600'}}},
          tooltip:{callbacks:{label:ctx => {
            const v=ctx.parsed.y;
            return Number.isFinite(v) ? ctx.dataset.label + ': ' + v.toLocaleString('pt-BR',{maximumFractionDigits:2}) + (asPercent?'%':'') : ctx.dataset.label + ': —';
          }}}
        },
        scales:{
          x:{grid:{color:'rgba(148,163,184,.15)'},ticks:{color:'#8fa4bd',maxRotation:90,minRotation:90,autoSkip:true,maxTicksLimit:36,font:{size:8}}},
          y:{beginAtZero:true,min:0,max:asPercent?100:undefined,grid:{color:'rgba(148,163,184,.15)'},ticks:{color:'#8fa4bd',font:{size:9},callback:v=>asPercent?Number(v).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%':v}}
        }
      }
    });
    return true;
  }

  window.DashboardCharts = { unitProgress, phaseProgress, variance, financialCurve, normalizeFinancialCurve };
}());
