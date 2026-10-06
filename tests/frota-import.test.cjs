const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { test } = require('node:test');
const XLSX = require('../vendor/xlsx-frota-0.20.3.min.js');
const Core = require('../js/frota-core.js');
const Import = require('../js/frota-import.js');
const fixture = require('./fixtures/frota-ptran-rows.json');
const parseFixture = () => Import.fromRows(structuredClone(fixture.rows), { XLSX, date1904: fixture.date1904 });
const one = parsed => ({ rows: [parsed.rows[0]], ignored: 0 });
function bankAsset(row, overrides = {}) {
  return {
    ...structuredClone(row.asset), id: 'asset-1', updated_at: '2026-10-06T12:00:00Z',
    categoria: 'Categoria definida manualmente', ativo_no_contrato: true,
    status_operacional: 'Disponível',
    ptrans: [{ ...structuredClone(row.ptran), id: 'ptran-1', created_at: '2026-10-01T12:00:00Z' }],
    ...overrides,
  };
}

test('uses the patched standalone SheetJS release reserved for the fleet module', () => {
  assert.equal(XLSX.version, '0.20.3');
});

test('reads all 35 real-source records using semantic CPL and misspelled observation headers', () => {
  const parsed = parseFixture();
  assert.equal(parsed.header_row, 2);
  assert.equal(parsed.rows.length, 35);
  assert.equal(parsed.headers.responsavel_cpl, 10);
  assert.equal(parsed.headers.observacao, 11);
  assert.equal(parsed.rows[0].asset.responsavel_cpl, fixture.rows[2][10]);
  assert.equal(parsed.rows[0].asset.observacao_atual, 'ATIVA');
  assert.equal(parsed.rows[0].ptran.numero_ptran, String(fixture.rows[2][5]));
  assert.equal(parsed.rows[0].ptran.data_recebimento, '2026-04-14');
  assert.equal(parsed.rows.at(-1).row_number, 37);
});

test('real-source issues match the audited five missing PTRANs, two missing people and two duplicate groups', () => {
  const parsed = parseFixture();
  const rows = type => parsed.issues.filter(i => i.type === type).map(i => i.row_number);
  assert.deepEqual(rows('PTRAN'), [8, 16, 17, 18, 29]);
  assert.deepEqual(rows('responsável'), [20, 31]);
  assert.deepEqual(rows('status'), [20]);
  assert.deepEqual(rows('data'), [10]);
  assert.deepEqual(rows('duplicidade').sort((a, b) => a - b), [28, 29, 31, 35]);
  assert.deepEqual(parsed.issues.filter(i => i.field === 'numero_isc').map(i => i.row_number), [26, 28]);
  assert.deepEqual(rows('provisório'), [29]);
  assert.equal(parsed.issues.filter(i => /CANCELAR/.test(i.message)).length, 4);
});

test('anomalous 1900 date stays in raw cells and is not converted into an operational date', () => {
  const row = parseFixture().rows.find(r => r.row_number === 10);
  assert.equal(row.raw.cells[6], 2.1);
  assert.equal(row.ptran.data_recebimento, null);
  assert.ok(row.issues.some(i => i.type === 'data' && i.severity === 'error'));
});

test('preserves original input cells, statuses and whitespace while deriving separate values', () => {
  const matrix = structuredClone(fixture.rows);
  const original = structuredClone(matrix);
  const parsed = Import.fromRows(matrix, { XLSX });
  assert.deepEqual(matrix, original);
  assert.equal(parsed.rows[0].raw.original_status, 'PRONTA');
  assert.equal(parsed.rows[0].ptran.status, 'Pronto');
  const equipment = parsed.rows.find(r => r.row_number === 31);
  assert.equal(equipment.raw.cells[8], fixture.rows[30][8]);
  assert.ok(equipment.raw.cells[8].endsWith('\u00a0'));
  assert.equal(equipment.ptran.numero_isc, fixture.rows[30][8].trim());
  const row = parsed.rows.find(r => r.row_number === 29);
  assert.equal(row.raw.cells[11], 'PTRAN PROVISORIA -CANCELAR ');
});

