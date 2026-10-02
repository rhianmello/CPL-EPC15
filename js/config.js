(function () {
  window.EPC15_CONFIG = Object.freeze({
    sheets: { primary: 'Avanço PLATAQ', summary: 'PPT_RESUMO', curves: 'CURVAS' },
    headerSearchLimit: 15,
    columns: {
      level: 3, unit: 4, phase: 5, subphase: 6, grouping: 7,
      component: 8, step: 9, criterion: 10, weight: 11,
      plannedValue: 12, plannedQuantity: 13, measureUnit: 14,
      actualValue: 15, actualQuantity: 16,
      attackPlannedValue: 18, attackActualValue: 19, attackValueVariance: 20,
      attackPlannedQuantity: 21, attackActualQuantity: 22, attackQuantityVariance: 23,
      plannedPercent: 24, actualPercent: 25, variance: 26,
      weightedVariance: 27
    },
    criticalHeaders: {
      level: { label: 'nível', aliases: ['NÍVEL', 'NIVEL'] },
      unit: { label: 'unidade/entrega', aliases: ['ENTREGA', 'UNIDADE', 'UNIDADE / ENTREGA', 'UNIDADE/ENTREGA'] },
      weight: { label: 'peso', aliases: ['PESO'] },
      plannedValue: { label: 'valor previsto', aliases: ['PREVISTO TOTAL', 'VALOR PREVISTO TOTAL', 'VALOR PREVISTO'] },
      plannedQuantity: { label: 'quantidade prevista', aliases: ['QUANTIDADE TOTAL PREVISTA', 'QUANTIDADE PREVISTA', 'QTD TOTAL PREVISTA', 'QTD PREVISTA'] },
      measureUnit: { label: 'unidade de medida', aliases: ['UNID.', 'UNID', 'UND.', 'UND', 'UNIDADE DE MEDIDA', 'UM'] },
      actualValue: { label: 'valor realizado', aliases: ['VALOR REAL ACUMULADO', 'REAL ACUMULADO', 'VALOR REALIZADO ACUMULADO', 'VALOR REALIZADO'] },
      actualQuantity: { label: 'quantidade realizada', aliases: ['QUANTIDADE TOTAL ACUMULADA', 'QUANTIDADE ACUMULADA', 'QUANTIDADE REALIZADA', 'QTD TOTAL ACUMULADA', 'QTD REALIZADA'] },
      plannedPercent: { label: '% previsto', aliases: ['PREV.', 'PREV', '% PREV.', '% PREV', '% PREVISTO', 'PREVISTO'] },
      actualPercent: { label: '% realizado', aliases: ['REAL', '% REAL', '% REALIZADO', 'REALIZADO'] },
      variance: { label: 'desvio', aliases: ['DESVIO', '% DESVIO'] },
      weightedVariance: { label: 'desvio ponderado', aliases: ['PESO X DESVIO', 'PESO × DESVIO', 'PESO * DESVIO', 'PESO DESVIO', 'DESVIO PONDERADO'] }
    },
    status: {
      good: 0,
      attention: -0.03,
      labels: { good: 'No prazo', attention: 'Atenção', critical: 'Crítico' }
    },
    colors: {
      blue: '#3b82f6', cyan: '#22d3ee', green: '#22c55e',
      orange: '#f59e0b', red: '#ef4444', neutral: '#64748b', grid: 'rgba(148,163,184,.15)'
    }
  });
}());
