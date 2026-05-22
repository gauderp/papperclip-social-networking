CREATE TABLE IF NOT EXISTS network_accounts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  network_key TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  connected_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, network_key)
);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  network_key TEXT NOT NULL,
  body TEXT NOT NULL,
  media_json TEXT,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  published_at TEXT,
  external_post_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post_metrics (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  network_key TEXT NOT NULL,
  external_post_id TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  raw_json TEXT
);
