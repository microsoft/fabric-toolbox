from __future__ import annotations

import hashlib
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator, Literal, Optional, Sequence

from mssql_python import connect  # type: ignore[import-untyped]

from ..assessment.synapse import (
    CodeObjectCount,
    CodeObjectLines,
    ColumnCompatibility,
    SynapseColumn,
    SynapseQueryActivity,
    SynapseSessionActivity,
    SynapseServerlessActivity,
    SynapseServerlessActivityCollectionMetadata,
    SynapseServerlessActivitySourceDiagnostic,
    SynapseServerlessDailyDatabaseUsage,
    SynapseServerlessDatabaseSummary,
    SynapseServerlessPerformanceSummary,
    SynapseServerlessQueryActivity,
    SynapseServerlessTopQueryMetric,
    TableStatistics,
)
# Supported SQL authentication modes
SqlAuthMode = Literal["sql", "entra-interactive", "entra-spn", "entra-default"]
EndpointKind = Literal["dedicated", "serverless"]

SERVERLESS_HISTORY_DAYS_MAX = 45
SERVERLESS_TOP_N_MAX = 10000

SERVERLESS_HISTORY_SOURCES: tuple[dict[str, Any], ...] = (
    {
        "name": "sys.dm_exec_requests_history",
        "kind": "history",
        "time_candidates": ("start_time", "request_start_time"),
        "select_candidates": {
            "request_id": ("distributed_statement_id", "request_id"),
            "session_id": ("session_id",),
            "connection_id": ("connection_id",),
            "query_hash": ("query_hash",),
            "database_name": ("database_name", "db_name"),
            "principal_name": ("login_name", "principal_name", "user_name"),
            "status": ("status",),
            "submit_time": ("submit_time",),
            "start_time": ("start_time", "request_start_time"),
            "end_time": ("end_time", "request_end_time", "completion_time"),
            "elapsed_time_ms": (
                "total_elapsed_time_ms",
                "elapsed_time_ms",
                "duration_ms",
            ),
            "program_name": ("program_name", "application_name"),
            "statement_type": ("statement_type", "statement_type ", "command_type"),
            "row_count": ("row_count",),
            "error_code": ("error_code",),
            "query_text": ("query_text", "sql_text", "command"),
            "processed_bytes": ("data_processed_bytes", "processed_bytes"),
            "processed_mb": ("data_processed_mb",),
            "remote_processed_mb": (
                "data_scanned_remote_storage_mb",
                "data_processed_remote_storage_mb",
            ),
            "memory_processed_mb": (
                "data_scanned_memory_mb",
                "data_processed_memory_mb",
            ),
            "disk_processed_mb": ("data_scanned_disk_mb", "data_processed_disk_mb"),
        },
    },
    {
        "name": "queryinsights.exec_requests_history",
        "kind": "history",
        "time_candidates": ("start_time",),
        "select_candidates": {
            "request_id": ("distributed_statement_id",),
            "session_id": ("session_id",),
            "connection_id": ("connection_id",),
            "query_hash": ("query_hash",),
            "database_name": ("database_name",),
            "principal_name": ("login_name",),
            "status": ("status",),
            "submit_time": ("submit_time",),
            "start_time": ("start_time",),
            "end_time": ("end_time",),
            "elapsed_time_ms": ("total_elapsed_time_ms",),
            "program_name": ("program_name",),
            "statement_type": ("statement_type", "statement_type "),
            "row_count": ("row_count",),
            "error_code": ("error_code",),
            "query_text": ("command",),
            "remote_processed_mb": ("data_scanned_remote_storage_mb",),
            "memory_processed_mb": ("data_scanned_memory_mb",),
            "disk_processed_mb": ("data_scanned_disk_mb",),
        },
    },
)

SERVERLESS_SUPPLEMENTAL_SOURCES: tuple[dict[str, Any], ...] = (
    {
        "name": "queryinsights.long_running_queries",
        "kind": "supplemental",
        "time_candidates": ("last_run_start_time",),
        "select_candidates": {
            "request_id": ("last_dist_statement_id",),
            "session_id": ("last_run_session_id",),
            "query_hash": ("query_hash",),
            "start_time": ("last_run_start_time",),
            "elapsed_time_ms": (
                "last_run_total_elapsed_time_ms",
                "median_total_elapsed_time_ms",
            ),
        },
    },
    {
        "name": "queryinsights.frequently_run_queries",
        "kind": "supplemental",
        "time_candidates": ("last_run_start_time",),
        "select_candidates": {
            "request_id": ("last_dist_statement_id",),
            "session_id": ("last_run_session_id",),
            "query_hash": ("query_hash",),
            "start_time": ("last_run_start_time",),
            "elapsed_time_ms": (
                "last_run_total_elapsed_time_ms",
                "avg_total_elapsed_time_ms",
                "max_run_total_elapsed_time_ms",
            ),
        },
    },
)


class ServerlessActivityExpectedError(Exception):
    """Expected serverless activity collection failure."""

    def __init__(self, category: str, message: str):
        super().__init__(message)
        self.category = category
        self.message = message


@dataclass(frozen=True)
class FabricTypeCompatibility:
    """Fabric Warehouse compatibility guidance for a SQL data type."""

    classification: ColumnCompatibility
    note: str


@dataclass
class SynapseColumnMetadataObject:
    """A table or view returned by the batched column metadata query."""

    schema: str
    object_type: Literal["table", "view"]
    name: str
    columns: list[SynapseColumn]
    columns_collected: bool


@dataclass
class SynapseColumnMetadataResult:
    """Batched metadata result for one database."""

    objects: list[SynapseColumnMetadataObject]
    total_objects: int
    selected_objects: int
    capped: bool


_FABRIC_TYPE_COMPATIBILITY: dict[str, FabricTypeCompatibility] = {
    "bigint": FabricTypeCompatibility("compatible", "Directly supported."),
    "bit": FabricTypeCompatibility("compatible", "Directly supported."),
    "date": FabricTypeCompatibility("compatible", "Directly supported."),
    "datetime2": FabricTypeCompatibility("compatible", "Directly supported."),
    "decimal": FabricTypeCompatibility("compatible", "Directly supported."),
    "float": FabricTypeCompatibility("compatible", "Directly supported."),
    "int": FabricTypeCompatibility("compatible", "Directly supported."),
    "numeric": FabricTypeCompatibility("compatible", "Directly supported."),
    "real": FabricTypeCompatibility("compatible", "Directly supported."),
    "smallint": FabricTypeCompatibility("compatible", "Directly supported."),
    "time": FabricTypeCompatibility("compatible", "Directly supported."),
    "tinyint": FabricTypeCompatibility("compatible", "Directly supported."),
    "binary": FabricTypeCompatibility(
        "review", "Review binary length and downstream usage."
    ),
    "char": FabricTypeCompatibility("review", "Review character length and collation."),
    "money": FabricTypeCompatibility(
        "review", "Consider an explicit decimal precision and scale."
    ),
    "nchar": FabricTypeCompatibility(
        "review", "Review character length and collation."
    ),
    "nvarchar": FabricTypeCompatibility(
        "review", "Review character length and collation."
    ),
    "smalldatetime": FabricTypeCompatibility(
        "review", "Review conversion to datetime2 and required precision."
    ),
    "smallmoney": FabricTypeCompatibility(
        "review", "Consider an explicit decimal precision and scale."
    ),
    "varbinary": FabricTypeCompatibility(
        "review", "Review binary length and downstream usage."
    ),
    "varchar": FabricTypeCompatibility(
        "review", "Review character length and collation."
    ),
    "datetime": FabricTypeCompatibility(
        "review", "Review conversion to datetime2 and required precision."
    ),
    "datetimeoffset": FabricTypeCompatibility(
        "unsupported", "No direct Fabric Warehouse target representation."
    ),
    "geography": FabricTypeCompatibility(
        "unsupported", "No direct Fabric Warehouse target representation."
    ),
    "geometry": FabricTypeCompatibility(
        "unsupported", "No direct Fabric Warehouse target representation."
    ),
    "hierarchyid": FabricTypeCompatibility(
        "unsupported", "No direct Fabric Warehouse target representation."
    ),
    "image": FabricTypeCompatibility(
        "unsupported", "Deprecated type without a direct target representation."
    ),
    "ntext": FabricTypeCompatibility(
        "unsupported", "Deprecated type without a direct target representation."
    ),
    "rowversion": FabricTypeCompatibility(
        "unsupported", "No direct Fabric Warehouse target representation."
    ),
    "sql_variant": FabricTypeCompatibility(
        "unsupported", "No direct Fabric Warehouse target representation."
    ),
    "text": FabricTypeCompatibility(
        "unsupported", "Deprecated type without a direct target representation."
    ),
    "timestamp": FabricTypeCompatibility(
        "unsupported", "No direct Fabric Warehouse target representation."
    ),
    "uniqueidentifier": FabricTypeCompatibility(
        "unsupported", "No direct Fabric Warehouse target representation."
    ),
    "xml": FabricTypeCompatibility(
        "unsupported", "No direct Fabric Warehouse target representation."
    ),
}


