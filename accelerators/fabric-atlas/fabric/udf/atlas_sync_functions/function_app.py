import contextlib
import contextvars
import datetime
import email.utils
import base64
import binascii
import hashlib
import importlib
import json
import math
import numbers
import re
import socket
import struct
import time
import uuid
import urllib.request
import urllib.error
import urllib.parse

import fabric.functions as fn

udf = fn.UserDataFunctions()

FABRIC = "https://api.fabric.microsoft.com/v1"
PBI = "https://api.powerbi.com/v1.0/myorg"
ADMIN = PBI + "/admin"
FABRIC_UDF_TIMEOUT_SECONDS = 200
PLATFORM_COMPLETION_RESERVE_SECONDS = 20
EXECUTION_BUDGET_SECONDS = (
    FABRIC_UDF_TIMEOUT_SECONDS - PLATFORM_COMPLETION_RESERVE_SECONDS
)
REQUEST_TIMEOUT_SECONDS = 20
MAX_REQUEST_ATTEMPTS = 4
MAX_BACKOFF_SECONDS = 8
MAX_RESPONSE_BYTES = 25 * 1024 * 1024
MAX_UPSTREAM_RESPONSE_BYTES = 25 * 1024 * 1024
RESPONSE_READ_CHUNK_BYTES = 64 * 1024
MAX_DEFINITION_PARTS = 500
MAX_DEFINITION_DECODED_BYTES = 8 * 1024 * 1024
MAX_DEFINITION_FACTS_PER_ITEM = 1000
MAX_SCHEMA_OBJECTS_PER_ITEM = 1000
MAX_SCHEMA_COLUMNS_PER_OBJECT = 500
MAX_SQL_CATALOG_ROWS = 50000
MAX_SQL_RELATIONSHIP_ROWS = 5000
MAX_SQL_TOKEN_CHARACTERS = 65536
MAX_SYNC_ITEM_IDS_CHARACTERS = 65536
MIN_ENRICHMENT_ITEM_BUDGET_SECONDS = 30
MAX_ARTIFACT_METADATA_ELEMENTS = 2048
MAX_ARTIFACT_METADATA_COLLECTION = 512
SQL_COPT_SS_ACCESS_TOKEN = 1256

SQL_OBJECTS_QUERY = """
SELECT TOP (50001)
    schemas.name,
    objects.name,
    objects.type,
    columns.name,
    types.name,
    columns.column_id
FROM sys.objects AS objects
INNER JOIN sys.schemas AS schemas
    ON schemas.schema_id = objects.schema_id
LEFT JOIN sys.columns AS columns
    ON columns.object_id = objects.object_id
LEFT JOIN sys.types AS types
    ON types.user_type_id = columns.user_type_id
WHERE objects.type IN ('U', 'V')
  AND objects.is_ms_shipped = 0
ORDER BY schemas.name, objects.name, columns.column_id;
""".strip()

SQL_PRIMARY_KEYS_QUERY = """
SELECT TOP (5001)
    schemas.name,
    tables.name,
    key_constraints.name,
    columns.name,
    index_columns.key_ordinal
FROM sys.key_constraints AS key_constraints
INNER JOIN sys.tables AS tables
    ON tables.object_id = key_constraints.parent_object_id
INNER JOIN sys.schemas AS schemas
    ON schemas.schema_id = tables.schema_id
INNER JOIN sys.index_columns AS index_columns
    ON index_columns.object_id = tables.object_id
   AND index_columns.index_id = key_constraints.unique_index_id
INNER JOIN sys.columns AS columns
    ON columns.object_id = index_columns.object_id
   AND columns.column_id = index_columns.column_id
WHERE key_constraints.type = 'PK'
ORDER BY schemas.name, tables.name, key_constraints.name,
         index_columns.key_ordinal;
""".strip()

SQL_FOREIGN_KEYS_QUERY = """
SELECT TOP (5001)
    foreign_keys.name,
    source_schemas.name,
    source_tables.name,
    source_columns.name,
    target_schemas.name,
    target_tables.name,
    target_columns.name,
    foreign_key_columns.constraint_column_id
FROM sys.foreign_keys AS foreign_keys
INNER JOIN sys.foreign_key_columns AS foreign_key_columns
    ON foreign_key_columns.constraint_object_id = foreign_keys.object_id
INNER JOIN sys.tables AS source_tables
    ON source_tables.object_id = foreign_key_columns.parent_object_id
INNER JOIN sys.schemas AS source_schemas
    ON source_schemas.schema_id = source_tables.schema_id
INNER JOIN sys.columns AS source_columns
    ON source_columns.object_id = foreign_key_columns.parent_object_id
   AND source_columns.column_id = foreign_key_columns.parent_column_id
INNER JOIN sys.tables AS target_tables
    ON target_tables.object_id = foreign_key_columns.referenced_object_id
INNER JOIN sys.schemas AS target_schemas
    ON target_schemas.schema_id = target_tables.schema_id
INNER JOIN sys.columns AS target_columns
    ON target_columns.object_id = foreign_key_columns.referenced_object_id
   AND target_columns.column_id = foreign_key_columns.referenced_column_id
ORDER BY foreign_keys.name, foreign_key_columns.constraint_column_id;
""".strip()


class DeadlineExceeded(RuntimeError):
    pass


class RequestTimeout(RuntimeError):
    pass


class RetryAfterDeferred(RuntimeError):
    pass


class ResponseSizeExceeded(RuntimeError):
    pass


class PaginationError(RuntimeError):
    pass


class ScannerError(RuntimeError):
    pass


class DefinitionError(RuntimeError):
    pass


class SqlRuntimeUnavailable(RuntimeError):
    pass


class SqlConnectionError(RuntimeError):
    pass


class SqlAuthorizationError(RuntimeError):
    pass


class SqlCatalogQueryError(RuntimeError):
    pass


SLICE_RETRY_ERRORS = (
    DeadlineExceeded,
    RequestTimeout,
    RetryAfterDeferred,
)


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


_HTTP_OPENER = urllib.request.build_opener(_NoRedirectHandler())


def _open_request(request, timeout):
    return _HTTP_OPENER.open(request, timeout=timeout)


class _ExecutionDeadline:
    def __init__(self, seconds=EXECUTION_BUDGET_SECONDS, clock=None):
        self.clock = clock or time.monotonic
        self.expires_at = self.clock() + seconds

    def remaining(self):
        return self.expires_at - self.clock()

    def request_timeout(self, bounded_timeout=REQUEST_TIMEOUT_SECONDS):
        remaining = self.remaining()
        if remaining <= 0:
            raise DeadlineExceeded("execution deadline exhausted")
        return min(max(0.001, bounded_timeout), remaining)

    def checkpoint(self, reserve_seconds=0):
        if self.remaining() <= reserve_seconds:
            raise DeadlineExceeded("execution deadline exhausted")

    def sleep(self, seconds, sleeper=None):
        if seconds <= 0:
            return
        if seconds >= self.remaining():
            raise DeadlineExceeded("execution deadline exhausted")
        (sleeper or time.sleep)(seconds)

    def retry_sleep(self, seconds, sleeper=None):
        if seconds >= self.remaining():
            raise RetryAfterDeferred(
                "retry delay exceeds the remaining execution budget"
            )
        (sleeper or time.sleep)(seconds)


_ACTIVE_DEADLINE = contextvars.ContextVar(
    "atlas_sync_deadline",
    default=None,
)


@contextlib.contextmanager
def _deadline_scope(deadline):
    token = _ACTIVE_DEADLINE.set(deadline)
    try:
        yield deadline
    finally:
        _ACTIVE_DEADLINE.reset(token)


