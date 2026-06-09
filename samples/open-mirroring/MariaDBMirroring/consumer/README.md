# MariaDB Mirroring Consumer Startup Flow

This document explains **what `consumer.py` does when it starts**, in the exact order it happens.

## 1) Script entry point

- Python executes:

```python
if __name__ == "__main__":
    sys.exit(main())
```

- `main()` is the startup and runtime orchestrator.

## 2) Logging is initialized

- `setup_logging()` runs first.
- Reads `LOG_LEVEL` (default: `INFO`).
- Configures global logging format and level.
- If `LOG_LEVEL` is invalid, it logs a warning and falls back to `INFO`.

## 3) Environment variables are read

`main()` loads all startup configuration, including:

- Kafka settings (`KAFKA_BOOTSTRAP_SERVERS`, `KAFKA_TOPIC`, `KAFKA_PARTITION`)
- Consumer behavior (`START_FROM`, `POLL_TIMEOUT_MS`, `CHECK_INTERVAL_SECONDS`, `MAX_ROWS_PER_UPLOAD`)
- Bootstrap/snapshot flags (`BOOTSTRAP_ONCE_FROM_BEGINNING`, `SNAPSHOT_TABLES_ON_START`, `RESET_BOOTSTRAP_STATE`)
- Output controls (`LANDING_ZONE_ROOT`, `LOCAL_ONLY`)
- Optional table filter (`TABLE_INCLUDE_LIST`)
- Snapshot source DB connection details (`SNAPSHOT_SOURCE_*`)
- Partner metadata (`PARTNER_NAME`, `SOURCE_TYPE`, `SOURCE_VERSION`)

Helper functions used here:

- `env_int()` for integer env vars
- `env_bool()` for boolean env vars
- `parse_table_include_list()` for CSV table filters

## 4) Remote upload client is configured (optional)

- `build_remote_uploader()` checks `LANDING_ZONE_URL` and Azure credential env vars.
- If `LOCAL_ONLY=true`, remote upload is forcibly disabled.
- If remote is configured, `validate_remote_landing_zone()` verifies the target path is reachable.
- If validation fails, remote upload is disabled and local writing continues.

## 5) Key-column mapping is loaded

- Default keys are defined for known tables.
- `load_key_columns()` can override defaults using `TABLE_KEY_COLUMNS_JSON`.

## 6) Landing zone structure is prepared

- Ensures `LANDING_ZONE_ROOT` exists.
- Creates local `_partnerEvents.json` via `ensure_partner_events()` if missing.
- If remote upload is active, uploads `_partnerEvents.json` once (if missing).

## 7) Persistent state is loaded

- State file path: `<LANDING_ZONE_ROOT>/.state/state.json`
- `load_state()` loads or initializes these structures:
  - `next_offsets`
  - `file_counters`
  - `table_columns`
  - `table_column_types`
  - `bootstrap_completed`
  - `bootstrap_target_offsets`
  - `snapshot_completed`
  - `snapshot_start_offsets`
  - `snapshot_gtid_positions`
  - `table_snapshots_completed`

## 8) Kafka consumer is created and assigned

- Creates `KafkaConsumer` with JSON value deserializer.
- Disables auto-commit (`enable_auto_commit=False`) because offset state is managed in the state file.
- Assigns to a single `TopicPartition(topic, partition)`.

## 9) Reset/bootstrap/snapshot decision logic runs

Using `offset_key = "<topic>:<partition>"`, startup chooses one path:

### Path A: Reset state (optional)

If `RESET_BOOTSTRAP_STATE=true`, it clears snapshot/bootstrap/offset markers for this partition in state.

### Path B: Full table snapshot on start

If `SNAPSHOT_TABLES_ON_START=true` and snapshot not yet completed:

1. Reads Kafka end offset and stores it as `snapshot_start_offsets[offset_key]`.
2. Calls `snapshot_source_tables(...)`:
   - Opens MariaDB connection.
   - Starts `START TRANSACTION WITH CONSISTENT SNAPSHOT`.
   - Captures GTID (`get_gtid_position`).
   - Reads included/all tables (`fetch_snapshot_table_list`).
   - For each table:
     - Reads schema + data (`create_snapshot_rows`).
     - Stores column metadata in state.
     - Stores table snapshot GTID in `snapshot_gtid_positions`.
     - Writes files (`flush_table_rows`) or empty file (`write_empty_snapshot_file`).
   - Commits transaction.
3. Sets `next_offsets[offset_key]` to the previously captured Kafka end offset.
4. Marks snapshot/bootstrap completed.
5. Saves state and seeks consumer to that offset.

### Path C: Bootstrap from beginning once

If `BOOTSTRAP_ONCE_FROM_BEGINNING=true` and not already completed:

1. Captures current end offset as bootstrap target.
2. Saves target in `bootstrap_target_offsets[offset_key]`.
3. Seeks Kafka consumer to beginning.

### Path D: Normal resume/start behavior

- If saved offset exists: seek to `next_offsets[offset_key]`.
- Else if `START_FROM=latest`: seek to end.
- Else: seek to beginning (`earliest` default behavior).

## 10) Signal handlers are registered

- Handles `SIGTERM` and `SIGINT`.
- Sets a stop flag so shutdown is graceful (flush buffers, save state, close consumer).

## 11) In-memory buffers are initialized

- `table_buffers`: rows buffered per table.
- `table_paths`: resolved output paths per table.
- `last_flush`: timestamp for periodic flushing.

At this point, startup is complete and the consumer enters the poll loop.

---

## What happens immediately after startup (first loop cycle)

- Polls Kafka records.
- Detects `DROP TABLE` events and purges table outputs/state.
- Resolves table from each event and applies optional table filter.
- For first-seen tables, takes an on-demand table snapshot (`snapshot_single_table_on_demand`).
- Filters out pre-snapshot events by GTID (`should_process_event_after_gtid_snapshot`).
- Normalizes row payloads (`normalize_row`) and buffers them.
- Flushes buffered rows to CSV when thresholds/time are met (`flush_table_rows`).
- Persists offsets + metadata in `.state/state.json`.

This continues until a stop signal is received, then it performs a final flush, saves state, closes Kafka consumer, and exits cleanly.
