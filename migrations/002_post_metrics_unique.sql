CREATE UNIQUE INDEX IF NOT EXISTS idx_post_metrics_company_network_external
  ON plugin_gauderp_social_networking_73c869526e.post_metrics (company_id, network_key, external_post_id);