def _workspace_id(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise ValueError("workspaceId must be a valid UUID")


def _item_id(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise ValueError("item ID must be a valid UUID")


def _fabric_url(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.netloc.lower() != "api.fabric.microsoft.com":
        raise ValueError("Fabric continuation URL used an unexpected origin")
    return url


def _retry_after_seconds(headers, wall_clock=None):
    value = headers.get("Retry-After") if headers else None
    if value is None:
        return None
    try:
        return max(0.0, float(value))
    except (TypeError, ValueError):
        try:
            retry_at = email.utils.parsedate_to_datetime(str(value))
        except (TypeError, ValueError, OverflowError):
            return None
        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=datetime.timezone.utc)
        now = (
            wall_clock()
            if wall_clock
            else datetime.datetime.now(datetime.timezone.utc)
        )
        if now.tzinfo is None:
            now = now.replace(tzinfo=datetime.timezone.utc)
        return max(0.0, (retry_at - now).total_seconds())


def _set_response_timeout(response, timeout):
    candidates = [
        getattr(getattr(getattr(response, "fp", None), "raw", None), "_sock", None),
        getattr(getattr(response, "fp", None), "_sock", None),
        getattr(getattr(response, "raw", None), "_sock", None),
    ]
    for candidate in candidates:
        if candidate is not None and hasattr(candidate, "settimeout"):
            candidate.settimeout(timeout)
            return


def _read_response_bytes(response, deadline, attempt_expires_at):
    payload = bytearray()
    while True:
        remaining = min(
            deadline.remaining(),
            attempt_expires_at - deadline.clock(),
        )
        if remaining <= 0:
            if deadline.remaining() <= 0:
                raise DeadlineExceeded("execution deadline exhausted")
            raise RequestTimeout("request deadline exhausted")
        _set_response_timeout(response, max(0.001, remaining))
        chunk = response.read(
            min(
                RESPONSE_READ_CHUNK_BYTES,
                MAX_UPSTREAM_RESPONSE_BYTES + 1 - len(payload),
            )
        )
        if not chunk:
            break
        payload.extend(chunk)
        if len(payload) > MAX_UPSTREAM_RESPONSE_BYTES:
            raise ResponseSizeExceeded(
                "upstream response exceeded the safe size limit"
            )
        if deadline.remaining() <= 0:
            raise DeadlineExceeded("execution deadline exhausted")
        if deadline.clock() >= attempt_expires_at:
            raise RequestTimeout("request deadline exhausted")
    return bytes(payload)


def _req_response(
    token,
    url,
    method="GET",
    body=None,
    headers=None,
    deadline=None,
    per_request_timeout=REQUEST_TIMEOUT_SECONDS,
    max_attempts=MAX_REQUEST_ATTEMPTS,
    sleeper=None,
    wall_clock=None,
):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    for name, value in (headers or {}).items():
        req.add_header(name, value)
    active_deadline = (
        deadline
        or _ACTIVE_DEADLINE.get()
        or _ExecutionDeadline()
    )
    for attempt in range(max_attempts):
        timeout = active_deadline.request_timeout(per_request_timeout)
        attempt_expires_at = active_deadline.clock() + timeout
        try:
            with _open_request(req, timeout=timeout) as response:
                payload = _read_response_bytes(
                    response,
                    active_deadline,
                    attempt_expires_at,
                )
                text = payload.decode("utf-8")
                status = getattr(
                    response,
                    "status",
                    getattr(response, "code", 200),
                )
                response_headers = getattr(response, "headers", {}) or {}
                return (
                    int(status),
                    response_headers,
                    json.loads(text) if text else {},
                )
        except urllib.error.HTTPError as error:
            retryable = error.code == 429 or 500 <= error.code <= 599
            if not retryable or attempt + 1 >= max_attempts:
                raise
            retry_after = _retry_after_seconds(
                error.headers,
                wall_clock=wall_clock,
            )
            delay = (
                retry_after
                if retry_after is not None
                else min(MAX_BACKOFF_SECONDS, 0.5 * (2 ** attempt))
            )
            active_deadline.retry_sleep(delay, sleeper=sleeper)
        except (TimeoutError, socket.timeout) as error:
            if attempt + 1 >= max_attempts:
                raise RequestTimeout("request timed out") from error
            active_deadline.sleep(
                min(MAX_BACKOFF_SECONDS, 0.5 * (2 ** attempt)),
                sleeper=sleeper,
            )
        except urllib.error.URLError as error:
            if not isinstance(error.reason, (TimeoutError, socket.timeout)):
                raise
            if attempt + 1 >= max_attempts:
                raise RequestTimeout("request timed out") from error
            active_deadline.sleep(
                min(MAX_BACKOFF_SECONDS, 0.5 * (2 ** attempt)),
                sleeper=sleeper,
            )
    raise RuntimeError("request attempts exhausted")


def _req(
    token,
    url,
    method="GET",
    body=None,
    headers=None,
    deadline=None,
    per_request_timeout=REQUEST_TIMEOUT_SECONDS,
    max_attempts=MAX_REQUEST_ATTEMPTS,
    sleeper=None,
    wall_clock=None,
):
    return _req_response(
        token,
        url,
        method=method,
        body=body,
        headers=headers,
        deadline=deadline,
        per_request_timeout=per_request_timeout,
        max_attempts=max_attempts,
        sleeper=sleeper,
        wall_clock=wall_clock,
    )[2]


def _get(token, url):
    return _req(token, url)


def _get_all(token, path):
    items = []
    url = FABRIC + path
    visited = set()
    while url:
        url = _fabric_url(url)
        if url in visited:
            raise PaginationError("Fabric pagination repeated a URL")
        visited.add(url)
        data = _get(token, url)
        if isinstance(data, dict):
            items.extend(data.get("value", []))
            url = data.get("continuationUri")
        else:
            raise ValueError("Fabric list response was not an object")
    return items


def _get_all_data(token, path):
    items = []
    url = FABRIC + path
    visited = set()
    while url:
        url = _fabric_url(url)
        if url in visited:
            raise PaginationError("Fabric data pagination repeated a URL")
        visited.add(url)
        data = _get(token, url)
        if not isinstance(data, dict):
            raise ValueError("Fabric data-list response was not an object")
        values = data.get("data", [])
        if not isinstance(values, list):
            raise ValueError("Fabric data-list response did not contain a list")
        items.extend(values)
        url = data.get("continuationUri")
    return items


@udf.function()
def ping(name: str) -> str:
    return "pong: " + name


# ---- admin scanner: the one source that returns per-item access + lineage ----

def _scan_workspace(token, ws):
    start = _req(
        token,
        ADMIN
        + "/workspaces/getInfo"
        + "?lineage=True&getArtifactUsers=True"
        + "&datasetSchema=True&datasetExpressions=True",
        method="POST",
        body={"workspaces": [ws]},
    )
    scan_id = start.get("id")
    if not scan_id:
        raise ScannerError("scanner did not return an operation id")
    for _ in range(30):
        st = _get(token, ADMIN + f"/workspaces/scanStatus/{scan_id}")
        if st.get("status") == "Succeeded":
            break
        if st.get("status") == "Failed":
            raise ScannerError("scanner operation failed")
        deadline = _ACTIVE_DEADLINE.get() or _ExecutionDeadline()
        deadline.sleep(2)
    else:
        raise ScannerError("scanner operation did not complete")
    res = _get(token, ADMIN + f"/workspaces/scanResult/{scan_id}")
    wss = res.get("workspaces") or []
    if not isinstance(wss, list) or not wss:
        raise ScannerError("scanner result omitted the workspace")
    return wss[0]


# scanner artifact array key -> Atlas item type
ART_KEYS = {
    "reports": "Report",
    "datasets": "SemanticModel",
    "dashboards": "Dashboard",
    "dataflows": "Dataflow",
    "datamarts": "Datamart",
    "Lakehouse": "Lakehouse",
    "Notebook": "Notebook",
    "DataPipeline": "DataPipeline",
    "warehouses": "Warehouse",
    "Warehouses": "Warehouse",
    "SQLDatabase": "SQLDatabase",
    "SQLDatabases": "SQLDatabase",
    "sqlDatabases": "SQLDatabase",
    "Eventhouse": "Eventhouse",
    "KQLDatabase": "KQLDatabase",
    "Ontology": "Ontology",
    "GraphModel": "GraphModel",
    "DataAgent": "DataAgent",
    "UserDataFunction": "UserDataFunction",
    "SQLAnalyticsEndpoint": "SQLEndpoint",
    "MirroredDatabase": "MirroredDatabase",
    "Eventstream": "Eventstream",
}

ITEM_TYPE_ALIASES = {
    "SQLAnalyticsEndpoint": "SQLEndpoint",
    "SqlDatabase": "SQLDatabase",
    "SQL Database": "SQLDatabase",
}

REL_LABEL = {
    "Datasource": "reads",
    "Association": "Direct Lake",
    "CascadeDelete": "SQL endpoint",
}


def _normalized_id(value):
    text = _strict_text(value)
    if not text:
        return None
    try:
        return str(uuid.UUID(text))
    except ValueError:
        return text


def _object_slug(value):
    text = _strict_text(value)
    if not text:
        return None
    return re.sub(r"[^a-z0-9]+", "-", text.casefold()).strip("-")


def _fabric_object_id(item_id, object_kind, identifier):
    normalized_item_id = _normalized_id(item_id)
    kind = _object_slug(object_kind)
    identity = (
        _strict_text(str(identifier))
        if identifier is not None
        else None
    )
    if not normalized_item_id or not kind or not identity:
        return None
    result = (
        "fabric-object://"
        + urllib.parse.quote(normalized_item_id, safe="")
        + "/"
        + kind
        + "/"
        + urllib.parse.quote(identity, safe="")
    )
    if len(result) <= 240:
        return result
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()
    return (
        "fabric-object://"
        + urllib.parse.quote(normalized_item_id, safe="")
        + "/"
        + kind
        + "/sha256-"
        + digest
    )


def _bounded_text(value, max_length=256):
    text = _strict_text(value)
    if not text:
        return None
    return text[:max_length]


def _schema_object_kind(item_type, object_type):
    item = _strict_text(item_type) or "item"
    kind = _strict_text(object_type) or "object"
    aliases = {
        ("Lakehouse", "Table"): "lakehouse-table",
        ("Lakehouse", "Managed"): "lakehouse-table",
        ("Lakehouse", "External"): "lakehouse-table",
        ("Warehouse", "Table"): "warehouse-table",
        ("Warehouse", "View"): "warehouse-view",
        ("SemanticModel", "Model table"): "semantic-model-table",
        ("KQLDatabase", "KQL table"): "kql-table",
        ("KQLDatabase", "KQL external table"): "kql-external-table",
        ("KQLDatabase", "KQL materialized view"): (
            "kql-materialized-view"
        ),
        ("KQLDatabase", "KQL function"): "kql-function",
        ("SQLDatabase", "SQL table"): "sql-table",
        ("SQLDatabase", "SQL view"): "sql-view",
    }
    return aliases.get((item, kind)) or _object_slug(kind) or "object"


def _metadata_object_kind(object_type, fallback="table"):
    value = (_strict_text(object_type) or "").casefold()
    mappings = {
        "table": "table",
        "managed": "table",
        "external": "table",
        "model table": "table",
        "kql table": "table",
        "kql external table": "table",
        "sql table": "table",
        "view": "view",
        "sql view": "view",
        "column": "column",
        "measure": "measure",
        "kql function": "function",
        "kql materialized view": "materializedView",
        "ontology entity": "entityType",
        "ontology property": "property",
        "ontology time-series property": "timeSeriesProperty",
        "ontology relationship": "relationshipType",
        "graph node": "nodeType",
        "graph edge": "edgeType",
        "graph property": "property",
        "data agent source": "dataSource",
        "data agent selected element": "selectedElement",
    }
    return mappings.get(value, fallback)


def _metadata_source_kind(value):
    text = (_strict_text(value) or "").casefold()
    if text.endswith("-column") or text.endswith("-field"):
        return "column"
    if text.endswith("-measure"):
        return "measure"
    if "function" in text:
        return "function"
    if "materialized-view" in text:
        return "materializedView"
    if text == "ontology-entity":
        return "entityType"
    if text == "ontology-property":
        return "property"
    if text == "ontology-relationship":
        return "relationshipType"
    if text == "graph-node":
        return "nodeType"
    if text == "graph-edge":
        return "edgeType"
    if "view" in text:
        return "view"
    return "table"


def _finalize_schema_object_ids(item_id, item_type, schema):
    result = []
    for table in schema or []:
        record = dict(table)
        object_kind = _schema_object_kind(
            item_type,
            record.get("objectType"),
        )
        object_id = _strict_text(record.get("objectId")) or _fabric_object_id(
            item_id,
            object_kind,
            record.get("name"),
        )
        if object_id:
            record["objectId"] = object_id
        columns = []
        for column in record.get("columns") or []:
            safe_column = dict(column)
            column_kind = (
                _object_slug(safe_column.get("objectType"))
                or f"{object_kind}-column"
            )
            column_id = _strict_text(
                safe_column.get("objectId")
            ) or _fabric_object_id(
                item_id,
                column_kind,
                f"{record.get('name')}/{safe_column.get('name')}",
            )
            if column_id:
                safe_column["objectId"] = column_id
            if object_id:
                safe_column.setdefault("parentObjectId", object_id)
            columns.append(safe_column)
        record["columns"] = columns
        measures = []
        for measure in record.get("measures") or []:
            safe_measure = dict(measure)
            measure_id = _strict_text(
                safe_measure.get("objectId")
            ) or _fabric_object_id(
                item_id,
                "semantic-model-measure",
                f"{record.get('name')}/{safe_measure.get('name')}",
            )
            if measure_id:
                safe_measure["objectId"] = measure_id
            if object_id:
                safe_measure.setdefault("parentObjectId", object_id)
            measures.append(safe_measure)
        record["measures"] = measures
        result.append(record)
    return result


def _object_edge_id(source_object_id, relation, target_object_id):
    source = _strict_text(source_object_id)
    label = _object_slug(relation)
    target = _strict_text(target_object_id)
    if not source or not label or not target:
        return None
    return (
        "fabric-edge://"
        + urllib.parse.quote(source, safe="")
        + "/"
        + label
        + "/"
        + urllib.parse.quote(target, safe="")
    )


def _metadata_object_ref(
    item_id,
    kind,
    object_id,
    name,
    parent_id=None,
    table_name=None,
):
    normalized_item_id = _normalized_id(item_id)
    safe_kind = _strict_text(kind)
    safe_id = _strict_text(object_id)
    safe_name = _bounded_text(name)
    if not normalized_item_id or not safe_kind or not safe_id or not safe_name:
        return None
    reference = {
        "itemId": normalized_item_id,
        "kind": safe_kind,
        "id": safe_id,
        "name": safe_name,
    }
    if _strict_text(parent_id):
        reference["parentId"] = parent_id
    if _bounded_text(table_name):
        reference["tableName"] = _bounded_text(table_name)
    return reference


def _add_artifact_object_edge(artifact, source, target, relation):
    relation = _bounded_text(relation)
    if not source or not target or not relation:
        return
    edges = artifact.setdefault("_objectEdges", [])
    edges.append({
        "source": source,
        "target": target,
        "relation": relation,
        "confidence": "verified",
    })


def _schema_object_references(item_id, schema):
    references = []
    for table in schema or []:
        for value in (
            [table]
            + list(table.get("columns") or [])
            + list(table.get("measures") or [])
        ):
            object_id = _strict_text(value.get("objectId"))
            name = _bounded_text(value.get("name"))
            if not object_id or not name:
                continue
            reference = {
                "id": object_id,
                "itemId": _normalized_id(item_id),
                "name": name,
                "kind": _metadata_object_kind(
                    value.get("objectType"),
                    (
                        "column"
                        if value is not table
                        else "table"
                    ),
                ),
            }
            parent_id = _strict_text(value.get("parentObjectId"))
            if parent_id:
                reference["parentId"] = parent_id
            if value is not table:
                reference["tableName"] = _strict_text(table.get("name"))
            references.append(reference)
    return references


def _schema_object_edges(schema):
    edges = []
    seen = set()
    for table in schema or []:
        values = (
            [table]
            + list(table.get("columns") or [])
            + list(table.get("measures") or [])
        )
        for value in values:
            object_id = _strict_text(value.get("objectId"))
            parent_id = _strict_text(value.get("parentObjectId"))
            candidates = []
            if parent_id and object_id:
                candidates.append((parent_id, object_id, "contains", None))
            source_id = _strict_text(value.get("sourceObjectId"))
            target_id = _strict_text(value.get("targetObjectId"))
            relation = _strict_text(value.get("relation"))
            if source_id and target_id and relation:
                candidates.append((
                    source_id,
                    target_id,
                    relation,
                    (
                        object_id
                        if value.get("objectType")
                        == "Ontology relationship"
                        else None
                    ),
                ))
            for source, target, label, relation_object_id in candidates:
                key = (source, target, label, relation_object_id)
                if key in seen:
                    continue
                seen.add(key)
                edge = {
                    "id": _object_edge_id(source, label, target),
                    "source": source,
                    "target": target,
                    "relation": label,
                }
                if relation_object_id:
                    edge["relationObjectId"] = relation_object_id
                edges.append(edge)
    return edges


def _public_schema(schema):
    result = []
    for table in schema or []:
        public_table = {
            key: value
            for key, value in table.items()
            if key not in ("columns", "measures")
        }
        public_table["columns"] = [
            dict(column)
            for column in table.get("columns") or []
        ]
        public_table["measures"] = [
            dict(measure)
            for measure in table.get("measures") or []
        ]
        result.append(public_table)
    return result


def _collect_atlas_object_edges(schema_by_item, extra_edges=None):
    references = {}
    values_by_id = {}
    table_by_object_id = {}
    for item_id, schema in schema_by_item.items():
        for table in schema or []:
            table_id = _strict_text(table.get("objectId"))
            if table_id:
                table_by_object_id[table_id] = table
            for value in (
                [table]
                + list(table.get("columns") or [])
                + list(table.get("measures") or [])
            ):
                object_id = _strict_text(value.get("objectId"))
                name = _strict_text(value.get("name"))
                if not object_id or not name:
                    continue
                parent_id = _strict_text(value.get("parentObjectId"))
                parent = table_by_object_id.get(parent_id)
                fallback_kind = (
                    "measure"
                    if any(
                        value is measure
                        for measure in table.get("measures") or []
                    )
                    else (
                        "column"
                        if value is not table
                        else "table"
                    )
                )
                reference = {
                    "itemId": _normalized_id(item_id),
                    "kind": _metadata_object_kind(
                        value.get("objectType"),
                        fallback_kind,
                    ),
                    "id": object_id,
                    "name": name,
                }
                if parent_id:
                    reference["parentId"] = parent_id
                parent_path = value.get("parentPath")
                if isinstance(parent_path, list) and parent_path:
                    reference["parentPath"] = [
                        name
                        for candidate in parent_path[:16]
                        if (name := _bounded_text(candidate))
                    ]
                table_name = _bounded_text(
                    value.get("tableName")
                    or (
                        (parent or table).get("name")
                        if parent_id
                        or reference["kind"]
                        in ("table", "view", "materializedView")
                        else None
                    )
                )
                if table_name:
                    reference["tableName"] = table_name
                references[object_id] = reference
                values_by_id[object_id] = value

    def reference_for(object_id, value=None, source=False):
        existing = references.get(object_id)
        if existing:
            return dict(existing)
        if not value:
            return None
        item_id = _normalized_id(value.get("sourceItemId"))
        name = _bounded_text(value.get("sourceObjectName"))
        source_type = _strict_text(value.get("sourceObjectType"))
        if not item_id or not object_id or not name:
            return None
        reference = {
            "itemId": item_id,
            "kind": (
                _metadata_source_kind(source_type)
                if source
                else "selectedElement"
            ),
            "id": object_id,
            "name": name,
        }
        parent_id = _strict_text(value.get("sourceParentObjectId"))
        if parent_id:
            reference["parentId"] = parent_id
        parent_path = value.get("sourceParentPath")
        if isinstance(parent_path, list) and parent_path:
            reference["parentPath"] = [
                name
                for candidate in parent_path[:16]
                if (name := _bounded_text(candidate))
            ]
        table_name = _bounded_text(value.get("sourceTableName"))
        if table_name:
            reference["tableName"] = table_name
        return reference

    edges = []
    seen = set()
    containment_parent_types = {
        "KQL table",
        "KQL external table",
        "KQL materialized view",
        "KQL function",
        "Ontology entity",
        "Graph node",
        "Graph edge",
        "Data Agent source",
        "Data Agent selected element",
    }

    def add(source, target, relation):
        relation = _bounded_text(relation)
        if not source or not target or not relation:
            return
        key = (
            source["itemId"],
            source["kind"],
            source["id"],
            target["itemId"],
            target["kind"],
            target["id"],
            relation,
        )
        if key in seen:
            return
        seen.add(key)
        edges.append({
            "source": source,
            "target": target,
            "relation": relation,
            "confidence": "verified",
        })

    for edge in extra_edges or []:
        if not isinstance(edge, dict):
            continue
        add(
            edge.get("source"),
            edge.get("target"),
            edge.get("relation"),
        )

    for object_id, value in values_by_id.items():
        current = references[object_id]
        parent_id = _strict_text(value.get("parentObjectId"))
        parent_value = values_by_id.get(parent_id)
        if (
            parent_id
            and isinstance(parent_value, dict)
            and parent_value.get("objectType")
            in containment_parent_types
        ):
            add(
                reference_for(parent_id),
                current,
                "contains",
            )
        source_id = _strict_text(value.get("sourceObjectId"))
        target_id = _strict_text(value.get("targetObjectId"))
        relation = _strict_text(value.get("relation"))
        if not source_id or not target_id or not relation:
            continue
        if value.get("objectType") == "Ontology relationship":
            add(
                reference_for(source_id),
                current,
                "relationship source",
            )
            add(
                current,
                reference_for(target_id),
                "relationship target",
            )
        else:
            add(
                reference_for(source_id, value, source=True),
                reference_for(target_id, value),
                relation,
            )
    return edges


def _atlas_object_edges(schema_by_item, extra_edges=None):
    return _collect_atlas_object_edges(
        schema_by_item,
        extra_edges=extra_edges,
    )


def _artifact_id(value):
    if not isinstance(value, dict):
        return None
    return _normalized_id(value.get("id")) or _normalized_id(
        value.get("objectId")
    )


def _normalize_timestamp(value):
    if not isinstance(value, str) or not value.strip():
        return value
    text = value.strip()
    try:
        parsed = datetime.datetime.fromisoformat(
            text[:-1] + "+00:00" if text.endswith("Z") else text
        )
    except ValueError:
        return value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    parsed = parsed.astimezone(datetime.timezone.utc)
    return parsed.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _safe_row_count(value):
    if isinstance(value, bool) or not isinstance(value, numbers.Real):
        return None
    numeric = float(value)
    if not math.isfinite(numeric) or numeric < 0:
        return None
    return value


def _safe_text(value):
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    if isinstance(value, dict):
        for key in (
            "displayName",
            "emailAddress",
            "email",
            "identifier",
            "graphId",
            "id",
        ):
            text = _safe_text(value.get(key))
            if text:
                return text
    return None


def _strict_text(value):
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def _sanitize_workspace(value):
    if not isinstance(value, dict):
        raise ValueError("workspace response was not an object")
    allowed = (
        "id",
        "displayName",
        "description",
        "type",
        "capacityId",
        "capacityRegion",
    )
    return {
        key: value[key]
        for key in allowed
        if isinstance(value.get(key), str) and value.get(key).strip()
    }


def _sanitize_item(value):
    if not isinstance(value, dict):
        return None
    item_id = _artifact_id(value)
    item_type = _strict_text(value.get("type"))
    if not item_id or not item_type:
        return None
    item = {"id": item_id, "type": item_type}
    for key in ("displayName", "description", "workspaceId", "folderId"):
        text = _strict_text(value.get(key))
        if text:
            item[key] = text
    return item


def _sanitize_role_assignment(value):
    if not isinstance(value, dict):
        return None
    role = _strict_text(value.get("role"))
    principal = value.get("principal")
    if not role or not isinstance(principal, dict):
        return None
    safe_principal = {}
    for key in ("id", "displayName", "type"):
        text = (
            _normalized_id(principal.get(key))
            if key == "id"
            else _strict_text(principal.get(key))
        )
        if text:
            safe_principal[key] = text
    user_type = _strict_text(principal.get("userType"))
    if user_type:
        safe_principal["userType"] = user_type
    details = principal.get("userDetails")
    if isinstance(details, dict):
        user_principal_name = _strict_text(
            details.get("userPrincipalName")
        )
        detail_user_type = _strict_text(details.get("userType"))
        safe_details = {}
        if user_principal_name:
            safe_details["userPrincipalName"] = user_principal_name
        if detail_user_type:
            safe_details["userType"] = detail_user_type
        if safe_details:
            safe_principal["userDetails"] = safe_details
    if not safe_principal.get("id"):
        fallback = (
            safe_principal.get("userDetails", {}).get("userPrincipalName")
            or safe_principal.get("displayName")
        )
        if fallback:
            safe_principal["id"] = fallback
    if not safe_principal.get("id"):
        return None
    return {"role": role, "principal": safe_principal}


def _sanitize_job(value, item):
    item_id = _artifact_id(item)
    if not isinstance(value, dict) or not item_id:
        return None
    job_type = _strict_text(value.get("jobType") or value.get("invokeType"))
    status = _strict_text(value.get("status"))
    if not job_type or not status:
        return None
    job = {
        "itemId": item_id,
        "itemDisplayName": item.get("displayName"),
        "itemType": item.get("type"),
        "jobType": job_type,
        "status": status,
    }
    for key in ("id", "invokeType"):
        text = _strict_text(value.get(key))
        if text:
            job[key] = text
    for key in (
        "startTimeUtc",
        "endTimeUtc",
        "createdTimeUtc",
        "lastUpdatedTimeUtc",
    ):
        timestamp = _strict_text(value.get(key))
        if timestamp:
            job[key] = _normalize_timestamp(timestamp)
    return {key: value for key, value in job.items() if value is not None}


def _metadata_for_item(artifact, scanner_matched):
    """Map scanner metadata to the documented itemMetadata DTO shape.

    The DTO contains scannerMatched plus configuredBy, modifiedBy,
    modifiedDateTime, endorsement {value, certifiedBy}, sensitivity
    {labelId, displayName}, and tags [{id, displayName}] when supplied.
    """
    metadata = {"scannerMatched": scanner_matched}
    if scanner_matched:
        configured_by = _safe_text(artifact.get("configuredBy"))
        modified_by = _safe_text(artifact.get("modifiedBy"))
        modified = _safe_text(
            artifact.get("modifiedDateTime")
            or artifact.get("lastUpdatedDate")
            or artifact.get("lastUpdatedTime")
        )
        if configured_by:
            metadata["configuredBy"] = configured_by
        if modified_by:
            metadata["modifiedBy"] = modified_by
        if modified:
            metadata["modifiedDateTime"] = _normalize_timestamp(modified)

    artifact_type = artifact.get("_type")
    owner_available = scanner_matched and artifact_type in (
        "SemanticModel",
        "Dataflow",
        "Datamart",
    ) or (
        scanner_matched
        and artifact_type == "Report"
        and ("createdBy" in artifact or "createdById" in artifact)
    )
    metadata["ownerAvailable"] = owner_available
    owner_name = None
    owner_id = None
    owner_source = None
    if artifact_type in ("SemanticModel", "Dataflow", "Datamart"):
        owner_name = _safe_text(artifact.get("configuredBy"))
        owner_id = _safe_text(artifact.get("configuredById"))
        owner_source = "workspaceInfo.configuredBy"
    elif artifact_type == "Report":
        owner_name = _safe_text(artifact.get("createdBy"))
        owner_id = _safe_text(artifact.get("createdById"))
        owner_source = "workspaceInfo.createdBy"
    if owner_name or owner_id:
        owner = {"source": owner_source}
        if owner_id:
            owner["principalId"] = owner_id
        if owner_name:
            owner["displayName"] = owner_name
            if "@" in owner_name:
                owner["email"] = owner_name
        metadata["owner"] = owner

    endorsement = artifact.get("endorsement")
    if not isinstance(endorsement, dict):
        endorsement = artifact.get("endorsementDetails")
    if isinstance(endorsement, dict):
        value = _safe_text(
            endorsement.get("value") or endorsement.get("endorsement")
        )
        certified_by = _safe_text(endorsement.get("certifiedBy"))
        if value or certified_by:
            metadata["endorsement"] = {}
            if value:
                metadata["endorsement"]["value"] = value
            if certified_by:
                metadata["endorsement"]["certifiedBy"] = certified_by

    sensitivity = artifact.get("sensitivity")
    if not isinstance(sensitivity, dict):
        sensitivity = artifact.get("sensitivityLabel")
    if isinstance(sensitivity, dict):
        label_id = _safe_text(
            sensitivity.get("labelId") or sensitivity.get("id")
        )
        display_name = _safe_text(
            sensitivity.get("displayName") or sensitivity.get("name")
        )
        if label_id or display_name:
            metadata["sensitivity"] = {}
            if label_id:
                metadata["sensitivity"]["labelId"] = label_id
            if display_name:
                metadata["sensitivity"]["displayName"] = display_name

    tags = []
    for tag in artifact.get("tags") or []:
        if isinstance(tag, str):
            tag_id = _safe_text(tag)
            display_name = None
        elif isinstance(tag, dict):
            tag_id = _safe_text(tag.get("id") or tag.get("tagId"))
            display_name = _safe_text(
                tag.get("displayName") or tag.get("name")
            )
        else:
            continue
        if tag_id:
            entry = {"id": tag_id}
            if display_name:
                entry["displayName"] = display_name
            tags.append(entry)
    if tags:
        metadata["tags"] = tags
    return metadata


def _safe_error_code(error, optional=False):
    if isinstance(error, DeadlineExceeded):
        return "deadline-exhausted"
    if isinstance(error, RequestTimeout):
        return "request-timeout"
    if isinstance(error, RetryAfterDeferred):
        return "retry-after-deferred"
    if isinstance(error, ResponseSizeExceeded):
        return "response-size-exceeded"
    if isinstance(error, PaginationError):
        return "pagination-invalid"
    if isinstance(error, urllib.error.HTTPError):
        if error.code == 423:
            return "encrypted-label-blocked"
        if optional and error.code in (400, 404):
            return "endpoint-unsupported"
        if error.code in (401, 403):
            return "authorization-failed"
        if error.code == 429:
            return "rate-limited"
        if 500 <= error.code <= 599:
            return "transient-upstream"
        return "upstream-http-error"
    if isinstance(error, (ValueError, json.JSONDecodeError)):
        return "invalid-response"
    if isinstance(error, ScannerError):
        return "scanner-failed"
    if isinstance(error, DefinitionError):
        return "invalid-definition"
    if isinstance(error, SqlRuntimeUnavailable):
        return "tds-runtime-unavailable"
    if isinstance(error, SqlConnectionError):
        return "sql-connection-failed"
    if isinstance(error, SqlAuthorizationError):
        return "authorization-failed"
    if isinstance(error, SqlCatalogQueryError):
        return "sql-catalog-query-failed"
    return "upstream-failure"


def _definition_error_code(error):
    if isinstance(error, DeadlineExceeded):
        return "deadline-exhausted"
    if isinstance(error, RequestTimeout):
        return "request-timeout"
    if isinstance(error, RetryAfterDeferred):
        return "retry-after-deferred"
    if isinstance(error, ResponseSizeExceeded):
        return "response-size-exceeded"
    if isinstance(error, PaginationError):
        return "pagination-invalid"
    if isinstance(error, urllib.error.HTTPError):
        if error.code in (401, 403):
            return "read-write-permission-required"
        if error.code == 423:
            return "encrypted-label-blocked"
        if error.code in (400, 404):
            return "endpoint-unsupported"
        return _safe_error_code(error, optional=True)
    if isinstance(error, (DefinitionError, ValueError, json.JSONDecodeError)):
        return "invalid-definition"
    return _safe_error_code(error, optional=True)


def _set_section(out, name, status, code=None):
    section = {"status": status}
    if code:
        section["code"] = code
    out["sections"][name] = section


def _record_failure(out, section, error, optional=False):
    code = _safe_error_code(error, optional=optional)
    status = (
        "unsupported"
        if optional and code == "endpoint-unsupported"
        else "failed"
    )
    _set_section(out, section, status, code)
    out["errors"].append(f"{section}: {code}")
    return code


def _new_optional_tracker():
    return {"success": 0, "unsupported": 0, "failed": 0, "codes": []}


def _track_optional(tracker, result, code=None):
    tracker[result] += 1
    if code and code not in tracker["codes"]:
        tracker["codes"].append(code)


def _finish_optional_section(out, name, tracker):
    if tracker["failed"]:
        _set_section(
            out,
            name,
            "failed",
            tracker["codes"][0] if tracker["codes"] else "upstream-failure",
        )
    elif tracker["success"]:
        _set_section(
            out,
            name,
            "complete",
            (
                "partial-unsupported"
                if tracker["unsupported"]
                else (tracker["codes"][0] if tracker["codes"] else None)
            ),
        )
    elif tracker["unsupported"]:
        _set_section(
            out,
            name,
            "unsupported",
            tracker["codes"][0]
            if tracker["codes"]
            else "endpoint-unsupported",
        )
    else:
        _set_section(out, name, "unsupported", "not-applicable")


def _set_metadata_capabilities(out):
    scanner = out["sections"].get(
        "scanner",
        {"status": "failed", "code": "scanner-failed"},
    )
    if scanner["status"] == "complete":
        endorsement = {"status": "complete"}
        sensitivity = {"status": "complete", "code": "label-ids"}
        tags = {"status": "complete", "code": "tag-ids"}
        ownership = {"status": "complete", "code": "type-specific"}
    else:
        unavailable = {
            "status": "failed",
            "code": scanner.get("code") or "scanner-failed",
        }
        endorsement = dict(unavailable)
        sensitivity = dict(unavailable)
        tags = dict(unavailable)
        ownership = dict(unavailable)
    out["capabilities"] = {
        "endorsement": endorsement,
        "sensitivity": sensitivity,
        "tags": tags,
        "ownership": ownership,
    }


def _set_optional_capabilities(out):
    for section_name, capability_name in (
        ("definitions", "definitionEnrichment"),
        ("kqlSchema", "kqlSchema"),
        ("sqlSchema", "sqlSchema"),
    ):
        section = out["sections"].get(section_name)
        if section:
            out["capabilities"][capability_name] = dict(section)


def _access_right(user):
    for k, v in user.items():
        if k.endswith("UserAccessRight") or k.endswith("AccessRight"):
            return v
    return None


def _lh_tables(token, ws, lid):
    rows = _get_all_data(
        token,
        f"/workspaces/{ws}/lakehouses/{lid}/tables?maxResults=100",
    )
    return _table_records(rows)


def _table_records(value):
    """Flatten both legacy table lists and schema-enabled schema/table trees."""
    if isinstance(value, list):
        rows = []
        for entry in value:
            rows.extend(_table_records(entry))
        return rows
    if not isinstance(value, dict):
        return []

    nested = []
    for key in ("data", "value", "tables"):
        if isinstance(value.get(key), list):
            nested.extend(_table_records(value[key]))
    if nested:
        return nested
    if value.get("name") and (
        "columns" in value or "type" in value or "format" in value
    ):
        return [value]
    return []


DETAIL_PATHS = {
    "Lakehouse": "lakehouses",
    "Warehouse": "warehouses",
    "SQLDatabase": "sqlDatabases",
    "Eventhouse": "eventhouses",
    "KQLDatabase": "kqlDatabases",
    "Ontology": "ontologies",
    "GraphModel": "graphModels",
    "DataAgent": "dataAgents",
}

DEFINITION_PATHS = {
    "Ontology": "ontologies",
    "GraphModel": "graphModels",
    "DataAgent": "dataAgents",
}


def _merge_detail_metadata(artifact, detail):
    if not isinstance(detail, dict):
        raise ValueError("item properties response was not an object")
    for key in (
        "displayName",
        "description",
        "workspaceId",
        "folderId",
        "sensitivityLabel",
        "tags",
    ):
        if key in detail and detail[key] is not None:
            artifact[key] = detail[key]


def _header_value(headers, name):
    if not headers:
        return None
    value = headers.get(name)
    if value is not None:
        return value
    expected = name.casefold()
    for key, candidate in headers.items():
        if str(key).casefold() == expected:
            return candidate
    return None


def _get_definition(token, ws, artifact_type, artifact_id):
    path = DEFINITION_PATHS[artifact_type]
    status, headers, data = _req_response(
        token,
        f"{FABRIC}/workspaces/{ws}/{path}/{artifact_id}/getDefinition",
        method="POST",
    )
    if status == 200:
        return data
    if status != 202:
        raise DefinitionError("definition request returned an invalid status")

    operation_id = _strict_text(
        _header_value(headers, "x-ms-operation-id")
    )
    location = _strict_text(_header_value(headers, "Location"))
    if not operation_id and location:
        operation_id = _strict_text(
            urllib.parse.urlparse(location).path.rstrip("/").rsplit("/", 1)[-1]
        )
    if not operation_id:
        raise DefinitionError("definition operation omitted its identifier")
    operation_id = _workspace_id(operation_id)
    # Ontology-family LROs can return an analysis.windows.net Location.
    # Poll the canonical Fabric operations endpoint with the Fabric token.
    state_url = f"{FABRIC}/operations/{operation_id}"
    deadline = _ACTIVE_DEADLINE.get() or _ExecutionDeadline()
    retry_after = _retry_after_seconds(headers) or 1
    for _ in range(30):
        deadline.sleep(retry_after)
        state_status, state_headers, state = _req_response(
            token,
            state_url,
        )
        if state_status != 200 or not isinstance(state, dict):
            raise DefinitionError("definition operation state was invalid")
        operation_status = _strict_text(state.get("status"))
        if operation_status == "Succeeded":
            return _get(
                token,
                f"{FABRIC}/operations/{operation_id}/result",
            )
        if operation_status == "Failed":
            raise DefinitionError("definition operation failed")
        if operation_status not in ("NotStarted", "Running"):
            raise DefinitionError("definition operation status was invalid")
        retry_after = _retry_after_seconds(state_headers) or 1
    raise DeadlineExceeded("definition operation did not complete")


def _definition_parts(response):
    if not isinstance(response, dict):
        raise DefinitionError("definition response was not an object")
    definition = response.get("definition")
    if not isinstance(definition, dict):
        raise DefinitionError("definition response omitted the definition")
    parts = definition.get("parts")
    if not isinstance(parts, list) or len(parts) > MAX_DEFINITION_PARTS:
        raise DefinitionError("definition parts were invalid")
    return parts


def _decode_definition_json(part, decoded_total):
    if not isinstance(part, dict):
        raise DefinitionError("definition part was invalid")
    path = _strict_text(part.get("path"))
    payload = _strict_text(part.get("payload"))
    if (
        not path
        or not payload
        or part.get("payloadType") != "InlineBase64"
    ):
        raise DefinitionError("definition part metadata was invalid")
    try:
        decoded = base64.b64decode(payload, validate=True)
    except (ValueError, binascii.Error) as error:
        raise DefinitionError("definition part payload was malformed") from error
    decoded_total[0] += len(decoded)
    if decoded_total[0] > MAX_DEFINITION_DECODED_BYTES:
        raise ResponseSizeExceeded(
            "definition payload exceeded the safe decoded size limit"
        )
    try:
        value = json.loads(decoded.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise DefinitionError("definition part was not valid JSON") from error
    if not isinstance(value, dict):
        raise DefinitionError("definition JSON part was not an object")
    return path, value


def _explicit_ids(value, field_names):
    found = set()
    expected = {name.casefold() for name in field_names}

    def visit(node):
        if isinstance(node, dict):
            for key, child in node.items():
                if str(key).casefold() in expected:
                    normalized = _normalized_id(child)
                    if normalized:
                        found.add(normalized)
                elif isinstance(child, (dict, list)):
                    visit(child)
        elif isinstance(node, list):
            for child in node:
                if isinstance(child, (dict, list)):
                    visit(child)

    visit(value)
    return found


def _exact_scalar_id(value, field_names):
    if not isinstance(value, dict):
        return None
    for name in field_names:
        candidate = value.get(name)
        normalized = _normalized_id(
            str(candidate) if candidate is not None else None
        )
        if normalized:
            return normalized
    return None


def _definition_identifier(value, fallback=None):
    candidate = value if value is not None else fallback
    if candidate is None:
        return None
    return _normalized_id(str(candidate))


def _dedupe_metadata(values, key):
    result = []
    seen = set()
    for value in values:
        identity = key(value)
        if not identity or identity in seen:
            continue
        seen.add(identity)
        result.append(value)
        if len(result) >= MAX_ARTIFACT_METADATA_COLLECTION:
            break
    return result


def _add_definition_fact(artifact, section, label, value):
    facts = artifact.setdefault("_definitionFacts", [])
    if len(facts) >= MAX_DEFINITION_FACTS_PER_ITEM:
        artifact["_definitionTruncated"] = True
        return
    if (
        _strict_text(section)
        and _strict_text(label)
        and isinstance(value, (str, int, float, bool))
        and str(value).strip()
    ):
        facts.append((str(section), str(label), str(value)))


def _safe_property_records(values):
    result = []
    for value in (values or [])[:MAX_SCHEMA_COLUMNS_PER_OBJECT]:
        if not isinstance(value, dict):
            continue
        name = _strict_text(value.get("name"))
        if not name:
            continue
        record = {"name": name}
        property_id = _definition_identifier(value.get("id"))
        value_type = _strict_text(value.get("valueType") or value.get("type"))
        if property_id:
            record["id"] = property_id
        if value_type:
            record["valueType"] = value_type
        result.append(record)
    return result


def _source_metadata(value):
    if not isinstance(value, dict):
        return None
    item_id = _normalized_id(
        value.get("itemId")
        or value.get("artifactId")
        or value.get("sourceItemId")
    )
    workspace_id = _normalized_id(
        value.get("workspaceId") or value.get("sourceWorkspaceId")
    )
    source_object_id = _normalized_id(
        value.get("sourceObjectId")
        or value.get("tableId")
        or value.get("objectId")
    )
    source_type = _strict_text(
        value.get("sourceType") or value.get("type")
    )
    table_name = _strict_text(
        value.get("sourceTableName")
        or value.get("tableName")
        or value.get("displayName")
    )
    schema_name = _strict_text(
        value.get("sourceSchema") or value.get("schemaName")
    )
    if not any((item_id, source_type, table_name, schema_name)):
        return None
    return {
        key: field
        for key, field in {
            "itemId": item_id,
            "workspaceId": workspace_id,
            "sourceType": source_type,
            "schema": schema_name,
            "table": table_name,
            "sourceObjectId": source_object_id,
        }.items()
        if field
    }


def _source_summary(source):
    values = [
        source.get("sourceType"),
        source.get("itemId"),
        ".".join(
            value
            for value in (source.get("schema"), source.get("table"))
            if value
        ),
    ]
    return " | ".join(value for value in values if value)


def _source_object_kind(source_type):
    value = (_strict_text(source_type) or "").casefold()
    if "warehouse" in value:
        return "warehouse-table"
    if "kusto" in value or "kql" in value:
        return "kql-table"
    if "semantic" in value or "dataset" in value:
        return "semantic-model-table"
    if "sql" in value:
        return "sql-table"
    return "table"


def _source_object_identity(source):
    if not isinstance(source, dict):
        return None
    return ".".join(
        value
        for value in (source.get("schema"), source.get("table"))
        if _strict_text(value)
    ) or _strict_text(source.get("itemId"))


def _source_object_reference(source):
    if not isinstance(source, dict):
        return None
    item_id = source.get("itemId")
    identity = _source_object_identity(source)
    object_kind = _source_object_kind(source.get("sourceType"))
    return _metadata_object_ref(
        item_id,
        "table",
        _fabric_object_id(item_id, object_kind, identity),
        source.get("table") or identity,
        table_name=source.get("table") or identity,
    )


def _source_column_reference(source, column_name):
    parent = _source_object_reference(source)
    name = _strict_text(column_name)
    if not parent or not name:
        return None
    object_kind = _source_object_kind(source.get("sourceType"))
    return _metadata_object_ref(
        source.get("itemId"),
        "column",
        _fabric_object_id(
            source.get("itemId"),
            f"{object_kind}-column",
            f"{_source_object_identity(source)}/{name}",
        ),
        name,
        parent_id=parent["id"],
        table_name=source.get("table") or _source_object_identity(source),
    )


def _project_ontology_definition(artifact, response):
    entity_parts = []
    binding_parts = []
    relationship_parts = []
    contextualization_parts = []
    decoded_total = [0]
    unknown = 0
    for part in _definition_parts(response):
        path = _strict_text(part.get("path"))
        if not path:
            raise DefinitionError("definition part path was invalid")
        normalized_path = path.replace("\\", "/")
        if normalized_path in (".platform", "definition.json"):
            continue
        if re.fullmatch(
            r"EntityTypes/[^/]+/(Documents|ResourceLinks)/.+\.json",
            normalized_path,
            re.IGNORECASE,
        ) or re.fullmatch(
            r"EntityTypes/[^/]+/Overviews/definition\.json",
            normalized_path,
            re.IGNORECASE,
        ):
            continue
        match = re.fullmatch(
            r"EntityTypes/([^/]+)/definition\.json",
            normalized_path,
            re.IGNORECASE,
        )
        if match:
            _, value = _decode_definition_json(part, decoded_total)
            entity_parts.append((match.group(1), value))
            artifact.setdefault("_graphModelItemIds", set()).update(
                _explicit_ids(
                    value,
                    (
                        "graphModelId",
                        "graphModelItemId",
                        "generatedGraphModelId",
                        "generatedGraphModelItemId",
                    ),
                )
            )
            continue
        match = re.fullmatch(
            r"EntityTypes/([^/]+)/DataBindings/([^/]+)\.json",
            normalized_path,
            re.IGNORECASE,
        )
        if match:
            _, value = _decode_definition_json(part, decoded_total)
            binding_parts.append((match.group(1), match.group(2), value))
            continue
        match = re.fullmatch(
            r"RelationshipTypes/([^/]+)/definition\.json",
            normalized_path,
            re.IGNORECASE,
        )
        if match:
            _, value = _decode_definition_json(part, decoded_total)
            relationship_parts.append((match.group(1), value))
            continue
        match = re.fullmatch(
            r"RelationshipTypes/([^/]+)/Contextualizations/([^/]+)\.json",
            normalized_path,
            re.IGNORECASE,
        )
        if match:
            _, value = _decode_definition_json(part, decoded_total)
            contextualization_parts.append(
                (match.group(1), match.group(2), value)
            )
            continue
        unknown += 1

    entity_names = {}
    entity_object_ids = {}
    entity_refs = {}
    property_refs = {}
    definition_schema = []
    metadata_entities = []
    metadata_bindings = []
    metadata_relationships = []
    metadata_contextualizations = []
    for path_id, value in entity_parts:
        entity_id = _definition_identifier(value.get("id"), path_id)
        name = _strict_text(value.get("name")) or entity_id
        entity_names[entity_id] = name
        entity_object_id = _fabric_object_id(
            artifact.get("id"),
            "ontology-entity",
            entity_id,
        )
        entity_object_ids[entity_id] = entity_object_id
        properties = _safe_property_records(value.get("properties"))
        timeseries = _safe_property_records(
            value.get("timeseriesProperties")
        )
        property_metadata = [
            {
                "id": prop["id"],
                "name": prop["name"],
                "valueType": prop.get("valueType") or "Object",
                "timeSeries": False,
            }
            for prop in properties
            if prop.get("id")
        ] + [
            {
                "id": prop["id"],
                "name": prop["name"],
                "valueType": prop.get("valueType") or "Object",
                "timeSeries": True,
            }
            for prop in timeseries
            if prop.get("id")
        ]
        property_ids = {
            prop["id"]
            for prop in property_metadata
        }
        key_property_ids = [
            normalized
            for candidate in value.get("entityIdParts") or []
            if (
                normalized := _definition_identifier(candidate)
            ) in property_ids
        ]
        display_name_property_id = _definition_identifier(
            value.get("displayNamePropertyId")
        )
        metadata_entity = {
            "id": entity_id,
            "name": name,
            "keyPropertyIds": key_property_ids,
            "properties": property_metadata,
        }
        namespace = _strict_text(value.get("namespace"))
        if namespace:
            metadata_entity["namespace"] = namespace
        if display_name_property_id in property_ids:
            metadata_entity[
                "displayNamePropertyId"
            ] = display_name_property_id
        metadata_entities.append(metadata_entity)
        definition_schema.append({
            "_mergeKey": f"ontology-entity:{entity_id}",
            "name": name,
            "objectType": "Ontology entity",
            "objectId": entity_object_id,
            "source": "Fabric Ontology definition",
            "columns": [
                {
                    "name": prop["name"],
                    "dataType": prop.get("valueType") or "property",
                    "objectType": "Ontology property",
                    "objectId": _fabric_object_id(
                        artifact.get("id"),
                        "ontology-property",
                        prop.get("id") or f"{entity_id}/{prop['name']}",
                    ),
                    "parentObjectId": entity_object_id,
                }
                for prop in properties
            ] + [
                {
                    "name": prop["name"],
                    "dataType": prop.get("valueType") or "property",
                    "objectType": "Ontology time-series property",
                    "objectId": _fabric_object_id(
                        artifact.get("id"),
                        "ontology-property",
                        prop.get("id") or f"{entity_id}/{prop['name']}",
                    ),
                    "parentObjectId": entity_object_id,
                }
                for prop in timeseries
            ],
            "measures": [],
        })
        entity_refs[entity_id] = _metadata_object_ref(
            artifact.get("id"),
            "entityType",
            entity_object_id,
            name,
        )
        for prop in properties:
            property_refs[(entity_id, prop.get("id"))] = (
                _metadata_object_ref(
                    artifact.get("id"),
                    "property",
                    _fabric_object_id(
                        artifact.get("id"),
                        "ontology-property",
                        prop.get("id")
                        or f"{entity_id}/{prop['name']}",
                    ),
                    prop["name"],
                    parent_id=entity_object_id,
                    table_name=name,
                )
            )
        for prop in timeseries:
            property_refs[(entity_id, prop.get("id"))] = (
                _metadata_object_ref(
                    artifact.get("id"),
                    "timeSeriesProperty",
                    _fabric_object_id(
                        artifact.get("id"),
                        "ontology-property",
                        prop.get("id")
                        or f"{entity_id}/{prop['name']}",
                    ),
                    prop["name"],
                    parent_id=entity_object_id,
                    table_name=name,
                )
            )
        _add_definition_fact(
            artifact,
            "Ontology entity types",
            name,
            f"id {entity_id} | {len(properties)} properties | "
            f"{len(timeseries)} time-series properties",
        )
        for prop in properties:
            _add_definition_fact(
                artifact,
                "Ontology properties",
                f"{name}.{prop['name']}",
                prop.get("valueType") or "property",
            )
        for prop in timeseries:
            _add_definition_fact(
                artifact,
                "Ontology time-series properties",
                f"{name}.{prop['name']}",
                prop.get("valueType") or "property",
            )

    for entity_id, binding_id, value in binding_parts:
        entity_id = _definition_identifier(entity_id)
        binding_id = _definition_identifier(value.get("id"), binding_id)
        configuration = value.get("dataBindingConfiguration")
        configuration = configuration if isinstance(configuration, dict) else {}
        source = _source_metadata(
            configuration.get("sourceTableProperties")
        )
        if source:
            source_id = source.get("itemId")
            if source_id:
                artifact.setdefault("_definitionSourceIds", set()).add(
                    source_id
                )
            property_bindings = configuration.get("propertyBindings")
            safe_property_bindings = []
            for property_binding in (
                property_bindings
                if isinstance(property_bindings, list)
                else []
            ):
                if not isinstance(property_binding, dict):
                    continue
                source_column = _strict_text(
                    property_binding.get("sourceColumnName")
                    or property_binding.get("sourceColumn")
                )
                target_property_id = _definition_identifier(
                    property_binding.get("targetPropertyId")
                    or property_binding.get("propertyId")
                )
                if (
                    source_column
                    and (entity_id, target_property_id) in property_refs
                ):
                    safe_property_bindings.append({
                        "sourceColumn": source_column,
                        "targetPropertyId": target_property_id,
                    })
            count = (
                len(safe_property_bindings)
            )
            label = f"{entity_names.get(entity_id, entity_id)}:{binding_id}"
            _add_definition_fact(
                artifact,
                "Ontology data bindings",
                label,
                f"{_source_summary(source)} | {count} property bindings",
            )
            _add_artifact_object_edge(
                artifact,
                _source_object_reference(source),
                entity_refs.get(entity_id),
                "binds entity",
            )
            for property_binding in safe_property_bindings:
                target_property_id = property_binding["targetPropertyId"]
                _add_artifact_object_edge(
                    artifact,
                    _source_column_reference(
                        source,
                        property_binding["sourceColumn"],
                    ),
                    property_refs.get(
                        (entity_id, target_property_id)
                    ),
                    "binds property",
                )
            if entity_id in entity_names and source.get("itemId") and source.get("table"):
                metadata_binding = {
                    "id": binding_id,
                    "entityId": entity_id,
                    "bindingType": _strict_text(
                        configuration.get("dataBindingType")
                        or configuration.get("bindingType")
                    ) or "Table",
                    "sourceItemId": source["itemId"],
                    "sourceObject": source["table"],
                    "propertyBindings": safe_property_bindings,
                }
                for target_key, source_key in (
                    ("sourceWorkspaceId", "workspaceId"),
                    ("sourceType", "sourceType"),
                    ("sourceSchema", "schema"),
                    ("sourceObjectId", "sourceObjectId"),
                ):
                    if source.get(source_key):
                        metadata_binding[target_key] = source[source_key]
                timestamp_column = _strict_text(
                    configuration.get("timestampColumn")
                    or configuration.get("timestampColumnName")
                )
                if timestamp_column:
                    metadata_binding["timestampColumn"] = timestamp_column
                metadata_bindings.append(metadata_binding)

    relationship_names = {}
    for relationship_id, value in relationship_parts:
        relationship_id = _definition_identifier(
            value.get("id"),
            relationship_id,
        )
        name = _strict_text(value.get("name")) or relationship_id
        relationship_names[relationship_id] = name
        source = value.get("source")
        target = value.get("target")
        source_id = (
            _definition_identifier(source.get("entityTypeId"))
            if isinstance(source, dict) and source.get("entityTypeId") is not None
            else None
        )
        target_id = (
            _definition_identifier(target.get("entityTypeId"))
            if isinstance(target, dict) and target.get("entityTypeId") is not None
            else None
        )
        _add_definition_fact(
            artifact,
            "Ontology relationship types",
            name,
            f"{entity_names.get(source_id, source_id) or 'unknown'} -> "
            f"{entity_names.get(target_id, target_id) or 'unknown'}",
        )
        definition_schema.append({
            "_mergeKey": f"ontology-relationship:{relationship_id}",
            "name": name,
            "objectType": "Ontology relationship",
            "objectId": _fabric_object_id(
                artifact.get("id"),
                "ontology-relationship",
                relationship_id,
            ),
            "sourceObjectId": entity_object_ids.get(source_id)
            or _fabric_object_id(
                artifact.get("id"),
                "ontology-entity",
                source_id,
            ),
            "targetObjectId": entity_object_ids.get(target_id)
            or _fabric_object_id(
                artifact.get("id"),
                "ontology-entity",
                target_id,
            ),
            "relation": "ontology relationship",
            "source": "Fabric Ontology definition",
            "description": (
                f"{entity_names.get(source_id, source_id) or 'unknown'} -> "
                f"{entity_names.get(target_id, target_id) or 'unknown'}"
            ),
            "columns": [],
            "measures": [],
        })
        if source_id in entity_names and target_id in entity_names:
            metadata_relationships.append({
                "id": relationship_id,
                "name": name,
                "sourceEntityId": source_id,
                "targetEntityId": target_id,
            })

    for relationship_id, contextualization_id, value in contextualization_parts:
        relationship_id = _definition_identifier(relationship_id)
        contextualization_id = _definition_identifier(
            value.get("id"),
            contextualization_id,
        )
        source = _source_metadata(value.get("dataBindingTable"))
        if source:
            source_id = source.get("itemId")
            if source_id:
                artifact.setdefault("_definitionSourceIds", set()).add(
                    source_id
                )
            _add_definition_fact(
                artifact,
                "Ontology contextualizations",
                f"{relationship_id}:{contextualization_id}",
                _source_summary(source),
            )
            relationship_ref = _metadata_object_ref(
                artifact.get("id"),
                "relationshipType",
                _fabric_object_id(
                    artifact.get("id"),
                    "ontology-relationship",
                    relationship_id,
                ),
                relationship_names.get(relationship_id)
                or relationship_id,
            )
            _add_artifact_object_edge(
                artifact,
                _source_object_reference(source),
                relationship_ref,
                "contextualizes relationship",
            )
            relationship = next(
                (
                    candidate
                    for candidate in metadata_relationships
                    if candidate["id"] == relationship_id
                ),
                None,
            )
            if (
                relationship
                and source.get("itemId")
                and source.get("table")
            ):
                source_key_bindings = []
                target_key_bindings = []
                for raw_values, output, entity_key in (
                    (
                        value.get("sourceKeyRefBindings")
                        or value.get("sourceKeyBindings"),
                        source_key_bindings,
                        "sourceEntityId",
                    ),
                    (
                        value.get("targetKeyRefBindings")
                        or value.get("targetKeyBindings"),
                        target_key_bindings,
                        "targetEntityId",
                    ),
                ):
                    for binding in (
                        raw_values
                        if isinstance(raw_values, list)
                        else []
                    ):
                        if not isinstance(binding, dict):
                            continue
                        source_column = _strict_text(
                            binding.get("sourceColumnName")
                            or binding.get("sourceColumn")
                        )
                        target_property_id = _definition_identifier(
                            binding.get("targetPropertyId")
                            or binding.get("propertyId")
                        )
                        if (
                            source_column
                            and (
                                relationship[entity_key],
                                target_property_id,
                            ) in property_refs
                        ):
                            output.append({
                                "sourceColumn": source_column,
                                "targetPropertyId": target_property_id,
                            })
                metadata_contextualization = {
                    "id": contextualization_id,
                    "relationshipId": relationship_id,
                    "sourceItemId": source["itemId"],
                    "sourceObject": source["table"],
                    "sourceKeyBindings": source_key_bindings,
                    "targetKeyBindings": target_key_bindings,
                }
                for target_key, source_key in (
                    ("sourceWorkspaceId", "workspaceId"),
                    ("sourceType", "sourceType"),
                    ("sourceSchema", "schema"),
                    ("sourceObjectId", "sourceObjectId"),
                ):
                    if source.get(source_key):
                        metadata_contextualization[target_key] = source[
                            source_key
                        ]
                metadata_contextualizations.append(
                    metadata_contextualization
                )
    artifact["_definitionSchema"] = _merge_schema_tables(
        definition_schema
    )
    metadata_entities = _dedupe_metadata(
        metadata_entities,
        lambda value: value.get("id"),
    )
    metadata_relationships = _dedupe_metadata(
        metadata_relationships,
        lambda value: value.get("id"),
    )
    metadata_bindings = _dedupe_metadata(
        metadata_bindings,
        lambda value: value.get("id"),
    )
    metadata_contextualizations = _dedupe_metadata(
        metadata_contextualizations,
        lambda value: value.get("id"),
    )
    artifact["_artifactMetadata"] = {
        "kind": "ontology",
        "entities": metadata_entities,
        "relationships": metadata_relationships,
        "bindings": metadata_bindings,
        "contextualizations": metadata_contextualizations,
    }
    artifact["_definitionUnknownParts"] = unknown


def _onelake_source(value):
    if not isinstance(value, dict):
        return None
    source = _source_metadata(value)
    properties = value.get("properties")
    properties = properties if isinstance(properties, dict) else {}
    path = _strict_text(properties.get("path"))
    if path:
        match = re.search(
            r"abfss://([0-9a-f-]{36})@onelake\.dfs\.fabric\.microsoft\.com/"
            r"([0-9a-f-]{36})/(Tables|Files)/(.*)$",
            path,
            re.IGNORECASE,
        )
        if match:
            source = source or {}
            source["workspaceId"] = _normalized_id(match.group(1))
            source["itemId"] = _normalized_id(match.group(2))
            source["sourceType"] = _strict_text(value.get("type"))
            source["table"] = _strict_text(match.group(4))
    return source


def _safe_graph_properties(values):
    result = []
    for value in (values or [])[:MAX_SCHEMA_COLUMNS_PER_OBJECT]:
        if not isinstance(value, dict):
            continue
        name = _strict_text(value.get("name"))
        data_type = _strict_text(value.get("type"))
        if name:
            result.append((name, data_type or "property"))
    return result


def _project_graph_definition(artifact, response):
    decoded_total = [0]
    known = {}
    unknown = 0
    known_paths = {
        "graphtype.json": "graphType",
        "graphdefinition.json": "graphDefinition",
        "datasources.json": "dataSources",
    }
    for part in _definition_parts(response):
        path = _strict_text(part.get("path"))
        if not path:
            raise DefinitionError("definition part path was invalid")
        lower_path = path.replace("\\", "/").casefold()
        if lower_path in (".platform", "stylingconfiguration.json"):
            continue
        name = known_paths.get(lower_path)
        if not name:
            unknown += 1
            continue
        _, value = _decode_definition_json(part, decoded_total)
        known[name] = value
        artifact.setdefault("_ontologyItemIds", set()).update(
            _explicit_ids(
                value,
                (
                    "ontologyId",
                    "ontologyItemId",
                    "sourceOntologyId",
                    "sourceOntologyItemId",
                    "generatedFromOntologyId",
                    "generatedFromOntologyItemId",
                ),
            )
        )

    graph_type = known.get("graphType", {})
    definition_schema = []
    schema_by_alias = {}
    metadata_node_types = []
    metadata_edge_types = []
    metadata_mappings = []
    ontology_ids = artifact.get("_ontologyItemIds") or set()
    ontology_item_id = (
        next(iter(ontology_ids)) if len(ontology_ids) == 1 else None
    )
    for node in graph_type.get("nodeTypes") or []:
        if not isinstance(node, dict):
            continue
        alias = _strict_text(node.get("alias"))
        if not alias:
            continue
        properties = _safe_graph_properties(node.get("properties"))
        labels = [
            label
            for label in node.get("labels") or []
            if _strict_text(label)
        ]
        _add_definition_fact(
            artifact,
            "Graph node types",
            alias,
            f"{', '.join(labels) or 'unlabeled'} | "
            f"{len(properties)} properties",
        )
        for name, data_type in properties:
            _add_definition_fact(
                artifact,
                "Graph node properties",
                f"{alias}.{name}",
                data_type,
            )
        schema_record = {
            "_mergeKey": f"graph-node:{alias}",
            "name": alias,
            "objectType": "Graph node",
            "objectId": _fabric_object_id(
                artifact.get("id"),
                "graph-node",
                alias,
            ),
            "source": "Fabric GraphModel definition",
            "description": ", ".join(labels) if labels else None,
            "columns": [
                {
                    "name": name,
                    "dataType": data_type,
                    "objectType": "Graph property",
                }
                for name, data_type in properties
            ],
            "measures": [],
        }
        metadata_node_types.append({
            "alias": alias,
            "labels": labels,
            "primaryKeyProperties": [
                key
                for key in node.get("primaryKeyProperties") or []
                if _strict_text(key)
            ],
            "properties": [
                {"name": name, "dataType": data_type}
                for name, data_type in properties
            ],
        })
        ontology_entity_id = _exact_scalar_id(
            node,
            (
                "ontologyEntityTypeId",
                "sourceOntologyEntityTypeId",
                "entityTypeId",
            ),
        )
        if ontology_item_id and ontology_entity_id:
            schema_record.update({
                "sourceObjectId": _fabric_object_id(
                    ontology_item_id,
                    "ontology-entity",
                    ontology_entity_id,
                ),
                "targetObjectId": schema_record["objectId"],
                "relation": "generated graph node",
                "sourceItemId": ontology_item_id,
                "sourceObjectName": ontology_entity_id,
                "sourceObjectType": "ontology-entity",
            })
        definition_schema.append(schema_record)
        schema_by_alias[("node", alias)] = schema_record
    for edge in graph_type.get("edgeTypes") or []:
        if not isinstance(edge, dict):
            continue
        alias = _strict_text(edge.get("alias"))
        if not alias:
            continue
        source = edge.get("sourceNodeType")
        target = edge.get("destinationNodeType")
        source_alias = (
            _strict_text(source.get("alias"))
            if isinstance(source, dict)
            else None
        )
        target_alias = (
            _strict_text(target.get("alias"))
            if isinstance(target, dict)
            else None
        )
        _add_definition_fact(
            artifact,
            "Graph edge types",
            alias,
            f"{source_alias or 'unknown'} -> {target_alias or 'unknown'} | "
            f"{len(_safe_graph_properties(edge.get('properties')))} properties",
        )
        properties = _safe_graph_properties(edge.get("properties"))
        schema_record = {
            "_mergeKey": f"graph-edge:{alias}",
            "name": alias,
            "objectType": "Graph edge",
            "objectId": _fabric_object_id(
                artifact.get("id"),
                "graph-edge",
                alias,
            ),
            "source": "Fabric GraphModel definition",
            "description": (
                f"{source_alias or 'unknown'} -> "
                f"{target_alias or 'unknown'}"
            ),
            "columns": [
                {
                    "name": name,
                    "dataType": data_type,
                    "objectType": "Graph property",
                }
                for name, data_type in properties
            ],
            "measures": [],
        }
        if source_alias and target_alias:
            metadata_edge_types.append({
                "alias": alias,
                "labels": [
                    label
                    for label in edge.get("labels") or []
                    if _strict_text(label)
                ],
                "sourceNodeType": source_alias,
                "destinationNodeType": target_alias,
                "properties": [
                    {"name": name, "dataType": data_type}
                    for name, data_type in properties
                ],
            })
        ontology_relationship_id = _exact_scalar_id(
            edge,
            (
                "ontologyRelationshipTypeId",
                "sourceOntologyRelationshipTypeId",
                "relationshipTypeId",
            ),
        )
        if ontology_item_id and ontology_relationship_id:
            schema_record.update({
                "sourceObjectId": _fabric_object_id(
                    ontology_item_id,
                    "ontology-relationship",
                    ontology_relationship_id,
                ),
                "targetObjectId": schema_record["objectId"],
                "relation": "generated graph edge",
                "sourceItemId": ontology_item_id,
                "sourceObjectName": ontology_relationship_id,
                "sourceObjectType": "ontology-relationship",
            })
        definition_schema.append(schema_record)
        schema_by_alias[("edge", alias)] = schema_record

    source_names = {}
    metadata_data_sources = []
    for source_value in known.get("dataSources", {}).get("dataSources") or []:
        if not isinstance(source_value, dict):
            continue
        name = _strict_text(source_value.get("name"))
        source = _onelake_source(source_value)
        if not name or not source:
            continue
        source_names[name] = source
        source_id = source.get("itemId")
        if source_id:
            artifact.setdefault("_definitionSourceIds", set()).add(source_id)
        _add_definition_fact(
            artifact,
            "Graph data sources",
            name,
            _source_summary(source),
        )
        if source.get("itemId") and source.get("table"):
            metadata_source = {
                "name": name,
                "sourceItemId": source["itemId"],
                "sourceObject": source["table"],
            }
            for target_key, source_key in (
                ("sourceWorkspaceId", "workspaceId"),
                ("sourceObjectId", "sourceObjectId"),
                ("sourceType", "sourceType"),
            ):
                if source.get(source_key):
                    metadata_source[target_key] = source[source_key]
            metadata_data_sources.append(metadata_source)

    graph_definition = known.get("graphDefinition", {})
    for collection, section, alias_field in (
        ("nodeTables", "Graph node mappings", "nodeTypeAlias"),
        ("edgeTables", "Graph edge mappings", "edgeTypeAlias"),
    ):
        for mapping in graph_definition.get(collection) or []:
            if not isinstance(mapping, dict):
                continue
            alias = _strict_text(mapping.get(alias_field))
            data_source_name = _strict_text(mapping.get("dataSourceName"))
            if not alias or not data_source_name:
                continue
            property_mappings = mapping.get("propertyMappings")
            count = (
                len(property_mappings)
                if isinstance(property_mappings, list)
                else 0
            )
            _add_definition_fact(
                artifact,
                section,
                alias,
                f"{data_source_name} | {count} property mappings",
            )
            kind = "node" if collection == "nodeTables" else "edge"
            schema_record = schema_by_alias.get((kind, alias))
            if schema_record:
                schema_record["source"] = (
                    "Fabric GraphModel definition | "
                    f"{data_source_name}"
                )
                source = source_names.get(data_source_name)
                target_kind = (
                    "nodeType" if kind == "node" else "edgeType"
                )
                target_object_kind = (
                    "graph-node" if kind == "node" else "graph-edge"
                )
                target_ref = _metadata_object_ref(
                    artifact.get("id"),
                    target_kind,
                    schema_record.get("objectId")
                    or _fabric_object_id(
                        artifact.get("id"),
                        target_object_kind,
                        alias,
                    ),
                    alias,
                )
                _add_artifact_object_edge(
                    artifact,
                    _source_object_reference(source),
                    target_ref,
                    "maps node" if kind == "node" else "maps edge",
                )
                for property_mapping in (
                    property_mappings
                    if isinstance(property_mappings, list)
                    else []
                ):
                    if not isinstance(property_mapping, dict):
                        continue
                    property_name = _strict_text(
                        property_mapping.get("propertyName")
                    )
                    if not property_name:
                        continue
                    _add_artifact_object_edge(
                        artifact,
                        _source_column_reference(
                            source,
                            property_mapping.get("sourceColumn"),
                        ),
                        _metadata_object_ref(
                            artifact.get("id"),
                            "property",
                            _fabric_object_id(
                                artifact.get("id"),
                                "graph-property",
                                f"{alias}/{property_name}",
                            ),
                            property_name,
                            parent_id=target_ref["id"]
                            if target_ref
                            else None,
                            table_name=alias,
                        ),
                        "maps property",
                    )
                source = source_names.get(data_source_name)
                property_names = {
                    name
                    for name, _ in _safe_graph_properties(
                        next(
                            (
                                candidate.get("properties")
                                for candidate in (
                                    graph_type.get("nodeTypes")
                                    if kind == "node"
                                    else graph_type.get("edgeTypes")
                                ) or []
                                if isinstance(candidate, dict)
                                and _strict_text(candidate.get("alias"))
                                == alias
                            ),
                            [],
                        )
                    )
                }
                safe_mappings = []
                for property_mapping in (
                    property_mappings
                    if isinstance(property_mappings, list)
                    else []
                ):
                    if not isinstance(property_mapping, dict):
                        continue
                    property_name = _strict_text(
                        property_mapping.get("propertyName")
                    )
                    source_column = _strict_text(
                        property_mapping.get("sourceColumn")
                    )
                    if (
                        property_name in property_names
                        and source_column
                    ):
                        safe_mappings.append({
                            "propertyName": property_name,
                            "sourceColumn": source_column,
                        })
                mapping_id = _definition_identifier(
                    mapping.get("id"),
                    f"{kind}:{alias}",
                )
                if (
                    mapping_id
                    and source
                    and source.get("itemId")
                    and source.get("table")
                ):
                    metadata_mapping = {
                        "id": mapping_id,
                        "kind": kind,
                        "typeAlias": alias,
                        "dataSourceName": data_source_name,
                        "sourceItemId": source["itemId"],
                        "sourceObject": source["table"],
                        "propertyMappings": safe_mappings,
                    }
                    for target_key, source_key in (
                        ("sourceWorkspaceId", "workspaceId"),
                        ("sourceObjectId", "sourceObjectId"),
                    ):
                        if source.get(source_key):
                            metadata_mapping[target_key] = source[source_key]
                    if kind == "edge":
                        metadata_mapping["sourceNodeKeyColumns"] = [
                            value
                            for value in mapping.get(
                                "sourceNodeKeyColumns"
                            ) or []
                            if _strict_text(value)
                        ]
                        metadata_mapping[
                            "destinationNodeKeyColumns"
                        ] = [
                            value
                            for value in mapping.get(
                                "destinationNodeKeyColumns"
                            ) or []
                            if _strict_text(value)
                        ]
                    metadata_mappings.append(metadata_mapping)
    artifact["_definitionSchema"] = _merge_schema_tables(
        definition_schema
    )
    metadata_data_sources = _dedupe_metadata(
        metadata_data_sources,
        lambda value: value.get("name"),
    )
    metadata_node_types = _dedupe_metadata(
        metadata_node_types,
        lambda value: value.get("alias"),
    )
    metadata_edge_types = _dedupe_metadata(
        metadata_edge_types,
        lambda value: value.get("alias"),
    )
    metadata_mappings = _dedupe_metadata(
        metadata_mappings,
        lambda value: value.get("id"),
    )
    node_aliases = {
        node["alias"]
        for node in metadata_node_types
    }
    metadata_edge_types = [
        edge
        for edge in metadata_edge_types
        if edge["sourceNodeType"] in node_aliases
        and edge["destinationNodeType"] in node_aliases
    ]
    edge_aliases = {
        edge["alias"]
        for edge in metadata_edge_types
    }
    metadata_mappings = [
        mapping
        for mapping in metadata_mappings
        if (
            mapping["kind"] == "node"
            and mapping["typeAlias"] in node_aliases
        )
        or (
            mapping["kind"] == "edge"
            and mapping["typeAlias"] in edge_aliases
        )
    ]
    artifact["_artifactMetadata"] = {
        "kind": "graphModel",
        "dataSources": metadata_data_sources,
        "nodeTypes": metadata_node_types,
        "edgeTypes": metadata_edge_types,
        "mappings": metadata_mappings,
    }
    artifact["_definitionUnknownParts"] = unknown


def _data_agent_source_object_kind(source_type, element_type):
    source = (_strict_text(source_type) or "").casefold()
    element = (_strict_text(element_type) or "").casefold()
    if source == "ontology":
        if element in ("ontology.entity", "graph.nodetype"):
            return "ontology-entity"
        if element in ("ontology.relationship", "graph.edgetype"):
            return "ontology-relationship"
        if element in (
            "ontology.property",
            "ontology.timeseriesproperty",
            "graph.property",
        ):
            return "ontology-property"
    if source == "graph":
        if element == "graph.nodetype":
            return "graph-node"
        if element == "graph.edgetype":
            return "graph-edge"
        if element == "graph.property":
            return "graph-property"
    mappings = {
        "lakehouse_tables.table": "lakehouse-table",
        "lakehouse_tables.column": "lakehouse-table-column",
        "warehouse_tables.table": "warehouse-table",
        "warehouse_tables.column": "warehouse-table-column",
        "kusto.table": "kql-table",
        "kusto.column": "kql-table-column",
        "kusto.function": "kql-function",
        "kusto.materializedview": "kql-materialized-view",
        "semantic_model.table": "semantic-model-table",
        "semantic_model.column": "semantic-model-table-column",
        "semantic_model.measure": "semantic-model-measure",
        "mirrored_database.table": "table",
        "mirrored_database.column": "table-column",
        "graph.nodetype": "graph-node",
        "graph.edgetype": "graph-edge",
        "graph.property": "graph-property",
    }
    return mappings.get(element)


def _source_element_identity(
    source_type,
    element_type,
    element_id,
    display_name,
    parent_identity,
):
    source = (_strict_text(source_type) or "").casefold()
    element = (_strict_text(element_type) or "").casefold()
    if source in ("ontology", "graph") and element_id:
        return element_id
    if element.endswith(".table"):
        return (
            f"{parent_identity}.{display_name}"
            if parent_identity
            else display_name
        )
    if (
        element.endswith(".column")
        or element.endswith(".measure")
    ) and parent_identity:
        return f"{parent_identity}/{display_name}"
    return "/".join(
        value for value in (parent_identity, display_name) if value
    )


def _data_agent_group_identity(element_type, display_name, parent_identity):
    element = (_strict_text(element_type) or "").casefold()
    if element.endswith(".schema"):
        return ".".join(
            value for value in (parent_identity, display_name) if value
        )
    return parent_identity


def _selected_element_facts(
    artifact,
    source_name,
    elements,
    source_id=None,
    source_type=None,
    target_object_id=None,
    parent_display="",
    parent_identity="",
    parent_source_kind=None,
    parent_source_object_id=None,
    parent_target_object_id=None,
    table_name=None,
    parent_path=None,
    selected_elements=None,
    metadata_elements=None,
    metadata_parent_id=None,
    metadata_parent_name=None,
    metadata_budget=None,
    state=None,
):
    for element in elements or []:
        if not isinstance(element, dict):
            continue
        display_name = _bounded_text(
            element.get("display_name") or element.get("displayName")
        )
        element_type = _strict_text(element.get("type"))
        element_data_type = _strict_text(
            element.get("data_type") or element.get("dataType")
        )
        selected = element.get("is_selected")
        if display_name:
            display_path = " / ".join(
                value for value in (parent_display, display_name) if value
            )
            element_id = _definition_identifier(element.get("id"))
            source_identity = _source_element_identity(
                source_type,
                element_type,
                element_id,
                display_name,
                parent_identity,
            )
            source_object_type = _data_agent_source_object_kind(
                source_type,
                element_type,
            )
            _add_definition_fact(
                artifact,
                "Data agent selected elements",
                f"{source_name}:{display_path}",
                f"{element_type or 'element'} | selected "
                f"{'yes' if selected is True else 'no'}",
            )
            next_parent_identity = source_identity
            next_parent_source_kind = source_object_type
            next_parent_source_object_id = (
                _fabric_object_id(
                    source_id,
                    source_object_type,
                    source_identity,
                )
                if source_object_type
                else parent_source_object_id
            )
            next_table_name = table_name
            if (
                source_object_type
                and _metadata_source_kind(source_object_type)
                in ("table", "view", "materializedView")
            ):
                next_table_name = source_identity
            next_parent_target_id = parent_target_object_id
            next_parent_path = list(parent_path or [])
            next_metadata_elements = metadata_elements
            next_metadata_parent_id = metadata_parent_id
            next_metadata_parent_name = metadata_parent_name
            if (
                selected is True
                and source_object_type
                and selected_elements is not None
            ):
                if metadata_budget is not None:
                    metadata_budget["count"] += 1
                    if (
                        metadata_budget["count"]
                        > MAX_ARTIFACT_METADATA_ELEMENTS
                    ):
                        artifact["_artifactMetadataTruncated"] = True
                        return
                selected_object_id = _fabric_object_id(
                    artifact.get("id"),
                    "data-agent-selected-element",
                    (
                        f"{source_id or source_name}/"
                        f"{element_id or source_identity}"
                    ),
                )
                selected_elements.append({
                    "name": display_name,
                    "dataType": element_data_type
                    or element_type
                    or "element",
                    "objectType": "Data Agent selected element",
                    "objectId": selected_object_id,
                    "parentObjectId": (
                        parent_target_object_id or target_object_id
                    ),
                    "parentPath": list(next_parent_path),
                    "tableName": next_table_name,
                    "sourceObjectId": _fabric_object_id(
                        source_id,
                        source_object_type,
                        source_identity,
                    ),
                    "sourceParentObjectId": parent_source_object_id,
                    "sourceParentPath": list(next_parent_path),
                    "sourceTableName": next_table_name,
                    "targetObjectId": selected_object_id,
                    "relation": "selected by data agent",
                    "sourceItemId": source_id,
                    "sourceObjectName": display_name,
                    "sourceObjectType": source_object_type,
                })
                if metadata_elements is not None and element_id:
                    metadata_element = {
                        "id": element_id,
                        "displayName": display_name,
                        "elementType": element_type,
                        "selected": True,
                        "sourceArtifactId": source_id,
                        "parentPath": list(next_parent_path),
                        "children": [],
                    }
                    if element_data_type:
                        metadata_element["dataType"] = element_data_type
                    if metadata_parent_id:
                        metadata_element["parentId"] = metadata_parent_id
                    if metadata_parent_name:
                        metadata_element["parentName"] = metadata_parent_name
                    index_state = _strict_text(
                        element.get("index_state")
                        or element.get("indexState")
                    )
                    if index_state:
                        metadata_element["indexState"] = index_state
                    if state:
                        metadata_element["state"] = state
                    metadata_elements.append(metadata_element)
                    next_metadata_elements = metadata_element["children"]
                    next_metadata_parent_id = element_id
                    next_metadata_parent_name = display_name
                next_parent_target_id = selected_object_id
                next_parent_path.append(display_name)
            elif not source_object_type:
                next_parent_identity = _data_agent_group_identity(
                    element_type,
                    display_name,
                    parent_identity,
                )
                next_parent_source_kind = parent_source_kind
                next_parent_source_object_id = parent_source_object_id
            children = element.get("children")
            if isinstance(children, list):
                _selected_element_facts(
                    artifact,
                    source_name,
                    children,
                    source_id=source_id,
                    source_type=source_type,
                    target_object_id=target_object_id,
                    parent_display=display_path,
                    parent_identity=next_parent_identity,
                    parent_source_kind=next_parent_source_kind,
                    parent_source_object_id=next_parent_source_object_id,
                    parent_target_object_id=next_parent_target_id,
                    table_name=next_table_name,
                    parent_path=next_parent_path,
                    selected_elements=selected_elements,
                    metadata_elements=next_metadata_elements,
                    metadata_parent_id=next_metadata_parent_id,
                    metadata_parent_name=next_metadata_parent_name,
                    metadata_budget=metadata_budget,
                    state=state,
                )


def _flatten_data_agent_elements(elements):
    flattened = []
    for element in elements or []:
        if not isinstance(element, dict):
            continue
        flattened.append(element)
        flattened.extend(
            _flatten_data_agent_elements(element.get("children"))
        )
    return flattened


def _project_data_agent_definition(artifact, response):
    decoded_total = [0]
    unknown = 0
    stages = set()
    published_description = None
    definition_schema = []
    metadata_sources = {}
    metadata_source_order = []
    for part in _definition_parts(response):
        path = _strict_text(part.get("path"))
        if not path:
            raise DefinitionError("definition part path was invalid")
        normalized_path = path.replace("\\", "/")
        lower_path = normalized_path.casefold()
        if lower_path in (
            ".platform",
            "dataagentv1.json",
            "files/config/data_agent.json",
        ):
            continue
        if lower_path.endswith("/fewshots.json"):
            continue
        if lower_path == "files/config/publish_info.json":
            _, value = _decode_definition_json(part, decoded_total)
            published_description = _strict_text(value.get("description"))
            continue
        stage_match = re.fullmatch(
            r"Files/Config/(draft|published)/stage_config\.json",
            normalized_path,
            re.IGNORECASE,
        )
        if stage_match:
            stages.add(stage_match.group(1).casefold())
            continue
        source_match = re.fullmatch(
            r"Files/Config/(draft|published)/[^/]+/datasource\.json",
            normalized_path,
            re.IGNORECASE,
        )
        if source_match:
            stage = source_match.group(1).casefold()
            stages.add(stage)
            _, value = _decode_definition_json(part, decoded_total)
            source_id = _normalized_id(value.get("artifactId"))
            source_name = _bounded_text(value.get("displayName")) or (
                source_id or "source"
            )
            source_type = _strict_text(value.get("type")) or "unknown"
            if source_id:
                artifact.setdefault("_definitionSourceIds", set()).add(
                    source_id
                )
            _add_definition_fact(
                artifact,
                "Data agent sources",
                f"{stage}:{source_name}",
                f"{source_type} | {source_id or 'external source'}",
            )
            agent_source_object_id = _fabric_object_id(
                artifact.get("id"),
                "data-agent-source",
                f"{stage}/{source_id or source_name}",
            )
            elements = value.get("elements")
            selected_elements = []
            metadata_elements = []
            metadata_budget = {"count": 0}
            if isinstance(elements, list):
                _selected_element_facts(
                    artifact,
                    f"{stage}:{source_name}",
                    elements,
                    source_id=source_id,
                    source_type=source_type,
                    target_object_id=agent_source_object_id,
                    selected_elements=selected_elements,
                    metadata_elements=metadata_elements,
                    metadata_budget=metadata_budget,
                    state=stage,
                )
            definition_schema.append({
                "_mergeKey": (
                    f"data-agent-source:{stage}:"
                    f"{source_id or source_name}"
                ),
                "name": f"{stage}:{source_name}",
                "objectType": "Data Agent source",
                "objectId": agent_source_object_id,
                "source": "Fabric DataAgent definition",
                "description": (
                    f"{source_type} | {source_id or 'external source'}"
                ),
                "columns": selected_elements,
                "measures": [],
            })
            if source_id:
                metadata_source = {
                    "artifactId": source_id,
                    "displayName": source_name,
                    "sourceType": source_type,
                    "elements": metadata_elements,
                    "selectedElements": [
                        {
                            key: field
                            for key, field in {
                                "id": element.get("id"),
                                "displayName": element.get("displayName"),
                                "elementType": element.get("elementType"),
                                "sourceArtifactId": element.get(
                                    "sourceArtifactId"
                                ),
                                "dataType": element.get("dataType"),
                                "parentId": element.get("parentId"),
                                "parentName": element.get("parentName"),
                                "parentPath": element.get("parentPath"),
                                "state": element.get("state"),
                                "indexState": element.get("indexState"),
                            }.items()
                            if field is not None
                        }
                        for element in _flatten_data_agent_elements(
                            metadata_elements
                        )
                    ],
                    "_stage": stage,
                }
                workspace_id = _normalized_id(value.get("workspaceId"))
                if workspace_id:
                    metadata_source["workspaceId"] = workspace_id
                existing = metadata_sources.get(source_id)
                if existing is None:
                    metadata_source_order.append(source_id)
                if (
                    existing is None
                    or existing.get("_stage") != "published"
                    and stage == "published"
                ):
                    metadata_sources[source_id] = metadata_source
            continue
        unknown += 1
    _add_definition_fact(
        artifact,
        "Data agent",
        "State",
        "published" if "published" in stages else "draft",
    )
    if published_description:
        _add_definition_fact(
            artifact,
            "Data agent",
            "Published description",
            published_description,
        )
    artifact["_definitionSchema"] = _merge_schema_tables(
        definition_schema
    )
    artifact["_artifactMetadata"] = {
        "kind": "dataAgent",
        "sources": [
            {
                key: value
                for key, value in metadata_sources[source_id].items()
                if key != "_stage"
            }
            for source_id in metadata_source_order
        ],
    }
    artifact["_definitionUnknownParts"] = unknown


def _project_definition(artifact, response):
    artifact_type = artifact.get("_type")
    if artifact_type == "Ontology":
        _project_ontology_definition(artifact, response)
    elif artifact_type == "GraphModel":
        _project_graph_definition(artifact, response)
    elif artifact_type == "DataAgent":
        _project_data_agent_definition(artifact, response)
    else:
        raise DefinitionError("definition type was unsupported")


def _kusto_url(value):
    text = _strict_text(value)
    if not text:
        raise ValueError("KQL query service URI was missing")
    parsed = urllib.parse.urlparse(text)
    host = (parsed.hostname or "").casefold()
    if (
        parsed.scheme != "https"
        or (
            not host.endswith(".kusto.fabric.microsoft.com")
            and not host.endswith(".kusto.windows.net")
        )
    ):
        raise ValueError("KQL query service URI used an unexpected origin")
    return text.rstrip("/") + "/v1/rest/mgmt"


def _json_documents(value):
    documents = []
    if isinstance(value, dict):
        if isinstance(value.get("Databases"), dict):
            documents.append(value)
        for table in value.get("Tables") or []:
            if not isinstance(table, dict):
                continue
            for row in table.get("Rows") or []:
                if not isinstance(row, list):
                    continue
                for cell in row:
                    if not isinstance(cell, str):
                        continue
                    try:
                        parsed = json.loads(cell)
                    except json.JSONDecodeError:
                        continue
                    if isinstance(parsed, dict):
                        documents.extend(_json_documents(parsed))
    return documents


def _kusto_entities(database, name):
    values = database.get(name)
    if isinstance(values, dict):
        return [
            (key, value)
            for key, value in values.items()
            if isinstance(value, dict)
        ]
    if isinstance(values, list):
        return [
            (_strict_text(value.get("Name")) or "", value)
            for value in values
            if isinstance(value, dict)
        ]
    return []


def _kusto_schema(response, database_name):
    documents = _json_documents(response)
    if not documents:
        raise ValueError("KQL schema response omitted database metadata")
    databases = documents[0]["Databases"]
    database = next(
        (
            value
            for key, value in databases.items()
            if str(key).casefold() == database_name.casefold()
            and isinstance(value, dict)
        ),
        None,
    )
    if database is None and len(databases) == 1:
        database = next(iter(databases.values()))
    if not isinstance(database, dict):
        raise ValueError("KQL schema response omitted the requested database")

    tables = []
    for collection, object_type in (
        ("Tables", "KQL table"),
        ("ExternalTables", "KQL external table"),
        ("MaterializedViews", "KQL materialized view"),
    ):
        for key, value in _kusto_entities(database, collection):
            name = _strict_text(value.get("Name")) or _strict_text(key)
            schema = value.get("Schema")
            schema = schema if isinstance(schema, dict) else value
            ordered_columns = schema.get("OrderedColumns")
            columns = []
            for column in (
                ordered_columns if isinstance(ordered_columns, list) else []
            ):
                if not isinstance(column, dict):
                    continue
                column_name = _strict_text(column.get("Name"))
                if not column_name:
                    continue
                columns.append({
                    "name": column_name,
                    "dataType": _strict_text(
                        column.get("CslType") or column.get("Type")
                    ) or "column",
                })
            if name:
                tables.append({
                    "_mergeKey": f"{collection}:{name}",
                    "name": name,
                    "objectType": object_type,
                    "source": "Kusto read-only management API",
                    "columns": columns,
                    "measures": [],
                })
    functions = []
    for key, value in _kusto_entities(database, "Functions"):
        name = _strict_text(value.get("Name")) or _strict_text(key)
        if not name:
            continue
        parameters = []
        raw_parameters = (
            value.get("Parameters")
            or value.get("InputParameters")
            or []
        )
        for parameter in (
            raw_parameters if isinstance(raw_parameters, list) else []
        ):
            if not isinstance(parameter, dict):
                continue
            parameter_name = _strict_text(
                parameter.get("Name") or parameter.get("name")
            )
            data_type = _strict_text(
                parameter.get("CslType")
                or parameter.get("Type")
                or parameter.get("dataType")
            )
            if parameter_name and data_type:
                parameters.append({
                    "name": parameter_name,
                    "dataType": data_type,
                })
        metadata = {"name": name, "parameters": parameters}
        for output_key, source_keys in (
            ("folder", ("Folder", "folder")),
            ("description", ("DocString", "Description", "description")),
            ("returnType", ("ReturnType", "returnType")),
        ):
            candidate = next(
                (
                    _bounded_text(
                        value.get(source_key),
                        512 if output_key == "description" else 256,
                    )
                    for source_key in source_keys
                    if _strict_text(value.get(source_key))
                ),
                None,
            )
            if candidate:
                metadata[output_key] = candidate
        functions.append(metadata)

    materialized_views = []
    for key, value in _kusto_entities(database, "MaterializedViews"):
        name = _strict_text(value.get("Name")) or _strict_text(key)
        if not name:
            continue
        schema = value.get("Schema")
        schema = schema if isinstance(schema, dict) else value
        columns = []
        for column in (
            schema.get("OrderedColumns")
            if isinstance(schema.get("OrderedColumns"), list)
            else []
        ):
            if not isinstance(column, dict):
                continue
            column_name = _strict_text(column.get("Name"))
            data_type = _strict_text(
                column.get("CslType") or column.get("Type")
            )
            if column_name and data_type:
                columns.append({
                    "name": column_name,
                    "dataType": data_type,
                })
        metadata = {"name": name, "columns": columns}
        source_table = _strict_text(
            value.get("SourceTable")
            or value.get("SourceTableName")
        )
        description = _bounded_text(
            value.get("DocString")
            or value.get("Description"),
            512,
        )
        if source_table:
            metadata["sourceTable"] = source_table
        if description:
            metadata["description"] = description
        materialized_views.append(metadata)

    for function in functions:
        tables.append({
                "_mergeKey": f"Functions:{function['name']}",
                "name": function["name"],
                "objectType": "KQL function",
                "source": "Kusto read-only management API",
                "columns": [],
                "measures": [],
            })
    functions = _dedupe_metadata(
        functions,
        lambda value: value.get("name"),
    )
    materialized_views = _dedupe_metadata(
        materialized_views,
        lambda value: value.get("name"),
    )
    return (
        _merge_schema_tables(tables),
        sorted(functions, key=lambda value: value["name"].casefold()),
        sorted(
            materialized_views,
            key=lambda value: value["name"].casefold(),
        ),
    )


def _collect_kql_schema(token, artifact):
    detail = artifact.get("_detail")
    detail = detail if isinstance(detail, dict) else {}
    properties = detail.get("properties")
    properties = properties if isinstance(properties, dict) else {}
    database_name = (
        _strict_text(properties.get("databaseName"))
        or _strict_text(detail.get("displayName"))
        or _strict_text(artifact.get("displayName"))
    )
    query_service_uri = _strict_text(properties.get("queryServiceUri"))
    if not database_name or not query_service_uri:
        raise ValueError("KQL database identity was incomplete")
    escaped_name = database_name.replace("'", "''")
    response = _req(
        token,
        _kusto_url(query_service_uri),
        method="POST",
        body={
            "db": database_name,
            "csl": (
                f".show database ['{escaped_name}'] schema as json "
                "with(Tables=True,ExternalTables=True,"
                "MaterializedViews=True,Functions=True)"
            ),
        },
        headers={
            "Accept": "application/json",
            "x-ms-readonly": "true",
            "x-ms-app": "Fabric Atlas",
        },
    )
    schema, functions, materialized_views = _kusto_schema(
        response,
        database_name,
    )
    artifact["_kqlSchema"] = schema
    artifact["_kqlFunctions"] = functions
    artifact["_kqlMaterializedViews"] = materialized_views
    artifact["_artifactMetadata"] = {
        "kind": "kql",
        "functions": functions,
        "materializedViews": materialized_views,
    }


def _sql_endpoint(value):
    text = _strict_text(value)
    if not text or any(
        character in text
        for character in ("\x00", "\r", "\n", ";", "{", "}")
    ):
        raise ValueError("SQL server endpoint was invalid")
    if "://" in text:
        parsed = urllib.parse.urlparse(text)
        if (
            parsed.scheme.casefold() != "https"
            or parsed.username
            or parsed.password
            or parsed.path not in ("", "/")
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("SQL server endpoint was invalid")
        host = parsed.hostname
        try:
            port = parsed.port or 1433
        except ValueError as error:
            raise ValueError("SQL server endpoint port was invalid") from error
    else:
        endpoint = text[4:] if text.casefold().startswith("tcp:") else text
        if endpoint.count(",") > 1:
            raise ValueError("SQL server endpoint was invalid")
        host, separator, raw_port = endpoint.rpartition(",")
        if not separator:
            host = endpoint
            raw_port = "1433"
        try:
            port = int(raw_port)
        except ValueError as error:
            raise ValueError("SQL server endpoint port was invalid") from error
    host = _strict_text(host)
    labels = host.casefold().split(".") if host else []
    if (
        not host
        or not re.fullmatch(r"[A-Za-z0-9.-]+", host)
        or any(
            not re.fullmatch(
                r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?",
                label,
            )
            for label in labels
        )
        or not host.casefold().endswith(".database.fabric.microsoft.com")
        or host.casefold() == "database.fabric.microsoft.com"
        or port != 1433
    ):
        raise ValueError("SQL server endpoint used an unexpected origin")
    return host.casefold(), port


def _sql_database_name(value):
    text = _strict_text(value)
    if (
        not text
        or len(text) > 128
        or any(
            character in text
            for character in ("\x00", "\r", "\n", ";", "{", "}")
        )
    ):
        raise ValueError("SQL database name was invalid")
    return text


def _pack_sql_access_token(token):
    text = _strict_text(token)
    if (
        not text
        or len(text) < 32
        or len(text) > MAX_SQL_TOKEN_CHARACTERS
        or any(ord(character) < 32 for character in text)
    ):
        raise ValueError("SQL access token was invalid")
    token_bytes = text.encode("utf-16le")
    return struct.pack(
        f"<I{len(token_bytes)}s",
        len(token_bytes),
        token_bytes,
    )


def _sql_timeout_seconds(deadline):
    remaining = deadline.remaining()
    if remaining < 1:
        raise DeadlineExceeded("execution deadline exhausted")
    return max(
        1,
        min(REQUEST_TIMEOUT_SECONDS, int(math.floor(remaining))),
    )


def _load_mssql_driver():
    try:
        return importlib.import_module("mssql_python")
    except (ImportError, ModuleNotFoundError, OSError) as error:
        raise SqlRuntimeUnavailable(
            "mssql-python runtime was unavailable"
        ) from error


def _sql_connect(driver, connection_string, token, timeout):
    try:
        return driver.connect(
            connection_string,
            autocommit=True,
            attrs_before={
                SQL_COPT_SS_ACCESS_TOKEN: _pack_sql_access_token(token),
            },
            timeout=timeout,
        )
    except (ImportError, ModuleNotFoundError, OSError) as error:
        raise SqlRuntimeUnavailable(
            "mssql-python native runtime was unavailable"
        ) from error
    except Exception as error:
        message = str(error).casefold()
        if (
            "28000" in message
            or "18456" in message
            or "login failed" in message
            or "authentication" in message
        ):
            raise SqlAuthorizationError(
                "SQL authentication failed"
            ) from error
        raise SqlConnectionError("SQL connection failed") from error


def _sql_fetch_rows(connection, query, limit, deadline):
    cursor = None
    active_error = None
    try:
        connection.timeout = _sql_timeout_seconds(deadline)
        cursor = connection.cursor()
        cursor.execute(query)
        rows = list(cursor.fetchmany(limit + 1))
        if len(rows) > limit:
            raise ResponseSizeExceeded(
                "SQL catalog response exceeded the safe row limit"
            )
        return rows
    except (DeadlineExceeded, ResponseSizeExceeded) as error:
        active_error = error
        raise
    except Exception as error:
        active_error = error
        raise SqlCatalogQueryError(
            "SQL catalog query failed"
        ) from error
    finally:
        if cursor is not None:
            try:
                cursor.close()
            except Exception as error:
                if active_error is None:
                    raise SqlCatalogQueryError(
                        "SQL catalog cursor cleanup failed"
                    ) from error


def _sql_catalog_projection(object_rows, primary_key_rows, foreign_key_rows):
    def row_values(row, minimum):
        if isinstance(row, (str, bytes, bytearray, dict)):
            raise ValueError("SQL catalog row was invalid")
        try:
            if len(row) < minimum:
                raise ValueError("SQL catalog row was invalid")
            return [row[index] for index in range(minimum)]
        except (TypeError, IndexError) as error:
            raise ValueError("SQL catalog row was invalid") from error

    def ordinal(value):
        return (
            int(value)
            if isinstance(value, numbers.Integral)
            and not isinstance(value, bool)
            else 0
        )

    objects = {}
    order = []
    for row in object_rows:
        values = row_values(row, 6)
        schema_name = _strict_text(values[0])
        object_name = _strict_text(values[1])
        object_code = _strict_text(values[2])
        if (
            not schema_name
            or not object_name
            or object_code not in ("U", "V")
        ):
            raise ValueError("SQL catalog object identity was invalid")
        key = (schema_name.casefold(), object_name.casefold(), object_code)
        if key not in objects:
            if len(objects) >= MAX_SCHEMA_OBJECTS_PER_ITEM:
                raise ResponseSizeExceeded(
                    "SQL catalog exceeded the safe object limit"
                )
            objects[key] = {
                "schema": schema_name,
                "name": object_name,
                "objectType": (
                    "SQL table" if object_code == "U" else "SQL view"
                ),
                "columns": [],
            }
            order.append(key)
        column_name = _strict_text(values[3])
        if column_name:
            columns = objects[key]["columns"]
            if len(columns) >= MAX_SCHEMA_COLUMNS_PER_OBJECT:
                raise ResponseSizeExceeded(
                    "SQL catalog exceeded the safe column limit"
                )
            columns.append({
                "name": column_name,
                "dataType": _strict_text(values[4]) or "column",
            })

    primary_keys = {}
    for row in primary_key_rows:
        values = row_values(row, 5)
        schema_name = _strict_text(values[0])
        table_name = _strict_text(values[1])
        key_name = _strict_text(values[2])
        column_name = _strict_text(values[3])
        if all((schema_name, table_name, key_name, column_name)):
            key = (schema_name, table_name, key_name)
            primary_keys.setdefault(key, []).append(
                (ordinal(values[4]), column_name)
            )

    foreign_keys = {}
    for row in foreign_key_rows:
        raw_values = row_values(row, 8)
        values = [_strict_text(value) for value in raw_values[:7]]
        if all(values):
            key = tuple(values[:3] + values[4:6])
            foreign_keys.setdefault(key, []).append(
                (ordinal(raw_values[7]), values[3], values[6])
            )

    facts = []
    for (schema_name, table_name, key_name), columns in primary_keys.items():
        ordered = [
            name
            for _, name in sorted(columns, key=lambda value: value[0])
        ]
        facts.append((
            "Primary key",
            f"{schema_name}.{table_name}",
            f"{key_name}: {', '.join(ordered)}",
        ))
    for key, columns in foreign_keys.items():
        key_name, source_schema, source_table, target_schema, target_table = key
        ordered = sorted(columns, key=lambda value: value[0])
        source_columns = ", ".join(value[1] for value in ordered)
        target_columns = ", ".join(value[2] for value in ordered)
        facts.append((
            "Foreign key",
            key_name,
            (
                f"{source_schema}.{source_table}({source_columns}) -> "
                f"{target_schema}.{target_table}({target_columns})"
            ),
        ))

    schema = _schema_objects(
        [objects[key] for key in order],
        "SQL table",
        "Fabric SQL system catalog",
    )
    return schema, facts


def _collect_sql_schema(token, artifact):
    detail = artifact.get("_detail")
    detail = detail if isinstance(detail, dict) else {}
    properties = detail.get("properties")
    properties = properties if isinstance(properties, dict) else {}
    host, port = _sql_endpoint(properties.get("serverFqdn"))
    database_name = _sql_database_name(properties.get("databaseName"))
    deadline = _ACTIVE_DEADLINE.get() or _ExecutionDeadline()
    timeout = _sql_timeout_seconds(deadline)
    connection_string = (
        f"Server=tcp:{host},{port};"
        f"Database={database_name};"
        "Encrypt=yes;"
        "TrustServerCertificate=no;"
        "ApplicationIntent=ReadOnly;"
    )
    driver = _load_mssql_driver()
    connection = _sql_connect(
        driver,
        connection_string,
        token,
        timeout,
    )
    active_error = None
    try:
        object_rows = _sql_fetch_rows(
            connection,
            SQL_OBJECTS_QUERY,
            MAX_SQL_CATALOG_ROWS,
            deadline,
        )
        primary_key_rows = _sql_fetch_rows(
            connection,
            SQL_PRIMARY_KEYS_QUERY,
            MAX_SQL_RELATIONSHIP_ROWS,
            deadline,
        )
        foreign_key_rows = _sql_fetch_rows(
            connection,
            SQL_FOREIGN_KEYS_QUERY,
            MAX_SQL_RELATIONSHIP_ROWS,
            deadline,
        )
    except Exception as error:
        active_error = error
        raise
    finally:
        try:
            connection.close()
        except Exception as error:
            if active_error is None:
                raise SqlConnectionError(
                    "SQL connection cleanup failed"
                ) from error
    schema, facts = _sql_catalog_projection(
        object_rows,
        primary_key_rows,
        foreign_key_rows,
    )
    artifact["_sqlSchema"] = schema
    artifact["_sqlMetadataFacts"] = facts


def _sql_metadata_projection(value):
    """Sanitize SQL catalog fixtures used by tests and offline diagnostics."""
    if not isinstance(value, dict):
        raise ValueError("SQL metadata item was not an object")
    tables = _schema_objects(
        value.get("tables") if isinstance(value.get("tables"), list) else [],
        "SQL table",
        "Sanitized SQL system catalog metadata",
    )
    views = _schema_objects(
        value.get("views") if isinstance(value.get("views"), list) else [],
        "SQL view",
        "Sanitized SQL system catalog metadata",
    )
    facts = []
    for collection, label in (
        (value.get("tables"), "Primary key"),
        (value.get("foreignKeys"), "Foreign key"),
    ):
        if not isinstance(collection, list):
            continue
        for entry in collection[:MAX_DEFINITION_FACTS_PER_ITEM]:
            if not isinstance(entry, dict):
                continue
            name = _qualified_object_name(entry)
            if label == "Primary key":
                columns = entry.get("primaryKey")
                if not isinstance(columns, list):
                    continue
                safe_columns = [
                    column for column in columns if _strict_text(column)
                ]
                if name and safe_columns:
                    facts.append((label, name, ", ".join(safe_columns)))
            else:
                source = _strict_text(entry.get("sourceTable"))
                target = _strict_text(entry.get("targetTable"))
                if source and target:
                    facts.append((
                        label,
                        _strict_text(entry.get("name"))
                        or f"{source}->{target}",
                        f"{source} -> {target}",
                    ))
    return _merge_schema_tables(tables, views), facts


def _enrich_artifact(
    token,
    ws,
    artifact,
    trackers,
    errors,
    definition_token="",
    kusto_token="",
    sql_token="",
):
    artifact_type = artifact.get("_type")
    artifact_id = artifact.get("id")
    detail_path = DETAIL_PATHS.get(artifact_type)
    if detail_path and artifact_id:
        artifact["_detailAttempted"] = True
        try:
            artifact["_detail"] = _get(
                token,
                f"{FABRIC}/workspaces/{ws}/{detail_path}/{artifact_id}",
            )
            _merge_detail_metadata(artifact, artifact["_detail"])
            _track_optional(trackers["itemDetails"], "success")
        except SLICE_RETRY_ERRORS:
            raise
        except urllib.error.HTTPError as error:
            code = _safe_error_code(error, optional=True)
            if code == "endpoint-unsupported":
                artifact["_detailError"] = "Item properties are unsupported"
                _track_optional(
                    trackers["itemDetails"],
                    "unsupported",
                    code,
                )
            else:
                artifact["_detailError"] = "Item properties unavailable"
                _track_optional(trackers["itemDetails"], "failed", code)
                errors.append(f"itemDetails: {code}")
        except Exception as error:
            code = _safe_error_code(error, optional=True)
            artifact["_detailError"] = "Fabric REST item properties unavailable"
            _track_optional(trackers["itemDetails"], "failed", code)
            errors.append(f"itemDetails: {code}")

    if artifact_type == "Lakehouse" and artifact_id:
        try:
            artifact["_lakehouseTables"] = _get_all_data(
                token,
                f"/workspaces/{ws}/lakehouses/{artifact_id}/tables?maxResults=100",
            )
            _track_optional(trackers["lakehouseTables"], "success")
        except SLICE_RETRY_ERRORS:
            raise
        except urllib.error.HTTPError as error:
            artifact["_lakehouseTables"] = []
            code = _safe_error_code(error, optional=True)
            if code == "endpoint-unsupported":
                artifact["_lakehouseTablesError"] = (
                    "Lakehouse table enumeration is unsupported"
                )
                _track_optional(
                    trackers["lakehouseTables"],
                    "unsupported",
                    code,
                )
            else:
                artifact["_lakehouseTablesError"] = (
                    "Lakehouse table enumeration unavailable"
                )
                _track_optional(
                    trackers["lakehouseTables"],
                    "failed",
                    code,
                )
                errors.append(f"lakehouseTables: {code}")
        except Exception as error:
            code = _safe_error_code(error, optional=True)
            artifact["_lakehouseTables"] = []
            artifact["_lakehouseTablesError"] = (
                "Lakehouse Tables REST enumeration failed"
            )
            _track_optional(trackers["lakehouseTables"], "failed", code)
            errors.append(f"lakehouseTables: {code}")

    if artifact_type == "Report" and artifact_id:
        if artifact.get("reportType") == "PaginatedReport":
            artifact["_reportPagesError"] = (
                "Page inventory is not supported for paginated reports"
            )
            _track_optional(
                trackers["reportPages"],
                "unsupported",
                "report-type-unsupported",
            )
        else:
            try:
                pages = _get(
                    token,
                    f"{PBI}/groups/{ws}/reports/{artifact_id}/pages",
                )
                values = pages.get("value", []) if isinstance(pages, dict) else []
                if not isinstance(values, list):
                    raise ValueError("Power BI pages response was not a list")
                artifact["_reportPages"] = values
                _track_optional(trackers["reportPages"], "success")
            except SLICE_RETRY_ERRORS:
                raise
            except urllib.error.HTTPError as error:
                code = _safe_error_code(error, optional=True)
                if code == "endpoint-unsupported":
                    artifact["_reportPagesError"] = (
                        "Report page inventory is unsupported"
                    )
                    _track_optional(
                        trackers["reportPages"],
                        "unsupported",
                        code,
                    )
                else:
                    artifact["_reportPagesError"] = (
                        "Power BI report page enumeration unavailable"
                    )
                    _track_optional(
                        trackers["reportPages"],
                        "failed",
                        code,
                    )
                    errors.append(f"reportPages: {code}")
            except Exception as error:
                code = _safe_error_code(error, optional=True)
                artifact["_reportPagesError"] = (
                    "Power BI report page enumeration failed"
                )
                _track_optional(trackers["reportPages"], "failed", code)
                errors.append(f"reportPages: {code}")

    if artifact_type in DEFINITION_PATHS and artifact_id:
        if not _strict_text(definition_token):
            artifact["_definitionStatus"] = "token-unavailable"
            _track_optional(
                trackers["definitions"],
                "unsupported",
                "token-unavailable",
            )
        else:
            try:
                definition = _get_definition(
                    definition_token,
                    ws,
                    artifact_type,
                    artifact_id,
                )
                _project_definition(artifact, definition)
                code = (
                    "forward-compatible-parts-skipped"
                    if artifact.get("_definitionUnknownParts")
                    else (
                        "artifact-metadata-truncated"
                        if artifact.get("_artifactMetadataTruncated")
                        else (
                            "projection-truncated"
                            if artifact.get("_definitionTruncated")
                            else None
                        )
                    )
                )
                artifact["_definitionStatus"] = code or "complete"
                _track_optional(trackers["definitions"], "success", code)
            except SLICE_RETRY_ERRORS:
                raise
            except Exception as error:
                code = _definition_error_code(error)
                artifact["_definitionStatus"] = code
                if code in (
                    "endpoint-unsupported",
                    "read-write-permission-required",
                    "encrypted-label-blocked",
                ):
                    _track_optional(
                        trackers["definitions"],
                        "unsupported",
                        code,
                    )
                else:
                    _track_optional(trackers["definitions"], "failed", code)
                    errors.append(f"definitions:{artifact_id}: {code}")

    if artifact_type == "KQLDatabase" and artifact_id:
        if not _strict_text(kusto_token):
            artifact["_kqlSchemaStatus"] = "token-unavailable"
            _track_optional(
                trackers["kqlSchema"],
                "unsupported",
                "token-unavailable",
            )
        else:
            try:
                _collect_kql_schema(kusto_token, artifact)
                artifact["_kqlSchemaStatus"] = "complete"
                _track_optional(trackers["kqlSchema"], "success")
            except SLICE_RETRY_ERRORS:
                raise
            except Exception as error:
                code = _safe_error_code(error, optional=True)
                artifact["_kqlSchemaStatus"] = code
                if code in (
                    "authorization-failed",
                    "endpoint-unsupported",
                ):
                    _track_optional(
                        trackers["kqlSchema"],
                        "unsupported",
                        code,
                    )
                else:
                    _track_optional(trackers["kqlSchema"], "failed", code)
                    errors.append(f"kqlSchema:{artifact_id}: {code}")

    if artifact_type == "SQLDatabase" and artifact_id:
        try:
            if _strict_text(sql_token):
                _collect_sql_schema(sql_token, artifact)
                artifact["_sqlSchemaStatus"] = "complete"
                _track_optional(trackers["sqlSchema"], "success")
            else:
                artifact["_sqlSchemaStatus"] = "token-unavailable"
                _track_optional(
                    trackers["sqlSchema"],
                    "unsupported",
                    "token-unavailable",
                )
        except SLICE_RETRY_ERRORS:
            raise
        except Exception as error:
            code = _safe_error_code(error, optional=True)
            artifact["_sqlSchemaStatus"] = code
            if code in (
                "authorization-failed",
                "tds-runtime-unavailable",
            ):
                _track_optional(
                    trackers["sqlSchema"],
                    "unsupported",
                    code,
                )
            else:
                _track_optional(trackers["sqlSchema"], "failed", code)
                errors.append(f"sqlSchema:{artifact_id}: {code}")


def _merge_schema_tables(*groups):
    """Deduplicate table names case-insensitively and retain all real columns."""
    merged = {}
    order = []
    for tables in groups:
        for table in tables or []:
            name = _strict_text(table.get("name"))
            if not name:
                continue
            explicit_key = _strict_text(table.get("_mergeKey"))
            key = (
                f"@{explicit_key.casefold()}"
                if explicit_key
                else name.casefold()
            )
            if key not in merged and not explicit_key:
                leaf = key.rsplit(".", 1)[-1]
                leaf_matches = [
                    existing
                    for existing in order
                    if not existing.startswith("@")
                    if existing.rsplit(".", 1)[-1] == leaf
                    and ("." not in key or "." not in existing)
                ]
                if len(leaf_matches) == 1:
                    key = leaf_matches[0]
            if key not in merged:
                merged[key] = {
                    "name": name,
                    "objectType": _strict_text(table.get("objectType")),
                    "objectId": _strict_text(table.get("objectId")),
                    "parentObjectId": _strict_text(
                        table.get("parentObjectId")
                    ),
                    "sourceObjectId": _strict_text(
                        table.get("sourceObjectId")
                    ),
                    "targetObjectId": _strict_text(
                        table.get("targetObjectId")
                    ),
                    "relation": _strict_text(table.get("relation")),
                    "sourceItemId": _normalized_id(
                        table.get("sourceItemId")
                    ),
                    "sourceObjectName": _strict_text(
                        table.get("sourceObjectName")
                    ),
                    "sourceObjectType": _strict_text(
                        table.get("sourceObjectType")
                    ),
                    "source": _strict_text(table.get("source")),
                    "description": _strict_text(table.get("description")),
                    "isHidden": (
                        table.get("isHidden")
                        if isinstance(table.get("isHidden"), bool)
                        else None
                    ),
                    "columns": [],
                    "measures": [],
                }
                safe_rows = _safe_row_count(table.get("rows"))
                if safe_rows is not None:
                    merged[key]["rows"] = safe_rows
                order.append(key)
            target = merged[key]
            if not target.get("objectType") and table.get("objectType"):
                target["objectType"] = table.get("objectType")
            for field in (
                "objectId",
                "parentObjectId",
                "sourceObjectId",
                "targetObjectId",
                "relation",
                "sourceItemId",
                "sourceObjectName",
                "sourceObjectType",
            ):
                if not target.get(field) and table.get(field):
                    target[field] = table.get(field)
            if table.get("source"):
                sources = [
                    value.strip()
                    for value in str(target.get("source") or "").split(" + ")
                    if value.strip()
                ]
                if table["source"] not in sources:
                    sources.append(table["source"])
                target["source"] = " + ".join(sources)
            if not target.get("description") and table.get("description"):
                target["description"] = table.get("description")
            if target.get("isHidden") is None and table.get("isHidden") is not None:
                target["isHidden"] = table.get("isHidden")
            column_names = {
                (_strict_text(column.get("name")) or "").casefold()
                for column in target["columns"]
            }
            for column in table.get("columns") or []:
                column_name = _strict_text(column.get("name"))
                if column_name and column_name.casefold() not in column_names:
                    target["columns"].append({
                        "name": column_name,
                        "dataType": _strict_text(
                            column.get("dataType") or column.get("type")
                        ) or "column",
                        "objectType": _strict_text(
                            column.get("objectType")
                        ),
                        "objectId": _strict_text(
                            column.get("objectId")
                        ),
                        "parentObjectId": _strict_text(
                            column.get("parentObjectId")
                        ),
                        "sourceObjectId": _strict_text(
                            column.get("sourceObjectId")
                        ),
                        "targetObjectId": _strict_text(
                            column.get("targetObjectId")
                        ),
                        "relation": _strict_text(
                            column.get("relation")
                        ),
                        "sourceItemId": _normalized_id(
                            column.get("sourceItemId")
                        ),
                        "sourceObjectName": _strict_text(
                            column.get("sourceObjectName")
                        ),
                        "sourceObjectType": _strict_text(
                            column.get("sourceObjectType")
                        ),
                        "sourceParentObjectId": _strict_text(
                            column.get("sourceParentObjectId")
                        ),
                        "sourceParentPath": (
                            list(column.get("sourceParentPath"))
                            if isinstance(
                                column.get("sourceParentPath"),
                                list,
                            )
                            else None
                        ),
                        "sourceTableName": _strict_text(
                            column.get("sourceTableName")
                        ),
                        "parentPath": (
                            list(column.get("parentPath"))
                            if isinstance(column.get("parentPath"), list)
                            else None
                        ),
                        "tableName": _strict_text(
                            column.get("tableName")
                        ),
                        "description": _strict_text(
                            column.get("description")
                        ),
                        "isHidden": (
                            column.get("isHidden")
                            if isinstance(column.get("isHidden"), bool)
                            else None
                        ),
                    })
                    column_names.add(column_name.casefold())
            measure_names = {
                (_strict_text(measure.get("name")) or "").casefold()
                for measure in target["measures"]
            }
            for measure in table.get("measures") or []:
                measure_name = _strict_text(measure.get("name"))
                if measure_name and measure_name.casefold() not in measure_names:
                    target["measures"].append({
                        "name": measure_name,
                        "expression": _strict_text(
                            measure.get("expression")
                        ),
                        "objectType": _strict_text(
                            measure.get("objectType")
                        ),
                        "objectId": _strict_text(
                            measure.get("objectId")
                        ),
                        "parentObjectId": _strict_text(
                            measure.get("parentObjectId")
                        ),
                        "description": _strict_text(
                            measure.get("description")
                        ),
                        "isHidden": (
                            measure.get("isHidden")
                            if isinstance(measure.get("isHidden"), bool)
                            else None
                        ),
                    })
                    measure_names.add(measure_name.casefold())
    result = []
    for key in order:
        table = merged[key]
        table["columns"] = [
            {field: value for field, value in column.items() if value is not None}
            for column in table["columns"]
        ]
        table["measures"] = [
            {field: value for field, value in measure.items() if value is not None}
            for measure in table["measures"]
        ]
        result.append({
            field: value
            for field, value in table.items()
            if value is not None
        })
    return result


def _metadata_endpoint_ids(value):
    ids = set()
    if not isinstance(value, dict):
        return ids
    roots = [value]
    for key in ("properties", "extendedProperties"):
        if isinstance(value.get(key), dict):
            roots.append(value[key])
    for root in roots:
        endpoint = root.get("sqlEndpointProperties")
        if isinstance(endpoint, dict) and endpoint.get("id"):
            endpoint_id = _normalized_id(endpoint["id"])
            if endpoint_id:
                ids.add(endpoint_id)
        for key in ("sqlEndpointId", "sqlAnalyticsEndpointId"):
            if root.get(key):
                endpoint_id = _normalized_id(root[key])
                if endpoint_id:
                    ids.add(endpoint_id)
        dw_properties = root.get("DwProperties")
        if isinstance(dw_properties, str):
            try:
                parsed_properties = json.loads(dw_properties)
                if isinstance(parsed_properties, dict):
                    roots.append(parsed_properties)
            except (TypeError, ValueError):
                pass
    return ids


def _storage_endpoint_ids(
    token,
    ws,
    storage,
    arts,
    resolve_details=True,
):
    storage_id = _artifact_id(storage)
    ids = set()
    for artifact in arts:
        if artifact.get("_type") != "SQLEndpoint":
            continue
        if any(
            _normalized_id(relation.get("dependentOnArtifactId"))
            == storage_id
            for relation in artifact.get("relations") or []
            if isinstance(relation, dict)
        ):
            endpoint_id = _artifact_id(artifact)
            if endpoint_id:
                ids.add(endpoint_id)
    ids.update(_metadata_endpoint_ids(storage))
    ids.update(_metadata_endpoint_ids(storage.get("_detail")))
    if resolve_details and storage.get("_type") == "Lakehouse":
        if (
            not storage.get("_detail")
            and not storage.get("_detailAttempted")
        ):
            try:
                detail = _get(
                    token,
                    f"{FABRIC}/workspaces/{ws}/lakehouses/{storage_id}",
                )
                ids.update(_metadata_endpoint_ids(detail))
            except SLICE_RETRY_ERRORS:
                raise
            except urllib.error.HTTPError as error:
                if error.code not in (400, 403, 404):
                    raise
            except (TypeError, ValueError):
                pass
    return ids


def _downstream_semantic_models(arts, start_ids):
    downstream = {}
    artifact_type = {}
    for artifact in arts:
        artifact_id = _artifact_id(artifact)
        if artifact_id:
            artifact_type[artifact_id] = artifact.get("_type")
        for relation in artifact.get("relations") or []:
            if not isinstance(relation, dict):
                continue
            dependency = _normalized_id(
                relation.get("dependentOnArtifactId")
            )
            if dependency and artifact_id:
                downstream.setdefault(dependency, set()).add(artifact_id)

    models = set()
    pending = [
        normalized
        for value in start_ids
        if (normalized := _normalized_id(value))
    ]
    visited = set()
    while pending:
        current = pending.pop()
        if current in visited:
            continue
        visited.add(current)
        for target in downstream.get(current, set()):
            target_type = artifact_type.get(target)
            if target_type == "SemanticModel":
                models.add(target)
            elif target_type == "SQLEndpoint" or target not in artifact_type:
                pending.append(target)
    return models


def _derive_storage_schemas(
    token,
    ws,
    arts,
    schema,
    resolve_details=True,
):
    for storage in arts:
        if storage.get("_type") not in (
            "Lakehouse",
            "Warehouse",
            "SQLDatabase",
        ):
            continue
        storage_id = _artifact_id(storage)
        endpoint_ids = _storage_endpoint_ids(
            token,
            ws,
            storage,
            arts,
            resolve_details=resolve_details,
        )
        model_ids = _downstream_semantic_models(
            arts,
            {storage_id, *endpoint_ids},
        )
        derived = []
        for model_id in model_ids:
            for table in schema.get(model_id, []):
                derived.append({
                    "name": table.get("name"),
                    "rows": table.get("rows"),
                    "objectType": table.get("objectType") or "Model table",
                    "source": "Downstream semantic model",
                    "description": table.get("description"),
                    "isHidden": table.get("isHidden"),
                    "columns": table.get("columns") or [],
                    "measures": [],
                })
        combined = _merge_schema_tables(schema.get(storage_id, []), derived)
        if combined:
            schema[storage_id] = combined
        storage["_derivedModelCount"] = len(model_ids)


def _qualified_object_name(value):
    name = _strict_text(value.get("name")) or ""
    schema_name = _strict_text(
        value.get("schema")
        or value.get("schemaName")
        or value.get("schema_name")
    ) or ""
    if schema_name and name and not name.casefold().startswith(
        schema_name.casefold() + "."
    ):
        return f"{schema_name}.{name}"
    return name


def _schema_objects(values, object_type, source, include_measures=False):
    tables = []
    for value in values or []:
        name = _qualified_object_name(value)
        if not name:
            continue
        columns = []
        for column in value.get("columns") or []:
            if not isinstance(column, dict):
                continue
            column_name = _strict_text(column.get("name"))
            if not column_name:
                continue
            columns.append({
                "name": column_name,
                "dataType": _strict_text(
                    column.get("dataType") or column.get("type")
                ) or "column",
                "objectType": _strict_text(column.get("objectType")),
                "description": _strict_text(column.get("description")),
                "isHidden": (
                    column.get("isHidden")
                    if isinstance(column.get("isHidden"), bool)
                    else None
                ),
            })
        measures = []
        if include_measures:
            for measure in value.get("measures") or []:
                if not isinstance(measure, dict):
                    continue
                measure_name = _strict_text(measure.get("name"))
                if not measure_name:
                    continue
                measures.append({
                    "name": measure_name,
                    "expression": _strict_text(
                        measure.get("expression")
                    ),
                    "objectType": _strict_text(
                        measure.get("objectType")
                    ),
                    "description": _strict_text(
                        measure.get("description")
                    ),
                    "isHidden": (
                        measure.get("isHidden")
                        if isinstance(measure.get("isHidden"), bool)
                        else None
                    ),
                })
        row_source = (
            value.get("rowCount")
            if "rowCount" in value
            else value.get("rows")
        )
        row_count = _safe_row_count(row_source)
        table = {
            "name": name,
            "objectType": _strict_text(
                value.get("objectType") or value.get("type")
            ) or object_type,
            "source": source,
            "description": _strict_text(value.get("description")),
            "isHidden": (
                value.get("isHidden")
                if isinstance(value.get("isHidden"), bool)
                else None
            ),
            "columns": columns,
            "measures": measures,
        }
        if row_count is not None:
            table["rows"] = row_count
        tables.append(table)
    return _merge_schema_tables(tables)


def _item_config(token, ws, a, typ, item_schema=None):
    rows = []

    def add(section, label, value):
        if (
            isinstance(label, (str, int, float))
            and str(label).strip()
            and isinstance(value, (str, int, float, bool))
            and value != ""
        ):
            rows.append({
                "itemId": a.get("id"),
                "section": str(section),
                "label": str(label),
                "value": str(value),
            })

    add("General", "Description", a.get("description"))
    add("General", "Configured by", _safe_text(a.get("configuredBy")))
    add("General", "Modified by", _safe_text(a.get("modifiedBy")))
    add(
        "General",
        "Modified",
        _normalize_timestamp(
            a.get("modifiedDateTime") or a.get("lastUpdatedDate")
        ),
    )
    detail = a.get("_detail") or {}
    properties = detail.get("properties") or {}
    add("General", "REST metadata", a.get("_detailError"))

    if typ == "SemanticModel":
        add("Model", "Storage mode", a.get("targetStorageMode"))
        add("Model", "Provider", a.get("contentProviderType"))
        tables = item_schema or []
        if tables:
            add("Model", "Tables", len(tables))
            add(
                "Model",
                "Columns",
                sum(len(t.get("columns") or []) for t in tables),
            )
            add(
                "Model",
                "Measures",
                sum(len(t.get("measures") or []) for t in tables),
            )
    elif typ == "Lakehouse":
        ep = a.get("extendedProperties") or {}
        add(
            "OneLake",
            "Tables path",
            properties.get("oneLakeTablesPath")
            or ep.get("OneLakeTablesPath"),
        )
        add(
            "OneLake",
            "Files path",
            properties.get("oneLakeFilesPath")
            or ep.get("OneLakeFilesPath"),
        )
        add(
            "OneLake",
            "Default schema",
            properties.get("defaultSchema") or ep.get("DefaultSchema"),
        )
        sql_endpoint = properties.get("sqlEndpointProperties") or {}
        add("SQL endpoint", "Item ID", sql_endpoint.get("id"))
        add(
            "SQL endpoint",
            "Provisioning status",
            sql_endpoint.get("provisioningStatus"),
        )
        raw_dw = ep.get("DwProperties")
        if isinstance(raw_dw, dict):
            dw = raw_dw
        elif isinstance(raw_dw, str):
            try:
                parsed_dw = json.loads(raw_dw or "{}")
            except (TypeError, ValueError):
                parsed_dw = {}
            dw = parsed_dw if isinstance(parsed_dw, dict) else {}
        else:
            dw = {}
        add(
            "SQL endpoint",
            "Metadata available",
            "Yes" if dw.get("tdsEndpoint") else None,
        )
        direct = a.get("_lakehouseTables") or []
        if direct:
            add("Inventory", "Lakehouse Tables REST", f"{len(direct)} objects")
        add("Inventory", "Lakehouse Tables REST status", a.get("_lakehouseTablesError"))
        if a.get("_derivedModelCount"):
            add(
                "Inventory",
                "Downstream semantic models",
                a.get("_derivedModelCount"),
            )
    elif typ == "Warehouse":
        add("Warehouse", "Collation", properties.get("collationType"))
        add(
            "Warehouse",
            "Created",
            _normalize_timestamp(properties.get("createdDate")),
        )
        add(
            "Warehouse",
            "Updated",
            _normalize_timestamp(properties.get("lastUpdatedTime")),
        )
    elif typ == "SQLDatabase":
        add("SQL database", "Database name", properties.get("databaseName"))
        add("SQL database", "Server", properties.get("serverFqdn"))
        add("SQL database", "Collation", properties.get("collation"))
        add(
            "SQL database",
            "Backup retention days",
            properties.get("backupRetentionDays"),
        )
        add(
            "Metadata capability",
            "SQL schema",
            a.get("_sqlSchemaStatus"),
        )
        for section, label, value in a.get("_sqlMetadataFacts") or []:
            add(f"SQL {section}s", label, value)
    elif typ == "Eventhouse":
        add(
            "Eventhouse",
            "Query service URI",
            properties.get("queryServiceUri"),
        )
        database_ids = properties.get("databasesItemIds")
        if isinstance(database_ids, list):
            add("Eventhouse", "KQL databases", len(database_ids))
    elif typ == "KQLDatabase":
        add(
            "KQL database",
            "Parent Eventhouse item ID",
            properties.get("parentEventhouseItemId"),
        )
        add(
            "KQL database",
            "Query service URI",
            properties.get("queryServiceUri"),
        )
        add(
            "KQL database",
            "Database identity",
            properties.get("databaseName")
            or detail.get("displayName")
            or a.get("displayName"),
        )
        add(
            "KQL database",
            "Database type",
            properties.get("databaseType"),
        )
        add(
            "Metadata capability",
            "KQL schema",
            a.get("_kqlSchemaStatus"),
        )
        for function in a.get("_kqlFunctions") or []:
            add(
                "KQL stored functions",
                function.get("name"),
                "Stored function",
            )
        for view in a.get("_kqlMaterializedViews") or []:
            add(
                "KQL materialized views",
                view.get("name"),
                "Materialized view",
            )
    elif typ == "Report":
        add("Report", "Type", a.get("reportType"))
        add("Report", "Semantic model", a.get("datasetId"))
        pages = a.get("_reportPages")
        if isinstance(pages, list):
            add("Report", "Pages", len(pages))
            for page in sorted(
                pages,
                key=lambda value: int(value.get("order") or 0),
            ):
                page_name = page.get("displayName") or page.get("name")
                internal_name = page.get("name")
                order = page.get("order")
                detail_value = (
                    f"{internal_name} · order {order}"
                    if internal_name and order is not None
                    else internal_name or order
                )
                add("Report pages", page_name, detail_value)
        add("Report", "Page inventory status", a.get("_reportPagesError"))
        add(
            "Report",
            "Visual and binding inventory",
            "Not exposed by the admin scanner or Reports REST; requires the Power BI report authoring/embed API.",
        )

    if typ in ("Warehouse", "SQLDatabase"):
        native_inventory = any(
            (
                "admin scanner" in str(table.get("source") or "").lower()
                or "system catalog" in str(table.get("source") or "").lower()
            )
            for table in (item_schema or [])
        )
        if native_inventory:
            sources = " + ".join(
                sorted({
                    str(table.get("source"))
                    for table in (item_schema or [])
                    if table.get("source")
                })
            )
            add(
                "Inventory",
                "Coverage",
                f"Tables/views and columns returned by {sources}.",
            )
        elif item_schema:
            add(
                "Inventory",
                "Coverage",
                "Downstream semantic-model subset only; complete tables, views and columns require SQL connectivity.",
            )
        else:
            add(
                "Inventory",
                "Coverage",
                "Fabric REST exposes item properties only; complete tables, views and columns require SQL connectivity.",
            )

    if typ in DEFINITION_PATHS:
        add(
            "Metadata capability",
            "Definition enrichment",
            a.get("_definitionStatus"),
        )
        if a.get("_definitionUnknownParts"):
            add(
                "Metadata capability",
                "Forward-compatible definition parts skipped",
                a.get("_definitionUnknownParts"),
            )
        if a.get("_definitionTruncated"):
            add(
                "Metadata capability",
                "Definition projection",
                "Truncated at the safe metadata fact limit",
            )
        if a.get("_artifactMetadataTruncated"):
            add(
                "Metadata capability",
                "Artifact metadata projection",
                "Truncated at the safe selected-element limit",
            )
        for section, label, value in a.get("_definitionFacts") or []:
            add(section, label, value)

    for table in item_schema or []:
        add(
            "Tables",
            table.get("name"),
            table.get("objectType") or table.get("source") or "Table",
        )

    return rows


def _item_schema(token, ws, a, typ, defer_enrichment=False):
    """Return only object metadata supplied by supported Fabric/Power BI APIs."""
    if typ == "SemanticModel":
        return _schema_objects(
            a.get("tables"),
            "Model table",
            "Power BI admin scanner",
            include_measures=True,
        )
    elif typ == "Lakehouse":
        if defer_enrichment:
            direct_values = []
        elif "_lakehouseTables" in a:
            direct_values = a["_lakehouseTables"]
        else:
            direct_values = _lh_tables(token, ws, a.get("id"))
        direct = _schema_objects(
            direct_values,
            "Table",
            "Fabric Lakehouse Tables REST",
        )
        scanned = _schema_objects(
            a.get("tables"),
            "Table",
            "Power BI admin scanner",
        )
        return _merge_schema_tables(direct, scanned)
    elif typ in ("Warehouse", "SQLDatabase"):
        tables = _schema_objects(
            a.get("tables"),
            "SQL table" if typ == "SQLDatabase" else "Table",
            "Power BI admin scanner",
        )
        views = _schema_objects(
            a.get("views"),
            "SQL view" if typ == "SQLDatabase" else "View",
            "Power BI admin scanner",
        )
        return _merge_schema_tables(
            tables,
            views,
            a.get("_sqlSchema") if typ == "SQLDatabase" else [],
        )
    elif typ == "KQLDatabase":
        return _merge_schema_tables(a.get("_kqlSchema"))
    elif typ in DEFINITION_PATHS:
        return _merge_schema_tables(a.get("_definitionSchema"))
    return []


def _lineage_collection(artifact, name):
    if name not in artifact or artifact[name] is None:
        return []
    values = artifact[name]
    if not isinstance(values, list):
        raise ValueError(f"scanner {name} collection was invalid")
    if not all(isinstance(value, dict) for value in values):
        raise ValueError(f"scanner {name} record was invalid")
    return values


def _official_lineage(artifacts, workspace_item_ids, workspace_id):
    edges = []
    seen = set()
    normalized_workspace_id = _normalized_id(workspace_id)
    item_types = {
        _artifact_id(artifact): artifact.get("_type")
        for artifact in artifacts
        if _artifact_id(artifact)
    }

    def add(source, target, relation):
        source_id = _normalized_id(source)
        target_id = _normalized_id(target)
        edge = (source_id, target_id, relation)
        if (
            source_id in workspace_item_ids
            and target_id in workspace_item_ids
            and source_id != target_id
            and edge not in seen
        ):
            seen.add(edge)
            edges.append({
                "source": source_id,
                "target": target_id,
                "relation": relation,
            })

    def is_local(value, field):
        if field not in value or value[field] is None:
            return True
        group_id = value[field]
        if not isinstance(group_id, str) or not group_id.strip():
            raise ValueError(
                f"scanner {field} workspace identifier was invalid"
            )
        return _normalized_id(group_id) == normalized_workspace_id

    def add_upstreams(artifact, name, id_field, relation):
        artifact_id = _artifact_id(artifact)
        for upstream in _lineage_collection(artifact, name):
            if is_local(upstream, "groupId"):
                add(upstream.get(id_field), artifact_id, relation)

    for artifact in artifacts:
        artifact_id = _artifact_id(artifact)
        for relation in _lineage_collection(artifact, "relations"):
            dependency = relation.get("dependentOnArtifactId")
            relation_type = relation.get("relationType")
            add(
                dependency,
                artifact_id,
                REL_LABEL.get(
                    relation_type,
                    _safe_text(relation_type) or "depends",
                ),
            )
        if artifact.get("_type") == "Report":
            if is_local(artifact, "datasetWorkspaceId"):
                add(artifact.get("datasetId"), artifact_id, "report")
        if artifact.get("_type") in (
            "Dataflow",
            "Datamart",
            "SemanticModel",
        ):
            add_upstreams(
                artifact,
                "upstreamDataflows",
                "targetDataflowId",
                "dataflow",
            )
            add_upstreams(
                artifact,
                "upstreamDatamarts",
                "targetDatamartId",
                "datamart",
            )
        if artifact.get("_type") == "SemanticModel":
            add_upstreams(
                artifact,
                "upstreamDatasets",
                "targetDatasetId",
                "semantic model",
            )
        if artifact.get("_type") == "Dashboard":
            for tile in _lineage_collection(artifact, "tiles"):
                add(tile.get("reportId"), artifact_id, "dashboard report")
                add(tile.get("datasetId"), artifact_id, "dashboard dataset")
        if artifact.get("_type") == "KQLDatabase":
            detail = artifact.get("_detail")
            detail = detail if isinstance(detail, dict) else {}
            properties = detail.get("properties")
            properties = properties if isinstance(properties, dict) else {}
            add(
                properties.get("parentEventhouseItemId"),
                artifact_id,
                "KQL database",
            )
        for source_id in artifact.get("_definitionSourceIds") or set():
            relation = {
                "Ontology": "ontology binding",
                "GraphModel": "graph source",
                "DataAgent": (
                    "ontology"
                    if item_types.get(_normalized_id(source_id)) == "Ontology"
                    else "data agent source"
                ),
            }.get(artifact.get("_type"), "metadata source")
            add(source_id, artifact_id, relation)
        if artifact.get("_type") == "GraphModel":
            for ontology_id in artifact.get("_ontologyItemIds") or set():
                add(ontology_id, artifact_id, "generated graph")
        if artifact.get("_type") == "Ontology":
            for graph_model_id in artifact.get("_graphModelItemIds") or set():
                add(artifact_id, graph_model_id, "generated graph")
    return edges


def _guard_response_size(value, max_bytes=MAX_RESPONSE_BYTES):
    try:
        size = len(
            json.dumps(
                value,
                ensure_ascii=False,
                separators=(",", ":"),
                allow_nan=False,
            ).encode("utf-8")
        )
    except (TypeError, ValueError) as error:
        raise ResponseSizeExceeded(
            "sync response could not be safely serialized"
        ) from error
    if size > max_bytes:
        raise ResponseSizeExceeded(
            "sync response exceeded the safe size limit"
        )
    return value


def _parse_sync_item_ids(value):
    if (
        not isinstance(value, str)
        or not value.strip()
        or len(value) > MAX_SYNC_ITEM_IDS_CHARACTERS
    ):
        raise ValueError("sync item identifiers were invalid")
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError) as error:
        raise ValueError("sync item identifiers were invalid") from error
    if not isinstance(parsed, list) or not parsed:
        raise ValueError("sync item identifiers were invalid")
    item_ids = []
    seen = set()
    for value in parsed:
        item_id = _item_id(value)
        if item_id in seen:
            raise ValueError("sync item identifiers were invalid")
        seen.add(item_id)
        item_ids.append(item_id)
    return item_ids


def _new_sync_trackers():
    return {
        "itemDetails": _new_optional_tracker(),
        "lakehouseTables": _new_optional_tracker(),
        "reportPages": _new_optional_tracker(),
        "jobs": _new_optional_tracker(),
        "definitions": _new_optional_tracker(),
        "kqlSchema": _new_optional_tracker(),
        "sqlSchema": _new_optional_tracker(),
    }


def _merge_optional_trackers(target, source):
    for name, tracker in source.items():
        current = target[name]
        for result in ("success", "unsupported", "failed"):
            current[result] += tracker[result]
        for code in tracker["codes"]:
            if code not in current["codes"]:
                current["codes"].append(code)


@udf.function()
def sync_items(
    fabricToken: str,
    workspaceId: str,
    itemIds: str,
    correlationId: str = "",
    definitionToken: str = "",
    kustoToken: str = "",
    sqlToken: str = "",
    storageToken: str = "",
) -> dict:
    """Return resumable deep metadata for a validated workspace item batch."""
    ws = _workspace_id(workspaceId)
    correlation_id = _item_id(correlationId) if correlationId else None
    requested_item_ids = _parse_sync_item_ids(itemIds)
    out = {
        "schemaVersion": 2,
        "syncMode": "enrichment",
        "correlationId": correlation_id,
        "requestedItemIds": requested_item_ids,
        "completedItemIds": [],
        "remainingItemIds": [],
        "itemFailures": {},
        "schema": {},
        "config": [],
        "jobs": [],
        "lineage": [],
        "objectEdges": [],
        "artifactMetadata": {},
        "itemMetadata": {},
        "capabilities": {},
        "sections": {},
        "errors": [],
    }
    deadline = _ExecutionDeadline()
    trackers = _new_sync_trackers()
    completed_artifacts = []
    internal_schema = {}
    extra_object_edges = []

    with _deadline_scope(deadline):
        raw_items = _get_all(
            fabricToken,
            f"/workspaces/{ws}/items",
        )
        items = [_sanitize_item(item) for item in raw_items]
        if any(item is None for item in items):
            raise ValueError("workspace items contained invalid metadata")
        items_by_id = {item["id"]: item for item in items}
        missing_item_ids = [
            item_id
            for item_id in requested_item_ids
            if item_id not in items_by_id
        ]
        if missing_item_ids:
            raise ValueError("sync item identifiers were outside the workspace")
        workspace_item_ids = set(items_by_id)

        for index, item_id in enumerate(requested_item_ids):
            if (
                index > 0
                and deadline.remaining()
                <= MIN_ENRICHMENT_ITEM_BUDGET_SECONDS
            ):
                out["remainingItemIds"] = requested_item_ids[index:]
                break

            item = items_by_id[item_id]
            item_type = ITEM_TYPE_ALIASES.get(
                item.get("type"),
                item.get("type"),
            )
            artifact = dict(item)
            artifact["_type"] = item_type
            item_trackers = _new_sync_trackers()
            item_errors = []
            try:
                _enrich_artifact(
                    fabricToken,
                    ws,
                    artifact,
                    item_trackers,
                    item_errors,
                    definition_token=definitionToken,
                    kusto_token=kustoToken,
                    sql_token=sqlToken,
                )
                deadline.checkpoint()
                item_schema = _finalize_schema_object_ids(
                    item_id,
                    item_type,
                    _item_schema(
                        fabricToken,
                        ws,
                        artifact,
                        item_type,
                    ),
                )
                deadline.checkpoint()
                item_config = _item_config(
                    fabricToken,
                    ws,
                    artifact,
                    item_type,
                    item_schema,
                )
                deadline.checkpoint()
            except SLICE_RETRY_ERRORS:
                out["remainingItemIds"] = requested_item_ids[index:]
                break
            except Exception as error:
                code = _safe_error_code(error, optional=True)
                item_schema = []
                item_config = []
                item_errors.append(f"enrichment:{item_id}: {code}")
                out["itemFailures"][item_id] = code

            safe_jobs = []
            try:
                jobs = _get_all(
                    fabricToken,
                    f"/workspaces/{ws}/items/{item_id}/jobs/instances",
                )
                _track_optional(item_trackers["jobs"], "success")
                safe_jobs = []
                for value in jobs[:3]:
                    job = _sanitize_job(value, item)
                    if job is None:
                        raise ValueError("job record was invalid")
                    safe_jobs.append(job)
                deadline.checkpoint()
            except urllib.error.HTTPError as error:
                code = _safe_error_code(error, optional=True)
                if code == "endpoint-unsupported":
                    _track_optional(
                        item_trackers["jobs"],
                        "unsupported",
                        code,
                    )
                else:
                    _track_optional(item_trackers["jobs"], "failed", code)
                    item_errors.append(f"jobs:{item_id}: {code}")
            except Exception as error:
                if isinstance(error, SLICE_RETRY_ERRORS):
                    out["remainingItemIds"] = requested_item_ids[index:]
                    break
                code = _safe_error_code(error, optional=True)
                _track_optional(item_trackers["jobs"], "failed", code)
                item_errors.append(f"jobs:{item_id}: {code}")

            _merge_optional_trackers(trackers, item_trackers)
            out["errors"].extend(item_errors)
            out["completedItemIds"].append(item_id)
            internal_schema[item_id] = item_schema
            out["schema"][item_id] = _public_schema(item_schema)
            out["config"].extend(item_config)
            out["jobs"].extend(safe_jobs)
            metadata = artifact.get("_artifactMetadata")
            if isinstance(metadata, dict):
                out["artifactMetadata"][item_id] = metadata
            item_metadata = _metadata_for_item(artifact, False)
            item_metadata.pop("scannerMatched", None)
            item_metadata.pop("ownerAvailable", None)
            if item_metadata:
                out["itemMetadata"][item_id] = item_metadata
            extra_object_edges.extend(artifact.get("_objectEdges") or [])
            completed_artifacts.append(artifact)

        out["lineage"] = _official_lineage(
            completed_artifacts,
            workspace_item_ids,
            ws,
        )
        out["objectEdges"] = _collect_atlas_object_edges(
            internal_schema,
            extra_edges=extra_object_edges,
        )

    for name, tracker in trackers.items():
        _finish_optional_section(out, name, tracker)
    _set_optional_capabilities(out)
    out["syncedAt"] = (
        datetime.datetime.now(datetime.timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )
    return _guard_response_size(out)


@udf.function()
def sync_all(
    fabricToken: str,
    workspaceId: str,
    correlationId: str = "",
    definitionToken: str = "",
    kustoToken: str = "",
    sqlToken: str = "",
    storageToken: str = "",
    deferEnrichment: str = "",
) -> dict:
    """Return the v2 metadata-only Fabric Atlas synchronization envelope."""
    ws = _workspace_id(workspaceId)
    correlation_id = _item_id(correlationId) if correlationId else None
    defer_enrichment = str(deferEnrichment).strip().casefold() in (
        "1",
        "true",
        "yes",
    )
    out = {
        "schemaVersion": 2,
        "correlationId": correlation_id,
        "syncMode": "base" if defer_enrichment else "complete",
        "workspace": None,
        "items": [],
        "roleAssignments": [],
        "access": [],
        "lineage": [],
        "objectEdges": [],
        "config": [],
        "schema": {},
        "jobs": [],
        "itemMetadata": {},
        "artifactMetadata": {},
        "capabilities": {},
        "sections": {
            name: {"status": "failed", "code": "not-run"}
            for name in (
                "workspace",
                "items",
                "roleAssignments",
                "scanner",
                "schema",
                "lineage",
                "access",
                "config",
            )
        },
        "errors": [],
    }
    deadline = _ExecutionDeadline()
    trackers = _new_sync_trackers()

    with _deadline_scope(deadline):
        try:
            out["workspace"] = _sanitize_workspace(
                _get(fabricToken, f"{FABRIC}/workspaces/{ws}")
            )
            _set_section(out, "workspace", "complete")
        except Exception as error:
            _record_failure(out, "workspace", error)

        try:
            raw_items = _get_all(
                fabricToken,
                f"/workspaces/{ws}/items",
            )
            items = [_sanitize_item(item) for item in raw_items]
            if any(item is None for item in items):
                raise ValueError("workspace items contained invalid metadata")
            out["items"] = items
            _set_section(out, "items", "complete")
        except Exception as error:
            _record_failure(out, "items", error)

        try:
            raw_assignments = _get_all(
                fabricToken,
                f"/workspaces/{ws}/roleAssignments",
            )
            assignments = [
                _sanitize_role_assignment(value)
                for value in raw_assignments
            ]
            if any(value is None for value in assignments):
                raise ValueError(
                    "role assignments contained invalid metadata"
                )
            out["roleAssignments"] = assignments
            _set_section(out, "roleAssignments", "complete")
        except Exception as error:
            _record_failure(out, "roleAssignments", error)

        scan = None
        scanner_artifacts = []
        try:
            scan = _scan_workspace(fabricToken, ws)
            if not isinstance(scan, dict):
                raise ScannerError("scanner result was not an object")
            artifacts_by_id = {}
            for key, artifact_type in ART_KEYS.items():
                values = scan.get(key, [])
                if values is None:
                    values = []
                if not isinstance(values, list):
                    raise ScannerError(
                        "scanner artifact collection was invalid"
                    )
                for value in values:
                    if not isinstance(value, dict):
                        raise ScannerError(
                            "scanner artifact record was invalid"
                        )
                    artifact = dict(value)
                    artifact_id = _artifact_id(artifact)
                    if not artifact_id:
                        continue
                    artifact["id"] = artifact_id
                    artifact["_type"] = artifact_type
                    existing = artifacts_by_id.get(artifact_id)
                    if existing:
                        for field, field_value in artifact.items():
                            existing.setdefault(field, field_value)
                    else:
                        artifacts_by_id[artifact_id] = artifact
            scanner_artifacts = list(artifacts_by_id.values())
            scanned_ids = set(artifacts_by_id)
            expected_scan_ids = {
                item["id"]
                for item in out["items"]
                if item.get("type") in ("SemanticModel", "Report")
            }
            if expected_scan_ids - scanned_ids:
                raise ScannerError(
                    "scanner result omitted expected artifacts"
                )
            missing_model_schema = [
                artifact["id"]
                for artifact in scanner_artifacts
                if artifact.get("_type") == "SemanticModel"
                and not isinstance(artifact.get("tables"), list)
            ]
            if missing_model_schema:
                _set_section(
                    out,
                    "schema",
                    "failed",
                    "scanner-schema-unavailable",
                )
                out["errors"].append(
                    "schema: scanner-schema-unavailable"
                )
            _set_section(out, "scanner", "complete")
        except Exception as error:
            _record_failure(out, "scanner", error)
        _set_metadata_capabilities(out)

        workspace_item_ids = {item["id"] for item in out["items"]}
        scanner_by_id = {
            artifact["id"]: artifact
            for artifact in scanner_artifacts
            if artifact.get("id")
        }
        artifacts_by_id = dict(scanner_by_id)
        for item in out["items"]:
            item_id = item["id"]
            item_type = ITEM_TYPE_ALIASES.get(
                item.get("type"),
                item.get("type"),
            )
            artifact = artifacts_by_id.get(item_id)
            if artifact:
                artifact.setdefault("_type", item_type)
                artifact.setdefault("displayName", item.get("displayName"))
                artifact.setdefault("description", item.get("description"))
            else:
                artifact = dict(item)
                artifact["_type"] = item_type
                artifacts_by_id[item_id] = artifact
            out["itemMetadata"][item_id] = _metadata_for_item(
                artifact,
                item_id in scanner_by_id,
            )
        artifacts = list(artifacts_by_id.values())

        if out["sections"].get("scanner", {}).get("status") == "complete":
            access_failed = False
            access_failure_code = None
            for artifact in artifacts:
                artifact_id = _artifact_id(artifact)
                if artifact_id not in workspace_item_ids:
                    continue
                try:
                    if not defer_enrichment:
                        _enrich_artifact(
                            fabricToken,
                            ws,
                            artifact,
                            trackers,
                            out["errors"],
                            definition_token=definitionToken,
                            kusto_token=kustoToken,
                            sql_token=sqlToken,
                        )
                    out["itemMetadata"][artifact_id] = _metadata_for_item(
                        artifact,
                        artifact_id in scanner_by_id,
                    )
                    if (
                        artifact_id in scanner_by_id
                        and "users" not in artifact
                    ):
                        access_failed = True
                        access_failure_code = (
                            "scanner-user-information-unavailable"
                        )
                        continue
                    users = artifact.get("users") or []
                    if not isinstance(users, list):
                        raise ValueError(
                            "scanner users collection was invalid"
                        )
                    for user in users:
                        if not isinstance(user, dict):
                            raise ValueError(
                                "scanner user record was invalid"
                            )
                        principal_type = _safe_text(
                            user.get("principalType")
                        )
                        user_type = _safe_text(user.get("userType"))
                        tenant_wide = (
                            str(principal_type or "").casefold()
                            in ("none", "entiretenant")
                        )
                        principal_id = (
                            "entire-tenant"
                            if tenant_wide
                            else (
                                _normalized_id(user.get("graphId"))
                                or _safe_text(user.get("identifier"))
                                or _safe_text(user.get("emailAddress"))
                            )
                        )
                        principal_name = (
                            _safe_text(user.get("displayName"))
                            or _safe_text(user.get("emailAddress"))
                            or principal_id
                        )
                        if not principal_id or not principal_name:
                            raise ValueError(
                                "scanner user identity was incomplete"
                            )
                        access = {
                            "itemId": artifact_id,
                            "principalId": principal_id,
                            "principalName": principal_name,
                            "principalType": principal_type,
                            "userType": user_type,
                            "tenantWide": tenant_wide,
                            "accessRight": _safe_text(
                                _access_right(user)
                            ),
                        }
                        email = _safe_text(user.get("emailAddress"))
                        if email:
                            access["principalEmail"] = email
                        out["access"].append({
                            key: value
                            for key, value in access.items()
                            if value is not None
                        })
                except Exception as error:
                    access_failed = True
                    code = _safe_error_code(error)
                    access_failure_code = access_failure_code or code
                    out["errors"].append(f"access: {code}")
            if access_failed:
                code = access_failure_code or "invalid-response"
                _set_section(out, "access", "failed", code)
                if code == "scanner-user-information-unavailable":
                    out["errors"].append(f"access: {code}")
            else:
                _set_section(out, "access", "complete")
            out["artifactMetadata"] = {
                artifact_id: artifact["_artifactMetadata"]
                for artifact in artifacts
                if (
                    (artifact_id := _artifact_id(artifact))
                    in workspace_item_ids
                    and isinstance(
                        artifact.get("_artifactMetadata"),
                        dict,
                    )
                )
            }
            try:
                out["lineage"] = _official_lineage(
                    artifacts,
                    workspace_item_ids,
                    ws,
                )
                _set_section(out, "lineage", "complete")
            except Exception as error:
                out["lineage"] = []
                _record_failure(out, "lineage", error)

            schema_state = out["sections"].get("schema", {})
            schema_failed = (
                schema_state.get("status") == "failed"
                and schema_state.get("code") != "not-run"
            )
            all_schema = {}
            for artifact in artifacts:
                artifact_id = _artifact_id(artifact)
                try:
                    item_schema = _item_schema(
                        fabricToken,
                        ws,
                        artifact,
                        artifact["_type"],
                        defer_enrichment=defer_enrichment,
                    )
                    if item_schema:
                        all_schema[artifact_id] = item_schema
                except Exception as error:
                    schema_failed = True
                    out["errors"].append(
                        f"schema: {_safe_error_code(error)}"
                    )
            try:
                _derive_storage_schemas(
                    fabricToken,
                    ws,
                    artifacts,
                    all_schema,
                    resolve_details=not defer_enrichment,
                )
            except Exception as error:
                schema_failed = True
                out["errors"].append(
                    f"schema: {_safe_error_code(error)}"
                )
            artifact_types = {
                _artifact_id(artifact): artifact.get("_type")
                for artifact in artifacts
                if _artifact_id(artifact)
            }
            all_schema = {
                item_id: _finalize_schema_object_ids(
                    item_id,
                    artifact_types.get(item_id),
                    tables,
                )
                for item_id, tables in all_schema.items()
            }
            workspace_schema = {
                item_id: tables
                for item_id, tables in all_schema.items()
                if item_id in workspace_item_ids
            }
            extra_object_edges = [
                edge
                for artifact in artifacts
                if _artifact_id(artifact) in workspace_item_ids
                for edge in artifact.get("_objectEdges") or []
            ]
            object_edges = _collect_atlas_object_edges(
                workspace_schema,
                extra_edges=extra_object_edges,
            )
            out["objectEdges"] = object_edges
            out["capabilities"]["objectLineage"] = {
                "status": "complete",
            }
            out["schema"] = {
                item_id: _public_schema(tables)
                for item_id, tables in workspace_schema.items()
            }
            if schema_failed:
                _set_section(
                    out,
                    "schema",
                    "failed",
                    out["sections"]
                    .get("schema", {})
                    .get("code", "upstream-failure"),
                )
            else:
                _set_section(out, "schema", "complete")

            config_failed = False
            for artifact in artifacts:
                artifact_id = _artifact_id(artifact)
                if artifact_id not in workspace_item_ids:
                    continue
                try:
                    out["config"].extend(
                        _item_config(
                            fabricToken,
                            ws,
                            artifact,
                            artifact["_type"],
                            out["schema"].get(artifact_id, []),
                        )
                    )
                except Exception as error:
                    config_failed = True
                    out["errors"].append(
                        f"config: {_safe_error_code(error)}"
                    )
            _set_section(
                out,
                "config",
                "failed" if config_failed else "complete",
                "upstream-failure" if config_failed else None,
            )
        else:
            scanner_code = out["sections"].get("scanner", {}).get(
                "code",
                "scanner-failed",
            )
            out["capabilities"]["objectLineage"] = {
                "status": "failed",
                "code": scanner_code,
            }
            for name in ("access", "lineage", "schema", "config"):
                _set_section(out, name, "failed", scanner_code)
                out["errors"].append(f"{name}: {scanner_code}")

        if not defer_enrichment:
            for item in out["items"]:
                try:
                    jobs = _get_all(
                        fabricToken,
                        f"/workspaces/{ws}/items/{item['id']}/jobs/instances",
                    )
                    _track_optional(trackers["jobs"], "success")
                    for value in jobs[:3]:
                        job = _sanitize_job(value, item)
                        if job is None:
                            raise ValueError("job record was invalid")
                        out["jobs"].append(job)
                except urllib.error.HTTPError as error:
                    code = _safe_error_code(error, optional=True)
                    if code == "endpoint-unsupported":
                        _track_optional(
                            trackers["jobs"],
                            "unsupported",
                            code,
                        )
                    else:
                        _track_optional(trackers["jobs"], "failed", code)
                        out["errors"].append(f"jobs: {code}")
                except Exception as error:
                    code = _safe_error_code(error, optional=True)
                    _track_optional(trackers["jobs"], "failed", code)
                    out["errors"].append(f"jobs: {code}")
                    if isinstance(error, DeadlineExceeded):
                        break

    for name, tracker in trackers.items():
        _finish_optional_section(out, name, tracker)
    _set_optional_capabilities(out)
    if defer_enrichment:
        out["enrichmentItemIds"] = [item["id"] for item in out["items"]]
    out["syncedAt"] = (
        datetime.datetime.now(datetime.timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )
    return _guard_response_size(out)
