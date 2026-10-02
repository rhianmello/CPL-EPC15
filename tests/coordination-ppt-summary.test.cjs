const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Exercise the shipped controllers together. These DOM and Chart adapters only
// record output; no remote service, credentials or production data is required.
function setup() {
  const elements = new Map();
  class Element {
    constructor(id) {
      this.id = id;
      this.value = '';
      this.textContent = '';
      this.dataset = {};
      this.options = [];
      this.classes = new Set();
      this.classList = {
        add: name => this.classes.add(name),
        remove: name => this.classes.delete(name),
        toggle: (name, yes) => yes ? this.classes.add(name) : this.classes.delete(name)
      };
    }
    set innerHTML(value) {
      this.html = value;
      if (this.id.endsWith('-filter')) {
        this.options = [...value.matchAll(/<option value="([^"]*)"/g)].map(m => ({value:m[1]}));
        this.value = this.options[0]?.value || '';
      }
    }
    get innerHTML() { return this.html || ''; }
    addEventListener() {}
  }
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  };
  const saved = new Map();
  const charts = [];
  const context = {
    console, Date, Intl,
    document:{getElementById:element, addEventListener() {}, dispatchEvent() {}},
    localStorage:{
      getItem:key => saved.get(key) ?? null,
      setItem:(key, value) => saved.set(key, value),
      removeItem:key => saved.delete(key)
    },
    CustomEvent:class {},
    Chart:class {
      constructor(canvas, config) { this.config = config; charts.push(this); }
      destroy() { this.destroyed = true; }
    },
    addEventListener() {},
    CoordinationWeek:{
      getSelectedWeek:() => Number(element('pb-week-filter').value) || 26,
      fillWeekOptions(select) { select.innerHTML = '<option value="26">26</option><option value="27">27</option>'; },
      canEdit:() => false,
      refreshStatus() {}
    }
  };
  context.window = context;
  vm.createContext(context);
  for (const name of ['coordination-deck.js', 'pb-dashboard.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8'), context);
  }
  const phase = 'PROJETO EXECUTIVO';
  const excel = {
    dataBase:new Date('2026-09-25T00:00:00Z'),
    contract:{planned:.09, actual:.06, variance:-.03},
    units:['U-8226','U-8224','U-8222'].map(code => ({
      code, rawName:code + ' — Unidade', planned:.19, actual:.099, variance:-.091,
      phases:[{phase, planned:.552, actual:.521, variance:-.031}],
      details:[{phase, subphase:'Somente Excel', planned:.5, actual:.1, variance:-.4, weight:1}]
    }))
  };
  context.PBDashboard.init(excel, 'excel-test.xlsx');
  function select(unit='U-8226', selectedPhase=phase, week=26) {
    element('pb-unit-filter').value = unit;
    element('pb-phase-filter').value = selectedPhase;
    element('pb-week-filter').value = String(week);
    context.PBDashboard.render();
  }
  const slide = (number, unitCode, selectedPhase, planned, actual, variance, extra={}) => ({
    number, unitCode, unitName:'Unidade', phase:selectedPhase,
    dataBase:'16/09/2026', planned, actual, variance,
    actions:[], deliveries:[], disciplines:[], equipment:[], ...extra
  });
  const deck = {
    version:4, fileName:'reuniao.pptx', importedAt:'2026-09-26T12:00:00Z',
    slides:[
      slide(2, '', '', .0771, .0542, -.0229),
      slide(10, 'U-8226', '', .1533, .088, -.0653),
      slide(11, 'U-8226', phase, .5361, .5209, -.0152, {
        deliveries:[
          {name:'Banco de Dados', planned:.3055, actual:.2944, variance:-.0111},
          {name:'Documentação técnica', planned:.4533, actual:.24, variance:-.2133},
          {name:'As built', planned:.0472, actual:null, variance:-.0472},
          {name:'Implantação', planned:1, actual:1, variance:0}
        ]
      }),
      slide(12, 'U-8226', phase, null, null, null, {
        disciplines:[{name:'Outra hierarquia', planned:.9, actual:.1}]
      }),
      slide(6, 'U-8224', phase, .5703, .5298, -.0405),
      slide(4, 'U-8224', '', .1172, .0633, -.0539)
    ]
  };
  function importDeck(data=deck, week=26) { context.CoordinationDeck.importData(data, week); }
  return {context, element, charts, select, excel, deck, importDeck};
}