def get_fabric_type_compatibility(data_type: str) -> FabricTypeCompatibility:
    """Return centralized Fabric Warehouse compatibility guidance."""

    normalized_type = (data_type or "").strip().lower()
    return _FABRIC_TYPE_COMPATIBILITY.get(
        normalized_type,
        FabricTypeCompatibility(
            "review", "Unknown type; review target support and conversion requirements."
        ),
    )


class OdbcClient:
    """ODBC client for Azure Synapse Analytics dedicated and serverless SQL endpoints.

    Supports multiple authentication modes:
    - sql: Traditional SQL authentication with username/password
    - entra-interactive: Entra ID interactive authentication (browser popup)
    - entra-spn: Entra ID Service Principal authentication
    - entra-default: Entra ID default authentication (Azure CLI, managed identity, etc.)
    """

    def __init__(
        self,
        workspace_name: str,
        database: str,
        username: Optional[str] = None,
        password: Optional[str] = None,
        auth_mode: SqlAuthMode = "sql",
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        tenant_id: Optional[str] = None,
        endpoint_kind: EndpointKind = "dedicated",
        server_host: Optional[str] = None,
    ):
        """
        Initialize ODBC client with connection parameters.

        Args:
            workspace_name: The Synapse workspace name or fully-qualified SQL host
            database: The database name to connect to
            username: SQL authentication username (required for 'sql' mode)
            password: SQL authentication password (required for 'sql' mode)
            auth_mode: Authentication mode - 'sql', 'entra-interactive', 'entra-spn', or 'entra-default'
            client_id: Service principal client ID (required for 'entra-spn' mode)
            client_secret: Service principal client secret (required for 'entra-spn' mode)
            tenant_id: Azure tenant ID (optional for 'entra-spn' mode, defaults to 'common')
            endpoint_kind: Synapse SQL endpoint kind ('dedicated' or 'serverless')
            server_host: Optional explicit SQL hostname, which overrides endpoint_kind
        """
        self.workspace_name = workspace_name
        self.database = database
        self.username = username
        self.password = password
        self.auth_mode = auth_mode
        self.client_id = client_id
        self.client_secret = client_secret
        self.tenant_id = tenant_id or "common"
        self.endpoint_kind = endpoint_kind
        self.server_host = server_host
        self._validate_auth_params()
        self._connection_string = self._build_connection_string()
        self._connection: Optional[Any] = None

    def _validate_auth_params(self) -> None:
        """Validate that required parameters are provided for the selected auth mode."""
        if self.auth_mode == "sql":
            if not self.username or not self.password:
                raise ValueError(
                    "SQL authentication requires both 'username' and 'password'"
                )
        elif self.auth_mode == "entra-spn":
            if not self.client_id or not self.client_secret:
                raise ValueError(
                    "Entra ID Service Principal authentication requires "
                    "'client_id' and 'client_secret'"
                )
        elif self.auth_mode not in (
            "entra-interactive",
            "entra-default",
        ):
            raise ValueError(f"Unsupported authentication mode: {self.auth_mode}")

    def _resolve_server_name(self) -> str:
        """Resolve the SQL hostname for the configured endpoint."""
        if self.server_host:
            return self.server_host

        if self.workspace_name.endswith(".sql.azuresynapse.net"):
            return self.workspace_name

        if self.endpoint_kind == "serverless":
            return f"{self.workspace_name}-ondemand.sql.azuresynapse.net"

        return f"{self.workspace_name}.sql.azuresynapse.net"

    def _build_connection_string(self) -> str:
        """Build the connection string based on the authentication mode."""
        server = self._resolve_server_name()

        base = (
            f"Server=tcp:{server},1433;"
            f"Database={self.database};"
            f"Encrypt=yes;"
            f"TrustServerCertificate=no;"
        )

        if self.auth_mode == "sql":
            return base + f"Uid={self.username};Pwd={self.password};"

        if self.auth_mode == "entra-interactive":
            return base + "Authentication=ActiveDirectoryInteractive;"

        if self.auth_mode == "entra-spn":
            return (
                base
                + "Authentication=ActiveDirectoryServicePrincipal;"
                + f"UID={self.client_id};"
                + f"******;"
            )

        return base + "Authentication=ActiveDirectoryDefault;"

    def __enter__(self):
        """Enter context manager - open connection."""
        self.open()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Exit context manager - close connection."""
        self.close()
        return False

    def open(self) -> None:
        """Open the database connection."""
        if self._connection is None:
            self._connection = connect(self._connection_string)

    def close(self) -> None:
        """Close the database connection."""
        if self._connection is not None:
            try:
                self._connection.close()
            except Exception:
                pass
            finally:
                self._connection = None

    def _ensure_connection(self) -> Any:
        """Ensure connection is open and return it."""
        if self._connection is None:
            self.open()
        return self._connection

    @staticmethod
    def _execute_cursor(
        cursor: Any, query: str, params: Optional[Sequence[Any]] = None
    ) -> None:
        """Execute a query with optional DB-API parameter support."""
        if params is None:
            cursor.execute(query)
            return

        try:
            cursor.execute(query, params)
        except TypeError:
            cursor.execute(query, *params)

    def execute_query(
        self, query: str, params: Optional[Sequence[Any]] = None
    ) -> Iterator[Any]:
        """
        Execute a SQL query and yield results row by row.

        Args:
            query: SQL query to execute
            params: Optional DB-API parameters for the query

        Yields:
            Row objects from the query results
        """
        conn = self._ensure_connection()
        with conn.cursor() as cursor:
            self._execute_cursor(cursor, query, params)
            for row in cursor:
                yield row

    @staticmethod
    def _row_value(row: Any, name: str, default: Any = None) -> Any:
        for candidate in (name, name.lower(), name.upper()):
            if hasattr(row, candidate):
                return getattr(row, candidate)
        return default

    @staticmethod
    def _timestamp_value(value: Any) -> Optional[str]:
        if value is None:
            return None
        if hasattr(value, "isoformat"):
            return value.isoformat()
        return str(value)

    def get_query_history(
        self, history_days: int, top_n: int, include_sql_text: bool
    ) -> list[SynapseQueryActivity]:
        """Get recent dedicated-pool requests from sys.dm_pdw_exec_requests."""
        command_column = ", [command] AS command" if include_sql_text else ""
        query = f"""
SELECT TOP ({top_n})
    request_id,
    session_id,
    status,
    resource_class,
    importance,
    submit_time,
    start_time,
    end_time,
    total_elapsed_time AS duration_ms,
    CASE
        WHEN start_time IS NULL THEN NULL
        ELSE DATEDIFF(millisecond, submit_time, start_time)
    END AS queue_duration_ms,
    [label],
    CAST(NULL AS nvarchar(128)) AS login_name
    {command_column}
FROM sys.dm_pdw_exec_requests
WHERE submit_time >= DATEADD(day, -{history_days}, GETUTCDATE())
ORDER BY submit_time DESC
"""
        requests = []
        for row in self.execute_query(query):
            raw = {
                "request_id": self._row_value(row, "request_id"),
                "session_id": self._row_value(row, "session_id"),
                "status": self._row_value(row, "status"),
                "resource_class": self._row_value(row, "resource_class"),
                "importance": self._row_value(row, "importance"),
                "submit_time": self._timestamp_value(
                    self._row_value(row, "submit_time")
                ),
                "start_time": self._timestamp_value(self._row_value(row, "start_time")),
                "end_time": self._timestamp_value(self._row_value(row, "end_time")),
                "duration_ms": self._row_value(row, "duration_ms"),
                "queue_duration_ms": self._row_value(row, "queue_duration_ms"),
                "label": self._row_value(row, "label"),
                "login_name": self._row_value(row, "login_name"),
            }
            command = self._row_value(row, "command") if include_sql_text else None
            requests.append(
                SynapseQueryActivity(
                    request_id=str(raw["request_id"] or ""),
                    session_id=str(raw["session_id"] or ""),
                    status=str(raw["status"] or "Unknown"),
                    resource_class=str(raw["resource_class"] or "Unknown"),
                    importance=str(raw["importance"] or "Unknown"),
                    submit_time=raw["submit_time"],
                    start_time=raw["start_time"],
                    end_time=raw["end_time"],
                    duration_ms=(
                        float(raw["duration_ms"])
                        if raw["duration_ms"] is not None
                        else None
                    ),
                    queue_duration_ms=(
                        float(raw["queue_duration_ms"])
                        if raw["queue_duration_ms"] is not None
                        else None
                    ),
                    label=raw["label"],
                    login_name=raw["login_name"],
                    command=command,
                    json_response={
                        **raw,
                        **({"command": command} if include_sql_text else {}),
                    },
                )
            )
        return requests

    def get_session_history(
        self, history_days: int, top_n: int
    ) -> list[SynapseSessionActivity]:
        """Get the recent/current session snapshot for a dedicated SQL pool."""
        query = f"""
SELECT TOP ({top_n})
    session_id,
    status,
    login_name,
    login_time,
    query_count,
    client_id,
    app_name
FROM sys.dm_pdw_exec_sessions
WHERE login_time >= DATEADD(day, -{history_days}, GETUTCDATE())
   OR status <> 'Closed'
