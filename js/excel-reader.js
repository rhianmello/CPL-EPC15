(function () {
  const cfg = window.EPC15_CONFIG;

  function validateExtension(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (!['xlsb', 'xlsx', 'xlsm'].includes(extension)) {
      throw new Error('Formato não suportado. Selecione um arquivo .xlsb, .xlsx ou .xlsm.');
    }
  }

  function normalizeHeader(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[×*]/g, ' X ')
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function headerMatches(value, aliases) {
    const normalized = normalizeHeader(value);
    return aliases.some(alias => normalizeHeader(alias) === normalized);
  }

  function findHeaderRow(rows) {
    const limit = Math.min(rows.length, cfg.headerSearchLimit);
    for (let i = 0; i < limit; i += 1) {
      const row = rows[i] || [];
      if (headerMatches(row[cfg.columns.level], cfg.criticalHeaders.level.aliases) &&
          headerMatches(row[cfg.columns.unit], cfg.criticalHeaders.unit.aliases)) return i;
    }
    return -1;
  }

  function validateCriticalHeaders(row) {
    const mismatches = Object.entries(cfg.criticalHeaders).flatMap(([columnKey, expected]) => {
      const index = cfg.columns[columnKey];
      const actual = row?.[index];
      if (headerMatches(actual, expected.aliases)) return [];
      const found = String(actual ?? '').trim() || 'vazio';
      return [`${expected.label} (coluna ${XLSX.utils.encode_col(index)}): encontrado “${found}”`];
    });
    if (mismatches.length) {
      throw new Error(`Estrutura incompatível na aba ${cfg.sheets.primary}. Cabeçalhos críticos não correspondem ao formato esperado: ${mismatches.join('; ')}. Verifique se colunas foram inseridas, removidas ou reposicionadas.`);
    }
  }

  function xmlDocument(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XML inválido no arquivo Excel.');
    return doc;
  }

  function localElements(node, name) {
    return Array.from(node.getElementsByTagNameNS('*', name));
  }

  function normalizeZipPath(sourcePath, target) {
    if (!target) return null;
    if (target.startsWith('/')) return target.replace(/^\/+/, '');
    const parts = sourcePath.split('/');
    parts.pop();
    target.split('/').forEach(part => {
      if (!part || part === '.') return;
      if (part === '..') parts.pop();
      else parts.push(part);
    });
    return parts.join('/');
  }

  function relsPath(sourcePath) {
    const parts = sourcePath.split('/');
    const file = parts.pop();
    return [...parts, '_rels', file + '.rels'].join('/');
  }

  async function relationshipTarget(zip, sourcePath, relationshipId) {
    const file = zip.file(relsPath(sourcePath));
    if (!file) return null;
    const doc = xmlDocument(await file.async('text'));
    const rel = localElements(doc, 'Relationship').find(el => el.getAttribute('Id') === relationshipId);
    return rel ? normalizeZipPath(sourcePath, rel.getAttribute('Target')) : null;
  }

  function nodeText(node, name) {
    const el = localElements(node, name)[0];
    return el ? String(el.textContent || '').trim() : '';
  }

  function formulaValues(formula, workbook) {
    if (!formula) return [];
    const clean = String(formula).replace(/^=/, '').trim();
    const m = clean.match(/^'?(.+?)'?!(\$?[A-Z]+\$?\d+)(?::(\$?[A-Z]+\$?\d+))?$/);
    if (!m) return [];
    const sheetName = m[1].replace(/''/g, "'");
    const ws = workbook.Sheets[sheetName];
    if (!ws) return [];
    const start = XLSX.utils.decode_cell(m[2].replace(/\$/g, ''));
    const end = XLSX.utils.decode_cell((m[3] || m[2]).replace(/\$/g, ''));
    const values = [];
    for (let r = start.r; r <= end.r; r += 1) {
      for (let c = start.c; c <= end.c; c += 1) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        values.push(cell ? (cell.v ?? null) : null);
      }
    }
    return values;
  }

  function cachedPoints(node, workbook) {
    if (!node) return [];
    const cache = localElements(node, 'numCache')[0] || localElements(node, 'strCache')[0];
    if (cache) {
      const points = localElements(cache, 'pt').map(pt => ({
        index: Number(pt.getAttribute('idx') || 0),
        value: nodeText(pt, 'v')
      })).sort((a,b) => a.index - b.index);
      if (points.length) return points.map(p => p.value);
    }
    const multi = localElements(node, 'multiLvlStrCache')[0];
    if (multi) {
      const level = localElements(multi, 'lvl')[0];
      if (level) return localElements(level, 'pt').map(pt => nodeText(pt, 'v'));
    }
    const formula = nodeText(node, 'f');
    return formulaValues(formula, workbook);
  }

  function formatCurveCategory(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 20000 && numeric < 90000 && XLSX.SSF?.parse_date_code) {
      const d = XLSX.SSF.parse_date_code(numeric);
      if (d) return String(d.d).padStart(2,'0') + '/' + String(d.m).padStart(2,'0') + '/' + String(d.y).slice(-2);
    }
    return value == null ? '' : String(value);
  }

  function chartSeries(chartDoc, workbook) {
    return localElements(chartDoc, 'ser').map((ser, index) => {
      const tx = localElements(ser, 'tx')[0];
      let name = tx ? (nodeText(tx, 'v') || cachedPoints(tx, workbook)[0]) : '';
      if (!name) name = 'Série ' + (index + 1);
      const cat = localElements(ser, 'cat')[0] || localElements(ser, 'xVal')[0];
      const val = localElements(ser, 'val')[0] || localElements(ser, 'yVal')[0];
      const categories = cachedPoints(cat, workbook).map(formatCurveCategory);
      const values = cachedPoints(val, workbook).map(v => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      });
      return { name: String(name).trim(), categories, values };
    }).filter(s => s.values.some(Number.isFinite));
  }

  function findUnitNearChart(rows, rowIndex, colIndex) {
    const start = Math.max(0, rowIndex - 12);
    const end = Math.min(rows.length - 1, rowIndex + 5);
    for (let r = end; r >= start; r -= 1) {
      const row = rows[r] || [];
      const from = Math.max(0, colIndex - 8);
      const to = Math.min(row.length, colIndex + 30);
      const line = row.slice(from, to).filter(v => v != null && v !== '').join(' ');
      const match = line.match(/U\s*-\s*\d{4}/i);
      if (match) return match[0].replace(/\s/g, '').toUpperCase();
      if (/IMPLANTA[ÇC][AÃ]O/i.test(line)) return 'IMPLANTAÇÃO';
    }
    return '';
  }

  async function extractCurvesCharts(buffer, workbook) {
    if (!workbook.SheetNames.includes(cfg.sheets.curves) || typeof JSZip === 'undefined') return [];
    try {
      const zip = await JSZip.loadAsync(buffer);
      const wbFile = zip.file('xl/workbook.xml');
      if (!wbFile) return [];
      const wbDoc = xmlDocument(await wbFile.async('text'));
      const sheet = localElements(wbDoc, 'sheet').find(el => normalizeHeader(el.getAttribute('name')) === normalizeHeader(cfg.sheets.curves));
      if (!sheet) return [];
      const rid = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || sheet.getAttribute('r:id');
      const sheetPath = await relationshipTarget(zip, 'xl/workbook.xml', rid);
      if (!sheetPath || !zip.file(sheetPath)) return [];
      const sheetDoc = xmlDocument(await zip.file(sheetPath).async('text'));
      const drawingEl = localElements(sheetDoc, 'drawing')[0];
      if (!drawingEl) return [];
      const drawingRid = drawingEl.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || drawingEl.getAttribute('r:id');
      const drawingPath = await relationshipTarget(zip, sheetPath, drawingRid);
      if (!drawingPath || !zip.file(drawingPath)) return [];
      const drawingDoc = xmlDocument(await zip.file(drawingPath).async('text'));
      const curveRows = XLSX.utils.sheet_to_json(workbook.Sheets[cfg.sheets.curves], { header: 1, raw: true, defval: null });
      const anchors = [...localElements(drawingDoc, 'twoCellAnchor'), ...localElements(drawingDoc, 'oneCellAnchor')];
      const output = [];

      for (const anchor of anchors) {
        const chartEl = localElements(anchor, 'chart')[0];
        if (!chartEl) continue;
        const chartRid = chartEl.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || chartEl.getAttribute('r:id');
        const chartPath = await relationshipTarget(zip, drawingPath, chartRid);
        if (!chartPath || !zip.file(chartPath)) continue;
        const chartDoc = xmlDocument(await zip.file(chartPath).async('text'));
        const series = chartSeries(chartDoc, workbook);
        if (!series.length) continue;
        const from = localElements(anchor, 'from')[0];
        const rowIndex = Number(nodeText(from, 'row') || 0);
        const colIndex = Number(nodeText(from, 'col') || 0);
        const unitCode = findUnitNearChart(curveRows, rowIndex, colIndex);
        const title = localElements(chartDoc, 'title').map(el => localElements(el, 't').map(t => t.textContent).join(' ')).join(' ').trim();
        output.push({
          unitCode,
          title: title || 'Curva de execução financeira',
          rowIndex,
          colIndex,
          series
        });
      }
      return output;
    } catch (error) {
      console.warn('Não foi possível interpretar os gráficos da aba CURVAS:', error);
      return [];
    }
  }


  function wsValue(ws, r, c) {
    const cell = ws?.[XLSX.utils.encode_cell({ r, c })];
    return cell ? (cell.v ?? null) : null;
  }

  function financialHeaderIndex(ws, aliases) {
    if (!ws?.['!ref']) return -1;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let c = range.s.c; c <= Math.min(range.e.c, 80); c += 1) {
      const value = normalizeHeader(wsValue(ws, 0, c));
      if (aliases.some(alias => value === normalizeHeader(alias))) return c;
    }
    return -1;
  }

  function financialDateColumns(ws) {
    if (!ws?.['!ref']) return [];
    const range = XLSX.utils.decode_range(ws['!ref']);
    let spreadsheetField = -1;
    for (let c = range.s.c; c <= Math.min(range.e.c, 80); c += 1) {
      if (normalizeHeader(wsValue(ws, 0, c)) === 'SPREADSHEET FIELD') spreadsheetField = c;
    }
    if (spreadsheetField < 0) return [];
    const cols = [];
    for (let c = spreadsheetField + 1; c <= range.e.c; c += 1) {
      const serial = Number(wsValue(ws, 0, c));
      if (Number.isFinite(serial) && serial >= 40000 && serial <= 70000) cols.push({ c, serial });
    }
    return cols;
  }

  function normalizeUnitCode(value) {
    const match = String(value ?? '').match(/U\s*-\s*(\d{4})/i);
    return match ? 'U-' + match[1] : '';
  }

  function unitDisplayNameFromRow(ws, r, maxCol) {
    for (let c = 0; c <= maxCol; c += 1) {
      const value = String(wsValue(ws, r, c) ?? '').trim();
      if (/U\s*-\s*\d{4}/i.test(value) && !/^WBS:/i.test(value)) return value.replace(/\s+/g, ' ');
    }
    return '';
  }

  function extractFinancialSheet(workbook, sheetName) {
    const ws = workbook.Sheets[sheetName];
    if (!ws?.['!ref']) return null;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const dateCols = financialDateColumns(ws);
    if (!dateCols.length) return null;

    const budgetCol = financialHeaderIndex(ws, ['Budgeted Units','Budgeted Labor Units']);
    const actualCol = financialHeaderIndex(ws, ['Actual Units','Actual Labor Units']);
    const remainingCol = financialHeaderIndex(ws, ['Remaining Units','Remaining Labor Units']);
    const units = {};

    for (let r = Math.max(1, range.s.r); r <= range.e.r; r += 1) {
      const name = unitDisplayNameFromRow(ws, r, Math.min(range.e.c, 25));
      const code = normalizeUnitCode(name);
      if (!code || units[code]) continue;

      const total = Number(wsValue(ws, r, budgetCol));
      const actual = Number(wsValue(ws, r, actualCol));
      const remaining = Number(wsValue(ws, r, remainingCol));
      const values = dateCols.map(({c}) => {
        const n = Number(wsValue(ws, r, c));
        return Number.isFinite(n) ? n : 0;
      });

      units[code] = {
        code,
        name,
        total: Number.isFinite(total) ? total : null,
        actual: Number.isFinite(actual) ? actual : null,
        remaining: Number.isFinite(remaining) ? remaining : null,
        dates: dateCols.map(x => x.serial),
        values
      };
    }

    return { sheetName, units };
  }


  function readCurveDateColumns(ws, rowIndex, maxCol) {
    const cols = [];
    let started = false;
    let blanksAfterStart = 0;
    for (let c = 21; c <= maxCol; c += 1) { // V onward
      const value = Number(wsValue(ws, rowIndex, c));
      if (Number.isFinite(value) && value >= 40000 && value <= 70000) {
        cols.push({ c, serial: value });
        started = true;
        blanksAfterStart = 0;
      } else if (started) {
        blanksAfterStart += 1;
        if (blanksAfterStart > 12) break;
      }
    }
    return cols;
  }

  function financialSeriesKey(label) {
    const raw = String(label ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toUpperCase()
      .trim();
    if (!/ACUM/.test(raw)) return null;
    const isPercent = raw.includes('%');
    if (/BLCONTRATUAL/.test(raw)) return isPercent ? 'contractualPct' : 'contractualAccum';
    if (/PLAN\.?\s*ATAQ/.test(raw)) return isPercent ? 'planAttackPct' : 'planAttackAccum';
    if (/^REAL\b/.test(raw)) return isPercent ? 'realPct' : 'realAccum';
    if (/^PROJETADO\b/.test(raw)) return isPercent ? 'projectedPct' : 'projectedAccum';
    return null;
  }

  function blockKeyFromName(name) {
    const clean = String(name ?? '').trim().replace(/\s+/g,' ');
    if (/^EMPREENDIMENTO$/i.test(clean)) return 'EMPREENDIMENTO';
    const match = clean.match(/U\s*-\s*(\d{4})/i);
    return match ? 'U-' + match[1] : '';
  }

  function extractBLPlanAtaqCurveBlocks(workbook) {
    const ws = workbook.Sheets.BLPlanAtaq;
    if (!ws?.['!ref']) return { sheetName:'BLPlanAtaq', blocks:{}, audit:{ found:false } };
    const range = XLSX.utils.decode_range(ws['!ref']);
    const blocks = {};
    let currentName = '';
    let currentKey = '';
    let currentDates = [];

    for (let r = range.s.r; r <= range.e.r; r += 1) {
      const dateCols = readCurveDateColumns(ws, r, range.e.c);
      if (dateCols.length >= 30) currentDates = dateCols;

      const scopeName = String(wsValue(ws,r,19) ?? '').trim().replace(/\s+/g,' '); // T
      const label = String(wsValue(ws,r,20) ?? '').trim(); // U
      if (scopeName && (/^EMPREENDIMENTO$/i.test(scopeName) || /U\s*-\s*\d{4}/i.test(scopeName))) {
        currentName = scopeName;
        currentKey = blockKeyFromName(scopeName);
      }

      const seriesKey = financialSeriesKey(label);
      if (!seriesKey || !currentKey || !currentDates.length) continue;

      const values = currentDates.map(({c}) => {
        const raw = wsValue(ws,r,c);
        const n = Number(raw);
        return raw == null || raw === '' || !Number.isFinite(n) ? null : n;
      });

      if (!blocks[currentKey]) {
        blocks[currentKey] = {
          key: currentKey,
          name: currentName,
          firstRow: r + 1,
          lastRow: r + 1,
          dates: currentDates.map(x => x.serial),
          series: {},
          sourceRows: {}
        };
      }
      const block = blocks[currentKey];
      block.name = currentName || block.name;
      block.lastRow = r + 1;
      block.dates = currentDates.map(x => x.serial);
      block.series[seriesKey] = values;
      block.sourceRows[seriesKey] = r + 1;
    }

    const keys = Object.keys(blocks);
    return {
      sheetName:'BLPlanAtaq',
      blocks,
      audit:{
        found:true,
        blockKeys:keys,
        blockCount:keys.length,
        sourceColumnName:'T',
        sourceColumnSeries:'U',
        firstDataColumn:'V'
      }
    };
  }

  function extractFinancialSources(workbook) {
    const aliases = {
      contractual: ['BLContratual'],
      planAttack: ['BLPlanAtaq'],
      current: ['Corrente'],
      projected: ['Planejado BLProjetada']
    };
    const output = {};
    Object.entries(aliases).forEach(([key,names]) => {
      const found = names.find(name => workbook.SheetNames.includes(name));
      output[key] = found ? extractFinancialSheet(workbook, found) : null;
    });
    return output;
  }


  function directFinanceKey(label) {
    const raw = String(label ?? '');
    const isPct = raw.includes('%');
    const n = normalizeHeader(raw);
    if (n === 'BLCONTRATUAL ACUM') return isPct ? 'contractualPct' : 'contractualAmount';
    if (n === 'PLAN ATAQ ACUM') return isPct ? 'planPct' : 'planAmount';
    if (n === 'REAL ACUM') return isPct ? 'realPct' : 'realAmount';
    if (n === 'PROJETADO ACUM') return isPct ? 'projectedPct' : 'projectedAmount';
    return null;
  }

  function financeScope(value) {
    const raw = String(value ?? '').trim();
    if (/^EMPREENDIMENTO$/i.test(raw)) return { key:'EMPREENDIMENTO', name:'Empreendimento' };
    const m = raw.match(/U\s*-\s*(\d{4})/i);
    return m ? { key:'U-' + m[1], name:raw.replace(/\s+/g,' ') } : null;
  }

  function numericSeries(row, start) {
    return row.slice(start).map(v => typeof v === 'number' && Number.isFinite(v) ? v : null);
  }

  function extractBLPlanAtaqBlocks(workbook) {
    const ws = workbook.Sheets.BLPlanAtaq;
    if (!ws) return {};
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:null });
    const out = {};
    let dates = [];
    let scope = null;
    for (let r=0;r<rows.length;r+=1) {
      const row = rows[r] || [];
      const colT = row[19];
      const colU = row[20];
      if (normalizeHeader(colU) === 'DIA') dates = numericSeries(row,21);
      const nextScope = financeScope(colT);
      if (nextScope) scope = nextScope;
      const key = directFinanceKey(colU);
      if (!scope || !key || !dates.length) continue;
      out[scope.key] = out[scope.key] || { code:scope.key, name:scope.name, sourceRows:{}, series:{} };
      out[scope.key].name = scope.name;
      out[scope.key].sourceRows[key] = r + 1;
      out[scope.key].series[key] = { dates:[...dates], values:numericSeries(row,21) };
    }
    return out;
  }

  async function readWorkbook(file) {
    validateExtension(file);
    let workbook, buffer;
    try {
      buffer = await file.arrayBuffer();
      workbook = XLSX.read(buffer, { type: 'array', cellDates: false, cellFormula: false });
    } catch (error) {
      throw new Error('Não foi possível ler o Excel. Confirme se o arquivo não está corrompido e tente novamente.');
    }
    if (!workbook.SheetNames.includes(cfg.sheets.primary)) {
      throw new Error(`A aba obrigatória “${cfg.sheets.primary}” não foi encontrada.`);
    }
    const primary = XLSX.utils.sheet_to_json(workbook.Sheets[cfg.sheets.primary], { header: 1, raw: true, defval: null });
    const headerRow = findHeaderRow(primary);
    if (headerRow < 0) throw new Error('O cabeçalho esperado da aba Avanço PLATAQ não foi identificado.');
    validateCriticalHeaders(primary[headerRow]);
    const summary = workbook.SheetNames.includes(cfg.sheets.summary)
      ? XLSX.utils.sheet_to_json(workbook.Sheets[cfg.sheets.summary], { header: 1, raw: true, defval: null })
      : null;
    const curvesCharts = await extractCurvesCharts(buffer, workbook);
    const financialSources = extractFinancialSources(workbook);
    const blPlanAtaqCurves = extractBLPlanAtaqCurveBlocks(workbook);
    return { workbook, primary, summary, curvesCharts, financialSources, blPlanAtaqCurves, headerRow };
  }

  window.ExcelReader = { readWorkbook };
}());
