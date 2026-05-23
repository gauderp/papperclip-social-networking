ALTER TABLE plugin_gauderp_social_networking_73c869526e.scheduled_posts
  ADD COLUMN IF NOT EXISTS created_by_agent_id text,
  ADD COLUMN IF NOT EXISTS created_by_run_id text;
