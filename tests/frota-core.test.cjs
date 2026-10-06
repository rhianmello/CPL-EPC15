const assert = require('node:assert/strict');
const { test } = require('node:test');
const Core = require('../js/frota-core.js');

const TODAY = '2026-10-06';
function asset(overrides = {}) {
  return {
    id: 'asset-1', asset_code: 'CPL-001', placa_identificador: 'ATV-TESTE-001',
    modelo: 'SAVEIRO - CINZA', tipo: 'Veículo', categoria: 'Utilitário',
    empresa: 'CPL', gerencia: 'EPC-15', responsavel_cpl: 'OPERADOR A',
    ativo_no_contrato: true, status_operacional: 'Disponível',
    ptrans: [{ id: 'ptran-1', numero_ptran: 'PTRAN-TESTE-001', numero_isc: 'ISC-TESTE-001',
      status: 'Pronto', data_validade: '2027-10-06', created_at: '2026-10-01T12:00:00Z' }],
    inspections: [], documents: [], maintenance: [], ...overrides,
  };
}
function offset(days) {
  const base = new Date(Core.todayISO() + 'T12:00:00Z');
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

test('keeps internal equipment identifiers generic and suggests editable categories', () => {
  assert.equal(Core.identifierKey(' EQP 0001 '), Core.identifierKey('EQP0001'));
  assert.equal(Core.suggestCategory('RETROESCAVADEIRA MODELO TESTE'), 'Retroescavadeira');
  assert.equal(Core.suggestCategory('MOTONIVELADORA MODELO TESTE'), 'Motoniveladora');
  assert.equal(Core.suggestCategory('MINI ESCAVADEIRA MODELO TESTE'), 'Escavadeira');
  assert.equal(Core.suggestCategory('BOMBA DE CONCRETO'), 'Bomba de concreto');
  assert.equal(Core.suggestCategory('ÔNIBUS - BRANCO'), 'Ônibus');
  assert.equal(Core.suggestCategory('Modelo não catalogado'), 'Outros');
});

test('rejects impossible calendar days and handles leap years deterministically', () => {
  assert.equal(Core.dateISO('2026-02-30'), null);
  assert.equal(Core.dateISO('2026-02-29'), null);
  assert.equal(Core.dateISO('2024-02-29'), '2024-02-29');
  assert.equal(Core.daysUntil('2026-10-06', TODAY), 0);
  assert.equal(Core.daysUntil('2026-10-05', TODAY), -1);
  assert.equal(Core.daysUntil('2026-11-05', TODAY), 30);
  assert.equal(Core.daysUntil('2026-02-30', TODAY), null);
  assert.equal(Core.daysUntil('2026-11-05', 'invalid'), null);
  assert.equal(Core.formatDate('2026-02-30'), 'Data inválida');
  assert.equal(Core.formatDate(null), '—');
  assert.equal(Core.formatDate('2026-10-06'), '06/10/2026');
});

test('selects current versions without destroying the superseded history', () => {
  const history = [{ id: 'p1' }, { id: 'p2', supersedes_id: 'p1' },
    { id: 'p3', supersedes_id: 'p2', created_at: '2026-10-02' },
    { id: 'deleted', deleted_at: '2026-10-03' }];
  const original = structuredClone(history);
  assert.deepEqual(Core.currentRecords(history).map(r => r.id), ['p3']);
  assert.equal(Core.newest(history).id, 'p3');
  assert.deepEqual(history, original);
});

test('regular requires operational data, a numbered PTRAN and a known validity', () => {
  assert.equal(Core.situation(asset(), TODAY).tone, 'green');
  const noExpiry = asset({ ptrans: [{ id: 'p1', numero_ptran: 'PTRAN-TESTE-001', status: 'Pronto' }] });
  assert.equal(Core.situation(noExpiry, TODAY).tone, 'yellow');
  assert.equal(Core.metrics([noExpiry], TODAY).ptran_valid, 0);
  assert.equal(Core.metrics([noExpiry], TODAY).ptran_pending, 1);
  assert.equal(Core.situation(asset({ status_operacional: '' }), TODAY).tone, 'yellow');
  assert.equal(Core.situation(asset({ responsavel_cpl: '' }), TODAY).tone, 'yellow');
});

test('validity boundaries warn within 30 days and become critical after expiry', () => {
  for (const [validity, tone] of [['2026-10-05', 'red'], ['2026-10-06', 'yellow'],
    ['2026-11-05', 'yellow'], ['2026-11-06', 'green']]) {
    const a = asset(); a.ptrans[0].data_validade = validity;
    assert.equal(Core.situation(a, TODAY).tone, tone, validity);
  }
  const invalid = asset(); invalid.ptrans[0].data_validade = '2026-02-30';
  assert.equal(Core.situation(invalid, TODAY).tone, 'yellow');
  assert.match(Core.situation(invalid, TODAY).reasons.join(' '), /data inválida/);
});

test('cancelled PTRAN is gray without changing active membership or available count', () => {
  const a = asset(); a.ptrans[0].status = 'Cancelado';
  const original = structuredClone(a);
  assert.equal(Core.situation(a, TODAY).tone, 'gray');
  assert.deepEqual(Core.metrics([a], TODAY), {
    total: 1, active: 1, unconfirmed: 0, available: 1, unavailable: 0,
    ptran_valid: 0, ptran_pending: 0, ptran_expired: 0,
    inspection_expired: 0, inspection_due: 0,
    maintenance_expired: 0, maintenance_due: 0, document_expired: 0,
  });
  assert.deepEqual(a, original);
});

test('out-of-contract assets stay gray even with expired documents and are excluded from KPIs', () => {
  const a = asset({ ativo_no_contrato: false, status_operacional: 'Indisponível',
    documents: [{ id: 'd1', tipo_documento: 'CRLV', validade: '2020-01-01' }] });
  assert.equal(Core.situation(a, TODAY).tone, 'gray');
  assert.equal(Core.metrics([a], TODAY).active, 0);
  assert.equal(Core.metrics([a], TODAY).document_expired, 0);
});

test('old expired inspections, documents and revisions do not invalidate later renewals', () => {
  const a = asset({
    inspections: [
      { id: 'i-old', tipo_inspecao: 'Mensal', data_inspecao: '2026-01-01', validade: '2026-01-31' },
      { id: 'i-new', tipo_inspecao: 'mensal', data_inspecao: '2026-10-01', validade: '2027-01-01' },
    ],
    documents: [
      { id: 'd-old', tipo_documento: 'CRLV', emissao: '2025-01-01', validade: '2026-01-01' },
      { id: 'd-new', tipo_documento: 'crlv', emissao: '2026-10-01', validade: '2027-01-01' },
    ],
    maintenance: [
      { id: 'm-old', categoria: 'preventiva', data_execucao: '2026-01-01', proxima_revisao_data: '2026-06-01' },
      { id: 'm-new', categoria: 'Preventiva', data_execucao: '2026-10-01', proxima_revisao_data: '2027-01-01' },
    ],
  });
  a.ptrans.push({ id: 'p-old', status: 'Vencido', numero_ptran: 'PTRAN-ANTERIOR',
    data_validade: '2020-01-01', created_at: '2020-01-01T12:00:00Z' });
  assert.equal(Core.situation(a, TODAY).tone, 'green');
  assert.equal(Core.metrics([a], TODAY).inspection_expired, 0);
  assert.equal(Core.metrics([a], TODAY).maintenance_expired, 0);
  assert.equal(Core.metrics([a], TODAY).document_expired, 0);
  assert.equal(a.inspections.length, 2);
  assert.equal(a.documents.length, 2);
  assert.equal(a.maintenance.length, 2);
});

test('a current reinspection failure and unavailable operation produce critical alerts', () => {
  const inspection = asset({ inspections: [{ id: 'i1', tipo_inspecao: 'Segurança',
    resultado: 'Reprovado', data_inspecao: TODAY, validade: '2027-01-01' }] });
  assert.equal(Core.situation(inspection, TODAY).tone, 'red');
  assert.match(Core.situation(inspection, TODAY).reasons.join(' '), /reprovada/);
  assert.equal(Core.situation(asset({ status_operacional: 'Indisponível' }), TODAY).tone, 'red');
});

test('maintenance becomes due when current kilometre or hour readings reach their limits', () => {
  const a = asset({ quilometragem: 15000, horimetro: 250,
    maintenance: [{ id: 'm1', categoria: 'preventiva', status: 'Concluída',
      proxima_revisao_km: 15000, proxima_revisao_horas: 250 }] });
  assert.equal(Core.situation(a, TODAY).tone, 'red');
  assert.equal(Core.situation(a, TODAY).alerts.filter(x => x.type === 'Revisão').length, 2);
  assert.equal(Core.metrics([a], TODAY).maintenance_expired, 1);
  a.quilometragem = 14999; a.horimetro = 249;
  assert.equal(Core.situation(a, TODAY).tone, 'green');
  a.maintenance[0].status = 'Cancelado'; a.quilometragem = 20000;
  assert.equal(Core.situation(a, TODAY).tone, 'green');
});

test('metric totals retain inactive registrations while counting only active due statuses', () => {
  const good = asset({ id: 'good' });
  const inactive = asset({ id: 'inactive', ativo_no_contrato: false });
  const pending = asset({ id: 'pending', status_operacional: 'Em manutenção',
    ptrans: [{ id: 'p2', status: 'Pendente' }] });
  const cancelled = asset({ id: 'cancelled' }); cancelled.ptrans[0].status = 'Cancelado';
  const expired = asset({ id: 'expired' }); expired.ptrans[0].data_validade = '2026-10-05';
  const values = Core.metrics([good, inactive, pending, cancelled, expired], TODAY);
  assert.equal(values.total, 5); assert.equal(values.active, 4);
  assert.equal(values.available, 3); assert.equal(values.unavailable, 1);
  assert.equal(values.ptran_valid, 1); assert.equal(values.ptran_pending, 1);
  assert.equal(values.ptran_expired, 1);
});

test('quality exposes unknown status, missing data and shared identifiers without mutation', () => {
  const a = asset({ id: 'one', responsavel_cpl: '', observacao_atual: 'CANCELAR',
    ptrans: [{ id: 'p1', status: 'STATUS DESCONHECIDO', data_recebimento: '1900-01-02' }] });
  const b = asset({ id: 'two', placa_identificador: 'ATV TESTE 001' });
  const original = structuredClone([a, b]);
  const issues = Core.quality([a, b]);
  assert.equal(issues.filter(i => i.type === 'duplicidade').length, 2);
  assert.ok(issues.some(i => i.type === 'status' && /STATUS DESCONHECIDO/.test(i.message)));
  assert.ok(issues.some(i => i.type === 'PTRAN'));
  assert.ok(issues.some(i => i.type === 'responsável'));
  assert.ok(issues.some(i => i.type === 'data'));
  assert.ok(issues.some(i => i.type === 'conflito'));
  assert.deepEqual([a, b], original);
});

test('global and field filters include PTRAN history and respect combined selections', () => {
  const one = asset({ id: 'one' });
  one.ptrans.push({ id: 'old', numero_ptran: '123456', numero_isc: 'ISC-OLD', status: 'Pendente', created_at: '2020-01-01' });
  const two = asset({ id: 'two', placa_identificador: 'EQP-TESTE-002', modelo: 'Escavadeira Sany',
    categoria: 'Escavadeira', responsavel_cpl: 'OPERADOR B', empresa: 'Fornecedor' });
  assert.deepEqual(Core.filterAssets([one, two], { search: 'ISC-OLD' }).map(a => a.id), ['one']);
  assert.deepEqual(Core.filterAssets([one, two], { categoria: 'escavadeira', modelo: 'SANY',
    responsavel_cpl: 'operador b', empresa: 'fornecedor' }).map(a => a.id), ['two']);
  assert.equal(Core.metrics(Core.filterAssets([one, two], { search: 'Sany' }), TODAY).total, 1);
  assert.equal(Core.filterAssets([one, two], { placa_identificador: 'ATv', ptran_status: 'pronto' }).length, 1);
  assert.equal(Core.filterAssets([one, two], { gerencia: 'different' }).length, 0);
});

test('expiry and pending filters use the current renewal and the São Paulo current date', () => {
  const soon = asset({ id: 'soon' }); soon.ptrans[0].data_validade = offset(7);
  const expired = asset({ id: 'expired' }); expired.ptrans[0].data_validade = offset(-1);
  const renewed = asset({ id: 'renewed', documents: [
    { id: 'd-old', tipo_documento: 'CRLV', emissao: '2020-01-01', validade: offset(-30) },
    { id: 'd-new', tipo_documento: 'CRLV', emissao: Core.todayISO(), validade: offset(90) },
  ] }); renewed.ptrans[0].data_validade = offset(90);
  assert.deepEqual(Core.filterAssets([soon, expired, renewed], { expiry: '7' }).map(a => a.id), ['soon']);
  assert.deepEqual(Core.filterAssets([soon, expired, renewed], { expiry: 'expired' }).map(a => a.id), ['expired']);
  assert.deepEqual(Core.filterAssets([soon, expired, renewed], { only_pending: true }).map(a => a.id), ['soon', 'expired']);
});

test('escaping makes imported HTML characters safe for text rendered through innerHTML', () => {
  assert.equal(Core.escape('<img src="x" onerror=\'run()\'> &'),
    '&lt;img src=&quot;x&quot; onerror=&#39;run()&#39;&gt; &amp;');
  assert.equal(Core.escape(null), '');
  assert.equal(Core.escape('CPL • EPC-15'), 'CPL • EPC-15');
});

test('cancelled revisions do not appear in expiry filters or create critical situations', () => {
  for (const status of ['Cancelado', 'Cancelada']) {
    const a = asset({ maintenance: [{ id: 'm-cancelled', categoria: 'Preventiva',
      status, proxima_revisao_data: offset(-30) }] });
    assert.equal(Core.situation(a).tone, 'green');
    assert.equal(Core.filterAssets([a], { expiry: 'expired' }).length, 0);
    assert.equal(Core.filterAssets([a], { only_pending: true }).length, 0);
  }
});

test('explicitly expired documents remain critical and counted when validity is unknown', () => {
  const a = asset({ documents: [{ id: 'd-expired', tipo_documento: 'CRLV', status: 'Vencido' }] });
  assert.equal(Core.situation(a, TODAY).tone, 'red');
  assert.equal(Core.metrics([a], TODAY).document_expired, 1);
});

test('explicitly expired inspections and maintenance are counted without invented dates', () => {
  const a = asset({
    inspections: [{ id: 'i-expired', tipo_inspecao: 'Segurança', status: 'Vencido' }],
    maintenance: [{ id: 'm-expired', categoria: 'Preventiva', status: 'Vencido' }],
  });
  assert.equal(Core.situation(a, TODAY).tone, 'red');
  assert.equal(Core.metrics([a], TODAY).inspection_expired, 1);
  assert.equal(Core.metrics([a], TODAY).maintenance_expired, 1);
  assert.ok(Core.situation(a, TODAY).alerts.every(a => a.validade === null));
});

test('unknown operational text cannot prove a regular condition and remains reviewable', () => {
  const a = asset({ status_operacional: 'Texto desconhecido' });
  const before = structuredClone(a);
  assert.equal(Core.situation(a, TODAY).tone, 'yellow');
  assert.ok(Core.situation(a, TODAY).reasons.some(r => /operacional.*desconhecid/i.test(r)));
  assert.ok(Core.quality([a]).some(i => /operacional.*desconhecid/i.test(i.message)));
  assert.equal(Core.metrics([a], TODAY).available, 0);
  assert.equal(Core.metrics([a], TODAY).unavailable, 0);
  assert.deepEqual(a, before);
});