ORDER BY login_time DESC
"""
        sessions = []
        for row in self.execute_query(query):
            raw = {
                "session_id": self._row_value(row, "session_id"),
                "status": self._row_value(row, "status"),
                "login_name": self._row_value(row, "login_name"),
                "login_time": self._timestamp_value(self._row_value(row, "login_time")),
                "query_count": self._row_value(row, "query_count"),
                "client_id": self._row_value(row, "client_id"),
                "app_name": self._row_value(row, "app_name"),
            }
            sessions.append(
                SynapseSessionActivity(
                    session_id=str(raw["session_id"] or ""),
                    status=str(raw["status"] or "Unknown"),
                    login_name=raw["login_name"],
                    login_time=raw["login_time"],
                    query_count=(
                        int(raw["query_count"])
                        if raw["query_count"] is not None
                        else None
                    ),
                    client_id=raw["client_id"],
                    app_name=raw["app_name"],
                    json_response=raw,
                )
            )
        return sessions

    def get_query_columns(
        self, query: str, params: Optional[Sequence[Any]] = None
    ) -> list[str]:
        """Execute a query and return the result-set column names."""
        conn = self._ensure_connection()
        with conn.cursor() as cursor:
            self._execute_cursor(cursor, query, params)
            return [column[0] for column in (cursor.description or [])]

    def get_schemas(self) -> list[str]:
        """Get schema names from the dedicated SQL pool."""
        query = """
SELECT SCHEMA_NAME
FROM INFORMATION_SCHEMA.SCHEMATA
ORDER BY SCHEMA_NAME
"""
        return [row.SCHEMA_NAME for row in self.execute_query(query)]

    def get_tables(self, schema_name: str) -> list[str]:
        """Get table names for a given schema in the dedicated SQL pool."""
        query = f"""
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = '{schema_name}' AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME
"""
        return [row.TABLE_NAME for row in self.execute_query(query)]

    @staticmethod
    def _row_value(row: Any, name: str) -> Any:
        """Read a driver row value without depending on one row implementation."""

        if isinstance(row, dict):
            return row.get(name)
        if hasattr(row, name):
            return getattr(row, name)
        if hasattr(row, name.lower()):
            return getattr(row, name.lower())
        try:
            return row[name]
        except (KeyError, TypeError, IndexError):
            return None

    @staticmethod
    def _optional_int(value: Any) -> Optional[int]:
        if value is None:
            return None
        return int(value)

    def get_column_metadata(
        self, max_objects: Optional[int] = None
    ) -> SynapseColumnMetadataResult:
        """Retrieve all table/view columns using one ordered database query.

        The optional cap is applied after grouping the complete result set, so a
        selected object always receives all of its columns.
        """

        if max_objects is not None and max_objects <= 0:
            raise ValueError("max_objects must be a positive integer")

        query = """
SELECT
    c.TABLE_SCHEMA,
    t.TABLE_TYPE,
    c.TABLE_NAME,
    c.COLUMN_NAME,
    c.ORDINAL_POSITION,
    c.COLUMN_DEFAULT,
    c.IS_NULLABLE,
    c.DATA_TYPE,
    c.CHARACTER_MAXIMUM_LENGTH,
    c.NUMERIC_PRECISION,
    c.NUMERIC_SCALE,
    c.DATETIME_PRECISION,
    c.CHARACTER_SET_NAME,
    c.COLLATION_NAME
FROM INFORMATION_SCHEMA.COLUMNS AS c
INNER JOIN INFORMATION_SCHEMA.TABLES AS t
    ON t.TABLE_CATALOG = c.TABLE_CATALOG
    AND t.TABLE_SCHEMA = c.TABLE_SCHEMA
    AND t.TABLE_NAME = c.TABLE_NAME
WHERE t.TABLE_TYPE IN ('BASE TABLE', 'VIEW')
ORDER BY
    c.TABLE_SCHEMA,
    t.TABLE_TYPE,
    c.TABLE_NAME,
    c.ORDINAL_POSITION
"""
        grouped: dict[
            tuple[str, Literal["table", "view"], str], list[SynapseColumn]
        ] = {}

        for row in self.execute_query(query):
            schema = str(self._row_value(row, "TABLE_SCHEMA") or "")
            table_type = str(self._row_value(row, "TABLE_TYPE") or "").upper()
            object_type: Literal["table", "view"] = (
                "view" if table_type == "VIEW" else "table"
            )
            object_name = str(self._row_value(row, "TABLE_NAME") or "")
            data_type = str(self._row_value(row, "DATA_TYPE") or "").lower()
            compatibility = get_fabric_type_compatibility(data_type)
            raw_response = {
                field.lower(): self._row_value(row, field)
                for field in (
                    "TABLE_SCHEMA",
                    "TABLE_TYPE",
                    "TABLE_NAME",
                    "COLUMN_NAME",
                    "ORDINAL_POSITION",
                    "COLUMN_DEFAULT",
                    "IS_NULLABLE",
                    "DATA_TYPE",
                    "CHARACTER_MAXIMUM_LENGTH",
                    "NUMERIC_PRECISION",
                    "NUMERIC_SCALE",
                    "DATETIME_PRECISION",
                    "CHARACTER_SET_NAME",
                    "COLLATION_NAME",
                )
            }
            column = SynapseColumn(
                name=str(self._row_value(row, "COLUMN_NAME") or ""),
                ordinal_position=int(self._row_value(row, "ORDINAL_POSITION") or 0),
                data_type=data_type,
                is_nullable=str(self._row_value(row, "IS_NULLABLE") or "").upper()
                == "YES",
                character_maximum_length=self._optional_int(
                    self._row_value(row, "CHARACTER_MAXIMUM_LENGTH")
                ),
                numeric_precision=self._optional_int(
                    self._row_value(row, "NUMERIC_PRECISION")
                ),
                numeric_scale=self._optional_int(self._row_value(row, "NUMERIC_SCALE")),
                datetime_precision=self._optional_int(
                    self._row_value(row, "DATETIME_PRECISION")
                ),
                column_default=self._row_value(row, "COLUMN_DEFAULT"),
                character_set_name=self._row_value(row, "CHARACTER_SET_NAME"),
                collation_name=self._row_value(row, "COLLATION_NAME"),
                compatibility=compatibility.classification,
                compatibility_note=compatibility.note,
                json_response=raw_response,
            )
            grouped.setdefault((schema, object_type, object_name), []).append(column)

        object_keys = list(grouped)
        selected_keys = set(
            object_keys if max_objects is None else object_keys[:max_objects]
        )
        objects = [
            SynapseColumnMetadataObject(
                schema=schema,
                object_type=object_type,
                name=name,
                columns=(
                    grouped[(schema, object_type, name)]
                    if (schema, object_type, name) in selected_keys
                    else []
                ),
                columns_collected=(schema, object_type, name) in selected_keys,
            )
            for schema, object_type, name in object_keys
        ]
        total_objects = len(objects)
        selected_objects = len(selected_keys)
        return SynapseColumnMetadataResult(
            objects=objects,
            total_objects=total_objects,
            selected_objects=selected_objects,
            capped=selected_objects < total_objects,
        )

    def get_table_view_objects(self) -> list[SynapseColumnMetadataObject]:
        """Retrieve table/view inventory without querying column metadata."""

        query = """
SELECT
    TABLE_SCHEMA,
    TABLE_TYPE,
    TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
ORDER BY
    TABLE_SCHEMA,
    TABLE_TYPE,
    TABLE_NAME
"""
        objects = []
        for row in self.execute_query(query):
            table_type = str(self._row_value(row, "TABLE_TYPE") or "").upper()
            objects.append(
                SynapseColumnMetadataObject(
                    schema=str(self._row_value(row, "TABLE_SCHEMA") or ""),
                    object_type="view" if table_type == "VIEW" else "table",
                    name=str(self._row_value(row, "TABLE_NAME") or ""),
                    columns=[],
                    columns_collected=False,
                )
            )
        return objects

    def check_table_statistics_dmv_exists(self) -> bool:
        """Check if the vTableSizes view exists in the master database."""
        check_query = """
SELECT OBJECT_ID('dbo.vTableSizes', 'V')
        """

        conn = self._ensure_connection()
        with conn.cursor() as cursor:
            cursor.execute(check_query)
            result = cursor.fetchone()
            return result[0] is not None

    def create_table_statistics_dmv(self) -> None:
        """Create the vTableSizes view in the master database if it does not exist."""
        create_view_query = """
