// js/cloudflare-config.js — Task 6: aponta o frontend para o Worker Cloudflare.
// Opcional: defina window.__EPC15_API_BASE__ antes deste script para
// sobrescrever a base (ex.: preview deploy). Sem ele, usa o dev local.
(function () {
  window.EPC15_CLOUDFLARE_CONFIG = {
    enabled: true,
    apiBase: window.__EPC15_API_BASE__ || 'http://127.0.0.1:8787',
    schemaVersion: 'epc15_snapshot_v1'
  };
}());
