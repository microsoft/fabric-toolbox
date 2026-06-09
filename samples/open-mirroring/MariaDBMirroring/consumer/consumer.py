import json
import logging
import os
import re
import signal
import shutil
import sys
import time
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import pyarrow as pa
import pyarrow.parquet as pq
from kafka import KafkaConsumer, TopicPartition
import pymysql
import yaml

from gtid_utils import get_gtid_position, gtid_compare
from openmirroring_operations import OpenMirroringClient

RemoteMirrorClient = Any


META_FIELDS = {
    "domain",
    "server_id",
    "sequence",
    "event_number",
    "timestamp",
    "event_type",
    "table_schema",
    "table_name",
}

ROW_MARKER_MAP = {
    "insert": 0,
    "update_after": 1,
    "delete": 2,
}
ROW_MARKER_FIELD = "__rowMarker__"

DATA_FILE_SEQ_RE = re.compile(r"^(\d{20})\.(?:parquet|csv)$")
DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$")
DROP_TABLE_STMT_RE = re.compile(r"(?is)\bdrop\s+table\b(?P<body>[^;]+)")
DROP_TABLE_TRAILING_RE = re.compile(r"(?is)\s+(restrict|cascade)\s*$")
LOGGER = logging.getLogger("mariadb_fabric_mirror")
CONFIG_FILE = Path(__file__).with_name("config.yaml")
VALID_LOG_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
VALID_START_FROM_VALUES = {"earliest", "latest"}


class ConfigValidationError(ValueError):
    pass


def setup_logging(config: Dict[str, Any]) -> None:
    level_name = str(config.get("logLevel", "INFO")).strip().upper() or "INFO"
    level = getattr(logging, level_name, logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    if level_name not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        LOGGER.warning("Invalid config logLevel '%s'. Falling back to INFO.", level_name)


def as_int(raw: Any, default: int) -> int:
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def as_bool(raw: Any, default: bool) -> bool:
    if raw is None or raw == "":
        return default
    if isinstance(raw, bool):
        return raw
    return str(raw).strip().lower() in {"1", "true", "yes", "y", "on"}


def load_config(config_file: Path) -> Dict[str, Any]:
    if not config_file.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_file}")

    with config_file.open("r", encoding="utf-8") as handle:
        loaded = yaml.safe_load(handle) or {}

    if not isinstance(loaded, dict):
        raise ValueError(f"Configuration file must contain a YAML object: {config_file}")

    return loaded


def require_mapping(raw: Any, path: str) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise ConfigValidationError(f"{path} must be a YAML object")
    return raw


def require_non_empty_string(raw: Any, path: str) -> str:
    value = str(raw).strip() if raw is not None else ""
    if not value:
        raise ConfigValidationError(f"{path} must be a non-empty string")
    return value


def require_int(raw: Any, path: str, minimum: Optional[int] = None) -> int:
    if raw is None or raw == "":
        raise ConfigValidationError(f"{path} must be set")
    try:
        value = int(raw)
    except (TypeError, ValueError) as ex:
        raise ConfigValidationError(f"{path} must be an integer") from ex
    if minimum is not None and value < minimum:
        raise ConfigValidationError(f"{path} must be >= {minimum}")
    return value


def require_bool(raw: Any, path: str) -> bool:
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str):
        value = raw.strip().lower()
        if value in {"1", "true", "yes", "y", "on"}:
            return True
        if value in {"0", "false", "no", "n", "off"}:
            return False
    raise ConfigValidationError(f"{path} must be a boolean")


def validate_table_identifier(table_id: str, path: str) -> str:
    parts = table_id.split(".", 1)
    if len(parts) != 2 or not parts[0].strip() or not parts[1].strip():
        raise ConfigValidationError(f"{path} must be in schema.table format")
    return f"{parts[0].strip()}.{parts[1].strip()}"


def validate_config(config: Dict[str, Any], config_file: Path) -> None:
    kafka_config = require_mapping(config.get("kafka"), "kafka")
    consumer_config = require_mapping(config.get("consumer"), "consumer")
    snapshot_config = require_mapping(config.get("snapshot"), "snapshot")
    onelake_config = require_mapping(config.get("onelake"), "onelake")
    partner_config = require_mapping(config.get("partner"), "partner")
    tables_config = require_mapping(config.get("tables"), "tables")

    log_level = require_non_empty_string(config.get("logLevel"), "logLevel").upper()
    if log_level not in VALID_LOG_LEVELS:
        raise ConfigValidationError(
            f"logLevel must be one of: {', '.join(sorted(VALID_LOG_LEVELS))}"
        )

    require_non_empty_string(kafka_config.get("bootstrapServers"), "kafka.bootstrapServers")
    require_non_empty_string(kafka_config.get("topic"), "kafka.topic")
    require_int(kafka_config.get("partition"), "kafka.partition", minimum=0)
    start_from = require_non_empty_string(kafka_config.get("startFrom"), "kafka.startFrom").lower()
    if start_from not in VALID_START_FROM_VALUES:
        raise ConfigValidationError(
            f"kafka.startFrom must be one of: {', '.join(sorted(VALID_START_FROM_VALUES))}"
        )
    require_int(kafka_config.get("pollTimeoutMs"), "kafka.pollTimeoutMs", minimum=1)

    require_int(consumer_config.get("checkIntervalSeconds"), "consumer.checkIntervalSeconds", minimum=1)
    require_int(consumer_config.get("maxRowsPerUpload"), "consumer.maxRowsPerUpload", minimum=1)
    require_bool(consumer_config.get("bootstrapOnceFromBeginning"), "consumer.bootstrapOnceFromBeginning")
    require_bool(consumer_config.get("snapshotTablesOnStart"), "consumer.snapshotTablesOnStart")
    require_bool(consumer_config.get("resetBootstrapState"), "consumer.resetBootstrapState")
    local_only = require_bool(consumer_config.get("localOnly"), "consumer.localOnly")

    require_non_empty_string(snapshot_config.get("host"), "snapshot.host")
    require_int(snapshot_config.get("port"), "snapshot.port", minimum=1)
    require_non_empty_string(snapshot_config.get("user"), "snapshot.user")
    require_non_empty_string(snapshot_config.get("password"), "snapshot.password")
    require_non_empty_string(snapshot_config.get("database"), "snapshot.database")

    require_non_empty_string(onelake_config.get("landingZoneRoot"), "onelake.landingZoneRoot")
    landing_zone_url = str(onelake_config.get("landingZoneUrl") or "").strip()
    if not local_only or landing_zone_url:
        require_non_empty_string(onelake_config.get("landingZoneUrl"), "onelake.landingZoneUrl")
        require_non_empty_string(onelake_config.get("tenantId"), "onelake.tenantId")
        require_non_empty_string(onelake_config.get("clientId"), "onelake.clientId")
        require_non_empty_string(onelake_config.get("clientSecret"), "onelake.clientSecret")

    require_non_empty_string(partner_config.get("name"), "partner.name")
    require_non_empty_string(partner_config.get("sourceType"), "partner.sourceType")
    require_non_empty_string(partner_config.get("sourceVersion"), "partner.sourceVersion")

    include_config = tables_config.get("include")
    if not isinstance(include_config, (list, str)):
        raise ConfigValidationError("tables.include must be a YAML list or comma-separated string")
    include_tables = parse_table_include_list(include_config)
    if not include_tables:
        raise ConfigValidationError("tables.include must contain at least one schema.table entry")
    for table_id in sorted(include_tables):
        validate_table_identifier(table_id, f"tables.include ({table_id})")

    key_columns = require_mapping(tables_config.get("keyColumns"), "tables.keyColumns")
    if not key_columns:
        raise ConfigValidationError("tables.keyColumns must contain at least one table entry")
    for table_id, columns in key_columns.items():
        normalized_table_id = validate_table_identifier(str(table_id), f"tables.keyColumns.{table_id}")
        if not isinstance(columns, list) or not columns:
            raise ConfigValidationError(f"tables.keyColumns.{normalized_table_id} must be a non-empty list")
        for index, column in enumerate(columns):
            require_non_empty_string(column, f"tables.keyColumns.{normalized_table_id}[{index}]")

    unknown_sections = set(config.keys()) - {
        "logLevel",
        "kafka",
        "consumer",
        "snapshot",
        "onelake",
        "partner",
        "tables",
    }
    if unknown_sections:
        LOGGER.warning(
            "Ignoring unknown config sections in %s: %s",
            config_file,
            ", ".join(sorted(str(section) for section in unknown_sections)),
        )


