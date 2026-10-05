WITH runtime AS
(
    SELECT
        SYSUTCDATETIME() AS report_end_time,
        DATEADD(day, -30, SYSUTCDATETIME()) AS report_start_time
),
qi AS
(
    SELECT
        distributed_statement_id,
        report_start_time,
        report_end_time,
        CAST('{{WAREHOUSE_ITEM_ID}}' AS varchar(36)) AS warehouse_item_id,
        CAST('{{WORKSPACE_NAME}} / {{WAREHOUSE_NAME}}' AS varchar(385)) AS warehouse_name,
        database_name,
        submit_time,
        start_time,
        end_time,
        statement_type,
        total_elapsed_time_ms,
        allocated_cpu_time_ms,
        login_name,
        row_count,
        status,
        program_name,
        query_hash,
        label,
        result_cache_hit,
        sql_pool_name,
        error_code,
        error_severity,
        error_state,
        data_scanned_remote_storage_mb,
        data_scanned_memory_mb,
        data_scanned_disk_mb,
        command
    FROM queryinsights.exec_requests_history
    CROSS JOIN runtime
    WHERE
        COALESCE(end_time, report_end_time) > report_start_time
        AND start_time < report_end_time
),
normalized AS
(
    SELECT
        *,
        CAST(
            UPPER(REPLACE(REPLACE(CONVERT(varchar(36), distributed_statement_id), '{', ''), '}', ''))
            AS varchar(36)
        ) AS query_insights_statement_id,
        CASE
            WHEN COALESCE(end_time, report_end_time) <= start_time
                THEN DATEADD(microsecond, 1, start_time)
            ELSE COALESCE(end_time, report_end_time)
        END AS effective_end_time,
        CASE
            WHEN start_time < report_start_time THEN report_start_time
            ELSE start_time
        END AS overlap_start_time
    FROM qi
),
localized AS
(
    SELECT
        n.*,
        CAST(
            n.start_time AT TIME ZONE 'UTC' AT TIME ZONE '{{TIME_ZONE_ID}}'
            AS datetime2
        ) AS local_start_time,
        CAST(
            n.effective_end_time AT TIME ZONE 'UTC' AT TIME ZONE '{{TIME_ZONE_ID}}'
            AS datetime2
        ) AS local_end_time,
        DATEADD(
            hour,
            DATEDIFF(hour, CONVERT(datetime2, '2000-01-01'), n.overlap_start_time),
            CONVERT(datetime2, '2000-01-01')
        ) AS utc_start_hour
    FROM normalized AS n
),
interval_numbers AS
(
    SELECT ones.n + (10 * tens.n) + (100 * hundreds.n) AS hour_number
    FROM
        (VALUES (0), (1), (2), (3), (4), (5), (6), (7), (8), (9)) AS ones(n)
    CROSS JOIN
        (VALUES (0), (1), (2), (3), (4), (5), (6), (7), (8), (9)) AS tens(n)
    CROSS JOIN
        (VALUES (0), (1), (2), (3), (4), (5), (6), (7)) AS hundreds(n)
)
SELECT
    CAST(l.warehouse_item_id + ':' + l.query_insights_statement_id AS varchar(73)) AS execution_key,
    l.query_insights_statement_id,
    l.warehouse_item_id,
    l.warehouse_name,
    CAST(l.database_name AS varchar(128)) AS database_name,
    l.submit_time,
    l.start_time,
    l.end_time,
    CAST(
        DATEADD(
            second,
            (DATEDIFF(second, CONVERT(datetime2, '2000-01-01'), l.local_start_time) / 30) * 30,
            CONVERT(datetime2, '2000-01-01')
        ) AS datetime2(6)
    ) AS query_timepoint,
    CAST(
        DATEADD(hour, i.hour_number, l.utc_start_hour)
            AT TIME ZONE 'UTC' AT TIME ZONE '{{TIME_ZONE_ID}}'
        AS datetime2
    ) AS query_hour,
    CAST(
        CAST(
            DATEADD(hour, i.hour_number, l.utc_start_hour)
                AT TIME ZONE 'UTC' AT TIME ZONE '{{TIME_ZONE_ID}}'
            AS datetime2
        )
        AS date
    ) AS query_date,
    CAST(l.statement_type AS varchar(128)) AS statement_type,
    CAST(l.total_elapsed_time_ms AS bigint) AS total_elapsed_time_ms,
    CAST(l.allocated_cpu_time_ms AS bigint) AS allocated_cpu_time_ms,
    CAST(l.login_name AS varchar(256)) AS login_name,
    CAST(l.row_count AS bigint) AS row_count,
    CAST(l.status AS varchar(128)) AS status,
    CAST(l.program_name AS varchar(256)) AS program_name,
    CONVERT(varchar(128), l.query_hash, 1) AS query_hash,
    CAST(l.label AS varchar(256)) AS label,
    CAST(l.result_cache_hit AS bigint) AS result_cache_hit,
    CAST(l.sql_pool_name AS varchar(128)) AS sql_pool_name,
    CAST(l.error_code AS bigint) AS error_code,
    CAST(l.error_severity AS bigint) AS error_severity,
    CAST(l.error_state AS bigint) AS error_state,
    CAST(l.data_scanned_remote_storage_mb AS decimal(19, 4)) AS data_scanned_remote_storage_mb,
    CAST(l.data_scanned_memory_mb AS decimal(19, 4)) AS data_scanned_memory_mb,
    CAST(l.data_scanned_disk_mb AS decimal(19, 4)) AS data_scanned_disk_mb,
    CAST(LEFT(l.command, 4000) AS varchar(4000)) AS command
FROM localized AS l
CROSS JOIN interval_numbers AS i
WHERE DATEADD(hour, i.hour_number, l.utc_start_hour) < l.effective_end_time;
