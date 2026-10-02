(function () {
  'use strict';

  const RELATIONSHIP_STATUS = Object.freeze({
    CONFIRMED: 'CONFIRMED',
    PROBABLE: 'PROBABLE',
    AMBIGUOUS: 'AMBIGUOUS',
    UNMATCHED: 'UNMATCHED',
    MANUAL_ALIAS: 'MANUAL_ALIAS',
    SOURCE_ERROR: 'SOURCE_ERROR'
  });

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function fold(value) {
    return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function normalizeText(value) {
    return fold(value).toUpperCase().replace(/\s+/g, ' ').trim();
  }

  function normalizeHeader(value) {
    return normalizeText(value).replace(/[×*]/g, ' X ').replace(/[^A-Z0-9]+/g, ' ').trim();
  }

  function normalizeReport(value) {
    const raw = normalizeText(value).replace(/=0\s*$/i, '');
    return raw.replace(/[^A-Z0-9]/g, '');
  }

  function parseUnit(value) {
    const match = normalizeText(value).match(/U[-_\s]?(\d{4})/);
    return match ? 'U-' + match[1] : '';
  }

  function parsePileTag(value) {
    const match = normalizeText(value).match(/E[-_\s]?(\d{3,4})/);
    return match ? 'E' + match[1] : '';
  }

  function hierarchyKey(parts) {
    return [
      parts?.entrega,
      parts?.fase,
      parts?.subfase,
      parts?.agrupamento,
      parts?.componente,
      parts?.etapa,
      parts?.criterio
    ].map(normalizeText).join('|');
  }

  function reportIdentity(value) {
    const rawValue = text(value);
    return {
      rawValue,
      normalizedValue: normalizeReport(rawValue),
      unit: parseUnit(rawValue),
      tag: parsePileTag(rawValue)
    };
  }

  window.IntegrationNormalizer = {
    RELATIONSHIP_STATUS,
    text,
    fold,
    normalizeText,
    normalizeHeader,
    normalizeReport,
    parseUnit,
    parsePileTag,
    hierarchyKey,
    reportIdentity
  };
}());
