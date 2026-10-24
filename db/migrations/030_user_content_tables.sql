-- migrate:up
-- 030 · Content owned by individual users: collections, their papers, and notes.
SET ROLE ra_owner;

CREATE TABLE collection (
  collection_id   BIGINT GENERATED ALWAYS AS IDENTITY,
  public_id       UUID NOT NULL DEFAULT uuidv7(),
  user_id         BIGINT NOT NULL,
  collection_name VARCHAR(150) NOT NULL,
  description     TEXT,
  is_public       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_collection PRIMARY KEY (collection_id),
  CONSTRAINT uq_collection_public_id UNIQUE (public_id),
  CONSTRAINT fk_collection_user FOREIGN KEY (user_id) REFERENCES user_account ON DELETE CASCADE,
  CONSTRAINT chk_collection_name_not_blank CHECK (length(btrim(collection_name)) > 0),
  CONSTRAINT uq_user_collection_name UNIQUE (user_id, collection_name)
);

CREATE TABLE collection_paper (
  collection_id  BIGINT NOT NULL,
  paper_id       BIGINT NOT NULL,
  reading_status VARCHAR(10) NOT NULL DEFAULT 'NOT_READ',
  priority       VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
  position       INT NOT NULL DEFAULT 0,
  added_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at        TIMESTAMPTZ,
  CONSTRAINT pk_collection_paper PRIMARY KEY (collection_id, paper_id),
  CONSTRAINT fk_collection_paper_collection FOREIGN KEY (collection_id) REFERENCES collection ON DELETE CASCADE,
  CONSTRAINT fk_collection_paper_paper FOREIGN KEY (paper_id) REFERENCES paper ON DELETE CASCADE,
  CONSTRAINT chk_collection_paper_reading_status CHECK (reading_status IN ('NOT_READ', 'READING', 'READ')),
  CONSTRAINT chk_collection_paper_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  CONSTRAINT chk_collection_paper_position_non_negative CHECK (position >= 0),
  -- read_at is set exactly when the paper is READ (the trigger keeps them in step).
  CONSTRAINT chk_collection_paper_read_at_matches_status CHECK ((reading_status = 'READ') = (read_at IS NOT NULL))
);

CREATE TABLE note (
  note_id    BIGINT GENERATED ALWAYS AS IDENTITY,
  user_id    BIGINT NOT NULL,
  paper_id   BIGINT NOT NULL,
  note_text  TEXT   NOT NULL,
  is_private BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_note PRIMARY KEY (note_id),
  CONSTRAINT fk_note_user FOREIGN KEY (user_id) REFERENCES user_account ON DELETE CASCADE,
  CONSTRAINT fk_note_paper FOREIGN KEY (paper_id) REFERENCES paper ON DELETE CASCADE,
  CONSTRAINT chk_note_text_length CHECK (length(btrim(note_text)) BETWEEN 1 AND 20000),
  CONSTRAINT chk_note_updated_after_created CHECK (updated_at >= created_at)
);

RESET ROLE;

-- migrate:down
SET ROLE ra_owner;
DROP TABLE IF EXISTS note;
DROP TABLE IF EXISTS collection_paper;
DROP TABLE IF EXISTS collection;
RESET ROLE;
