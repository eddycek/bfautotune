CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  license_key TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'paid',
  stripe_payment_id TEXT,
  trivi_document_id TEXT,
  installation_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  activated_at TEXT,
  last_validated_at TEXT,
  reset_count INTEGER NOT NULL DEFAULT 0,
  max_resets INTEGER NOT NULL DEFAULT 3,
  whitelist_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);
CREATE INDEX IF NOT EXISTS idx_licenses_installation ON licenses(installation_id);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);

-- Beta whitelist table
CREATE TABLE IF NOT EXISTS beta_whitelist (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  quad_count INTEGER NOT NULL DEFAULT 1,
  platform TEXT NOT NULL,
  comment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  license_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  ip_address TEXT,
  UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_beta_whitelist_status ON beta_whitelist(status);
CREATE INDEX IF NOT EXISTS idx_beta_whitelist_email ON beta_whitelist(email);
CREATE INDEX IF NOT EXISTS idx_beta_whitelist_ip_created_at ON beta_whitelist(ip_address, created_at);