CREATE VIEW dbo.vTableSizes
AS
WITH base
AS
(
SELECT
 GETDATE()                                                             AS  [execution_time]
, DB_NAME()                                                            AS  [database_name]
, s.name                                                               AS  [schema_name]
, t.name                                                               AS  [table_name]
, QUOTENAME(s.name)+'.'+QUOTENAME(t.name)                              AS  [two_part_name]
, nt.[name]                                                            AS  [node_table_name]
, ROW_NUMBER() OVER(PARTITION BY nt.[name] ORDER BY (SELECT NULL))     AS  [node_table_name_seq]
, tp.[distribution_policy_desc]                                        AS  [distribution_policy_name]
, c.[name]                                                             AS  [distribution_column]
, nt.[distribution_id]                                                 AS  [distribution_id]
, i.[type]                                                             AS  [index_type]
, i.[type_desc]                                                        AS  [index_type_desc]
, nt.[pdw_node_id]                                                     AS  [pdw_node_id]
, pn.[type]                                                            AS  [pdw_node_type]
, pn.[name]                                                            AS  [pdw_node_name]
, di.name                                                              AS  [dist_name]
, di.position                                                          AS  [dist_position]
, nps.[partition_number]                                               AS  [partition_nmbr]
, nps.[reserved_page_count]                                            AS  [reserved_space_page_count]
, nps.[reserved_page_count] - nps.[used_page_count]                    AS  [unused_space_page_count]
, nps.[in_row_data_page_count]
    + nps.[row_overflow_used_page_count]
    + nps.[lob_used_page_count]                                        AS  [data_space_page_count]
, nps.[reserved_page_count]
 - (nps.[reserved_page_count] - nps.[used_page_count])
 - ([in_row_data_page_count]
         + [row_overflow_used_page_count]+[lob_used_page_count])       AS  [index_space_page_count]
, nps.[row_count]                                                      AS  [row_count]
from
    sys.schemas s
INNER JOIN sys.tables t
    ON s.[schema_id] = t.[schema_id]
INNER JOIN sys.indexes i
    ON  t.[object_id] = i.[object_id]
    AND i.[index_id] <= 1
INNER JOIN sys.pdw_table_distribution_properties tp
    ON t.[object_id] = tp.[object_id]
INNER JOIN sys.pdw_table_mappings tm
    ON t.[object_id] = tm.[object_id]
INNER JOIN sys.pdw_nodes_tables nt
    ON tm.[physical_name] = nt.[name]
INNER JOIN sys.dm_pdw_nodes pn
    ON  nt.[pdw_node_id] = pn.[pdw_node_id]
INNER JOIN sys.pdw_distributions di
    ON  nt.[distribution_id] = di.[distribution_id]
INNER JOIN sys.dm_pdw_nodes_db_partition_stats nps
    ON nt.[object_id] = nps.[object_id]
    AND nt.[pdw_node_id] = nps.[pdw_node_id]
    AND nt.[distribution_id] = nps.[distribution_id]
    AND i.[index_id] = nps.[index_id]
LEFT OUTER JOIN (select * from sys.pdw_column_distribution_properties where distribution_ordinal = 1) cdp
    ON t.[object_id] = cdp.[object_id]
LEFT OUTER JOIN sys.columns c
    ON cdp.[object_id] = c.[object_id]
    AND cdp.[column_id] = c.[column_id]
WHERE pn.[type] = 'COMPUTE'
)
, size
AS
(
SELECT
   [execution_time]
,  [database_name]
,  [schema_name]
,  [table_name]
,  [two_part_name]
,  [node_table_name]
,  [node_table_name_seq]
,  [distribution_policy_name]
,  [distribution_column]
,  [distribution_id]
,  [index_type]
,  [index_type_desc]
,  [pdw_node_id]
,  [pdw_node_type]
,  [pdw_node_name]
,  [dist_name]
,  [dist_position]
,  [partition_nmbr]
,  [reserved_space_page_count]
,  [unused_space_page_count]
,  [data_space_page_count]
,  [index_space_page_count]
,  [row_count]
,  ([reserved_space_page_count] * 8.0)                                 AS [reserved_space_KB]
,  ([reserved_space_page_count] * 8.0)/1000                            AS [reserved_space_MB]
,  ([reserved_space_page_count] * 8.0)/1000000                         AS [reserved_space_GB]
,  ([reserved_space_page_count] * 8.0)/1000000000                      AS [reserved_space_TB]
,  ([unused_space_page_count]   * 8.0)                                 AS [unused_space_KB]
,  ([unused_space_page_count]   * 8.0)/1000                            AS [unused_space_MB]
,  ([unused_space_page_count]   * 8.0)/1000000                         AS [unused_space_GB]
,  ([unused_space_page_count]   * 8.0)/1000000000                      AS [unused_space_TB]
,  ([data_space_page_count]     * 8.0)                                 AS [data_space_KB]
,  ([data_space_page_count]     * 8.0)/1000                            AS [data_space_MB]
,  ([data_space_page_count]     * 8.0)/1000000                         AS [data_space_GB]
,  ([data_space_page_count]     * 8.0)/1000000000                      AS [data_space_TB]
,  ([index_space_page_count]  * 8.0)                                   AS [index_space_KB]
,  ([index_space_page_count]  * 8.0)/1000                              AS [index_space_MB]
,  ([index_space_page_count]  * 8.0)/1000000                           AS [index_space_GB]
,  ([index_space_page_count]  * 8.0)/1000000000                        AS [index_space_TB]
FROM base
)
SELECT *
FROM size
        """

        conn = self._ensure_connection()
        original_autocommit = conn.autocommit
        try:
            conn.autocommit = True
            with conn.cursor() as cursor:
                cursor.execute(create_view_query)
        finally:
            conn.autocommit = original_autocommit

    def get_table_statistics(self, database: str) -> Iterator[TableStatistics]:
        """Get table statistics from the vTableSizes view."""
        query = """
SELECT
    database_name
,   schema_name
,   table_name
,   distribution_policy_name
,   distribution_column
,   index_type_desc
,   COUNT(distinct partition_nmbr) as nbr_partitions
,   SUM(row_count)                 as table_row_count
,   SUM(reserved_space_GB)         as table_reserved_space_GB
,   SUM(data_space_GB)             as table_data_space_GB
,   SUM(index_space_GB)            as table_index_space_GB
,   SUM(unused_space_GB)           as table_unused_space_GB
FROM
    dbo.vTableSizes
GROUP BY
    database_name
,   schema_name
,   table_name
,   distribution_policy_name
,   distribution_column
,   index_type_desc
ORDER BY
    table_reserved_space_GB desc
"""

        for row in self.execute_query(query):
            yield TableStatistics(
                database_name=row.database_name,
                schema_name=row.schema_name,
                table_name=row.table_name,
                distribution_policy_name=row.distribution_policy_name,
                distribution_column=row.distribution_column,
                index_type_desc=row.index_type_desc,
                nbr_partitions=row.nbr_partitions,
                table_row_count=row.table_row_count,
                table_reserved_space_gb=row.table_reserved_space_GB,
                table_data_space_gb=row.table_data_space_GB,
                table_index_space_gb=row.table_index_space_GB,
                table_unused_space_gb=row.table_unused_space_GB,
            )

    def get_object_count(self, database: str) -> Iterator[CodeObjectCount]:
        """Get dedicated SQL object counts."""
        query = """
SELECT 
    type_desc, count(*) AS count_objects
FROM SYS.OBJECTS
WHERE TYPE IN ( 'P','V','TR','FN')
GROUP BY TYPE_desc,type        
"""
        for row in self.execute_query(query):
            yield CodeObjectCount(
                type_description=row.type_desc, count=row.count_objects
            )

    def get_code_lines_statistics(self, database: str) -> Iterator[CodeObjectLines]:
        """Get dedicated SQL code line counts."""
        query = """
declare @lencount nchar(2)
set @lencount = char(0x0d) + char(0x0a);
select [Schema]=schema_name(p.schema_id), [ObjectName]=p.name
, Num_of_LineCode=(len(m.definition) -len(replace(m.definition, @lencount, ''))) /2,'Procedure' as Type
from sys.sql_modules m
inner join sys.procedures p on m.object_id = p.object_id
union all
select [Schema]=schema_name(p.schema_id), [ObjectName]=p.name
, Num_of_LineCode=(len(m.definition) -len(replace(m.definition, @lencount, ''))) /2,'Views' as Type
from sys.sql_modules m
inner join sys.views p on m.object_id = p.object_id
union all
select [Schema]=schema_name(p.schema_id), [ObjectName]=p.name
, Num_of_LineCode=(len(m.definition) -len(replace(m.definition, @lencount, ''))) /2,'Functions' as Type
from sys.sql_modules m inner join
sys.objects AS p   
    ON m.object_id = p.object_id   
    AND type = ('FN'); 
