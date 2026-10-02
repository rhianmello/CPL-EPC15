(function () {
  'use strict';

  const N = window.IntegrationNormalizer;
  const S = N.RELATIONSHIP_STATUS;

  function cell(row, index) {
    return row?.[index] ?? null;
  }

  function present(value) {
    return value != null && String(value).trim() !== '';
  }

  function headerIndex(row, aliases) {
    const normalizedAliases = aliases.map(N.normalizeHeader);
    return (row || []).findIndex(value => normalizedAliases.includes(N.normalizeHeader(value)));
  }

  function sheetRows(workbook, sheetName) {
    const sheet = workbook?.Sheets?.[sheetName];
    if (!sheet) throw new Error('A aba "' + sheetName + '" não foi encontrada.');
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  }

  function fileMeta(file, sourceType) {
    return {
      sourceType,
      fileName: file?.name || sourceType,
      fileSize: Number.isFinite(file?.size) ? file.size : null,
      importedAt: new Date().toISOString()
    };
  }

  function findPlanningHeader(rows) {
    const limit = Math.min(rows.length, 15);
    for (let i = 0; i < limit; i += 1) {
      const row = rows[i] || [];
      if (N.normalizeHeader(row[3]) === 'NIVEL' && N.normalizeHeader(row[4]) === 'ENTREGA') return i;
    }
    throw new Error('Cabeçalho da aba Avanço PLATAQ não identificado.');
  }

  function planningRows(workbook, file) {
    const rows = sheetRows(workbook, 'Avanço PLATAQ');
    const header = findPlanningHeader(rows);
    return rows.slice(header + 1).map((row, index) => ({
      sourceType: 'planning',
      sourceFile: file?.name || '',
      sourceSheet: 'Avanço PLATAQ',
      sourceRow: header + index + 2,
      level: Number(cell(row, 3)),
      wbs: N.text(cell(row, 0)),
      hierarchy: {
        entrega: N.text(cell(row, 4)),
        fase: N.text(cell(row, 5)),
        subfase: N.text(cell(row, 6)),
        agrupamento: N.text(cell(row, 7)),
        componente: N.text(cell(row, 8)),
        etapa: N.text(cell(row, 9)),
        criterio: N.text(cell(row, 10))
      },
      planned: Number(cell(row, 24)),
      actual: Number(cell(row, 25)),
      variance: Number(cell(row, 26)),
      weight: Number(cell(row, 11))
    })).filter(row => row.wbs || Object.values(row.hierarchy).some(Boolean));
  }

  function eapRows(workbook, file) {
    const rows = sheetRows(workbook, 'EAP');
    const header = rows[1] || [];
    const idx = {
      activityId: headerIndex(header, ['ACTIVITY ID']),
      wbs: headerIndex(header, ['WBS P6']),
      unidade: headerIndex(header, ['UNIDADE']),
      entrega: headerIndex(header, ['ENTREGA']),
      fase: headerIndex(header, ['FASE']),
      subfase: headerIndex(header, ['SUBFASE']),
      agrupamento: headerIndex(header, ['AGRUPAMENTO']),
      componente: headerIndex(header, ['COMPONENTE']),
      etapa: headerIndex(header, ['ETAPA']),
      criterio: headerIndex(header, ['CRITÉRIO DE MEDIÇÃO (Etapa)', 'CRITERIO DE MEDICAO ETAPA']),
      relatorio: headerIndex(header, ['RELATÓRIO', 'RELATORIO'])
    };
    if (idx.activityId < 0 || idx.unidade < 0 || idx.relatorio < 0) {
      throw new Error('Cabeçalhos obrigatórios da EAP não foram encontrados.');
    }
    return rows.slice(2).map((row, index) => {
      const reportRaw = cell(row, idx.relatorio);
      const criterion = cell(row, idx.criterio);
      const normalizedReport = N.normalizeReport(reportRaw);
      const hierarchy = {
        entrega: N.text(cell(row, idx.entrega)),
        fase: N.text(cell(row, idx.fase)),
        subfase: N.text(cell(row, idx.subfase)),
        agrupamento: N.text(cell(row, idx.agrupamento)),
        componente: N.text(cell(row, idx.componente)),
        etapa: N.text(cell(row, idx.etapa)),
        criterio: N.text(criterion)
      };
      return {
        sourceType: 'eap',
        sourceFile: file?.name || '',
        sourceSheet: 'EAP',
        sourceRow: index + 3,
        activityId: N.text(cell(row, idx.activityId)),
        wbs: N.text(cell(row, idx.wbs)),
        unit: N.parseUnit(cell(row, idx.unidade)),
        activityUnit: N.parseUnit(cell(row, idx.activityId)),
        criterionUnit: N.parseUnit(criterion),
        reportRaw: N.text(reportRaw),
        reportNormalized: normalizedReport,
        reportUnit: N.parseUnit(reportRaw),
        tag: N.parsePileTag(reportRaw) || N.parsePileTag(criterion),
        hierarchy,
        isEsthcContext: /ESTHC|ESTACA HELICE/.test(N.normalizeText([reportRaw, criterion, hierarchy.agrupamento, hierarchy.componente].join(' '))),
        isEsthcReport: normalizedReport.startsWith('ESTHC')
      };
    }).filter(row => row.activityId || row.reportRaw || row.isEsthcContext);
  }

  function qualityRows(workbook, file) {
    const rows = sheetRows(workbook, 'Estaqueamento');
    const header = rows[1] || [];
    const idx = {
      relatorio: headerIndex(header, ['RELATÓRIO', 'RELATORIO']),
      tag: headerIndex(header, ['TAG']),
      tag2: headerIndex(header, ['TAG 2']),
      bloco: headerIndex(header, ['BLOCO']),
      unidade: headerIndex(header, ['UNIDADE']),
      dataExecucao: headerIndex(header, ['DATA DE EXECUÇÃO', 'DATA DE EXECUCAO']),
      profundidade: headerIndex(header, ['PROFUNDIDADE']),
      volume: headerIndex(header, ['VOLUME DE CONCRETO (m³)', 'VOLUME DE CONCRETO M3']),
      ficha: headerIndex(header, ['FICHA DE MOLDAGEM']),
      amostra: headerIndex(header, ['AMOSTRA']),
      resistencia28: headerIndex(header, ['28 DIAS  (Mpa)', '28 DIAS']),
      arrasamento: headerIndex(header, ['DATA ARRASAMENTO']),
      pit: headerIndex(header, ['TESTE DE INTEGRIDADE (PIT)']),
      pitRelatorio: headerIndex(header, ['REL. PIT', 'RELATÓRIO PIT']),
      pitStatus: headerIndex(header, ['STATUS PIT']),
      pce: headerIndex(header, ['TESTE DE CARGA (PCE)']),
      pceStatus: headerIndex(header, ['STATUS PCE']),
      projeto: headerIndex(header, ['PROJETO']),
      revisao: headerIndex(header, ['REVISÃO PROJ.', 'REVISAO PROJ']),
      sondagem: headerIndex(header, ['SONDAGEM']),
      rnc: headerIndex(header, ['RNC'])
    };
    if (idx.relatorio < 0 || idx.unidade < 0 || idx.tag < 0) {
      throw new Error('Cabeçalhos obrigatórios da aba Estaqueamento não foram encontrados.');
    }
    return rows.slice(2).map((row, index) => {
      const reportRaw = cell(row, idx.relatorio);
      const tag = cell(row, idx.tag);
      return {
        sourceType: 'quality',
        sourceFile: file?.name || '',
        sourceSheet: 'Estaqueamento',
        sourceRow: index + 3,
        reportRaw: N.text(reportRaw),
        reportNormalized: N.normalizeReport(reportRaw),
        reportUnit: N.parseUnit(reportRaw),
        tag: N.parsePileTag(tag) || N.parsePileTag(reportRaw),
        tagRaw: N.text(tag),
        tag2: N.text(cell(row, idx.tag2)),
        block: N.text(cell(row, idx.bloco)),
        unit: N.parseUnit(cell(row, idx.unidade)),
        executionDate: cell(row, idx.dataExecucao),
        depth: cell(row, idx.profundidade),
        concreteVolume: cell(row, idx.volume),
        molding: N.text(cell(row, idx.ficha)),
        sample: N.text(cell(row, idx.amostra)),
        strength28: cell(row, idx.resistencia28),
        arrasamento: cell(row, idx.arrasamento),
        pit: N.text(cell(row, idx.pit)),
        pitReport: N.text(cell(row, idx.pitRelatorio)),
        pitStatus: N.text(cell(row, idx.pitStatus)),
        pce: N.text(cell(row, idx.pce)),
        pceStatus: N.text(cell(row, idx.pceStatus)),
        projeto: N.text(cell(row, idx.projeto)),
        revisao: N.text(cell(row, idx.revisao)),
        sondagem: N.text(cell(row, idx.sondagem)),
        rnc: N.text(cell(row, idx.rnc))
      };
    }).filter(row => row.reportRaw);
  }

  function groupBy(rows, keyFn) {
    const map = new Map();
    rows.forEach(row => {
      const key = keyFn(row);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return map;
  }

  function countBy(rows, keyFn) {
    return rows.reduce((acc, row) => {
      const key = keyFn(row) || '(sem valor)';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  function sourceErrors(eapReportRows) {
    return eapReportRows.filter(row => {
      if (row.alias) return false;
      const contextUnits = [row.unit, row.activityUnit, row.criterionUnit].filter(Boolean);
      return row.reportUnit && contextUnits.length && !contextUnits.includes(row.reportUnit);
    }).map(row => ({
      status: S.SOURCE_ERROR,
      source: 'EAP',
      sourceRow: row.sourceRow,
      activityId: row.activityId,
      unit: row.unit,
      reportRaw: row.reportRaw,
      reportNormalized: row.reportNormalized,
      reason: 'Unidade do relatório diverge da unidade, Activity ID ou critério da EAP',
      comparedKeys: {
        reportUnit: row.reportUnit,
        unit: row.unit,
        activityUnit: row.activityUnit,
        criterionUnit: row.criterionUnit
      }
    }));
  }

  function linkEapQuality(eapReportRows, qualityReportRows) {
    const eapByReport = groupBy(eapReportRows, row => row.reportNormalized);
    return qualityReportRows.map(quality => {
      const candidates = eapByReport.get(quality.reportNormalized) || [];
      if (!candidates.length) {
        return { status: S.UNMATCHED, quality, reason: 'Nenhum relatório normalizado correspondente na EAP' };
      }
      if (candidates.length > 1) {
        return { status: S.AMBIGUOUS, quality, candidates, reason: 'Mais de uma linha EAP com o mesmo relatório normalizado' };
      }
      const eap = candidates[0];
      if (eap.alias) {
        return {
          status: S.MANUAL_ALIAS,
          quality,
          eap,
          reason: eap.alias.reason || 'Alias manual aplicado ao relatório da EAP',
          ruleUsed: 'manual_alias'
        };
      }
      const contextUnits = [eap.unit, eap.activityUnit, eap.criterionUnit].filter(Boolean);
      if (quality.unit && contextUnits.length && !contextUnits.includes(quality.unit)) {
        return { status: S.SOURCE_ERROR, quality, eap, reason: 'Relatório coincide, mas a unidade da Qualidade diverge do contexto da EAP' };
      }
      if (eap.reportUnit && eap.unit && eap.reportUnit !== eap.unit) {
        return { status: S.SOURCE_ERROR, quality, eap, reason: 'Relatório da EAP diverge da unidade de contexto' };
      }
      return { status: S.CONFIRMED, quality, eap, reason: 'Relatório normalizado único com unidade coerente' };
    });
  }

  function linkPlanningEap(planning, eapReportRows) {
    const planningByWbs = groupBy(planning, row => row.wbs);
    const planningByHierarchy = groupBy(planning, row => N.hierarchyKey(row.hierarchy));
    return eapReportRows.map(eap => {
      const byWbs = planningByWbs.get(eap.wbs) || [];
      if (byWbs.length === 1) return { status: S.CONFIRMED, rule: 'WBS P6', eap, planning: byWbs[0] };
      if (byWbs.length > 1) return { status: S.AMBIGUOUS, rule: 'WBS P6', eap, candidates: byWbs };
      const byHierarchy = planningByHierarchy.get(N.hierarchyKey(eap.hierarchy)) || [];
      if (byHierarchy.length === 1) return { status: S.CONFIRMED, rule: 'hierarquia', eap, planning: byHierarchy[0] };
      if (byHierarchy.length > 1) return { status: S.AMBIGUOUS, rule: 'hierarquia', eap, candidates: byHierarchy };
      return { status: S.UNMATCHED, rule: 'WBS/hierarquia', eap, reason: 'Sem correspondência determinística no Planejamento' };
    });
  }

  function summarizeLinks(links) {
    return countBy(links, link => link.status);
  }

  function applyAliases(eap, aliases = []) {
    if (!Array.isArray(aliases) || !aliases.length) return eap;
    return eap.map(row => {
      const alias = aliases.find(item => {
        if (item.sourceType && item.sourceType !== 'eap_report') return false;
        if (item.sourceRow && Number(item.sourceRow) !== Number(row.sourceRow)) return false;
        if (item.sourceValueNormalized && item.sourceValueNormalized !== row.reportNormalized) return false;
        return true;
      });
      if (!alias) return row;
      const corrected = alias.correctedValueNormalized || N.normalizeReport(alias.correctedValueRaw);
      return {
        ...row,
        originalReportNormalized: row.reportNormalized,
        reportNormalized: corrected,
        reportUnit: N.parseUnit(alias.correctedValueRaw || corrected) || row.reportUnit,
        tag: N.parsePileTag(alias.correctedValueRaw || corrected) || row.tag,
        alias: {
          sourceValueRaw: alias.sourceValueRaw || row.reportRaw,
          sourceValueNormalized: alias.sourceValueNormalized || row.reportNormalized,
          correctedValueRaw: alias.correctedValueRaw || corrected,
          correctedValueNormalized: corrected,
          reason: alias.reason || 'Correção manual'
        }
      };
    });
  }

  function audit({ planningWorkbook, eapWorkbook, qualityWorkbook, files = {}, aliases = [] }) {
    const planning = planningRows(planningWorkbook, files.planning);
    const eap = applyAliases(eapRows(eapWorkbook, files.eap), aliases);
    const quality = qualityRows(qualityWorkbook, files.quality);
    const eapContextRows = eap.filter(row => row.isEsthcContext);
    const eapReportRows = eap.filter(row => row.isEsthcReport);
    const qualityReportRows = quality.filter(row => row.reportNormalized.startsWith('ESTHC'));
    const eapQualityLinks = linkEapQuality(eapReportRows, qualityReportRows);
    const planningEapLinks = linkPlanningEap(planning, eapReportRows);
    const errors = sourceErrors(eapReportRows);
    const u8226E003 = {
      quality: qualityReportRows.filter(row => row.reportNormalized === 'ESTHCU8226E003'),
      eapContext: eapContextRows.filter(row => row.unit === 'U-8226' && row.tag === 'E003'),
      eapWrongReport: eapReportRows.filter(row => row.reportNormalized === 'ESTHCU8224E003')
    };

    return {
      generatedAt: new Date().toISOString(),
      publications: {
        planning: fileMeta(files.planning, 'planning'),
        eap: fileMeta(files.eap, 'eap'),
        quality: fileMeta(files.quality, 'quality')
      },
      rows: { planning, eap, quality, eapContextRows, eapReportRows, qualityReportRows },
      links: { eapQualityLinks, planningEapLinks },
      errors,
      summary: {
        planningRows: planning.length,
        eapRows: eap.length,
        eapEsthcContextRows: eapContextRows.length,
        eapEsthcReportRows: eapReportRows.length,
        qualityRows: qualityReportRows.length,
        qualityByUnit: countBy(qualityReportRows, row => row.unit),
        qualityExecutedByUnit: countBy(qualityReportRows.filter(row => present(row.executionDate)), row => row.unit),
        qualityNotExecutedByUnit: countBy(qualityReportRows.filter(row => !present(row.executionDate)), row => row.unit),
        eapEsthcByUnit: countBy(eapReportRows, row => row.unit),
        eapQualityStatus: summarizeLinks(eapQualityLinks),
        planningEapStatus: summarizeLinks(planningEapLinks),
        sourceErrors: errors.length,
        manualAliases: eapReportRows.filter(row => row.alias).length,
        u8226E003
      }
    };
  }

  window.IntegrationMatcher = {
    planningRows,
    eapRows,
    qualityRows,
    audit,
    applyAliases,
    linkEapQuality,
    linkPlanningEap
  };
}());