test('semantic mapping survives reordered columns and punctuation/accents in headers', () => {
  const permutation = [11, 4, 9, 6, 2, 0, 10, 3, 8, 1, 7, 5];
  const matrix = fixture.rows.map(row => permutation.map(index => row[index]));
  const reordered = Import.fromRows(matrix, { XLSX });
  const reference = parseFixture();
  assert.deepEqual(reordered.rows.map(r => r.asset), reference.rows.map(r => r.asset));
  assert.deepEqual(reordered.rows.map(r => r.ptran), reference.rows.map(r => r.ptran));
  assert.equal(reordered.rows.length, 35);
  assert.equal(reordered.issues.length, reference.issues.length);
});

test('rejects duplicate semantic headers and absent required headers', () => {
  assert.throws(() => Import.fromRows([['PLACA', 'MODELO', 'STATUS', 'Identificador'],
    ['A', 'B', 'Pronto', 'C']]), /Cabeçalho duplicado/);
  assert.throws(() => Import.fromRows([['Modelo', 'Responsável'], ['SAVEIRO', 'OPERADOR TESTE']]), /Cabeçalhos/);
});

test('ignores blank rows and does not create unsupported availability or contract fields', () => {
  const matrix = structuredClone(fixture.rows); matrix.push([null, '   ']);
  const parsed = Import.fromRows(matrix, { XLSX });
  assert.equal(parsed.rows.length, 35);
  assert.equal(parsed.ignored, 1);
  for (const row of parsed.rows) {
    assert.equal(row.asset.ativo_no_contrato, undefined);
    assert.equal(row.asset.status_operacional, undefined);
    assert.equal(row.asset.data_entrada, undefined);
    assert.equal(row.ptran.data_validade, undefined);
  }
});

test('unknown status is retained for review instead of moved into the responsible field', () => {
  const row = parseFixture().rows.find(r => r.row_number === 20);
  assert.equal(row.ptran.status, 'Nome Indevido');
  assert.equal(row.asset.responsavel_cpl, '');
  assert.equal(row.raw.original_status, 'Nome Indevido');
  assert.ok(row.issues.some(i => i.type === 'status' && i.severity === 'error'));
});

test('same import is idempotent against current records and preserves manual classification', () => {
  const parsed = one(parseFixture());
  const bank = [bankAsset(parsed.rows[0])];
  const parsedBefore = structuredClone(parsed), bankBefore = structuredClone(bank);
  const result = Import.compare(parsed, bank);
  assert.equal(result.summary.new_assets, 0);
  assert.equal(result.summary.existing_assets, 1);
  assert.equal(result.summary.new_ptrans, 0);
  assert.equal(result.summary.changes, 0);
  assert.deepEqual(result.rows[0].changes, []);
  assert.equal(result.rows[0].ptran, null);
  assert.equal(result.rows[0].asset.categoria, undefined);
  assert.equal(result.rows[0].expected_updated_at, bank[0].updated_at);
  assert.deepEqual(parsed, parsedBefore);
  assert.deepEqual(bank, bankBefore);
});

test('responsible and status changes create reviewable history diffs with a prior-version link', () => {
  const parsed = one(parseFixture());
  const bank = [bankAsset(parsed.rows[0])];
  parsed.rows[0].asset.responsavel_cpl = 'RESPONSAVEL NOVO';
  parsed.rows[0].ptran.responsavel = 'RESPONSAVEL NOVO';
  parsed.rows[0].ptran.status = 'Pendente';
  const bankBefore = structuredClone(bank);
  const result = Import.compare(parsed, bank);
  assert.equal(result.rows[0].ptran.supersedes_id, 'ptran-1');
  assert.deepEqual(result.rows[0].changes.find(c => c.field === 'responsavel_cpl'),
    { field: 'responsavel_cpl', before: bank[0].responsavel_cpl, after: 'RESPONSAVEL NOVO' });
  assert.deepEqual(result.rows[0].changes.find(c => c.field === 'PTRAN.status'),
    { field: 'PTRAN.status', before: 'Pronto', after: 'Pendente' });
  assert.deepEqual(result.rows[0].changes.find(c => c.field === 'PTRAN.responsavel'),
    { field: 'PTRAN.responsavel', before: bank[0].ptrans[0].responsavel, after: 'RESPONSAVEL NOVO' });
  assert.deepEqual(bank, bankBefore);
});

