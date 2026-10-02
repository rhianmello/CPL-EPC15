(function () {
  'use strict';

  async function publishAudit(audit) {
    if (!window.CloudSync?.rpc) throw new Error('Supabase ainda não está disponível.');
    return window.CloudSync.rpc('publish_bi_snapshot', {
      p_dataset_type: 'epc15_integration_audit',
      p_file_name: 'auditoria-integracao-epc15',
      p_file_size: null,
      p_file_last_modified: null,
      p_data_base: null,
      p_schema_version: 'epc15_integration_audit_v1',
      p_dataset: {
        schema_version: 'epc15_integration_audit_v1',
        generated_at: audit.generatedAt,
        model: audit
      },
      p_pb_manual: {}
    });
  }

  window.IntegrationRepository = { publishAudit };
}());