"""
        for row in self.execute_query(query):
            yield CodeObjectLines(
                schema_name=row.Schema,
                object_name=row.ObjectName,
                code_line_number=row.Num_of_LineCode,
                type_description=row.Type,
            )

    def collect_serverless_activity(
        self, history_days: int = 30, top_n: int = 1000
    ) -> SynapseServerlessActivity:
        """Collect serverless SQL activity using capability-probed sources."""
        self._validate_serverless_activity_options(history_days, top_n)

        current_time = datetime.now(timezone.utc).replace(tzinfo=None)
        cutoff = current_time - timedelta(days=history_days)
        collected_at = current_time.isoformat()

        metadata = SynapseServerlessActivityCollectionMetadata(
            status="unavailable",
            attempted=True,
            history_days=history_days,
            top_n=top_n,
            requested_sources=[
                source["name"]
                for source in (
                    SERVERLESS_HISTORY_SOURCES + SERVERLESS_SUPPLEMENTAL_SOURCES
                )
            ],
            collected_at=collected_at,
        )

        try:
            self._ensure_connection()
        except Exception as exc:
            raise self._expected_or_raise(exc, "Unable to connect to serverless SQL")

        all_queries: list[SynapseServerlessQueryActivity] = []
        supplemental_slowest: list[SynapseServerlessTopQueryMetric] = []
        history_source_warnings: list[str] = []
        aggregate_results: Optional[
            tuple[
                list[SynapseServerlessDailyDatabaseUsage],
                list[SynapseServerlessDatabaseSummary],
                SynapseServerlessPerformanceSummary,
            ]
        ] = None
        aggregate_warning = False

        for source in SERVERLESS_HISTORY_SOURCES:
            diagnostic = self._probe_serverless_source(source["name"])
            metadata.source_diagnostics.append(diagnostic)
            if diagnostic.status == "available":
                metadata.available_sources.append(source["name"])
            else:
                history_source_warnings.append(source["name"])
                if diagnostic.message:
                    metadata.warnings.append(diagnostic.message)
                continue

            try:
                all_queries.extend(
                    self._fetch_history_source_rows(
                        source, diagnostic.available_columns, cutoff, top_n
                    )
                )
                metadata.detailed_sources_used.append(source["name"])
                try:
                    candidate_aggregates = self._fetch_history_source_aggregates(
                        source,
                        diagnostic.available_columns,
                        cutoff,
                        current_time - timedelta(hours=24),
                        collected_at,
                    )
                    if (
                        aggregate_results is None
                        or candidate_aggregates[2].total_queries
                        > aggregate_results[2].total_queries
                    ):
                        aggregate_results = candidate_aggregates
                except ServerlessActivityExpectedError as exc:
                    aggregate_warning = True
                    metadata.warnings.append(
                        f"{source['name']} aggregates: {exc.message}"
                    )
            except ServerlessActivityExpectedError as exc:
                message = f"{source['name']}: {exc.message}"
                history_source_warnings.append(source["name"])
                metadata.warnings.append(message)
                self._replace_diagnostic(
                    metadata.source_diagnostics,
                    source["name"],
                    SynapseServerlessActivitySourceDiagnostic(
                        source_name=source["name"],
                        status="unavailable",
                        available_columns=diagnostic.available_columns,
                        message=message,
                    ),
                )

        for source in SERVERLESS_SUPPLEMENTAL_SOURCES:
            diagnostic = self._probe_serverless_source(source["name"])
            metadata.source_diagnostics.append(diagnostic)
            if diagnostic.status == "available":
                metadata.available_sources.append(source["name"])
            elif diagnostic.message:
                metadata.warnings.append(diagnostic.message)
                continue
            else:
                continue

            try:
                supplemental_rows = self._fetch_supplemental_source_rows(
                    source, diagnostic.available_columns, cutoff, min(top_n, 25)
                )
                if supplemental_rows:
                    metadata.supplemental_sources_used.append(source["name"])
                    if source["name"] == "queryinsights.long_running_queries":
                        supplemental_slowest.extend(supplemental_rows)
            except ServerlessActivityExpectedError as exc:
                message = f"{source['name']}: {exc.message}"
                metadata.warnings.append(message)
                self._replace_diagnostic(
                    metadata.source_diagnostics,
                    source["name"],
                    SynapseServerlessActivitySourceDiagnostic(
                        source_name=source["name"],
                        status="unavailable",
                        available_columns=diagnostic.available_columns,
                        message=message,
                    ),
                )

        queries = self._deduplicate_queries(all_queries)
        queries = self._filter_and_limit_queries(queries, cutoff, top_n)

        if metadata.detailed_sources_used:
            metadata.status = (
                "partial"
                if history_source_warnings or aggregate_warning
                else "completed"
            )
        else:
            metadata.status = "unavailable"
            if metadata.supplemental_sources_used:
                metadata.warnings.append(
                    "Detailed request history was unavailable; only aggregate query insight sources were reachable."
                )
            elif not metadata.available_sources:
                metadata.warnings.append(
                    "No compatible serverless activity sources were available."
                )

        if aggregate_results is not None:
            daily_usage, database_summaries, performance_summary = aggregate_results
            performance_summary.top_slowest_queries = self._top_query_metrics(
                queries, key=lambda item: item.elapsed_time_ms or 0
            )
            performance_summary.top_largest_queries = self._top_query_metrics(
                queries, key=lambda item: item.processed_bytes or 0
            )
            if not performance_summary.top_slowest_queries:
                performance_summary.top_slowest_queries = supplemental_slowest[:10]
        else:
            daily_usage = self._build_daily_database_usage(queries)
            database_summaries = self._build_database_summaries(queries)
            performance_summary = self._build_performance_summary(
                queries=queries,
                cutoff=cutoff,
                collected_at=collected_at,
                fallback_slowest=supplemental_slowest,
            )
            performance_summary.queries_last_24h = self._count_queries_since(
                queries, current_time - timedelta(hours=24)
            )

        return SynapseServerlessActivity(
            metadata=metadata,
            queries=queries,
            daily_database_usage=daily_usage,
            database_summaries=database_summaries,
            performance_summary=performance_summary,
        )

    @staticmethod
    def _validate_serverless_activity_options(history_days: int, top_n: int) -> None:
        """Validate serverless history and cap values."""
        if not 1 <= history_days <= SERVERLESS_HISTORY_DAYS_MAX:
            raise ValueError(
                f"serverless history_days must be between 1 and {SERVERLESS_HISTORY_DAYS_MAX}"
            )
        if not 1 <= top_n <= SERVERLESS_TOP_N_MAX:
            raise ValueError(
                f"serverless top_n must be between 1 and {SERVERLESS_TOP_N_MAX}"
            )

    def _probe_serverless_source(
        self, source_name: str
    ) -> SynapseServerlessActivitySourceDiagnostic:
        """Probe a serverless activity source and discover its columns."""
        probe_query = f"SELECT TOP (0) * FROM {source_name}"
        try:
            columns = self.get_query_columns(probe_query)
            return SynapseServerlessActivitySourceDiagnostic(
                source_name=source_name,
                status="available",
                available_columns=columns,
            )
        except Exception as exc:
            expected = self._classify_expected_serverless_error(exc)
            if expected is None:
                raise
            return SynapseServerlessActivitySourceDiagnostic(
                source_name=source_name,
                status="unavailable",
                message=f"{source_name}: {expected}",
            )

    def _fetch_history_source_rows(
        self,
        source_definition: dict[str, Any],
        available_columns: list[str],
        cutoff: datetime,
        top_n: int,
    ) -> list[SynapseServerlessQueryActivity]:
        """Fetch detailed history rows from one compatible source."""
        query = self._build_activity_query(
            source_definition=source_definition,
            available_columns=available_columns,
            top_n=top_n,
        )

        try:
            rows = list(self.execute_query(query, (cutoff, top_n)))
        except Exception as exc:
            raise self._expected_or_raise(
                exc, f"Failed to read {source_definition['name']}"
            )

        return [
            self._normalize_history_row(row, source_definition["name"]) for row in rows
        ]

    def _fetch_supplemental_source_rows(
        self,
        source_definition: dict[str, Any],
        available_columns: list[str],
        cutoff: datetime,
        top_n: int,
    ) -> list[SynapseServerlessTopQueryMetric]:
        """Fetch supplemental top-query metrics from aggregate sources."""
        query = self._build_activity_query(
            source_definition=source_definition,
            available_columns=available_columns,
            top_n=top_n,
        )

        try:
            rows = list(self.execute_query(query, (cutoff, top_n)))
        except Exception as exc:
            raise self._expected_or_raise(
                exc, f"Failed to read {source_definition['name']}"
            )

        metrics = [
            self._normalize_supplemental_metric(row, source_definition["name"])
            for row in rows
        ]
        filtered_metrics: list[SynapseServerlessTopQueryMetric] = []
        for metric in metrics:
            if not metric.start_time:
                continue
            parsed_start = self._parse_timestamp(metric.start_time)
            if parsed_start is None or parsed_start < cutoff:
                continue
            filtered_metrics.append(metric)
        return filtered_metrics

    def _fetch_history_source_aggregates(
        self,
        source_definition: dict[str, Any],
        available_columns: list[str],
        cutoff: datetime,
        last_24h_cutoff: datetime,
        collected_at: str,
    ) -> tuple[
        list[SynapseServerlessDailyDatabaseUsage],
        list[SynapseServerlessDatabaseSummary],
        SynapseServerlessPerformanceSummary,
    ]:
        """Aggregate the full history window without applying the detail-row cap."""
        query = self._build_activity_aggregate_query(
            source_definition, available_columns
        )
        try:
            rows = list(self.execute_query(query, (last_24h_cutoff, cutoff)))
        except Exception as exc:
            raise self._expected_or_raise(
                exc, f"Failed to aggregate {source_definition['name']}"
            )

        daily_usage: list[SynapseServerlessDailyDatabaseUsage] = []
        database_groups: dict[str, dict[str, int]] = defaultdict(
            lambda: {
                "query_count": 0,
                "processed_bytes": 0,
                "total_elapsed_time_ms": 0,
                "max_elapsed_time_ms": 0,
                "success_count": 0,
                "failure_count": 0,
                "cancelled_count": 0,
            }
        )
        queries_last_24h = 0

        for row in rows:
            query_count = self._int_or_none(getattr(row, "query_count", None)) or 0
            processed_bytes = (
                self._int_or_none(getattr(row, "processed_bytes", None)) or 0
            )
            total_elapsed_time_ms = (
                self._int_or_none(getattr(row, "total_elapsed_time_ms", None)) or 0
            )
            max_elapsed_time_ms = (
                self._int_or_none(getattr(row, "max_elapsed_time_ms", None)) or 0
            )
            success_count = self._int_or_none(getattr(row, "success_count", None)) or 0
            failure_count = self._int_or_none(getattr(row, "failure_count", None)) or 0
            cancelled_count = (
                self._int_or_none(getattr(row, "cancelled_count", None)) or 0
            )
            queries_last_24h += (
                self._int_or_none(getattr(row, "queries_last_24h", None)) or 0
            )
            database_name = (
                self._string_or_none(getattr(row, "database_name", None)) or "Unknown"
            )
            activity_date = self._to_isoformat(getattr(row, "activity_date", None))
            if activity_date:
                daily_usage.append(
                    SynapseServerlessDailyDatabaseUsage(
                        date=activity_date,
                        database_name=database_name,
                        query_count=query_count,
                        processed_bytes=processed_bytes,
                        total_elapsed_time_ms=total_elapsed_time_ms,
                        average_elapsed_time_ms=(
                            round(total_elapsed_time_ms / query_count, 2)
                            if query_count
                            else 0.0
                        ),
                    )
                )

            group = database_groups[database_name]
            group["query_count"] += query_count
            group["processed_bytes"] += processed_bytes
            group["total_elapsed_time_ms"] += total_elapsed_time_ms
            group["max_elapsed_time_ms"] = max(
                group["max_elapsed_time_ms"], max_elapsed_time_ms
            )
            group["success_count"] += success_count
            group["failure_count"] += failure_count
            group["cancelled_count"] += cancelled_count

        daily_usage.sort(key=lambda item: (item.date, item.database_name))
        database_summaries = [
            SynapseServerlessDatabaseSummary(
                database_name=database_name,
                query_count=values["query_count"],
                processed_bytes=values["processed_bytes"],
                average_elapsed_time_ms=(
                    round(values["total_elapsed_time_ms"] / values["query_count"], 2)
                    if values["query_count"]
                    else 0.0
                ),
                max_elapsed_time_ms=values["max_elapsed_time_ms"],
                success_count=values["success_count"],
                failure_count=values["failure_count"],
                cancelled_count=values["cancelled_count"],
            )
            for database_name, values in database_groups.items()
        ]
        database_summaries.sort(
            key=lambda item: (-item.processed_bytes, item.database_name)
        )

        total_queries = sum(item.query_count for item in database_summaries)
        total_processed_bytes = sum(item.processed_bytes for item in database_summaries)
        total_elapsed_time_ms = sum(item.total_elapsed_time_ms for item in daily_usage)
        performance_summary = SynapseServerlessPerformanceSummary(
            total_queries=total_queries,
            queries_last_24h=queries_last_24h,
            total_processed_bytes=total_processed_bytes,
            total_elapsed_time_ms=total_elapsed_time_ms,
            average_elapsed_time_ms=(
                round(total_elapsed_time_ms / total_queries, 2)
                if total_queries
                else 0.0
            ),
            max_elapsed_time_ms=max(
                (item.max_elapsed_time_ms for item in database_summaries), default=0
            ),
            success_count=sum(item.success_count for item in database_summaries),
            failure_count=sum(item.failure_count for item in database_summaries),
            cancelled_count=sum(item.cancelled_count for item in database_summaries),
            collection_window_start=cutoff.isoformat(),
            collection_window_end=collected_at,
        )
        return daily_usage, database_summaries, performance_summary

    def _build_activity_query(
        self,
        source_definition: dict[str, Any],
        available_columns: list[str],
        top_n: int,
    ) -> str:
        """Build a parameterized query for a capability-probed activity source."""
        del top_n

        normalized_columns = {
            self._normalize_column_name(column): column for column in available_columns
        }
        time_column = self._find_available_column(
            normalized_columns, source_definition["time_candidates"]
        )
        if time_column is None:
            raise ServerlessActivityExpectedError(
                "query-shape",
                f"{source_definition['name']} is missing a compatible time column",
            )

        select_expressions: list[str] = []
        for alias, candidates in source_definition["select_candidates"].items():
            column = self._find_available_column(normalized_columns, candidates)
            if column is None:
                continue
            select_expressions.append(f"{self._quote_identifier(column)} AS {alias}")

        if not any(" AS start_time" in expr for expr in select_expressions):
            select_expressions.append(
                f"{self._quote_identifier(time_column)} AS start_time"
            )

        if not select_expressions:
            raise ServerlessActivityExpectedError(
                "query-shape",
                f"{source_definition['name']} does not expose compatible columns",
            )

        request_id_column = self._find_available_column(
            normalized_columns,
            source_definition["select_candidates"].get("request_id", ()),
        )
        order_by = [f"{self._quote_identifier(time_column)} DESC"]
        if request_id_column:
            order_by.append(f"{self._quote_identifier(request_id_column)} DESC")

        return f"""