test('blank Excel fields neither erase current database values nor generate replacement PTRANs', () => {
  const parsed = one(parseFixture());
  const bank = [bankAsset(parsed.rows[0])];
  Object.assign(parsed.rows[0].asset, { empresa: '', gerencia: '', responsavel_cpl: '', observacao_atual: '' });
  Object.assign(parsed.rows[0].ptran, { data_recebimento: null, data_solicitacao: null,
    status: '', observacao: '', responsavel: '' });
  const result = Import.compare(parsed, bank);
  assert.equal(result.summary.changes, 0);
  assert.equal(result.rows[0].ptran, null);
  assert.equal(bank[0].responsavel_cpl, fixture.rows[2][10]);
  assert.equal(bank[0].ptrans[0].status, 'Pronto');
});

test('a changed PTRAN number creates a new event instead of mutating the preceding one', () => {
  const parsed = one(parseFixture());
  const bank = [bankAsset(parsed.rows[0])];
  parsed.rows[0].ptran.numero_ptran = '999999';
  const result = Import.compare(parsed, bank);
  assert.equal(result.summary.new_ptrans, 1);
  assert.equal(result.rows[0].ptran.supersedes_id, undefined);
  assert.equal(bank[0].ptrans[0].numero_ptran, String(fixture.rows[2][5]));
});

test('repeated source identifiers are never consolidated automatically even with one bank match', () => {
  const full = parseFixture();
  const parsed = { rows: full.rows.filter(r => [28, 29, 31, 35].includes(r.row_number)), ignored: 0 };
  const bank = [bankAsset(parsed.rows.find(r => r.row_number === 35))];
  const result = Import.compare(parsed, bank);
  assert.equal(result.rows.length, 4);
  assert.equal(result.summary.existing_assets, 0);
  assert.equal(result.summary.new_assets, 4);
  for (const row of result.rows) {
    assert.equal(row.asset_id, null);
    assert.equal(row.decision, 'new');
    assert.ok(row.issues.some(i => i.type === 'duplicidade'));
  }
});

test('multiple bank matches and disagreeing models require an explicit linking decision', () => {
  const parsed = one(parseFixture());
  const duplicateBank = [bankAsset(parsed.rows[0]), bankAsset(parsed.rows[0], { id: 'asset-2' })];
  const ambiguous = Import.compare(parsed, duplicateBank).rows[0];
  assert.equal(ambiguous.asset_id, null);
  assert.ok(ambiguous.issues.some(i => i.type === 'correspondência'));
  const mismatch = Import.compare(parsed, [bankAsset(parsed.rows[0], { modelo: 'Outra máquina' })]).rows[0];
  assert.equal(mismatch.asset_id, null);
  assert.ok(mismatch.issues.some(i => i.type === 'correspondência'));
});

test('source PRONTA and ATIVA never count as validity or prove an entirely regular fleet', () => {
  const imported = parseFixture().rows.map((row, index) => ({ ...row.asset,
    id: 'source-' + index, ptrans: [{ ...row.ptran, id: 'ptran-' + index }], raw_import: row.raw }));
  const metrics = Core.metrics(imported, '2026-10-06');
  assert.equal(metrics.ptran_valid, 0);
  assert.equal(metrics.active, 0);
  assert.equal(metrics.unconfirmed, 35);
  assert.equal(imported.filter(a => Core.situation(a, '2026-10-06').tone === 'green').length, 0);
  assert.equal(imported.filter(a => Core.situation(a, '2026-10-06').tone === 'gray').length, 2);
  assert.equal(imported.every(a => a.ativo_no_contrato === undefined), true);
});

