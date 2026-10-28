#!/usr/bin/env python3
"""Copy or move selected content between Microsoft Fabric Lakehouses.

Run in Fabric Spark in three explicit phases:

* ``copy`` with the source Lakehouse attached.
* ``finalize`` with the target Lakehouse attached.
* ``delete-source`` with the source attached, only for a validated move.

Native Delta tables, ordinary Files content, OneLake shortcuts, and Spark views
are selectable. A move is always copy + validation + separately confirmed
source deletion. The utility never deletes a source Lakehouse item itself.
"""

from __future__ import annotations

import fnmatch
import json
import logging
import re
import time
import uuid
from dataclasses import asdict, dataclass
from typing import Any, Iterable, Mapping, Protocol, Sequence
from urllib.parse import quote

import requests

try:
    from notebookutils import mssparkutils
except ImportError:  # pragma: no cover - Fabric only
    mssparkutils = None  # type: ignore[assignment]


LOGGER = logging.getLogger("lakehouse_copy_move")
FABRIC_API = "https://api.fabric.microsoft.com/v1"
MANIFEST_VERSION = 1
ITEM_TYPES = frozenset({"tables", "files", "shortcuts", "views"})
CONFLICT_MODES = frozenset({"error", "skip", "overwrite"})


class SparkSessionLike(Protocol):
    catalog: Any
    read: Any

    def sql(self, query: str) -> Any: ...

    def table(self, table_name: str) -> Any: ...


@dataclass(frozen=True)
class Endpoint:
    workspace_id: str
    lakehouse_id: str

    @property
    def root(self) -> str:
        return (
            f"abfss://{self.workspace_id}@onelake.dfs.fabric.microsoft.com/"
            f"{self.lakehouse_id}"
        )


@dataclass(frozen=True)
class TablePlan:
    schema: str
    name: str
    source_path: str
    target_path: str
    source_version: int
    partition_columns: tuple[str, ...]
    ddl_file: str

    @property
    def qualified_name(self) -> str:
        return f"{quote_identifier(self.schema)}.{quote_identifier(self.name)}"


class FabricClient:
    def __init__(self, token: str, attempts: int = 5) -> None:
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        self.attempts = attempts

    def collection(self, url: str, key: str = "value") -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        next_url: str | None = url
        while next_url:
            payload = self.request("GET", next_url).json()
            records.extend(payload.get(key, []))
            next_url = payload.get("continuationUri")
            if not next_url and payload.get("continuationToken"):
                separator = "&" if "?" in url else "?"
                token = quote(str(payload["continuationToken"]), safe="")
                next_url = f"{url}{separator}continuationToken={token}"
        return records

    def request(
        self,
        method: str,
        url: str,
        body: Mapping[str, Any] | None = None,
    ) -> requests.Response:
        for attempt in range(1, self.attempts + 1):
            response = requests.request(
                method,
                url,
                headers=self.headers,
                json=body,
                timeout=90,
            )
            if response.status_code not in {429, 500, 502, 503, 504}:
                response.raise_for_status()
                return response
            if attempt == self.attempts:
                response.raise_for_status()
            retry_after = response.headers.get("Retry-After", "")
            delay = float(retry_after) if retry_after.isdigit() else min(2 ** (attempt - 1), 30)
            time.sleep(delay)
        raise RuntimeError("Fabric API retry loop exited unexpectedly")


def quote_identifier(value: str) -> str:
    return f"`{value.replace('`', '``')}`"


def normalize_path(value: str) -> str:
    return "/".join(part for part in value.strip("/").split("/") if part).casefold()


def logical_schema_name(namespace: str) -> str:
    value = namespace.strip()
    if not value:
        raise ValueError("Spark returned an empty namespace")
    return value.rsplit(".", 1)[-1]


def row_value(row: Any, *names: str) -> Any:
    for name in names:
        try:
            return row[name]
        except (KeyError, TypeError, ValueError):
            pass
        if hasattr(row, name):
            return getattr(row, name)
    raise KeyError(f"Missing row fields: {', '.join(names)}")


