-- 文档评论线程与回复
CREATE TABLE IF NOT EXISTS doc_comment_threads (
  id              VARCHAR(64)   NOT NULL PRIMARY KEY,
  doc_id          VARCHAR(64)   NOT NULL,
  block_id        VARCHAR(128)  NOT NULL,
  anchor_start    INT           NOT NULL,
  anchor_end      INT           NOT NULL,
  quote           VARCHAR(500)  NOT NULL DEFAULT '',
  anchor_meta     TEXT          NULL,
  resolved        TINYINT(1)    NOT NULL DEFAULT 0,
  created_by      CHAR(36)      NOT NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_dct_doc (doc_id),
  KEY idx_dct_doc_resolved (doc_id, resolved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS doc_comment_replies (
  id              VARCHAR(64)   NOT NULL PRIMARY KEY,
  thread_id       VARCHAR(64)   NOT NULL,
  author_id       CHAR(36)      NOT NULL,
  author_name     VARCHAR(100)  NOT NULL,
  author_avatar   VARCHAR(500)  DEFAULT NULL,
  text            TEXT          NOT NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NULL DEFAULT NULL,
  KEY idx_dcr_thread (thread_id),
  CONSTRAINT fk_dcr_thread FOREIGN KEY (thread_id) REFERENCES doc_comment_threads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS doc_comment_reply_likes (
  reply_id        VARCHAR(64)   NOT NULL,
  user_id         CHAR(36)      NOT NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reply_id, user_id),
  KEY idx_dcrl_user (user_id),
  CONSTRAINT fk_dcrl_reply FOREIGN KEY (reply_id) REFERENCES doc_comment_replies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