WITH fat_activity_source AS (
    SELECT
        {", ".join(select_expressions)},
        ROW_NUMBER() OVER (ORDER BY {", ".join(order_by)}) AS __fat_row_number
    FROM {source_definition["name"]}
    WHERE {self._quote_identifier(time_column)} >= ?
)
SELECT *
FROM fat_activity_source
WHERE __fat_row_number <= ?
ORDER BY start_time DESC
"""

    def _build_activity_aggregate_query(
        self,
        source_definition: dict[str, Any],
        available_columns: list[str],
    ) -> str:
        """Build full-window daily/database aggregate SQL for a history source."""
        normalized_columns = {
            self._normalize_column_name(column): column for column in available_columns
        }
        time_column = self._find_available_column(
            normalized_columns, source_definition["time_candidates"]
        )
        if time_column is None:
            raise ServerlessActivityExpectedError(
                "query-shape",
                f"{source_definition['name']} is missing a compatible time column",
            )

        database_column = self._find_available_column(
            normalized_columns,
            source_definition["select_candidates"].get("database_name", ()),
        )
        elapsed_column = self._find_available_column(
            normalized_columns,
            source_definition["select_candidates"].get("elapsed_time_ms", ()),
        )
        status_column = self._find_available_column(
            normalized_columns,
            source_definition["select_candidates"].get("status", ()),
        )

        database_expression = (
            f"COALESCE(CAST({self._quote_identifier(database_column)} AS "
            "nvarchar(128)), 'Unknown')"
            if database_column
            else "CAST('Unknown' AS nvarchar(128))"
        )
        elapsed_expression = (
            f"COALESCE(CAST({self._quote_identifier(elapsed_column)} AS bigint), 0)"
            if elapsed_column
            else "CAST(0 AS bigint)"
        )
        processed_expression = self._build_processed_bytes_expression(
            normalized_columns, source_definition
        )
        if status_column:
            status_expression = (
                f"LOWER(CAST({self._quote_identifier(status_column)} AS "
                "nvarchar(128)))"
            )
            success_expression = (
                f"CASE WHEN {status_expression} IN "
                "('succeeded', 'success', 'completed', 'complete') THEN 1 ELSE 0 END"
            )
            cancelled_expression = (
                f"CASE WHEN {status_expression} IN "
                "('cancelled', 'canceled') THEN 1 ELSE 0 END"
            )
            failure_expression = (
                f"CASE WHEN {status_expression} IS NOT NULL "
                f"AND {status_expression} NOT IN "
                "('succeeded', 'success', 'completed', 'complete', "
                "'cancelled', 'canceled') THEN 1 ELSE 0 END"
            )
        else:
            success_expression = "0"
            cancelled_expression = "0"
            failure_expression = "0"

        quoted_time = self._quote_identifier(time_column)
        group_by_expressions = [f"CONVERT(date, {quoted_time})"]
        if database_column:
            group_by_expressions.append(database_expression)
        return f"""
SELECT
    CONVERT(date, {quoted_time}) AS activity_date,
    {database_expression} AS database_name,
    COUNT_BIG(*) AS query_count,
    SUM({processed_expression}) AS processed_bytes,
    SUM({elapsed_expression}) AS total_elapsed_time_ms,
    MAX({elapsed_expression}) AS max_elapsed_time_ms,
    SUM({success_expression}) AS success_count,
    SUM({failure_expression}) AS failure_count,
    SUM({cancelled_expression}) AS cancelled_count,
    SUM(CASE WHEN {quoted_time} >= ? THEN 1 ELSE 0 END) AS queries_last_24h