def parse_string_list(value: Any, parameter_name: str) -> list[str]:
    """Accept notebook lists, JSON arrays, or comma-separated pipeline text."""
    if value is None:
        return []
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return []
        if stripped.startswith(("[", "{")):
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{parameter_name} is not valid JSON") from exc
            if not isinstance(parsed, list):
                raise ValueError(f"{parameter_name} JSON value must be an array")
            value = parsed
        else:
            value = stripped.split(",")
    if not isinstance(value, (list, tuple, set)):
        raise ValueError(
            f"{parameter_name} must be a list, JSON array, or comma-separated text"
        )
    result = [str(item).strip() for item in value if str(item).strip()]
    return result


def parse_bool(value: Any, parameter_name: str) -> bool:
    """Accept booleans and common pipeline-friendly boolean text."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().casefold()
        if normalized in {"true", "1", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
    raise ValueError(f"{parameter_name} must be a boolean or true/false text")


def validate_uuid(value: str, parameter_name: str) -> str:
    """Validate and canonicalize a Fabric workspace or item UUID."""
    try:
        return str(uuid.UUID(value.strip()))
    except (AttributeError, ValueError) as exc:
        raise ValueError(f"{parameter_name} must be a valid UUID") from exc


def resolve_manifest_root(value: str, source: Endpoint | None = None) -> str:
    """Return a stable manifest path usable with either Lakehouse attached."""
    stripped = value.strip().rstrip("/") if value else ""
    if stripped.casefold().startswith("abfss://"):
        return stripped
    if source is None:
        raise ValueError(
            "manifest_root must be a full abfss:// path during finalize or "
            "delete-source"
        )
    relative = stripped or "Files/lakehouse-copy-move"
    if not normalize_path(relative).startswith("files/"):
        raise ValueError(
            "Relative manifest_root must be under Files/, or use a full abfss:// path"
        )
    return f"{source.root}/{relative.lstrip('/')}"


def resolve_item_types(
    include: Sequence[str] | None,
    exclude: Sequence[str] | None,
) -> set[str]:
    requested = {value.casefold() for value in (include or ("all",))}
    excluded = {value.casefold() for value in (exclude or ())}
    unknown = (requested | excluded) - ITEM_TYPES - {"all"}
    if unknown:
        raise ValueError(f"Unknown item types: {', '.join(sorted(unknown))}")
    selected = set(ITEM_TYPES) if "all" in requested else requested
    if "all" in excluded:
        selected.clear()
    else:
        selected -= excluded
    if not selected:
        raise ValueError("No item types remain after include/exclude selection")
    return selected


def selected_name(
    value: str,
    include_patterns: Sequence[str] | None,
    exclude_patterns: Sequence[str] | None,
) -> bool:
    normalized = normalize_path(value)
    included = not include_patterns or any(
        fnmatch.fnmatchcase(normalized, pattern.casefold())
        for pattern in include_patterns
    )
    excluded = bool(exclude_patterns) and any(
        fnmatch.fnmatchcase(normalized, pattern.casefold())
        for pattern in exclude_patterns
    )
    return included and not excluded


def active_spark() -> SparkSessionLike:
    if mssparkutils is None:
        raise RuntimeError("Run this utility in a Microsoft Fabric Spark runtime")
    existing = globals().get("spark")
    if existing is not None:
        return existing
    from pyspark.sql import SparkSession

    session = SparkSession.getActiveSession()
    if session is None:
        raise RuntimeError("No active SparkSession was found")
    return session


def fs_exists(path: str) -> bool:
    assert mssparkutils is not None
    try:
        return bool(mssparkutils.fs.exists(path))
    except AttributeError:
        try:
            mssparkutils.fs.ls(path)
            return True
        except Exception:
            return False


def ensure_target_available(path: str, conflict: str, dry_run: bool) -> bool:
    if conflict not in CONFLICT_MODES:
        raise ValueError(f"Unsupported conflict mode: {conflict}")
    if not fs_exists(path):
        return True
    if conflict == "skip":
        LOGGER.info("Skipping existing target %s", path)
        return False
    if conflict == "error":
        raise FileExistsError(f"Target already exists: {path}")
    LOGGER.warning("Overwriting existing target %s", path)
    if not dry_run:
        assert mssparkutils is not None
        mssparkutils.fs.rm(path, True)
    return True


def shortcut_paths(shortcuts: Iterable[Mapping[str, Any]]) -> set[str]:
    return {
        normalize_path(f"{item.get('path', '')}/{item.get('name', '')}")
        for item in shortcuts
        if item.get("name")
    }


def table_relative_path(location: str) -> str:
    """Extract a Lakehouse-relative Tables path from a Delta location."""
    normalized = location.replace("\\", "/")
    marker = "/tables/"
    index = normalized.casefold().find(marker)
    if index < 0:
        raise ValueError(f"Delta location is not under a Lakehouse Tables path: {location}")
    suffix = normalized[index + len(marker) :].strip("/")
    if not suffix or ".." in suffix.split("/"):
        raise ValueError(f"Unsafe or incomplete Delta table location: {location}")
    return f"Tables/{suffix}"


def shortcut_item_url(endpoint: Endpoint, path: str, name: str) -> str:
    encoded_path = "/".join(
        quote(part, safe="") for part in path.strip("/").split("/")
    )
    return (
        f"{FABRIC_API}/workspaces/{endpoint.workspace_id}/items/"
        f"{endpoint.lakehouse_id}/shortcuts/{encoded_path}/{quote(name, safe='')}"
    )


def discover_tables(
    spark_session: SparkSessionLike,
    source: Endpoint,
    target: Endpoint,
    shortcut_roots: set[str],
    include_patterns: Sequence[str] | None,
    exclude_patterns: Sequence[str] | None,
) -> list[TablePlan]:
    namespaces: list[str] = []
    for row in spark_session.sql("SHOW DATABASES").collect():
        schema = logical_schema_name(str(row_value(row, "namespace", "databaseName")))
        if schema != "global_temp" and schema not in namespaces:
            namespaces.append(schema)

    plans: list[TablePlan] = []
    for schema in namespaces:
        try:
            view_names = {
                str(row_value(row, "viewName", "tableName")).casefold()
                for row in spark_session.sql(
                    f"SHOW VIEWS IN {quote_identifier(schema)}"
                ).collect()
            }
        except Exception:
            view_names = set()
        for row in spark_session.sql(f"SHOW TABLES IN {quote_identifier(schema)}").collect():
            if bool(row_value(row, "isTemporary")):
                continue
            name = str(row_value(row, "tableName"))
            if name.casefold() in view_names:
                continue
            local_candidates = {
                normalize_path(f"Tables/{schema}/{name}"),
                normalize_path(f"Tables/{name}"),
            }
            if local_candidates & shortcut_roots:
                continue
            logical = f"{schema}.{name}"
            if not selected_name(logical, include_patterns, exclude_patterns):
                continue
            qualified = f"{quote_identifier(schema)}.{quote_identifier(name)}"
            detail = spark_session.sql(f"DESCRIBE DETAIL {qualified}").first()
            if detail is None or str(row_value(detail, "format")).casefold() != "delta":
                continue
            location = str(row_value(detail, "location"))
            relative = table_relative_path(location)
            if normalize_path(relative) in shortcut_roots:
                continue
            history = spark_session.sql(f"DESCRIBE HISTORY {qualified} LIMIT 1").first()
            version = int(row_value(history, "version")) if history is not None else 0
            partitions = tuple(str(x) for x in row_value(detail, "partitionColumns"))
            plans.append(
                TablePlan(
                    schema=schema,
                    name=name,
                    source_path=location,
                    target_path=f"{target.root}/{relative}",
                    source_version=version,
                    partition_columns=partitions,
                    ddl_file=f"ddl/{schema}.{name}.sql",
                )
            )
    return sorted(plans, key=lambda item: (item.schema, item.name))


def normalize_view_ddl(ddl: str, schema: str, name: str) -> str:
    """Make Fabric SHOW CREATE VIEW output portable and idempotent."""
    normalized = ddl.strip().rstrip(";")
    header = re.match(r"(?is)^CREATE\s+VIEW\s+[^\s(]+", normalized)
    if not header:
        raise ValueError(f"Unsupported view DDL for {schema}.{name}")
    normalized = (
        f"CREATE OR REPLACE VIEW {quote_identifier(schema)}.{quote_identifier(name)}"
        + normalized[header.end() :]
    )
    normalized = re.sub(
        r"(?is)\nTBLPROPERTIES\s*\((?:[^']|'(?:''|[^'])*')*?\)\s*(?=\nAS\s)",
        "",
        normalized,
    )
    normalized = re.sub(
        r"`[^`]+`\.`[^`]+`\.`([^`]+)`\.`([^`]+)`",
        r"`\1`.`\2`",
        normalized,
    )
    return normalized + ";\n"


def ddl_from_table(spark_session: SparkSessionLike, table: TablePlan) -> str:
    dataframe = spark_session.table(table.qualified_name)
    columns = []
    for field in dataframe.schema.fields:
        nullable = "" if field.nullable else " NOT NULL"
        columns.append(
            f"  {quote_identifier(field.name)} {field.dataType.simpleString()}{nullable}"
        )
    partition = ""
    if table.partition_columns:
        names = ", ".join(quote_identifier(name) for name in table.partition_columns)
        partition = f"\nPARTITIONED BY ({names})"
    return (
        f"CREATE TABLE IF NOT EXISTS {table.qualified_name} (\n"
        + ",\n".join(columns)
        + f"\n)\nUSING DELTA{partition};\n"
    )


def remap_shortcut(
    shortcut: Mapping[str, Any],
    source: Endpoint,
    target: Endpoint,
    remap_internal: bool,
) -> dict[str, Any]:
    result = json.loads(json.dumps(shortcut))
    result.pop("isShortcutTransform", None)
    result.pop("readOnly", None)
    target_body = result.get("target", {})
    one_lake = target_body.get("oneLake") or target_body.get("onelake")
    if remap_internal and isinstance(one_lake, dict):
        if (
            str(one_lake.get("workspaceId", "")).casefold() == source.workspace_id.casefold()
            and str(one_lake.get("itemId", "")).casefold() == source.lakehouse_id.casefold()
        ):
            one_lake["workspaceId"] = target.workspace_id
            one_lake["itemId"] = target.lakehouse_id
    return result


def list_files_recursive(root: str, excluded_roots: set[str]) -> list[dict[str, Any]]:
    assert mssparkutils is not None
    records: list[dict[str, Any]] = []

    def walk(path: str, relative: str) -> None:
        for entry in mssparkutils.fs.ls(path):
            child_relative = f"{relative}/{entry.name}".strip("/")
            if any(
                normalize_path(child_relative) == blocked
                or normalize_path(child_relative).startswith(blocked + "/")
                for blocked in excluded_roots
            ):
                continue
            is_dir = bool(getattr(entry, "isDir", False))
            records.append(
                {
                    "relativePath": child_relative,
                    "sourcePath": entry.path,
                    "isDirectory": is_dir,
                    "size": int(getattr(entry, "size", 0)),
                }
            )
            if is_dir:
                walk(entry.path, child_relative)

    if fs_exists(root):
        walk(root, "")
    return records


def write_json(path: str, value: Mapping[str, Any]) -> None:
    assert mssparkutils is not None
    mssparkutils.fs.put(path, json.dumps(value, indent=2, sort_keys=True) + "\n", True)


def read_json(path: str) -> dict[str, Any]:
    assert mssparkutils is not None
    return json.loads(str(mssparkutils.fs.head(path, 32 * 1024 * 1024)))


def validate_migration_manifest(manifest: Mapping[str, Any]) -> None:
    """Reject malformed or unsafe persisted migration plans."""
    if manifest.get("formatVersion") != MANIFEST_VERSION:
        raise ValueError("Unsupported migration manifest version")
    if manifest.get("kind") != "FabricLakehouseCopyMove":
        raise ValueError("Unexpected migration manifest kind")
    for endpoint_name in ("source", "target"):
        endpoint = manifest.get(endpoint_name)
        if not isinstance(endpoint, Mapping):
            raise ValueError(f"Manifest {endpoint_name} endpoint is invalid")
        if not endpoint.get("workspace_id") or not endpoint.get("lakehouse_id"):
            raise ValueError(f"Manifest {endpoint_name} endpoint is incomplete")
        validate_uuid(str(endpoint["workspace_id"]), f"manifest {endpoint_name} workspace_id")
        validate_uuid(str(endpoint["lakehouse_id"]), f"manifest {endpoint_name} lakehouse_id")
    for item in manifest.get("files", []):
        relative = str(item.get("relativePath", ""))
        if not relative or relative.startswith(("/", "\\")) or ".." in relative.replace("\\", "/").split("/"):
            raise ValueError(f"Unsafe Files relative path: {relative!r}")


def copy_phase(
    *,
    operation: str,
    source: Endpoint,
    target: Endpoint,
    manifest_root: str,
    include_items: Sequence[str] | None = None,
    exclude_items: Sequence[str] | None = None,
    include_patterns: Sequence[str] | None = None,
    exclude_patterns: Sequence[str] | None = None,
    include_table_data: bool = True,
    conflict: str = "error",
    remap_internal_shortcuts: bool = True,
    dry_run: bool = True,
) -> dict[str, Any]:
    """Inventory and copy selected source content to the target."""
    if operation not in {"copy", "move"}:
        raise ValueError("operation must be 'copy' or 'move'")
    validate_uuid(source.workspace_id, "source_workspace_id")
    validate_uuid(source.lakehouse_id, "source_lakehouse_id")
    validate_uuid(target.workspace_id, "target_workspace_id")
    validate_uuid(target.lakehouse_id, "target_lakehouse_id")
    if operation == "move" and "tables" in resolve_item_types(include_items, exclude_items) and not include_table_data:
        raise ValueError("Moving tables requires include_table_data=True")
    if source == target:
        raise ValueError("Source and target Lakehouses must differ")
    selected = resolve_item_types(include_items, exclude_items)
    spark_session = active_spark()
    assert mssparkutils is not None
    token = mssparkutils.credentials.getToken("pbi")
    api = FabricClient(token)
    shortcuts_url = f"{FABRIC_API}/workspaces/{source.workspace_id}/items/{source.lakehouse_id}/shortcuts"
    shortcuts = api.collection(shortcuts_url)
    roots = shortcut_paths(shortcuts)

    tables = (
        discover_tables(
            spark_session,
            source,
            target,
            roots,
            include_patterns,
            exclude_patterns,
        )
        if "tables" in selected
        else []
    )
    copied_tables: list[str] = []
    for table in tables:
        ddl = ddl_from_table(spark_session, table)
        if not dry_run:
            mssparkutils.fs.put(f"{manifest_root.rstrip('/')}/{table.ddl_file}", ddl, True)
        if include_table_data:
            should_copy = ensure_target_available(table.target_path, conflict, dry_run)
            if should_copy and not dry_run:
                dataframe = (
                    spark_session.read.format("delta")
                    .option("versionAsOf", table.source_version)
                    .load(table.source_path)
                )
                writer = dataframe.write.format("delta").mode("overwrite")
                if table.partition_columns:
                    writer = writer.partitionBy(*table.partition_columns)
                writer.save(table.target_path)
            if should_copy:
                copied_tables.append(table.qualified_name)

    selected_shortcuts = [
        remap_shortcut(item, source, target, remap_internal_shortcuts)
        for item in shortcuts
        if "shortcuts" in selected
        and selected_name(
            f"{item.get('path', '')}/{item.get('name', '')}",
            include_patterns,
            exclude_patterns,
        )
    ]
    excluded_file_roots = {
        path[len("files/") :]
        for path in roots
        if path.startswith("files/")
    }
    manifest_relative = None
    marker = f"/{source.lakehouse_id}/Files/"
    if marker.casefold() in manifest_root.casefold():
        manifest_relative = manifest_root.split(marker, 1)[-1]
    elif normalize_path(manifest_root).startswith("files/"):
        manifest_relative = manifest_root.strip("/")[len("Files/") :]
    if manifest_relative:
        excluded_file_roots.add(normalize_path(manifest_relative))
    files = (
        list_files_recursive(f"{source.root}/Files", excluded_file_roots)
        if "files" in selected
        else []
    )
    copied_files: list[str] = []
    for item in files:
        relative = str(item["relativePath"])
        if not selected_name(f"Files/{relative}", include_patterns, exclude_patterns):
            continue
        destination = f"{target.root}/Files/{relative}"
        should_copy = ensure_target_available(destination, conflict, dry_run)
        if should_copy and not dry_run:
            if bool(item["isDirectory"]):
                mssparkutils.fs.mkdirs(destination)
            else:
                parent = destination.rsplit("/", 1)[0]
                mssparkutils.fs.mkdirs(parent)
                mssparkutils.fs.cp(str(item["sourcePath"]), destination, False)
        if should_copy:
            copied_files.append(relative)

    if not dry_run:
        target_shortcuts_url = (
            f"{FABRIC_API}/workspaces/{target.workspace_id}/items/"
            f"{target.lakehouse_id}/shortcuts"
        )
        for shortcut in selected_shortcuts:
            try:
                api.request("POST", target_shortcuts_url, shortcut)
            except requests.HTTPError as exc:
                is_conflict = exc.response is not None and exc.response.status_code == 409
                if not is_conflict or conflict == "error":
                    raise
                if conflict == "skip":
                    LOGGER.info(
                        "Skipping existing target shortcut %s/%s",
                        shortcut["path"],
                        shortcut["name"],
                    )
                    continue
                api.request(
                    "DELETE",
                    shortcut_item_url(
                        target,
                        str(shortcut["path"]),
                        str(shortcut["name"]),
                    ),
                )
                api.request("POST", target_shortcuts_url, shortcut)

    views: list[dict[str, str]] = []
    if "views" in selected:
        for row in spark_session.sql("SHOW DATABASES").collect():
            schema = logical_schema_name(str(row_value(row, "namespace", "databaseName")))
            if schema == "global_temp":
                continue
            try:
                view_rows = spark_session.sql(f"SHOW VIEWS IN {quote_identifier(schema)}").collect()
            except Exception:
                continue
            for view_row in view_rows:
                name = str(row_value(view_row, "viewName", "tableName"))
                logical = f"{schema}.{name}"
                if not selected_name(logical, include_patterns, exclude_patterns):
                    continue
                qualified = f"{quote_identifier(schema)}.{quote_identifier(name)}"
                ddl_row = spark_session.sql(f"SHOW CREATE TABLE {qualified}").first()
                if ddl_row is None:
                    raise RuntimeError(f"No view DDL returned for {qualified}")
                views.append(
                    {
                        "schema": schema,
                        "name": name,
                        "ddl": normalize_view_ddl(str(ddl_row[0]), schema, name),
                    }
                )

    manifest: dict[str, Any] = {
        "formatVersion": MANIFEST_VERSION,
        "kind": "FabricLakehouseCopyMove",
        "operation": operation,
        "manifestRoot": manifest_root,
        "phase": "copied" if not dry_run else "planned",
        "validated": False,
        "source": asdict(source),
        "target": asdict(target),
        "selection": {
            "includeItems": sorted(selected),
            "includePatterns": list(include_patterns or []),
            "excludePatterns": list(exclude_patterns or []),
            "includeTableData": include_table_data,
            "conflict": conflict,
        },
        "tables": [asdict(item) for item in tables],
        "copiedTables": copied_tables,
        "files": files,
        "copiedFiles": copied_files,
        "shortcuts": selected_shortcuts,
        "views": views,
    }
    if not dry_run:
        write_json(f"{manifest_root.rstrip('/')}/manifest.json", manifest)
    return manifest


def finalize_phase(manifest_root: str, dry_run: bool = True) -> dict[str, Any]:
    """Finalize and validate copied content with the target attached."""
    spark_session = active_spark()
    manifest = read_json(f"{manifest_root.rstrip('/')}/manifest.json")
    validate_migration_manifest(manifest)
    if manifest.get("phase") != "copied":
        raise ValueError("Manifest is not ready for finalization")
    copied_table_names = set(manifest.get("copiedTables", []))
    tables = [
        TablePlan(**{**item, "partition_columns": tuple(item["partition_columns"])})
        for item in manifest["tables"]
        if (
            f"{quote_identifier(str(item['schema']))}."
            f"{quote_identifier(str(item['name']))}"
        ) in copied_table_names
    ]
    include_data = bool(manifest["selection"]["includeTableData"])
    for table in tables:
        spark_session.sql(f"CREATE SCHEMA IF NOT EXISTS {quote_identifier(table.schema)}")
        if not include_data:
            assert mssparkutils is not None
            ddl = str(mssparkutils.fs.head(f"{manifest_root.rstrip('/')}/{table.ddl_file}", 4 * 1024 * 1024))
            if not dry_run:
                spark_session.sql(ddl)
    for view in manifest.get("views", []):
        spark_session.sql(f"CREATE SCHEMA IF NOT EXISTS {quote_identifier(str(view['schema']))}")
        if not dry_run:
            spark_session.sql(str(view["ddl"]))

    if not dry_run:
        missing = [table.qualified_name for table in tables if not spark_session.catalog.tableExists(table.qualified_name)]
        if missing:
            raise RuntimeError("Missing target tables: " + ", ".join(missing))
        table_counts: dict[str, dict[str, int]] = {}
        for table in tables:
            target_detail = spark_session.sql(f"DESCRIBE DETAIL {table.qualified_name}").first()
            target_partitions = tuple(str(x) for x in row_value(target_detail, "partitionColumns"))
            if target_partitions != table.partition_columns:
                raise RuntimeError(f"Partition mismatch for {table.qualified_name}")
            target_count = int(spark_session.table(table.qualified_name).count())
            source_count = int(
                spark_session.read.format("delta")
                .option("versionAsOf", table.source_version)
                .load(table.source_path)
                .count()
            )
            expected_count = source_count if include_data else 0
            if target_count != expected_count:
                raise RuntimeError(
                    f"Row count mismatch for {table.qualified_name}: "
                    f"expected {expected_count}, found {target_count}"
                )
            table_counts[table.qualified_name] = {
                "source": source_count,
                "target": target_count,
            }

        file_validation: list[str] = []
        target = Endpoint(**manifest["target"])
        file_records = {
            str(item["relativePath"]): item for item in manifest.get("files", [])
        }
        for relative in manifest.get("copiedFiles", []):
            target_path = f"{target.root}/Files/{relative}"
            if not fs_exists(target_path):
                raise RuntimeError(f"Missing target Files item: {relative}")
            record = file_records[str(relative)]
            if not bool(record.get("isDirectory", False)):
                assert mssparkutils is not None
                parent, name = target_path.rsplit("/", 1)
                target_entries = {entry.name: entry for entry in mssparkutils.fs.ls(parent)}
                target_size = int(getattr(target_entries[name], "size", 0))
                if target_size != int(record.get("size", 0)):
                    raise RuntimeError(f"File size mismatch for {relative}")
            file_validation.append(str(relative))

        assert mssparkutils is not None
        api = FabricClient(mssparkutils.credentials.getToken("pbi"))
        target_shortcuts = api.collection(
            f"{FABRIC_API}/workspaces/{target.workspace_id}/items/{target.lakehouse_id}/shortcuts"
        )
        actual_shortcuts = shortcut_paths(target_shortcuts)
        for shortcut in manifest.get("shortcuts", []):
            expected_path = normalize_path(f"{shortcut['path']}/{shortcut['name']}")
            if expected_path not in actual_shortcuts:
                raise RuntimeError(f"Missing target shortcut: {expected_path}")

        for view in manifest.get("views", []):
            qualified = f"{quote_identifier(str(view['schema']))}.{quote_identifier(str(view['name']))}"
            if not spark_session.catalog.tableExists(qualified):
                raise RuntimeError(f"Missing target view: {qualified}")

        manifest["phase"] = "validated"
        manifest["validated"] = True
        manifest["validation"] = {
            "tableRowCounts": table_counts,
            "files": file_validation,
            "shortcuts": len(manifest.get("shortcuts", [])),
            "views": len(manifest.get("views", [])),
        }
        write_json(f"{manifest_root.rstrip('/')}/manifest.json", manifest)
    return manifest


def expected_move_confirmation(source: Endpoint) -> str:
    return f"DELETE-SOURCE-{source.lakehouse_id}"


def delete_source_phase(
    manifest_root: str,
    confirmation: str,
    dry_run: bool = True,
) -> dict[str, Any]:
    """Delete validated selected source objects for a move operation."""
    spark_session = active_spark()
    manifest = read_json(f"{manifest_root.rstrip('/')}/manifest.json")
    validate_migration_manifest(manifest)
    source = Endpoint(**manifest["source"])
    if manifest.get("operation") != "move":
        raise ValueError("Source deletion is allowed only for operation='move'")
    if not manifest.get("validated") or manifest.get("phase") != "validated":
        raise ValueError("Source deletion requires a validated target manifest")
    expected = expected_move_confirmation(source)
    if confirmation != expected:
        raise ValueError(f"Invalid confirmation. Expected exactly: {expected}")

    assert mssparkutils is not None
    token = mssparkutils.credentials.getToken("pbi")
    api = FabricClient(token)
    deleted: dict[str, list[str]] = {key: [] for key in ITEM_TYPES}

    for view in reversed(manifest.get("views", [])):
        qualified = f"{quote_identifier(str(view['schema']))}.{quote_identifier(str(view['name']))}"
        if not dry_run:
            spark_session.sql(f"DROP VIEW IF EXISTS {qualified}")
        deleted["views"].append(qualified)
    for shortcut in manifest.get("shortcuts", []):
        path = str(shortcut["path"])
        name = str(shortcut["name"])
        if not dry_run:
            api.request("DELETE", shortcut_item_url(source, path, name))
        deleted["shortcuts"].append(f"{path}/{name}")
    copied_table_names = set(manifest.get("copiedTables", []))
    for raw in manifest.get("tables", []):
        table = TablePlan(**{**raw, "partition_columns": tuple(raw["partition_columns"])})
        if table.qualified_name not in copied_table_names:
            continue
        if not dry_run:
            spark_session.sql(f"DROP TABLE IF EXISTS {table.qualified_name}")
        deleted["tables"].append(table.qualified_name)
    file_records = {
        str(item["relativePath"]): bool(item.get("isDirectory", False))
        for item in manifest.get("files", [])
    }
    for relative in sorted(
        manifest.get("copiedFiles", []),
        key=lambda value: (str(value).count("/"), str(value)),
        reverse=True,
    ):
        source_path = f"{source.root}/Files/{relative}"
        if not dry_run and fs_exists(source_path):
            mssparkutils.fs.rm(source_path, file_records.get(str(relative), False))
        deleted["files"].append(relative)

    if not dry_run:
        manifest["phase"] = "source-deleted"
        manifest["deletedSourceItems"] = deleted
        write_json(f"{manifest_root.rstrip('/')}/manifest.json", manifest)
    return {"dryRun": dry_run, "deleted": deleted, "confirmation": expected}
