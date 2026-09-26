CREATE TABLE installs (
  install_id TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  app_version TEXT NOT NULL,
  lol_region TEXT,
  locale TEXT,
  country TEXT,
  os_build TEXT,
  mode TEXT,
  streaming TEXT
);
CREATE INDEX installs_last_seen ON installs (last_seen);
CREATE INDEX installs_first_seen ON installs (first_seen);

CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  install_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  ended INTEGER NOT NULL DEFAULT 0,
  app_version TEXT NOT NULL,
  lol_region TEXT,
  country TEXT
);
CREATE INDEX sessions_last_seen ON sessions (last_seen);
CREATE INDEX sessions_started_at ON sessions (started_at);

CREATE TABLE daily (
  day TEXT NOT NULL,
  install_id TEXT NOT NULL,
  app_version TEXT NOT NULL,
  lol_region TEXT,
  country TEXT,
  PRIMARY KEY (day, install_id)
);