FROM {source_definition["name"]}
WHERE {quoted_time} >= ?
GROUP BY {", ".join(group_by_expressions)}
ORDER BY activity_date, database_name
"""

    def _build_processed_bytes_expression(
        self,
        normalized_columns: dict[str, str],
        source_definition: dict[str, Any],
    ) -> str:
        """Build a byte expression from whichever processed-data columns exist."""
        candidates = source_definition["select_candidates"]
        processed_bytes_column = self._find_available_column(
            normalized_columns, candidates.get("processed_bytes", ())
        )
        if processed_bytes_column:
            return (
                f"COALESCE(CAST({self._quote_identifier(processed_bytes_column)} "
                "AS bigint), 0)"
            )

        processed_mb_column = self._find_available_column(
            normalized_columns, candidates.get("processed_mb", ())
        )
        if processed_mb_column:
            return (
                f"CAST(COALESCE({self._quote_identifier(processed_mb_column)}, 0) "
                "* 1048576 AS bigint)"
            )

        component_expressions = []
        for alias in (
            "remote_processed_mb",
            "memory_processed_mb",
            "disk_processed_mb",
        ):
            column = self._find_available_column(
                normalized_columns, candidates.get(alias, ())
            )
            if column:
                component_expressions.append(
                    f"COALESCE({self._quote_identifier(column)}, 0)"
                )
        if component_expressions:
            return (
                "CAST((" + " + ".join(component_expressions) + ") "
                "* 1048576 AS bigint)"
            )
        return "CAST(0 AS bigint)"

    def _normalize_history_row(
        self, row: Any, source_name: str
    ) -> SynapseServerlessQueryActivity:
        """Normalize a history row from any supported detailed source."""
        processed_bytes = self._get_numeric_value(getattr(row, "processed_bytes", None))
        processed_mb = self._get_numeric_value(getattr(row, "processed_mb", None))
        remote_mb = self._get_numeric_value(getattr(row, "remote_processed_mb", None))
        memory_mb = self._get_numeric_value(getattr(row, "memory_processed_mb", None))
        disk_mb = self._get_numeric_value(getattr(row, "disk_processed_mb", None))

        if processed_bytes is None and processed_mb is not None:
            processed_bytes = self._mb_to_bytes(processed_mb)

        remote_bytes = self._mb_to_bytes(remote_mb) if remote_mb is not None else None
        memory_bytes = self._mb_to_bytes(memory_mb) if memory_mb is not None else None
        disk_bytes = self._mb_to_bytes(disk_mb) if disk_mb is not None else None

        if processed_bytes is None:
            component_sum = sum(
                value for value in [remote_bytes, memory_bytes, disk_bytes] if value
            )
            processed_bytes = component_sum or None

        return SynapseServerlessQueryActivity(
            source_name=source_name,
            request_id=self._string_or_none(getattr(row, "request_id", None)),
            session_id=self._int_or_none(getattr(row, "session_id", None)),
            connection_id=self._string_or_none(getattr(row, "connection_id", None)),
            query_hash=self._string_or_none(getattr(row, "query_hash", None)),
            database_name=self._string_or_none(getattr(row, "database_name", None)),
            principal_name=self._string_or_none(getattr(row, "principal_name", None)),
            status=self._normalize_status(getattr(row, "status", None)),
            submit_time=self._to_isoformat(getattr(row, "submit_time", None)),
            start_time=self._to_isoformat(getattr(row, "start_time", None)),
            end_time=self._to_isoformat(getattr(row, "end_time", None)),
            elapsed_time_ms=self._int_or_none(getattr(row, "elapsed_time_ms", None)),
            processed_bytes=self._int_or_none(processed_bytes),
            remote_processed_bytes=self._int_or_none(remote_bytes),
            memory_processed_bytes=self._int_or_none(memory_bytes),
            disk_processed_bytes=self._int_or_none(disk_bytes),
            row_count=self._int_or_none(getattr(row, "row_count", None)),
            statement_type=self._string_or_none(getattr(row, "statement_type", None)),
            program_name=self._string_or_none(getattr(row, "program_name", None)),
            error_code=self._int_or_none(getattr(row, "error_code", None)),
            query_text=self._string_or_none(getattr(row, "query_text", None)),
        )

    def _normalize_supplemental_metric(
        self, row: Any, source_name: str
    ) -> SynapseServerlessTopQueryMetric:
        """Normalize a supplemental aggregate source into a safe top-query metric."""
        return SynapseServerlessTopQueryMetric(
            source_name=source_name,
            request_id=self._string_or_none(getattr(row, "request_id", None)),
            session_id=self._int_or_none(getattr(row, "session_id", None)),
            query_hash=self._string_or_none(getattr(row, "query_hash", None)),
            start_time=self._to_isoformat(getattr(row, "start_time", None)),
            elapsed_time_ms=self._int_or_none(getattr(row, "elapsed_time_ms", None)),
        )

    def _deduplicate_queries(
        self, queries: list[SynapseServerlessQueryActivity]
    ) -> list[SynapseServerlessQueryActivity]:
        """Merge overlapping query rows from multiple detailed sources."""
        merged: dict[str, SynapseServerlessQueryActivity] = {}
        for query in queries:
            key = self._query_dedup_key(query)
            if key not in merged:
                merged[key] = query
                continue
            merged[key] = self._merge_query_activity(merged[key], query)
        return list(merged.values())

    def _filter_and_limit_queries(
        self,
        queries: list[SynapseServerlessQueryActivity],
        cutoff: datetime,
        top_n: int,
    ) -> list[SynapseServerlessQueryActivity]:
        """Apply defensive cutoff filtering and final top-N capping in Python."""
        filtered = []
        for query in queries:
            query_time = self._parse_timestamp(query.start_time)
            if query_time is not None and query_time < cutoff:
                continue
            filtered.append(query)

        filtered.sort(
            key=lambda item: (
                self._parse_timestamp(item.start_time) or datetime.min,
                self._score_query_activity(item),
            ),
            reverse=True,
        )
        return filtered[:top_n]

    def _build_daily_database_usage(
        self, queries: list[SynapseServerlessQueryActivity]
    ) -> list[SynapseServerlessDailyDatabaseUsage]:
        """Aggregate detailed queries by database and day."""
        groups: dict[tuple[str, str], dict[str, float]] = {}
        for query in queries:
            start_time = self._parse_timestamp(query.start_time)
            if start_time is None:
                continue
            database_name = query.database_name or "Unknown"
            key = (start_time.date().isoformat(), database_name)
            groups.setdefault(
                key,
                {
                    "query_count": 0,
                    "processed_bytes": 0,
                    "total_elapsed_time_ms": 0,
                },
            )
            groups[key]["query_count"] += 1
            groups[key]["processed_bytes"] += query.processed_bytes or 0
            groups[key]["total_elapsed_time_ms"] += query.elapsed_time_ms or 0

        results = [
            SynapseServerlessDailyDatabaseUsage(
                date=date_key,
                database_name=database_name,
                query_count=int(values["query_count"]),
                processed_bytes=int(values["processed_bytes"]),
                total_elapsed_time_ms=int(values["total_elapsed_time_ms"]),
                average_elapsed_time_ms=(
                    round(
                        values["total_elapsed_time_ms"] / values["query_count"],
                        2,
                    )
                    if values["query_count"]
                    else 0.0
                ),
            )
            for (date_key, database_name), values in groups.items()
        ]
        results.sort(key=lambda item: (item.date, item.database_name))
        return results

    def _build_database_summaries(
        self, queries: list[SynapseServerlessQueryActivity]
    ) -> list[SynapseServerlessDatabaseSummary]:
        """Aggregate detailed queries by database."""
        groups: dict[str, dict[str, int]] = defaultdict(
            lambda: {
                "query_count": 0,
                "processed_bytes": 0,
                "total_elapsed_time_ms": 0,
                "max_elapsed_time_ms": 0,
                "success_count": 0,
                "failure_count": 0,
                "cancelled_count": 0,
            }
        )

        for query in queries:
            database_name = query.database_name or "Unknown"
            values = groups[database_name]
            values["query_count"] += 1
            values["processed_bytes"] += query.processed_bytes or 0
            values["total_elapsed_time_ms"] += query.elapsed_time_ms or 0
            values["max_elapsed_time_ms"] = max(
                values["max_elapsed_time_ms"], query.elapsed_time_ms or 0
            )

            normalized_status = self._normalize_status(query.status)
            if normalized_status == "Succeeded":
                values["success_count"] += 1
            elif normalized_status == "Canceled":
                values["cancelled_count"] += 1
            elif normalized_status:
                values["failure_count"] += 1

        results = [
            SynapseServerlessDatabaseSummary(
                database_name=database_name,
                query_count=values["query_count"],
                processed_bytes=values["processed_bytes"],
                average_elapsed_time_ms=(
                    round(
                        values["total_elapsed_time_ms"] / values["query_count"],
                        2,
                    )
                    if values["query_count"]
                    else 0.0
                ),
                max_elapsed_time_ms=values["max_elapsed_time_ms"],
                success_count=values["success_count"],
                failure_count=values["failure_count"],
                cancelled_count=values["cancelled_count"],
            )
            for database_name, values in groups.items()
        ]
        results.sort(key=lambda item: (-item.processed_bytes, item.database_name))
        return results

    def _build_performance_summary(
        self,
        queries: list[SynapseServerlessQueryActivity],
        cutoff: datetime,
        collected_at: str,
        fallback_slowest: list[SynapseServerlessTopQueryMetric],
    ) -> SynapseServerlessPerformanceSummary:
        """Build the overall performance summary from detailed queries."""
        total_queries = len(queries)
        total_processed_bytes = sum(query.processed_bytes or 0 for query in queries)
        total_elapsed_time_ms = sum(query.elapsed_time_ms or 0 for query in queries)
        max_elapsed_time_ms = max(
            (query.elapsed_time_ms or 0 for query in queries), default=0
        )
        success_count = 0
        failure_count = 0
        cancelled_count = 0

        for query in queries:
            normalized_status = self._normalize_status(query.status)
            if normalized_status == "Succeeded":
                success_count += 1
            elif normalized_status == "Canceled":
                cancelled_count += 1
            elif normalized_status:
                failure_count += 1

        top_slowest = self._top_query_metrics(
            queries, key=lambda item: item.elapsed_time_ms or 0
        )
        top_largest = self._top_query_metrics(
            queries, key=lambda item: item.processed_bytes or 0
        )

        if not top_slowest:
            top_slowest = fallback_slowest[:10]

        return SynapseServerlessPerformanceSummary(
            total_queries=total_queries,
            queries_last_24h=None,
            total_processed_bytes=total_processed_bytes,
            total_elapsed_time_ms=total_elapsed_time_ms,
            average_elapsed_time_ms=(
                round(total_elapsed_time_ms / total_queries, 2)
                if total_queries
                else 0.0
            ),
            max_elapsed_time_ms=max_elapsed_time_ms,
            success_count=success_count,
            failure_count=failure_count,
            cancelled_count=cancelled_count,
            collection_window_start=cutoff.isoformat(),
            collection_window_end=collected_at,
            top_slowest_queries=top_slowest,
            top_largest_queries=top_largest,
        )

    def _count_queries_since(
        self,
        queries: list[SynapseServerlessQueryActivity],
        cutoff: datetime,
    ) -> int:
        """Count normalized queries at or after a cutoff."""
        return sum(
            1
            for query in queries
            if (self._parse_timestamp(query.start_time) or datetime.min) >= cutoff
        )

    def _top_query_metrics(
        self,
        queries: list[SynapseServerlessQueryActivity],
        key: Any,
        limit: int = 10,
    ) -> list[SynapseServerlessTopQueryMetric]:
        """Create visualization-safe top query metrics."""
        ranked = sorted(queries, key=key, reverse=True)
        metrics = []
        for query in ranked[:limit]:
            metrics.append(
                SynapseServerlessTopQueryMetric(
                    source_name=query.source_name,
                    request_id=query.request_id,
                    session_id=query.session_id,
                    connection_id=query.connection_id,
                    query_hash=query.query_hash,
                    database_name=query.database_name,
                    principal_name=query.principal_name,
                    status=query.status,
                    start_time=query.start_time,
                    end_time=query.end_time,
                    elapsed_time_ms=query.elapsed_time_ms,
                    processed_bytes=query.processed_bytes,
                )
            )
        return metrics

    @staticmethod
    def _normalize_status(value: Any) -> Optional[str]:
        """Normalize status values across activity sources."""
        if value is None:
            return None
        normalized = str(value).strip()
        lower = normalized.lower()
        if lower in ("succeeded", "success", "completed", "complete"):
            return "Succeeded"
        if lower in ("failed", "failure", "error"):
            return "Failed"
        if lower in ("canceled", "cancelled"):
            return "Canceled"
        return normalized

    @staticmethod
    def _normalize_column_name(column_name: str) -> str:
        """Normalize a column name for capability-probe matching."""
        return column_name.strip().lower()

    @staticmethod
    def _find_available_column(
        available_columns: dict[str, str], candidates: Sequence[str]
    ) -> Optional[str]:
        """Find the first available original column name for a set of candidates."""
        for candidate in candidates:
            original = available_columns.get(candidate.strip().lower())
            if original:
                return original
        return None

    @staticmethod
    def _quote_identifier(identifier: str) -> str:
        """Quote an identifier for SQL Server."""
        return f"[{identifier.replace(']', ']]')}]"

    @staticmethod
    def _string_or_none(value: Any) -> Optional[str]:
        """Convert a value to a trimmed string."""
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @staticmethod
    def _int_or_none(value: Any) -> Optional[int]:
        """Convert a value to an int when possible."""
        numeric = OdbcClient._get_numeric_value(value)
        return int(numeric) if numeric is not None else None

    @staticmethod
    def _get_numeric_value(value: Any) -> Optional[float]:
        """Convert a numeric-like value to float."""
        if value is None:
            return None
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, (int, float)):
            return float(value)
        try:
            return float(str(value))
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _mb_to_bytes(value: Optional[float]) -> Optional[int]:
        """Convert MB values to bytes."""
        if value is None:
            return None
        return int(round(value * 1024 * 1024))

    @staticmethod
    def _to_isoformat(value: Any) -> Optional[str]:
        """Normalize datetime-like values to ISO 8601 strings."""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.isoformat()
        text = str(value).strip()
        return text or None

    @staticmethod
    def _parse_timestamp(value: Optional[str]) -> Optional[datetime]:
        """Parse an ISO-like timestamp string."""
        if not value:
            return None
        candidate = value.strip()
        try:
            if candidate.endswith("Z"):
                return datetime.fromisoformat(candidate.replace("Z", "+00:00")).replace(
                    tzinfo=None
                )
            return datetime.fromisoformat(candidate)
        except ValueError:
            return None

    @staticmethod
    def _query_dedup_key(query: SynapseServerlessQueryActivity) -> str:
        """Build a stable deduplication key for overlapping sources."""
        if query.request_id:
            return f"request:{query.request_id.lower()}"
        if query.query_hash and query.start_time:
            return (
                f"hash:{query.query_hash.lower()}:{query.start_time}:"
                f"{(query.database_name or '').lower()}"
            )
        text_hash = hashlib.sha256((query.query_text or "").encode("utf-8")).hexdigest()
        return (
            f"fallback:{query.session_id}:{query.start_time}:{query.end_time}:"
            f"{(query.database_name or '').lower()}:{text_hash}"
        )

    @staticmethod
    def _score_query_activity(query: SynapseServerlessQueryActivity) -> int:
        """Score a query row by how much information it contains."""
        populated_fields = [
            query.request_id,
            query.session_id,
            query.connection_id,
            query.query_hash,
            query.database_name,
            query.principal_name,
            query.status,
            query.submit_time,
            query.start_time,
            query.end_time,
            query.elapsed_time_ms,
            query.processed_bytes,
            query.row_count,
            query.statement_type,
            query.program_name,
            query.error_code,
            query.query_text,
        ]
        return sum(1 for value in populated_fields if value not in (None, ""))

    def _merge_query_activity(
        self,
        existing: SynapseServerlessQueryActivity,
        candidate: SynapseServerlessQueryActivity,
    ) -> SynapseServerlessQueryActivity:
        """Merge two detailed query rows, preserving the richest values."""
        if self._score_query_activity(candidate) > self._score_query_activity(existing):
            primary = candidate
            secondary = existing
        else:
            primary = existing
            secondary = candidate

        for field_name in primary.__dataclass_fields__:
            if getattr(primary, field_name) in (None, "") and getattr(
                secondary, field_name
            ) not in (None, ""):
                setattr(primary, field_name, getattr(secondary, field_name))
        return primary

    @staticmethod
    def _replace_diagnostic(
        diagnostics: list[SynapseServerlessActivitySourceDiagnostic],
        source_name: str,
        replacement: SynapseServerlessActivitySourceDiagnostic,
    ) -> None:
        """Replace a probe diagnostic for a source."""
        for index, diagnostic in enumerate(diagnostics):
            if diagnostic.source_name == source_name:
                diagnostics[index] = replacement
                return

    def _expected_or_raise(
        self, exc: Exception, prefix: str
    ) -> ServerlessActivityExpectedError:
        """Wrap an expected SQL error, or re-raise unexpected exceptions."""
        message = self._classify_expected_serverless_error(exc)
        if message is None:
            raise exc
        return ServerlessActivityExpectedError("expected", f"{prefix}: {message}")

    @staticmethod
    def _classify_expected_serverless_error(exc: Exception) -> Optional[str]:
        """Classify expected serverless activity failures."""
        message = str(exc).strip()
        lowered = message.lower()

        expected_patterns = {
            "permission": (
                "permission",
                "denied",
                "not authorized",
                "does not have permission",
                "insufficient privileges",
            ),
            "missing-object": (
                "invalid object name",
                "cannot find the object",
                "does not exist",
                "is not supported",
                "unsupported",
            ),
            "missing-column": (
                "invalid column name",
                "multi-part identifier",
            ),
            "connection": (
                "login failed",
                "network-related",
                "server was not found",
                "could not open a connection",
                "cannot open server",
                "timeout expired",
                "timeout error",
                "tcp provider",
                "temporarily unavailable",
                "sql authentication requires",
                "service principal authentication requires",
            ),
        }

        for category, patterns in expected_patterns.items():
            if any(pattern in lowered for pattern in patterns):
                return f"{category}: {message}"
        return None
