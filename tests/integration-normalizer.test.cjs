const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function setup() {
  const context = { console };
  context.window = context;
  vm.createContext(context);
  for (const name of ['integration-normalizer.js', 'integration-matcher.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8'), context);
  }
  return context;
}

test('normalizes real ESTHC report spelling variants without losing identity', () => {
  const { IntegrationNormalizer:N } = setup();
  assert.equal(N.normalizeReport('ESTHC_U-8224-E003'), 'ESTHCU8224E003');
  assert.equal(N.normalizeReport('ESTHC-U-8224-E003=0'), 'ESTHCU8224E003');
  assert.equal(N.normalizeReport('ESTHC U-8224 E003'), 'ESTHCU8224E003');
  assert.equal(N.normalizeReport('ESTHC_U_8224_E003'), 'ESTHCU8224E003');
});

test('classifies the real U-8226 E003 mismatch as source error', () => {
  const { IntegrationMatcher:M } = setup();
  const eap = [{
    unit:'U-8226',
    activityUnit:'U-8226',
    criterionUnit:'U-8226',
    activityId:'U8226-C-000017000',
    reportRaw:'ESTHC_U-8224-E003=0',
    reportNormalized:'ESTHCU8224E003',
    reportUnit:'U-8224',
    tag:'E003',
    sourceRow:11109
  }];
  const quality = [{
    unit:'U-8224',
    reportRaw:'ESTHC_U-8224-E003',
    reportNormalized:'ESTHCU8224E003',
    tag:'E003',
    sourceRow:5
  }];
  const [link] = M.linkEapQuality(eap, quality);
  assert.equal(link.status, 'SOURCE_ERROR');
  assert.match(link.reason, /contexto/);
});

test('does not silently accept duplicate EAP reports', () => {
  const { IntegrationMatcher:M } = setup();
  const eap = [
    { unit:'U-8224', activityUnit:'U-8224', reportNormalized:'ESTHCU8224E003', reportUnit:'U-8224', sourceRow:7568 },
    { unit:'U-8226', activityUnit:'U-8226', reportNormalized:'ESTHCU8224E003', reportUnit:'U-8224', sourceRow:11109 }
  ];
  const quality = [{ unit:'U-8224', reportNormalized:'ESTHCU8224E003', sourceRow:5 }];
  const [link] = M.linkEapQuality(eap, quality);
  assert.equal(link.status, 'AMBIGUOUS');
  assert.equal(link.candidates.length, 2);
});

test('manual alias corrects U-8226 E003 without changing the raw report', () => {
  const { IntegrationMatcher:M } = setup();
  const eap = [{
    sourceRow:11109,
    unit:'U-8226',
    activityUnit:'U-8226',
    criterionUnit:'U-8226',
    reportRaw:'ESTHC_U-8224-E003=0',
    reportNormalized:'ESTHCU8224E003',
    reportUnit:'U-8224',
    tag:'E003'
  }];
  const [corrected] = M.applyAliases(eap, [{
    sourceType:'eap_report',
    sourceRow:11109,
    sourceValueNormalized:'ESTHCU8224E003',
    correctedValueRaw:'ESTHC_U-8226-E003',
    correctedValueNormalized:'ESTHCU8226E003',
    reason:'inconsistência entre relatório e contexto da atividade'
  }]);
  assert.equal(corrected.reportRaw, 'ESTHC_U-8224-E003=0');
  assert.equal(corrected.originalReportNormalized, 'ESTHCU8224E003');
  assert.equal(corrected.reportNormalized, 'ESTHCU8226E003');
  const [link] = M.linkEapQuality([corrected], [{ unit:'U-8226', reportNormalized:'ESTHCU8226E003', sourceRow:175 }]);
  assert.equal(link.status, 'MANUAL_ALIAS');
});