test('U-8226 / Projeto Executivo uses the PPT totals, precision and cut-off date', () => {
  const t = setup();
  const originalExcel = JSON.stringify(t.excel);
  t.select();
  assert.equal(t.element('pb-planned').textContent, '55,2%');
  t.importDeck();
  t.select();
  assert.equal(t.element('pb-planned').textContent, '53,61%');
  assert.equal(t.element('pb-actual').textContent, '52,09%');
  assert.equal(t.element('pb-gap').textContent, '-1,52 p.p.');
  assert.match(t.element('pb-context-date').textContent, /PPT.*16\/09\/2026.*Slide 11/);
  assert.match(t.element('pb-date-filter').innerHTML, /PPT • 16\/09\/2026/);
  assert.equal(JSON.stringify(t.excel), originalExcel, 'Excel model stays unchanged');
});

test('PPT Pareto uses one hierarchy and no Excel or duplicate parent/child data', () => {
  const t = setup();
  t.importDeck(); t.select();
  const config = t.charts.at(-1).config;
  assert.equal(config.data.labels.length, 3);
  assert.match(config.data.labels[0], /^Documentação/);
  assert(!config.data.labels.some(label => /Excel|hierarquia|Resumo/.test(label)));
  const values = config.data.datasets[0].data;
  assert(Math.abs(values[0] - .2133 / (.2133 + .0472 + .0111) * 100) < 1e-9);
  assert(Math.abs(values.reduce((a,b) => a+b, 0) - 100) < 1e-9);
  assert.match(t.element('pb-pareto-title').textContent, /PPT/);
});

test('unit, contract and missing phase summaries keep the selected scope', () => {
  const t = setup();
  t.importDeck();
  t.select('U-8224');
  assert.equal(t.element('pb-planned').textContent, '57,03%');
  t.select('U-8226', '');
  assert.equal(t.element('pb-planned').textContent, '15,33%');
  t.select('', '');
  assert.equal(t.element('pb-planned').textContent, '7,71%');
  t.select('', 'PROJETO EXECUTIVO');
  assert.equal(t.element('pb-planned').textContent, 'N/D');
  assert.match(t.element('pb-summary-note').textContent, /Selecione uma unidade/);
  t.select('U-8222');
  assert.equal(t.element('pb-planned').textContent, 'N/D');
  assert.equal(t.element('pb-actual').textContent, 'N/D');
  assert(!t.element('pb-summary-note').classes.has('hidden'));
  assert(!t.element('pb-pareto-empty').classes.has('hidden'));
});

test('reimport, weekly isolation and the explicit Excel fallback work with version 4 decks', () => {
  const t = setup();
  t.importDeck(); t.select();
  const changed = JSON.parse(JSON.stringify(t.deck));
  changed.slides.find(s => s.number === 11).planned = .54;
  changed.slides.find(s => s.number === 11).variance = -.0191;
  t.importDeck(changed, 27);
  t.select();
  assert.equal(t.element('pb-planned').textContent, '53,61%');
  t.select('U-8226', 'PROJETO EXECUTIVO', 27);
  assert.equal(t.element('pb-planned').textContent, '54,00%');
  t.importDeck(changed, 26); t.select();
  assert.equal(t.element('pb-planned').textContent, '54,00%');
  t.context.CoordinationDeck.clearWeek(26); t.select();
  assert.equal(t.element('pb-planned').textContent, '55,2%');
  assert.match(t.element('pb-context-date').textContent, /Excel.*25\/09\/2026/);
  assert.match(t.element('pb-pareto-title').textContent, /Excel/);
});