test('date parsing handles raw serials, 1904 epochs, strict dates and invalid Date objects', () => {
  assert.deepEqual(Import.parseDate(46126, { XLSX }), { value: '2026-04-14' });
  assert.deepEqual(Import.parseDate(46126 - 1462, { XLSX, date1904: true }), { value: '2026-04-14' });
  assert.deepEqual(Import.parseDate('29/02/2024'), { value: '2024-02-29' });
  assert.deepEqual(Import.parseDate('06.10.2026'), { value: '2026-10-06' });
  assert.deepEqual(Import.parseDate(new Date('2026-10-06T12:00:00Z')), { value: '2026-10-06' });
  assert.deepEqual(Import.parseDate(null), { value: null });
  for (const invalid of [2.1, 60, -1, Number.NaN, '1900-01-02', '31/02/2026', '29/02/2026', 'invalid', new Date('invalid')]) {
    const result = Import.parseDate(invalid, { XLSX });
    assert.equal(result.value, null, String(invalid));
    assert.match(result.issue, /inválida|anômala/, String(invalid));
  }
});

test('file validation rejects unsupported extensions and oversized inputs before reading bytes', async () => {
  let read = false;
  const badFile = { name: 'dados.csv', size: 1, arrayBuffer: async () => { read = true; } };
  await assert.rejects(Import.read(badFile), /xlsx.*xlsm.*xlsb/);
  await assert.rejects(Import.read({ ...badFile, name: 'dados.xlsx', size: 25 * 1024 * 1024 + 1 }), /25 MB/);
  assert.equal(read, false);
});

test('real workbook read uses the vendored SheetJS parser and preserves its source checksum', async context => {
  const sourcePath = process.env.FROTA_SOURCE_EXCEL;
  if (!sourcePath || !fs.existsSync(sourcePath)) { context.skip('Set FROTA_SOURCE_EXCEL to verify the private source workbook; 35 sanitized records run by default.'); return; }
  const bytes = fs.readFileSync(sourcePath);
  const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
  const originalHash = hash(bytes);
  const workbook = XLSX.read(bytes, { type: 'buffer', cellDates: false });
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets.Planilha1,
    { header: 1, defval: null, raw: true, blankrows: true });
  const previous = global.window;
  global.window = { XLSX };
  try {
    const file = { name: path.basename(sourcePath), size: bytes.length,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    const parsed = await Import.read(file);
    assert.equal(parsed.rows.length, 35);
    assert.equal(parsed.file_name, path.basename(sourcePath));
    assert.deepEqual(parsed.rows.map(r => r.raw.cells), matrix.slice(2));
    assert.deepEqual(parsed.issues.filter(i => i.type === 'PTRAN').map(i => i.row_number), [8, 16, 17, 18, 29]);
    assert.deepEqual(parsed.issues.filter(i => i.type === 'responsável').map(i => i.row_number), [20, 31]);
    assert.equal(parsed.issues.filter(i => i.type === 'duplicidade').length, 4);
    assert.equal(parsed.issues.filter(i => i.type === 'status').length, 1);
    assert.equal(parsed.issues.filter(i => i.type === 'data').length, 1);
    assert.equal(hash(fs.readFileSync(sourcePath)), originalHash);
  } finally {
    if (previous === undefined) delete global.window; else global.window = previous;
  }
});

test('imports XLSM and XLSB buffers through the same file-read and semantic mapping path', async () => {
  const reference = parseFixture();
  const previous = global.window;
  global.window = { XLSX };
  try {
    for (const bookType of ['xlsm', 'xlsb']) {
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(fixture.rows), 'Planilha1');
      const bytes = XLSX.write(book, { type: 'buffer', bookType });
      const file = { name: 'frota-teste.' + bookType, size: bytes.length,
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
      const parsed = await Import.read(file);
      assert.equal(parsed.rows.length, 35, bookType);
      assert.equal(parsed.file_name, file.name);
      assert.deepEqual(parsed.rows.map(r => r.asset), reference.rows.map(r => r.asset), bookType);
      assert.deepEqual(parsed.rows.map(r => r.ptran), reference.rows.map(r => r.ptran), bookType);
      assert.equal(parsed.issues.length, reference.issues.length, bookType);
    }
  } finally {
    if (previous === undefined) delete global.window; else global.window = previous;
  }
});
