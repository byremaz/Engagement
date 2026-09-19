-- ASAS Challenge - PostgreSQL schema (spec §5, §11, §12)
-- Applied idempotently by src/db/migrate.ts.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  join_code       text NOT NULL UNIQUE,
  title           text NOT NULL,
  capacity        integer NOT NULL DEFAULT 100 CHECK (capacity BETWEEN 1 AND 500),
  state           text NOT NULL DEFAULT 'Draft',
  join_open       boolean NOT NULL DEFAULT true,
  paused          boolean NOT NULL DEFAULT false,
  game_index      integer NOT NULL DEFAULT -1,
  round_index     integer NOT NULL DEFAULT -1,
  ceremony_step   integer NOT NULL DEFAULT 0,
  signal_mode     text NOT NULL DEFAULT 'MANUAL' CHECK (signal_mode IN ('MANUAL','AUTO')),
  content_frozen  boolean NOT NULL DEFAULT false,
  content         jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_started_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz
);

CREATE TABLE IF NOT EXISTS participants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  number          integer NOT NULL,
  name            text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 24),
  avatar          text NOT NULL,
  recovery_hash   text NOT NULL,             -- sha256(recoveryCode); raw code never stored
  controller_id   text,                      -- active controller token id (one per identity)
  device          jsonb NOT NULL DEFAULT '{}'::jsonb,
  device_history  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ready           boolean NOT NULL DEFAULT false,
  connected       boolean NOT NULL DEFAULT false,
  is_simulated    boolean NOT NULL DEFAULT false,
  removed_at      timestamptz,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, number)
);
CREATE INDEX IF NOT EXISTS participants_session_idx ON participants(session_id) WHERE removed_at IS NULL;

-- One row per (game, round) attempt. Voided attempts remain for audit; replay creates a new attempt.
CREATE TABLE IF NOT EXISTS round_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  game_type       text NOT NULL CHECK (game_type IN ('RLGL','GEO','ORDER')),
  round_index     integer NOT NULL,
  content_id      text NOT NULL,
  is_practice     boolean NOT NULL DEFAULT false,
  attempt_no      integer NOT NULL DEFAULT 1,
  started_at      timestamptz,
  deadline_at     timestamptz,
  closed_at       timestamptz,
  revealed_at     timestamptz,
  voided_at       timestamptz,
  void_reason     text,
  seed            integer NOT NULL DEFAULT 0,
  UNIQUE (session_id, game_type, round_index, is_practice, attempt_no)
);

-- Locked answers / race outcomes. Scores are server-computed only.
CREATE TABLE IF NOT EXISTS answers (
  attempt_id      uuid NOT NULL REFERENCES round_attempts(id) ON DELETE CASCADE,
  participant_id  uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  payload         jsonb NOT NULL,            -- {pin:{lat,lng}} | {order:[...]} | {progress,state,finishedAt}
  locked_at       timestamptz,
  raw_score       numeric(8,3),              -- unrounded per-round value; null until reveal
  PRIMARY KEY (attempt_id, participant_id)
);

-- Signal log for Red Light, Green Light (server-authoritative, spec §6.4).
CREATE TABLE IF NOT EXISTS signal_events (
  id              bigserial PRIMARY KEY,
  attempt_id      uuid NOT NULL REFERENCES round_attempts(id) ON DELETE CASCADE,
  event_id        integer NOT NULL,
  color           text NOT NULL CHECK (color IN ('RED','GREEN')),
  effective_at    timestamptz NOT NULL,
  source          text NOT NULL CHECK (source IN ('MANUAL','AUTO'))
);

-- Incremental, idempotent extensions (spec §11 pause overlay, §12.1 attempt/participation fields).
ALTER TABLE round_attempts ADD COLUMN IF NOT EXISTS content            jsonb NOT NULL DEFAULT '{}'::jsonb; -- frozen round content incl. solution
ALTER TABLE sessions       ADD COLUMN IF NOT EXISTS standings_page     integer NOT NULL DEFAULT 0;        -- display leaderboard page (host-driven)
ALTER TABLE round_attempts ADD COLUMN IF NOT EXISTS duration_ms        integer NOT NULL DEFAULT 0;
ALTER TABLE round_attempts ADD COLUMN IF NOT EXISTS countdown_ends_at  timestamptz;
ALTER TABLE round_attempts ADD COLUMN IF NOT EXISTS paused_remaining_ms integer;                          -- set while paused
ALTER TABLE round_attempts ADD COLUMN IF NOT EXISTS pause_records      jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE round_attempts ADD COLUMN IF NOT EXISTS participant_count  integer;                           -- N registered at start (§6.8)
ALTER TABLE round_attempts ADD COLUMN IF NOT EXISTS interrupted        boolean NOT NULL DEFAULT false;    -- server restart mid-race (§11)
ALTER TABLE round_attempts ADD COLUMN IF NOT EXISTS is_tiebreak        boolean NOT NULL DEFAULT false;    -- §9.3, never counts toward totals
ALTER TABLE round_attempts ADD COLUMN IF NOT EXISTS tiebreak_participants jsonb;                          -- participant IDs allowed to answer

ALTER TABLE answers ADD COLUMN IF NOT EXISTS saved_at timestamptz;
ALTER TABLE answers ADD COLUMN IF NOT EXISTS detail   jsonb;                                              -- scoring details published at reveal

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_attempt_id uuid;                                  -- attempt driving the current stage
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS seq bigint NOT NULL DEFAULT 0;                             -- snapshot sequence (§12.4)
ALTER TABLE participants ADD COLUMN IF NOT EXISTS tie_break numeric(12,4);                              -- §9.3 ordering value; null = none

CREATE INDEX IF NOT EXISTS round_attempts_session_idx ON round_attempts(session_id, game_type, round_index);
CREATE INDEX IF NOT EXISTS answers_participant_idx ON answers(participant_id);

-- Host audit trail (actions, voids, renames, removals, exports).
CREATE TABLE IF NOT EXISTS host_audit (
  id              bigserial PRIMARY KEY,
  session_id      uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  action          text NOT NULL,
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb,
  at              timestamptz NOT NULL DEFAULT now()
);
