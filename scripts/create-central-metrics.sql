-- Migration: create central_metrics table
-- Run once on the target database: coderstm_gympify
-- Usage: mysql -u coderstm_gympify -p coderstm_gympify < scripts/create-central-metrics.sql

CREATE TABLE IF NOT EXISTS `central_metrics` (
  `id`          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `tenant_id`   VARCHAR(50)     NOT NULL,
  `metric_type` VARCHAR(50)     NOT NULL,
  `value`       DECIMAL(12, 2)  NOT NULL DEFAULT 0,
  `updated_at`  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenant_metric` (`tenant_id`, `metric_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
