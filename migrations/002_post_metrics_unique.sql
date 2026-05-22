CREATE UNIQUE INDEX IF NOT EXISTS idx_post_metrics_company_network_external
  ON post_metrics (company_id, network_key, external_post_id);
