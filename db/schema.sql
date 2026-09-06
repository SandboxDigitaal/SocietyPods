PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS societies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  locality TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL UNIQUE,
  active_society_id TEXT REFERENCES societies(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS society_residents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  society_id TEXT NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  flat_no TEXT NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0 CHECK(is_verified IN (0, 1)),
  verification_method TEXT NOT NULL CHECK(verification_method IN ('invite_code', 'work_email')),
  verification_status TEXT NOT NULL,
  work_email TEXT,
  invited_by_resident_id TEXT REFERENCES society_residents(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, society_id)
);

CREATE TABLE IF NOT EXISTS pods (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  school_name TEXT NOT NULL,
  departure_time TEXT NOT NULL,
  max_capacity INTEGER NOT NULL CHECK(max_capacity > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE IF NOT EXISTS pod_members (
  id TEXT PRIMARY KEY,
  pod_id TEXT NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  resident_id TEXT NOT NULL REFERENCES society_residents(id) ON DELETE CASCADE,
  kids_json TEXT NOT NULL,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(pod_id, resident_id)
);

CREATE TABLE IF NOT EXISTS kids (
  id TEXT PRIMARY KEY,
  resident_id TEXT NOT NULL REFERENCES society_residents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  age INTEGER NOT NULL CHECK(age BETWEEN 3 AND 17),
  school_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sos_alerts (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  pod_id TEXT NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  child_id TEXT NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  triggered_by_resident_id TEXT NOT NULL REFERENCES society_residents(id) ON DELETE CASCADE,
  claimed_by_resident_id TEXT REFERENCES society_residents(id),
  reason TEXT NOT NULL,
  handshake_otp TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLAIMED', 'COMPLETED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);
