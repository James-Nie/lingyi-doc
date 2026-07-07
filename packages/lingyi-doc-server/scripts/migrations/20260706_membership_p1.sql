-- 会员 P1：日配额流水
USE lingyi_doc_db;

CREATE TABLE IF NOT EXISTS quota_daily_log (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    space_kind  TINYINT      NOT NULL COMMENT '1=个人 2=团队',
    space_id    CHAR(36)     NOT NULL COMMENT '个人=userId 团队=tenantId',
    metric      VARCHAR(32)  NOT NULL COMMENT 'export 等',
    log_date    DATE         NOT NULL,
    count_value INT          NOT NULL DEFAULT 0,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_quota_daily (space_kind, space_id, metric, log_date),
    KEY idx_quota_daily_date (log_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('20260706_membership_p1');