def load_key_columns(default_table_keys: Dict[str, List[str]], config: Dict[str, Any]) -> Dict[str, List[str]]:
    raw = config.get("tables", {}).get("keyColumns", {})
    if not raw:
        return default_table_keys
    try:
        result: Dict[str, List[str]] = {}
        for table_id, keys in raw.items():
            if isinstance(keys, list) and keys:
                result[str(table_id)] = [str(k) for k in keys]
        return result or default_table_keys
    except AttributeError:
        return default_table_keys


def parse_table_include_list(raw: Any) -> Set[str]:
    if raw is None or raw == "":
        return set()

    values: Set[str] = set()
    if isinstance(raw, list):
        for token in raw:
            table_id = str(token).strip()
            if table_id:
                values.add(table_id)
        return values

    for token in str(raw).split(","):
        table_id = token.strip()
        if table_id:
            values.add(table_id)
    return values


def get_pending_table_snapshots(included_tables: Set[str], state: Dict) -> Set[str]:
    if not included_tables:
        return set()

    table_snapshots_completed = state.get("table_snapshots_completed", {})
    return {
        table_id
        for table_id in included_tables
        if not table_snapshots_completed.get(table_id, False)
    }


def load_state(state_file: Path) -> Dict:
    if not state_file.exists():
        return {
            "next_offsets": {},
            "file_counters": {},
            "table_columns": {},
            "table_column_types": {},
            "bootstrap_completed": {},
            "bootstrap_target_offsets": {},
            "snapshot_completed": {},
            "snapshot_start_offsets": {},
            "snapshot_gtid_positions": {},
            "table_snapshots_completed": {},
        }
    try:
        state = json.loads(state_file.read_text(encoding="utf-8"))
        state.setdefault("next_offsets", {})
        state.setdefault("file_counters", {})
        state.setdefault("table_columns", {})
        state.setdefault("table_column_types", {})
        state.setdefault("bootstrap_completed", {})
        state.setdefault("bootstrap_target_offsets", {})
        state.setdefault("snapshot_completed", {})
        state.setdefault("snapshot_start_offsets", {})
        state.setdefault("snapshot_gtid_positions", {})
        state.setdefault("table_snapshots_completed", {})
        return state
    except json.JSONDecodeError:
        return {
            "next_offsets": {},
            "file_counters": {},
            "table_columns": {},
            "table_column_types": {},
            "bootstrap_completed": {},
            "bootstrap_target_offsets": {},
            "snapshot_completed": {},
            "snapshot_start_offsets": {},
            "snapshot_gtid_positions": {},
            "table_snapshots_completed": {},
        }


def should_process_table(table_id: str, included_tables: Set[str]) -> bool:
    return not included_tables or table_id in included_tables


def quote_mysql_identifier(identifier: str) -> str:
    return f"`{identifier.replace('`', '``')}`"


def parse_mysql_column_type(raw_type: str) -> str:
    value = raw_type.lower()
    if any(token in value for token in ["bigint", "int", "smallint", "tinyint", "mediumint"]):
        return "int64"
    if any(token in value for token in ["decimal", "numeric", "float", "double", "real"]):
        return "float64"
    if value.startswith("bool") or value.startswith("boolean"):
        return "bool"
    if any(token in value for token in ["date", "time", "year"]):
        return "datetime"
    return "string"


