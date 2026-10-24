-- migrate:up
-- 010 · Access-control and account tables.
SET ROLE ra_owner;

CREATE TABLE role (
  role_id      INT GENERATED ALWAYS AS IDENTITY,
  role_code    VARCHAR(30) NOT NULL,
  role_name    VARCHAR(50) NOT NULL,
  db_role_name NAME        NOT NULL,          -- the PostgreSQL role this application role maps to
  rank         SMALLINT    NOT NULL,          -- ADMIN 3 > CURATOR 2 > RESEARCHER 1
  CONSTRAINT pk_role PRIMARY KEY (role_id),
  CONSTRAINT uq_role_code UNIQUE (role_code),
  CONSTRAINT uq_role_name UNIQUE (role_name),
  CONSTRAINT uq_role_db_role_name UNIQUE (db_role_name),
  CONSTRAINT uq_role_rank UNIQUE (rank),
  CONSTRAINT chk_role_code_format CHECK (role_code ~ '^[A-Z_]+$'),
  CONSTRAINT chk_role_rank_positive CHECK (rank > 0)
);

CREATE TABLE permission (
  permission_id   INT GENERATED ALWAYS AS IDENTITY,
  permission_code VARCHAR(60) NOT NULL,
  description     TEXT,
  CONSTRAINT pk_permission PRIMARY KEY (permission_id),
  CONSTRAINT uq_permission_code UNIQUE (permission_code),
  CONSTRAINT chk_permission_code_format CHECK (permission_code ~ '^[a-z_]+:[a-z_]+$')
);

CREATE TABLE role_permission (
  role_id       INT NOT NULL,
  permission_id INT NOT NULL,
  CONSTRAINT pk_role_permission PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permission_role FOREIGN KEY (role_id) REFERENCES role ON DELETE CASCADE,
  CONSTRAINT fk_role_permission_permission FOREIGN KEY (permission_id) REFERENCES permission ON DELETE CASCADE
);

CREATE TABLE user_account (
  user_id            BIGINT GENERATED ALWAYS AS IDENTITY,
  public_id          UUID         NOT NULL DEFAULT uuidv7(),
  name               VARCHAR(120) NOT NULL,
  email              CITEXT       NOT NULL,
  password_hash      VARCHAR(255) NOT NULL,
  role_id            INT          NOT NULL,
  is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
  failed_login_count SMALLINT     NOT NULL DEFAULT 0,
  locked_until       TIMESTAMPTZ,
  last_login_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT pk_user_account PRIMARY KEY (user_id),
  CONSTRAINT uq_user_account_public_id UNIQUE (public_id),
  CONSTRAINT uq_user_account_email UNIQUE (email),
  CONSTRAINT fk_user_account_role FOREIGN KEY (role_id) REFERENCES role ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_user_account_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT chk_user_account_email_format CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Only Argon2id hashes are accepted, so a plaintext password can never be stored.
  CONSTRAINT chk_user_account_password_is_argon2id CHECK (password_hash LIKE '$argon2id$%'),
  CONSTRAINT chk_user_account_failed_logins_non_negative CHECK (failed_login_count >= 0)
);

CREATE TABLE user_session (
  session_id   CHAR(64)    NOT NULL,          -- SHA-256 hex of the cookie token; the token itself is never stored
  user_id      BIGINT      NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  ip           INET,
  user_agent   TEXT,
  CONSTRAINT pk_user_session PRIMARY KEY (session_id),
  CONSTRAINT fk_user_session_user FOREIGN KEY (user_id) REFERENCES user_account ON DELETE CASCADE,
  CONSTRAINT chk_user_session_id_is_sha256_hex CHECK (session_id ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_user_session_expiry_after_creation CHECK (expires_at > created_at)
);

RESET ROLE;

-- migrate:down
SET ROLE ra_owner;
DROP TABLE IF EXISTS user_session;
DROP TABLE IF EXISTS user_account;
DROP TABLE IF EXISTS role_permission;
DROP TABLE IF EXISTS permission;
DROP TABLE IF EXISTS role;
RESET ROLE;
