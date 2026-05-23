CREATE TABLE plugin_gauderp_social_networking_73c869526e.network_accounts (
  id uuid PRIMARY KEY,
  company_id text NOT NULL,
  network_key text NOT NULL,
  display_name text,
  status text NOT NULL DEFAULT 'disconnected',
  connected_at timestamptz,
  metadata_json text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, network_key)
);

CREATE TABLE plugin_gauderp_social_networking_73c869526e.scheduled_posts (
  id uuid PRIMARY KEY,
  company_id text NOT NULL,
  network_key text NOT NULL,
  body text NOT NULL,
  media_json text,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  published_at timestamptz,
  external_post_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plugin_gauderp_social_networking_73c869526e.post_metrics (
  id uuid PRIMARY KEY,
  company_id text NOT NULL,
  network_key text NOT NULL,
  external_post_id text NOT NULL,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  impressions integer,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  raw_json text
);