def fetch_snapshot_table_list(connection, source_database: str, included_tables: Set[str]) -> List[Tuple[str, str]]:
    if included_tables:
        tables: List[Tuple[str, str]] = []
        for table_id in sorted(included_tables):
            parts = table_id.split(".", 1)
            if len(parts) != 2:
                raise ValueError(f"TABLE_INCLUDE_LIST entry '{table_id}' must be in schema.table format")
            tables.append((parts[0], parts[1]))
        return tables

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT TABLE_SCHEMA, TABLE_NAME
            FROM information_schema.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = %s
            ORDER BY TABLE_NAME
            """,
            (source_database,),
        )
        return [(row["TABLE_SCHEMA"], row["TABLE_NAME"]) for row in cursor.fetchall()]


def create_snapshot_rows(connection, schema_name: str, table_name: str) -> Tuple[List[Dict], Dict[str, str]]:
    quoted_table = f"{quote_mysql_identifier(schema_name)}.{quote_mysql_identifier(table_name)}"
    with connection.cursor() as cursor:
        cursor.execute(f"DESCRIBE {quoted_table}")
        describe_rows = cursor.fetchall()
        column_types = {
            row["Field"]: parse_mysql_column_type(str(row["Type"]))
            for row in describe_rows
        }
        cursor.execute(f"SELECT * FROM {quoted_table}")
        result_rows = cursor.fetchall()

    snapshot_rows: List[Dict] = []
    for row in result_rows:
        snapshot_row = dict(row)
        # Do not add __rowMarker__ to snapshots; only add during incremental writes
        snapshot_rows.append(snapshot_row)

    return snapshot_rows, column_types


def snapshot_source_tables(
    root: Path,
    source_host: str,
    source_port: int,
    source_user: str,
    source_password: str,
    source_database: str,
    included_tables: Set[str],
    state: Dict,
    key_columns_map: Dict[str, List[str]],
    remote_service: Optional[RemoteMirrorClient],
    remote_file_system: str,
    remote_base_path: str,
) -> List[str]:
    connection = pymysql.connect(
        host=source_host,
        port=source_port,
        user=source_user,
        password=source_password,
        database=source_database,
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )

    try:
        processed_tables: List[str] = []
        table_specs = fetch_snapshot_table_list(connection, source_database, included_tables)
        
        # Start a consistent snapshot transaction to capture GTID at a fixed point
        with connection.cursor() as cursor:
            cursor.execute("START TRANSACTION WITH CONSISTENT SNAPSHOT")
        
        # Capture GTID position at the time of consistent snapshot
        snapshot_gtid = get_gtid_position(connection)
        if snapshot_gtid:
            LOGGER.info("Starting snapshot with GTID position: %s", snapshot_gtid)
        else:
            LOGGER.warning("Could not capture GTID position for snapshot")
        
        # Read all tables within the same consistent snapshot transaction
        for schema_name, table_name in table_specs:
            table_id = f"{schema_name}.{table_name}"
            if not should_process_table(table_id, included_tables):
                continue

            snapshot_rows, column_types = create_snapshot_rows(connection, schema_name, table_name)
            table_path, _ = resolve_table_path(root, schema_name, table_name)

            # Store GTID position for this table's snapshot
            if snapshot_gtid:
                state["snapshot_gtid_positions"][table_id] = snapshot_gtid

            if column_types:
                state["table_columns"][table_id] = list(column_types.keys())
                state["table_column_types"][table_id] = column_types

            if snapshot_rows:
                flush_table_rows(
                    root,
                    table_id,
                    table_path,
                    snapshot_rows,
                    state,
                    key_columns_map,
                    remote_service,
                    remote_file_system,
                    remote_base_path,
                    is_snapshot=True,
                )
            else:
                write_empty_snapshot_file(
                    root,
                    table_id,
                    table_path,
                    state,
                    key_columns_map,
                    remote_service,
                    remote_file_system,
                    remote_base_path,
                    is_snapshot=True,
                )

            state["table_snapshots_completed"][table_id] = True
            processed_tables.append(table_id)
        
        # Commit the consistent snapshot transaction
        connection.commit()
        return processed_tables
    except Exception as e:
        connection.rollback()
        LOGGER.error("Error during snapshot: %s", e)
        raise
    finally:
        connection.close()


def save_state(state_file: Path, state: Dict) -> None:
    state_file.parent.mkdir(parents=True, exist_ok=True)
    temp_file = state_file.with_suffix(".tmp")
    temp_file.write_text(json.dumps(state, indent=2), encoding="utf-8")
    temp_file.replace(state_file)


def ensure_partner_events(root: Path, partner_name: str, source_type: str, source_version: str) -> None:
    partner_path = root / "_partnerEvents.json"
    if partner_path.exists():
        return
    payload = {
        "partnerName": partner_name,
        "sourceInfo": {
            "sourceType": source_type,
            "sourceVersion": source_version,
        },
    }
    partner_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def build_remote_uploader(config: Dict[str, Any]) -> Tuple[Optional[RemoteMirrorClient], str, str]:
    onelake_config = config.get("onelake", {})
    landing_zone_url = str(onelake_config.get("landingZoneUrl", "")).strip()
    tenant_id = str(onelake_config.get("tenantId", "")).strip()
    client_id = str(onelake_config.get("clientId", "")).strip()
    client_secret = str(onelake_config.get("clientSecret", "")).strip()

    if not landing_zone_url:
        return None, "", ""

    if not tenant_id or not client_id or not client_secret:
        raise ValueError(
            "landingZoneUrl is set but tenantId/clientId/clientSecret are missing in config.yaml"
        )

    client = OpenMirroringClient(
        client_id=client_id,
        client_secret=client_secret,
        client_tenant=tenant_id,
        host=landing_zone_url,
    )
    return client, "LandingZone", ""


def validate_remote_landing_zone(
    service: RemoteMirrorClient,
    file_system: str,
    base_path: str,
) -> bool:
    try:
        return service.landing_zone_exists()
    except Exception as ex:
        LOGGER.warning(
            "Remote upload disabled: landing zone path not reachable. Error: %s: %s",
            type(ex).__name__,
            ex,
        )
        return False


def remote_join(base_path: str, relative_path: str) -> str:
    clean_rel = relative_path.strip("/")
    clean_base = base_path.strip("/")
    if not clean_base:
        return clean_rel
    if not clean_rel:
        return clean_base
    return f"{clean_base}/{clean_rel}"


def upload_remote_if_missing(
    service: RemoteMirrorClient,
    file_system: str,
    remote_path: str,
    payload: bytes,
) -> None:
    service.upload_bytes(remote_path, payload, overwrite=False)


def upload_remote_atomic(
    service: RemoteMirrorClient,
    file_system: str,
    remote_path: str,
    payload: bytes,
) -> None:
    service.upload_bytes(remote_path, payload, overwrite=True)


def remote_file_exists(
    service: RemoteMirrorClient,
    file_system: str,
    remote_path: str,
) -> bool:
    return service.file_exists(remote_path)


def ensure_table_metadata(table_path: Path, key_columns: List[str], column_types: Dict[str, str], is_snapshot: bool = False) -> None:
    metadata_path = table_path / "_metadata.json"
    payload = {
        "keyColumns": key_columns,
        "isUpsertDefaultRowMarker": False,
    }
    metadata_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def resolve_table_path(root: Path, schema_name: str, table_name: str) -> Tuple[Path, str]:
    schema_folder = f"{schema_name}.schema"
    table_id = f"{schema_name}.{table_name}"
    return root / schema_folder / table_name, table_id


def normalize_identifier(raw: str) -> str:
    value = raw.strip()
    if len(value) >= 2 and ((value[0] == "`" and value[-1] == "`") or (value[0] == '"' and value[-1] == '"')):
        return value[1:-1]
    if len(value) >= 2 and value[0] == "[" and value[-1] == "]":
        return value[1:-1]
    return value


def parse_drop_targets(sql: str, default_schema: str) -> List[Tuple[str, str]]:
    targets: List[Tuple[str, str]] = []

    for match in DROP_TABLE_STMT_RE.finditer(sql):
        body = match.group("body").strip()
        body = re.sub(r"(?is)^if\s+exists\s+", "", body)
        body = DROP_TABLE_TRAILING_RE.sub("", body).strip()

        for raw_target in body.split(","):
            token = raw_target.strip()
            if not token:
                continue

            token = token.split()[0]
            parts = [normalize_identifier(p) for p in token.split(".") if p.strip()]
            if not parts:
                continue

            if len(parts) >= 2:
                schema_name = parts[-2]
                table_name = parts[-1]
            else:
                schema_name = default_schema
                table_name = parts[-1]

            if schema_name and table_name:
                targets.append((schema_name, table_name))

    return targets


def should_process_event_after_gtid_snapshot(
    table_id: str,
    payload: Dict,
    state: Dict,
) -> bool:
    """
    Determine if a Kafka event should be processed based on GTID comparison.
    
    When a snapshot is taken with SNAPSHOT_TABLES_ON_START=true, a GTID position
    is captured. This function filters out any events that occurred BEFORE the
    snapshot GTID, ensuring no duplicate processing.
    
    Args:
        table_id: Schema.table identifier
        payload: Kafka event payload from CDC
        state: Consumer state with snapshot GTID positions
        
    Returns:
        True if the event should be processed (occurred after snapshot GTID),
        False if the event occurred before the snapshot and should be skipped
    """
    # If we didn't capture a snapshot GTID for this table, process all events
    snapshot_gtid = state.get("snapshot_gtid_positions", {}).get(table_id)
    if not snapshot_gtid:
        return True
    
    # Get the GTID from the Kafka event
    event_gtid = payload.get("gtid") or payload.get("binlog_position")
    if not event_gtid:
        # If event doesn't have GTID, process it (assume it's after snapshot)
        LOGGER.debug(
            "Event for %s has no GTID; processing anyway. Event: %s",
            table_id,
            payload.get("event_type"),
        )
        return True
    
    # Compare GTIDs: process if event GTID > snapshot GTID
    cmp_result = gtid_compare(event_gtid, snapshot_gtid)
    
    if cmp_result <= 0:
        LOGGER.debug(
            "Skipping event for %s (GTID %s <= snapshot GTID %s, event_type=%s)",
            table_id,
            event_gtid,
            snapshot_gtid,
            payload.get("event_type"),
        )
        return False
    
    return True


def snapshot_single_table_on_demand(
    root: Path,
    table_id: str,
    schema_name: str,
    table_name: str,
    source_host: str,
    source_port: int,
    source_user: str,
    source_password: str,
    source_database: str,
    state: Dict,
    key_columns_map: Dict[str, List[str]],
    remote_service: Optional[RemoteMirrorClient],
    remote_file_system: str,
    remote_base_path: str,
) -> bool:
    """
    Take an on-demand GTID-aware snapshot for a single table.
    
    This is called when the consumer encounters a table for the first time.
    Captures the current GTID position along with the snapshot data.
    
    Args:
        root: Landing zone root path
        table_id: Schema.table identifier
        schema_name: Database schema name
        table_name: Table name
        source_host: MariaDB host
        source_port: MariaDB port
        source_user: MariaDB user
        source_password: MariaDB password
        source_database: Database name
        state: Consumer state dictionary
        key_columns_map: Key columns mapping
        remote_service: Remote upload service (or None)
        remote_file_system: Remote filesystem
        remote_base_path: Remote base path
        
    Returns:
        True if snapshot succeeded, False otherwise
    """
    connection = None
    try:
        connection = pymysql.connect(
            host=source_host,
            port=source_port,
            user=source_user,
            password=source_password,
            database=source_database,
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=False,
        )
        
        # Start consistent snapshot transaction
        with connection.cursor() as cursor:
            cursor.execute("START TRANSACTION WITH CONSISTENT SNAPSHOT")
        
        # Get GTID at snapshot time
        snapshot_gtid = get_gtid_position(connection)
        if snapshot_gtid:
            LOGGER.info("Taking on-demand snapshot for %s with GTID: %s", table_id, snapshot_gtid)
        else:
            LOGGER.warning("Could not capture GTID for on-demand snapshot of %s", table_id)
        
        # Read table data within consistent snapshot
        snapshot_rows, column_types = create_snapshot_rows(connection, schema_name, table_name)
        
        # Commit transaction
        connection.commit()
        
        # Resolve table path
        table_path, _ = resolve_table_path(root, schema_name, table_name)
        
        # Store column metadata
        if column_types:
            state["table_columns"][table_id] = list(column_types.keys())
            state["table_column_types"][table_id] = column_types
        
        # Store GTID position for this table
        if snapshot_gtid:
            state["snapshot_gtid_positions"][table_id] = snapshot_gtid
        
        # Write snapshot data to files
        if snapshot_rows:
            flush_table_rows(
                root,
                table_id,
                table_path,
                snapshot_rows,
                state,
                key_columns_map,
                remote_service,
                remote_file_system,
                remote_base_path,
                is_snapshot=True,
            )
            LOGGER.info(
                "Snapshot for %s completed: %d rows written, GTID=%s",
                table_id,
                len(snapshot_rows),
                snapshot_gtid,
            )
        else:
            # Empty table case
            write_empty_snapshot_file(
                root,
                table_id,
                table_path,
                state,
                key_columns_map,
                remote_service,
                remote_file_system,
                remote_base_path,
                is_snapshot=True,
            )
            LOGGER.info("Snapshot for %s completed: empty table, GTID=%s", table_id, snapshot_gtid)
        
        # Mark this table as snapshotted
        state["table_snapshots_completed"][table_id] = True
        return True
        
    except Exception as e:
        if connection:
            try:
                connection.rollback()
            except Exception:
                pass
        LOGGER.error("Failed to take on-demand snapshot for %s: %s", table_id, e)
        return False
        
    finally:
        if connection:
            try:
                connection.close()
            except Exception:
                pass


def detect_drop_tables(payload: Dict) -> List[Tuple[str, str]]:
    schema_hint = str(payload.get("table_schema") or payload.get("database") or "dbo")
    table_hint = str(payload.get("table_name") or payload.get("table") or "").strip()
    event_type = str(payload.get("event_type", "")).lower().strip()

    if event_type in {"drop_table", "drop"} and table_hint:
        return [(schema_hint, table_hint)]

    sql_candidates = [
        payload.get("query"),
        payload.get("sql"),
        payload.get("statement"),
        payload.get("ddl"),
        payload.get("sql_text"),
    ]

    for candidate in sql_candidates:
        if not isinstance(candidate, str) or not candidate.strip():
            continue

        if "drop" not in candidate.lower() or "table" not in candidate.lower():
            continue

        targets = parse_drop_targets(candidate, schema_hint)
        if targets:
            return targets

    return []


def delete_remote_directory_if_exists(
    service: RemoteMirrorClient,
    file_system: str,
    remote_path: str,
) -> bool:
    return service.delete_directory_if_exists(remote_path)


def purge_table_outputs(
    root: Path,
    schema_name: str,
    table_name: str,
    state: Dict,
    remote_service: Optional[RemoteMirrorClient],
    remote_file_system: str,
    remote_base_path: str,
) -> None:
    table_path, table_id = resolve_table_path(root, schema_name, table_name)

    if table_path.exists():
        shutil.rmtree(table_path, ignore_errors=True)
        LOGGER.warning("Dropped table detected. Removed local table folder %s", table_path)
    else:
        LOGGER.info("Dropped table detected. Local table folder already absent: %s", table_path)

    if remote_service is not None:
        remote_table_path = remote_join(remote_base_path, f"{schema_name}.schema/{table_name}")
        try:
            deleted = delete_remote_directory_if_exists(remote_service, remote_file_system, remote_table_path)
            if deleted:
                LOGGER.warning("Dropped table detected. Removed remote table folder %s", remote_table_path)
            else:
                LOGGER.info("Dropped table detected. Remote table folder already absent: %s", remote_table_path)
        except Exception as ex:
            LOGGER.error(
                "Failed to remove remote table folder %s due to %s: %s",
                remote_table_path,
                type(ex).__name__,
                ex,
            )

    state["file_counters"].pop(table_id, None)
    state["table_columns"].pop(table_id, None)
    state["table_column_types"].pop(table_id, None)


def next_file_number(table_path: Path, state_counter: int) -> int:
    existing_numbers: List[int] = []
    if table_path.exists():
        for item in table_path.iterdir():
            if not item.is_file():
                continue
            match = DATA_FILE_SEQ_RE.match(item.name)
            if match:
                existing_numbers.append(int(match.group(1)))

    if not existing_numbers:
        return 1

    max_existing = max(existing_numbers)
    expected_from_state = state_counter + 1
    if expected_from_state == max_existing + 1:
        return expected_from_state

    if expected_from_state > max_existing + 1:
        print(
            f"State counter gap detected for {table_path}. "
            f"state={state_counter}, max_existing={max_existing}. Resyncing to {max_existing + 1}."
        )

    return max_existing + 1


def normalize_row(
    event: Dict,
    key_columns: List[str],
) -> Tuple[str, Dict]:
    event_type = str(event.get("event_type", "")).lower()

    if event_type == "update_before":
        return "skip", {}

    if event_type not in ROW_MARKER_MAP:
        return "skip", {}

    marker = ROW_MARKER_MAP[event_type]
    row = {k: v for k, v in event.items() if k not in META_FIELDS}

    if marker == 2 and key_columns:
        delete_row: Dict = {}
        for key in key_columns:
            if key in row:
                delete_row[key] = row[key]
        row = delete_row or row

    row[ROW_MARKER_FIELD] = marker
    return "ok", row


def infer_type_name(value) -> str:
    if value is None:
        return "string"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int64"
    if isinstance(value, float):
        return "float64"
    if isinstance(value, str) and DATETIME_RE.match(value.strip()):
        return "datetime"
    return "string"


def coerce_value(value, type_name: str):
    if value is None:
        return None
    if type_name == "bool":
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "y", "on"}
        return bool(value)
    if type_name == "int64":
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
    if type_name == "float64":
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
    if type_name == "datetime":
        return str(value)
    return str(value)


def fabric_data_type(type_name: str) -> str:
    if type_name == "int64":
        return "Int64"
    if type_name == "float64":
        return "Double"
    if type_name == "bool":
        return "Boolean"
    if type_name == "datetime":
        return "DateTime"
    return "String"


def pyarrow_type(type_name: str) -> pa.DataType:
    if type_name == "bool":
        return pa.bool_()
    if type_name == "int64":
        return pa.int64()
    if type_name == "float64":
        return pa.float64()
    return pa.string()


def flush_table_rows(
    root: Path,
    table_id: str,
    table_path: Path,
    rows: List[Dict],
    state: Dict,
    key_columns_map: Dict[str, List[str]],
    remote_service: Optional[RemoteMirrorClient],
    remote_file_system: str,
    remote_base_path: str,
    is_snapshot: bool = False,
    max_rows_per_upload: Optional[int] = None,
) -> int:
    if not rows:
        return 0

    rows_to_flush = rows if max_rows_per_upload is None else rows[:max_rows_per_upload]

    table_path.mkdir(parents=True, exist_ok=True)

    key_columns = key_columns_map.get(table_id, ["id"])
    
    # Need to build columns and column_types first before metadata
    columns = state["table_columns"].get(table_id, [])
    column_types = state["table_column_types"].get(table_id, {})

    for row in rows_to_flush:
        for col in row.keys():
            if col == ROW_MARKER_FIELD:
                continue
            if col not in columns:
                columns.append(col)
            if col not in column_types:
                column_types[col] = infer_type_name(row.get(col))
            elif row.get(col) is not None and column_types[col] == "string":
                # Keep existing string type to avoid schema churn when values vary by file.
                pass
            elif row.get(col) is not None and column_types[col] in {"int64", "float64", "bool"}:
                # Keep first concrete non-string type once chosen.
                pass

    state["table_columns"][table_id] = columns
    state["table_column_types"][table_id] = column_types

    # Ensure metadata is created/updated with current schema  
    ensure_table_metadata(table_path, key_columns, column_types, is_snapshot=is_snapshot)
    if remote_service is not None:
        metadata_payload = json.dumps({
            "keyColumns": key_columns,
            "isUpsertDefaultRowMarker": False,
        }, indent=2).encode("utf-8")
        remote_metadata = remote_join(remote_base_path, f"{table_path.relative_to(root).as_posix()}/_metadata.json")
        upload_remote_if_missing(remote_service, remote_file_system, remote_metadata, metadata_payload)
    
    normalized_rows: List[Dict] = []
    for row in rows_to_flush:
        out: Dict = {}
        for col in columns:
            out[col] = coerce_value(row.get(col), column_types.get(col, "string"))

        # For snapshots, no row marker needed. For incremental, marker is required.
        if is_snapshot:
            normalized_rows.append(out)
        else:
            marker_value = row.get(ROW_MARKER_FIELD)
            if marker_value is None:
                # Open Mirroring requires row marker for incremental files.
                continue
            marker_int = int(marker_value)
            out[ROW_MARKER_FIELD] = marker_int
            normalized_rows.append(out)

    if not normalized_rows:
        LOGGER.debug("Skipping flush for %s because no rows remained after normalization.", table_id)
        return len(rows_to_flush)

    state_counter = int(state["file_counters"].get(table_id, 0))
    next_file_num = next_file_number(table_path, state_counter)

    # Keep parquet sequence append-only across local and remote targets
    while True:
        file_name = f"{next_file_num:020d}.parquet"
        target_file = table_path / file_name
        if target_file.exists():
            LOGGER.warning(
                "Local parquet collision for %s at %s. Advancing sequence.",
                table_id,
                target_file,
            )
            next_file_num += 1
            continue

        if remote_service is not None:
            remote_parquet = remote_join(remote_base_path, f"{table_path.relative_to(root).as_posix()}/{file_name}")
            if remote_file_exists(remote_service, remote_file_system, remote_parquet):
                LOGGER.warning(
                    "Remote parquet collision for %s at %s. Advancing sequence.",
                    table_id,
                    remote_parquet,
                )
                next_file_num += 1
                continue

        break

    header = columns if is_snapshot else columns + [ROW_MARKER_FIELD]

    parquet_payload_rows: List[Dict] = []
    for row in normalized_rows:
        parquet_row = {col: row.get(col) for col in header}
        parquet_payload_rows.append(parquet_row)

    parquet_table = pa.Table.from_pylist(parquet_payload_rows)
    pq.write_table(parquet_table, target_file)

    parquet_bytes = target_file.read_bytes()
    if remote_service is not None:
        remote_parquet = remote_join(remote_base_path, f"{table_path.relative_to(root).as_posix()}/{file_name}")
        upload_remote_if_missing(remote_service, remote_file_system, remote_parquet, parquet_bytes)
    state["file_counters"][table_id] = next_file_num

    LOGGER.info("Flushed %d rows for %s to %s", len(normalized_rows), table_id, target_file)
    return len(rows_to_flush)


def write_empty_snapshot_file(
    root: Path,
    table_id: str,
    table_path: Path,
    state: Dict,
    key_columns_map: Dict[str, List[str]],
    remote_service: Optional[RemoteMirrorClient],
    remote_file_system: str,
    remote_base_path: str,
    is_snapshot: bool = False,
) -> None:
    table_path.mkdir(parents=True, exist_ok=True)

    key_columns = key_columns_map.get(table_id, ["id"])
    columns = state["table_columns"].get(table_id, [])
    column_types = state["table_column_types"].get(table_id, {})

    ensure_table_metadata(table_path, key_columns, column_types, is_snapshot=is_snapshot)
    if remote_service is not None:
        metadata_payload = json.dumps({
            "keyColumns": key_columns,
            "isUpsertDefaultRowMarker": False,
        }, indent=2).encode("utf-8")
        remote_metadata = remote_join(remote_base_path, f"{table_path.relative_to(root).as_posix()}/_metadata.json")
        upload_remote_if_missing(remote_service, remote_file_system, remote_metadata, metadata_payload)

    state_counter = int(state["file_counters"].get(table_id, 0))
    next_file_num = next_file_number(table_path, state_counter)

    while True:
        file_name = f"{next_file_num:020d}.parquet"
        target_file = table_path / file_name
        if target_file.exists():
            next_file_num += 1
            continue

        if remote_service is not None:
            remote_parquet = remote_join(remote_base_path, f"{table_path.relative_to(root).as_posix()}/{file_name}")
            if remote_file_exists(remote_service, remote_file_system, remote_parquet):
                next_file_num += 1
                continue

        break

    header = columns if is_snapshot else columns + [ROW_MARKER_FIELD]
    empty_payload = {col: [] for col in header}
    empty_table = pa.Table.from_pydict(empty_payload)
    pq.write_table(empty_table, target_file)

    parquet_bytes = target_file.read_bytes()
    if remote_service is not None:
        remote_parquet = remote_join(remote_base_path, f"{table_path.relative_to(root).as_posix()}/{file_name}")
        upload_remote_if_missing(remote_service, remote_file_system, remote_parquet, parquet_bytes)
    state["file_counters"][table_id] = next_file_num

    LOGGER.info("Created empty snapshot file for %s at %s", table_id, target_file)


def bootstrap_reached_target(state: Dict, offset_key: str) -> bool:
    target_offset = state.get("bootstrap_target_offsets", {}).get(offset_key)
    if target_offset is None:
        return False

    next_offset = int(state.get("next_offsets", {}).get(offset_key, 0))
    return next_offset >= int(target_offset)

def main() -> int:
    try:
        config = load_config(CONFIG_FILE)
        validate_config(config, CONFIG_FILE)
    except (FileNotFoundError, ConfigValidationError, ValueError) as ex:
        logging.basicConfig(
            level=logging.ERROR,
            format="%(asctime)s %(levelname)s %(name)s %(message)s",
        )
        LOGGER.error("Configuration error in %s: %s", CONFIG_FILE, ex)
        return 2

    setup_logging(config)

    kafka_config = config.get("kafka", {})
    consumer_config = config.get("consumer", {})
    snapshot_config = config.get("snapshot", {})
    partner_config = config.get("partner", {})
    onelake_config = config.get("onelake", {})

    bootstrap_servers = require_non_empty_string(kafka_config.get("bootstrapServers"), "kafka.bootstrapServers")
    topic = require_non_empty_string(kafka_config.get("topic"), "kafka.topic")
    partition = require_int(kafka_config.get("partition"), "kafka.partition", minimum=0)
    landing_zone_root = Path(require_non_empty_string(onelake_config.get("landingZoneRoot"), "onelake.landingZoneRoot"))
    start_from = require_non_empty_string(kafka_config.get("startFrom"), "kafka.startFrom").lower()
    poll_timeout_ms = require_int(kafka_config.get("pollTimeoutMs"), "kafka.pollTimeoutMs", minimum=1)
    check_interval_seconds = require_int(consumer_config.get("checkIntervalSeconds"), "consumer.checkIntervalSeconds", minimum=1)
    max_rows_per_upload = require_int(consumer_config.get("maxRowsPerUpload"), "consumer.maxRowsPerUpload", minimum=1)
    bootstrap_once_from_beginning = require_bool(consumer_config.get("bootstrapOnceFromBeginning"), "consumer.bootstrapOnceFromBeginning")
    snapshot_tables_on_start = require_bool(consumer_config.get("snapshotTablesOnStart"), "consumer.snapshotTablesOnStart")
    reset_bootstrap = require_bool(consumer_config.get("resetBootstrapState"), "consumer.resetBootstrapState")
    local_only = require_bool(consumer_config.get("localOnly"), "consumer.localOnly")
    included_tables = parse_table_include_list(config.get("tables", {}).get("include", []))

    snapshot_source_host = require_non_empty_string(snapshot_config.get("host"), "snapshot.host")
    snapshot_source_port = require_int(snapshot_config.get("port"), "snapshot.port", minimum=1)
    snapshot_source_user = require_non_empty_string(snapshot_config.get("user"), "snapshot.user")
    snapshot_source_password = require_non_empty_string(snapshot_config.get("password"), "snapshot.password")
    snapshot_source_database = require_non_empty_string(snapshot_config.get("database"), "snapshot.database")

    partner_name = require_non_empty_string(partner_config.get("name"), "partner.name")
    source_type = require_non_empty_string(partner_config.get("sourceType"), "partner.sourceType")
    source_version = require_non_empty_string(partner_config.get("sourceVersion"), "partner.sourceVersion")

    LOGGER.info(
        "Starting consumer with topic=%s partition=%d bootstrap_servers=%s landing_zone_root=%s start_from=%s poll_timeout_ms=%d check_interval_seconds=%d max_rows_per_upload=%d",
        topic,
        partition,
        bootstrap_servers,
        landing_zone_root,
        start_from,
        poll_timeout_ms,
        check_interval_seconds,
        max_rows_per_upload,
    )
    if included_tables:
        LOGGER.info("Filtering consumer tables to: %s", ", ".join(sorted(included_tables)))

    remote_service, remote_file_system, remote_base_path = build_remote_uploader(config)
    if local_only:
        remote_service = None
        LOGGER.info("LOCAL_ONLY=true: remote upload to OneLake is disabled. Files will only be written locally.")
    elif remote_service is None:
        LOGGER.info("Remote upload disabled (LANDING_ZONE_URL not set).")
    else:
        LOGGER.info("Remote upload configured for filesystem=%s base_path=%s", remote_file_system, remote_base_path)

    default_table_keys = {
        "sampledb.customers": ["id"],
        "sampledb.orders": ["id"],
    }
    key_columns_map = load_key_columns(default_table_keys, config)

    landing_zone_root.mkdir(parents=True, exist_ok=True)
    ensure_partner_events(landing_zone_root, partner_name, source_type, source_version)
    if remote_service is not None:
        if not validate_remote_landing_zone(remote_service, remote_file_system, remote_base_path):
            remote_service = None
            LOGGER.warning("Remote upload turned off after landing zone validation failure.")

    if remote_service is not None:
        partner_payload = json.dumps(
            {
                "partnerName": partner_name,
                "sourceInfo": {
                    "sourceType": source_type,
                    "sourceVersion": source_version,
                },
            },
            indent=2,
        ).encode("utf-8")
        remote_partner = remote_join(remote_base_path, "_partnerEvents.json")
        try:
            upload_remote_if_missing(remote_service, remote_file_system, remote_partner, partner_payload)
        except Exception as ex:
            LOGGER.warning(
                "Remote upload disabled due to landing zone error: %s: %s",
                type(ex).__name__,
                ex,
            )
            remote_service = None

    state_file = landing_zone_root / ".state" / "state.json"
    state = load_state(state_file)

    consumer = KafkaConsumer(
        bootstrap_servers=bootstrap_servers,
        enable_auto_commit=False,
        consumer_timeout_ms=poll_timeout_ms,
        value_deserializer=lambda m: json.loads(m.decode("utf-8")),
    )

    tp = TopicPartition(topic, partition)
    consumer.assign([tp])

    offset_key = f"{topic}:{partition}"
    if reset_bootstrap:
        state["next_offsets"].pop(offset_key, None)
        state["bootstrap_completed"].pop(offset_key, None)
        state["bootstrap_target_offsets"].pop(offset_key, None)
        state["snapshot_completed"].pop(offset_key, None)
        state["snapshot_start_offsets"].pop(offset_key, None)
        LOGGER.info("Reset bootstrap state for %s", offset_key)

    pending_table_snapshots = get_pending_table_snapshots(included_tables, state)
    needs_snapshot = snapshot_tables_on_start and (
        not state["snapshot_completed"].get(offset_key, False)
        or bool(pending_table_snapshots)
    )
    needs_bootstrap = bootstrap_once_from_beginning and not state["bootstrap_completed"].get(offset_key, False)
    bootstrap_target_offset = None

    if needs_snapshot:
        snapshot_start_offset = consumer.end_offsets([tp])[tp]
        state["snapshot_start_offsets"][offset_key] = snapshot_start_offset
        LOGGER.info(
            "Snapshot bootstrap enabled for %s: creating initial files before resuming from offset %d.",
            offset_key,
            snapshot_start_offset,
        )

        snapshot_include_tables = pending_table_snapshots or included_tables
        if pending_table_snapshots:
            LOGGER.info(
                "Snapshot policy: only processing tables not yet snapshotted: %s",
                ", ".join(sorted(pending_table_snapshots)),
            )

        processed_tables = snapshot_source_tables(
            landing_zone_root,
            snapshot_source_host,
            snapshot_source_port,
            snapshot_source_user,
            snapshot_source_password,
            snapshot_source_database,
            snapshot_include_tables,
            state,
            key_columns_map,
            remote_service,
            remote_file_system,
            remote_base_path,
        )
        state["next_offsets"][offset_key] = snapshot_start_offset
        state["snapshot_completed"][offset_key] = True
        state["bootstrap_completed"][offset_key] = True
        save_state(state_file, state)
        consumer.seek(tp, snapshot_start_offset)
        LOGGER.info(
            "Snapshot bootstrap completed for %s. Tables=%s. Resuming incremental consumption from offset %d.",
            offset_key,
            ", ".join(processed_tables) if processed_tables else "none",
            snapshot_start_offset,
        )
        needs_bootstrap = False
    elif needs_bootstrap:
        bootstrap_target_offset = consumer.end_offsets([tp])[tp]
        state["bootstrap_target_offsets"][offset_key] = bootstrap_target_offset
        consumer.seek_to_beginning(tp)
        LOGGER.info(
            "Bootstrap mode enabled for %s: reading topic from beginning to offset %d.",
            offset_key,
            bootstrap_target_offset,
        )
    elif offset_key in state["next_offsets"]:
        next_offset = int(state["next_offsets"][offset_key])
        consumer.seek(tp, next_offset)
        LOGGER.info("Resuming from saved offset %d for %s", next_offset, offset_key)
    elif start_from == "latest":
        consumer.seek_to_end(tp)
        LOGGER.info("No saved offset for %s. Starting from latest.", offset_key)
    else:
        consumer.seek_to_beginning(tp)
        LOGGER.info("No saved offset for %s. Starting from earliest.", offset_key)

    stop = {"value": False}

    def _stop_handler(_signum, _frame):
        stop["value"] = True
        LOGGER.info("Stop signal received. Finishing in-flight work before shutdown.")

    signal.signal(signal.SIGTERM, _stop_handler)
    signal.signal(signal.SIGINT, _stop_handler)

    table_buffers: Dict[str, List[Dict]] = {}
    table_paths: Dict[str, Path] = {}

    next_check_time = time.time()

    LOGGER.info("Kafka consumer started for topic=%s, partition=%d", topic, partition)

    while not stop["value"]:
        now = time.time()
        if now < next_check_time:
            time.sleep(min(1.0, next_check_time - now))
            continue

        next_check_time = time.time() + check_interval_seconds
        poll_batches: List[Dict[TopicPartition, List]] = []
        first_batch = consumer.poll(timeout_ms=poll_timeout_ms)
        poll_batches.append(first_batch)

        while not stop["value"] and not any(len(rows) >= max_rows_per_upload for rows in table_buffers.values()):
            extra_batch = consumer.poll(timeout_ms=0)
            if not extra_batch:
                break
            poll_batches.append(extra_batch)

        for polled in poll_batches:
            for _partition, records in polled.items():
                for record in records:
                    payload = record.value
                    if not isinstance(payload, dict):
                        continue

                    drop_targets = detect_drop_tables(payload)
                    if drop_targets:
                        for drop_schema, drop_table in drop_targets:
                            drop_table_id = f"{drop_schema}.{drop_table}"
                            if not should_process_table(drop_table_id, included_tables):
                                continue
                            purge_table_outputs(
                                landing_zone_root,
                                drop_schema,
                                drop_table,
                                state,
                                remote_service,
                                remote_file_system,
                                remote_base_path,
                            )

                        state["next_offsets"][offset_key] = record.offset + 1
                        continue

                    schema_name = str(payload.get("table_schema", "dbo"))
                    table_name = str(payload.get("table_name", ""))
                    if not table_name:
                        continue

                    table_id = f"{schema_name}.{table_name}"
                    if not should_process_table(table_id, included_tables):
                        state["next_offsets"][offset_key] = record.offset + 1
                        continue

                    # Take on-demand snapshot for new tables on first encounter
                    if not state["table_snapshots_completed"].get(table_id, False):
                        LOGGER.info("First time seeing table %s, taking on-demand snapshot...", table_id)
                        snapshot_success = snapshot_single_table_on_demand(
                            landing_zone_root,
                            table_id,
                            schema_name,
                            table_name,
                            snapshot_source_host,
                            snapshot_source_port,
                            snapshot_source_user,
                            snapshot_source_password,
                            snapshot_source_database,
                            state,
                            key_columns_map,
                            remote_service,
                            remote_file_system,
                            remote_base_path,
                        )
                        if not snapshot_success:
                            LOGGER.warning("Failed to take snapshot for %s, continuing anyway", table_id)
                        save_state(state_file, state)

                    # Filter out events that occurred before the snapshot GTID
                    if not should_process_event_after_gtid_snapshot(table_id, payload, state):
                        state["next_offsets"][offset_key] = record.offset + 1
                        continue

                    status, row = normalize_row(
                        payload,
                        key_columns_map.get(table_id, ["id"]),
                    )
                    if status == "skip":
                        state["next_offsets"][offset_key] = record.offset + 1
                        continue

                    table_path, table_id = resolve_table_path(landing_zone_root, schema_name, table_name)
                    table_paths[table_id] = table_path
                    table_buffers.setdefault(table_id, []).append(row)

                    state["next_offsets"][offset_key] = record.offset + 1

        buffered_count = sum(len(v) for v in table_buffers.values())
        if buffered_count > 0:
            LOGGER.info("Upload cycle: buffered_records=%d tables=%d", buffered_count, len(table_buffers))
            for table_id, rows in list(table_buffers.items()):
                consumed = flush_table_rows(
                    landing_zone_root,
                    table_id,
                    table_paths[table_id],
                    rows,
                    state,
                    key_columns_map,
                    remote_service,
                    remote_file_system,
                    remote_base_path,
                    max_rows_per_upload=max_rows_per_upload,
                )
                table_buffers[table_id] = rows[consumed:]
                if table_buffers[table_id]:
                    LOGGER.info(
                        "Deferred %d rows for %s to next upload cycle.",
                        len(table_buffers[table_id]),
                        table_id,
                    )

            if needs_bootstrap and bootstrap_reached_target(state, offset_key):
                state["bootstrap_completed"][offset_key] = True
                LOGGER.info("Bootstrap completed for %s", offset_key)
            save_state(state_file, state)
            LOGGER.debug("State saved to %s", state_file)

        if needs_bootstrap and not table_buffers and bootstrap_reached_target(state, offset_key):
            state["bootstrap_completed"][offset_key] = True
            save_state(state_file, state)
            LOGGER.info(
                "Bootstrap completed for %s at offset %d",
                offset_key,
                int(state["bootstrap_target_offsets"][offset_key]),
            )
            needs_bootstrap = False

    for table_id, rows in list(table_buffers.items()):
        while rows:
            consumed = flush_table_rows(
                landing_zone_root,
                table_id,
                table_paths[table_id],
                rows,
                state,
                key_columns_map,
                remote_service,
                remote_file_system,
                remote_base_path,
                max_rows_per_upload=max_rows_per_upload,
            )
            rows = rows[consumed:]
        table_buffers[table_id] = []

    if needs_bootstrap and bootstrap_reached_target(state, offset_key):
        state["bootstrap_completed"][offset_key] = True
        LOGGER.info("Bootstrap completed for %s", offset_key)
    save_state(state_file, state)
    LOGGER.debug("Final state saved to %s", state_file)
    consumer.close()
    LOGGER.info("Kafka consumer stopped cleanly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
