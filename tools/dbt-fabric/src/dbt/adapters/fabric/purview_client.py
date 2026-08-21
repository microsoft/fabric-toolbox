import json
import time
from urllib.parse import parse_qs, quote, urlencode, urlparse, urlunparse

import dbt_common.exceptions
import requests

from dbt.adapters.events.logging import AdapterLogger
from dbt.adapters.fabric.fabric_token_provider import FabricTokenProvider
from dbt.adapters.fabric.purview_types import (
    AtlasEntity,
    AtlasRelationship,
    BulkResponse,
    EntityResponse,
    PurviewEntityRef,
)

logger = AdapterLogger("fabric")

_API_VERSION = "2023-09-01"
_PURVIEW_SCOPE = "https://purview.azure.net/.default"
_SEARCH_API = "/datamap/api/search/query"
_ENTITY_API = "/datamap/api/atlas/v2/entity"
_ENTITY_BULK_API = "/datamap/api/atlas/v2/entity/bulk"
_RELATIONSHIP_API = "/datamap/api/atlas/v2/relationship"
_TYPEDEF_API = "/datamap/api/atlas/v2/types/typedefs"
_TYPEDEF_BY_NAME_API = "/datamap/api/atlas/v2/types/typedef"
_BM_TYPEDEF_BY_NAME_API = "/datamap/api/atlas/v2/types/businessmetadatadef"
_BUSINESS_METADATA_API = (
    "/datamap/api/atlas/v2/entity/guid/{guid}/businessmetadata/{bm_name}?isOverwrite=true"
)
_LABELS_API = "/datamap/api/atlas/v2/entity/guid/{guid}/labels"


def _qualifiedname_matches(qualified_name: str, identifiers: list[str]) -> bool:
    """Check if any identifier matches a path segment in the qualifiedName."""
    segments = [s.lower() for s in qualified_name.split("/") if s]
    return any(i in segments for i in identifiers)


_BM_APPLICABLE_TYPES = {"DataSet"}

_BM_ATTRIBUTES = [
    ("dbt_model_id", "dbt model unique ID"),
    ("dbt_tags", "Comma-separated dbt tags"),
    ("dbt_materialization", "Materialization type (table, view, incremental, etc.)"),
    ("dbt_meta", "Custom meta from dbt model config (JSON)"),
    ("dbt_tests", "Comma-separated test names on this model"),
    ("dbt_test_status", "Test status summary from last run"),
    ("dbt_last_sync", "ISO 8601 timestamp of last Purview sync"),
]

_DBT_BUSINESS_METADATA_DEF = {
    "businessMetadataDefs": [
        {
            "name": "dbt_metadata",
            "description": "Metadata synced from dbt models",
            "attributeDefs": [
                {
                    "name": name,
                    "typeName": "string",
                    "description": desc,
                    "isOptional": True,
                    "options": {
                        "applicableEntityTypes": json.dumps(sorted(_BM_APPLICABLE_TYPES)),
                        "maxStrLength": "500",
                    },
                }
                for name, desc in _BM_ATTRIBUTES
            ],
        }
    ]
}

_DBT_TRANSFORMATION_TYPE_DEF = {
    "entityDefs": [
        {
            "name": "dbt_transformation",
            "superTypes": ["Process"],
            "serviceType": "dbt",
            "typeVersion": "1.0",
            "attributeDefs": [
                {
                    "name": "dbt_model_id",
                    "typeName": "string",
                    "description": "dbt model unique ID",
                },
                {
                    "name": "dbt_materialization",
                    "typeName": "string",
                    "description": "Materialization type",
                },
            ],
        }
    ]
}

# Purview's built-in fabric_warehouse type uses this serviceType (Synapse legacy)
_WAREHOUSE_SERVICE_TYPE = "Azure Synapse Analytics"

_WAREHOUSE_TYPE_DEFS = {
    "entityDefs": [
        {
            "name": "fabric_warehouse_schema",
            "description": "Schema within a Fabric Data Warehouse",
            "superTypes": ["Asset"],
            "serviceType": _WAREHOUSE_SERVICE_TYPE,
            "typeVersion": "1.0",
            "attributeDefs": [],
        },
        {
            "name": "fabric_warehouse_table",
            "description": "Table in a Fabric Data Warehouse",
            "superTypes": ["DataSet", "Purview_Table"],
            "serviceType": _WAREHOUSE_SERVICE_TYPE,
            "typeVersion": "1.0",
            "attributeDefs": [
                {"name": "createTime", "typeName": "date", "isOptional": True},
                {"name": "modifiedTime", "typeName": "date", "isOptional": True},
            ],
        },
        {
            "name": "fabric_warehouse_table_column",
            "description": "Column in a Fabric Data Warehouse table",
            "superTypes": ["DataSet"],
            "serviceType": _WAREHOUSE_SERVICE_TYPE,
            "typeVersion": "1.0",
            "attributeDefs": [
                {
                    "name": "data_type",
                    "typeName": "string",
                    "isOptional": False,
                    "description": "SQL data type",
                },
                {"name": "length", "typeName": "long", "isOptional": True},
                {"name": "precision", "typeName": "int", "isOptional": True},
                {"name": "scale", "typeName": "int", "isOptional": True},
                {"name": "isNullable", "typeName": "boolean", "isOptional": True},
            ],
        },
    ],
    "relationshipDefs": [
        {
            "name": "fabric_warehouse_schema_warehouses",
            "description": "Link between warehouse and its schemas",
            "serviceType": _WAREHOUSE_SERVICE_TYPE,
            "typeVersion": "1.0",
            "relationshipCategory": "COMPOSITION",
            "endDef1": {
                "type": "fabric_warehouse",
                "name": "schemas",
                "cardinality": "SET",
                "isContainer": True,
            },
            "endDef2": {
                "type": "fabric_warehouse_schema",
                "name": "warehouse",
                "cardinality": "SINGLE",
            },
        },
        {
            "name": "fabric_warehouse_table_schemas",
            "description": "Link between schema and its tables",
            "serviceType": _WAREHOUSE_SERVICE_TYPE,
            "typeVersion": "1.0",
            "relationshipCategory": "COMPOSITION",
            "endDef1": {
                "type": "fabric_warehouse_schema",
                "name": "tables",
                "cardinality": "SET",
                "isContainer": True,
            },
            "endDef2": {
                "type": "fabric_warehouse_table",
                "name": "dbSchema",
                "cardinality": "SINGLE",
            },
        },
        {
            "name": "fabric_warehouse_table_columns",
            "description": "Link between table and its columns",
            "serviceType": _WAREHOUSE_SERVICE_TYPE,
            "typeVersion": "1.0",
            "relationshipCategory": "COMPOSITION",
            "endDef1": {
                "type": "fabric_warehouse_table",
                "name": "columns",
                "cardinality": "SET",
                "isContainer": True,
            },
            "endDef2": {
                "type": "fabric_warehouse_table_column",
                "name": "table",
                "cardinality": "SINGLE",
            },
        },
    ],
}


class PurviewClient:
    """Low-level client for the Microsoft Purview Data Map REST API.

    This client handles authentication, retry logic, and batching for all Purview
    interactions. It is used by PurviewSync, which orchestrates the higher-level
    dbt-to-Purview sync workflow.

    Typical usage flow:
        1. ensure_type_definitions() — registers custom types (dbt_metadata, dbt_transformation,
           fabric_warehouse entity/relationship types)
        2. search_entities() — finds Purview entities matching dbt model names
        3. bulk_create_or_update() — creates/updates entities with descriptions,
           business metadata, labels, columns, and lineage in batched calls

    All HTTP requests go through _api_request(), which handles auth headers and
    retries on 429 (rate limit). Batch operations (bulk_create_or_update) split
    payloads into chunks of 50 per Purview API limits.
    """

    def __init__(self, endpoint: str, token_provider: FabricTokenProvider) -> None:
        self._endpoint = endpoint.rstrip("/")
        self._token_provider = token_provider
        self._bm_type_ensured = False
        self._transformation_type_ensured = False
        self._warehouse_types_ensured = False

    def _get_auth_headers(self) -> dict[str, str]:
        token = self._token_provider.get_access_token(scope=_PURVIEW_SCOPE)
        return {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def _api_request(
        self,
        url: str,
        method: str = "get",
        body: dict | list | None = None,
        expected_statuses: set[int] | None = None,
    ) -> requests.Response:
        """Send an HTTP request with auth headers, automatic 429 retry, and error handling.

        When expected_statuses is provided, those status codes are returned without raising.
        """
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        params["api-version"] = [_API_VERSION]
        url = urlunparse(parsed._replace(query=urlencode(params, doseq=True)))

        response = requests.request(method, url, json=body, headers=self._get_auth_headers())

        retries = 0
        while response.status_code == 429 and retries < 10:
            try:
                retry_after = int(response.headers.get("Retry-After", 5))
            except (ValueError, TypeError):
                retry_after = 5
            time.sleep(retry_after)
            response = requests.request(method, url, json=body, headers=self._get_auth_headers())
            retries += 1

        if response.status_code == 429:
            raise dbt_common.exceptions.DbtRuntimeError(
                f"Purview {method.upper()} {url} rate limited after {retries} retries"
            )

        if expected_statuses and response.status_code in expected_statuses:
            return response

        if not (200 <= response.status_code < 300):
            raise dbt_common.exceptions.DbtRuntimeError(
                f"Purview {method.upper()} {url} failed ({response.status_code}): {response.text}"
            )
        return response

    def _api_get(self, url: str) -> requests.Response:
        return self._api_request(url, method="get")

    def _api_post(self, url: str, body: dict | list) -> requests.Response:
        return self._api_request(url, method="post", body=body)

    def _api_put(self, url: str, body: dict | list) -> requests.Response:
        return self._api_request(url, method="put", body=body)

    def search_entities(
        self,
        name: str,
        database_identifiers: list[str] | None = None,
    ) -> list[PurviewEntityRef]:
        """Search Purview for table entities by name, filtering by database identifiers.

        The database_identifiers list contains Fabric item GUIDs. Results are filtered by
        checking if any identifier appears as a path segment in the qualifiedName.
        """
        url = f"{self._endpoint}{_SEARCH_API}"
        filters: list[dict] = [
            {"attributeName": "name", "operator": "eq", "attributeValue": name},
            {"objectType": "Tables"},
        ]

        results = self._run_search(url, filters)

        if database_identifiers:
            lower_ids = [i.lower() for i in database_identifiers]
            return [
                r for r in results if _qualifiedname_matches(r.get("qualifiedName", ""), lower_ids)
            ]

        return results

    def _run_search(
        self, url: str, filters: list[dict], keywords: str | None = None
    ) -> list[PurviewEntityRef]:
        """Execute a paginated search request against the Purview Data Map search API."""

        body: dict = {
            "keywords": keywords,
            "filter": {"and": filters},
            "limit": 50,
        }

        results: list[PurviewEntityRef] = []
        while True:
            response = self._api_post(url, body)
            data = response.json()
            page = data.get("value", [])
            if not page:
                break
            results.extend(page)
            if "continuationToken" not in data:
                break
            body["continuationToken"] = data["continuationToken"]

        return results

    def search_process_entities(self, qualified_name_prefix: str) -> list[PurviewEntityRef]:
        """Search for process entities with a given qualifiedName prefix."""
        url = f"{self._endpoint}{_SEARCH_API}"
        filters = [{"objectType": "Process"}]
        results = self._run_search(url, filters, keywords=qualified_name_prefix)
        return [r for r in results if r.get("qualifiedName", "").startswith(qualified_name_prefix)]

    def get_entity_by_guid(self, guid: str) -> EntityResponse:
        """Fetch a single entity and its referred entities (e.g. columns) by GUID."""
        url = f"{self._endpoint}{_ENTITY_API}/guid/{guid}"
        response = self._api_get(url)
        return response.json()

    def get_entity_by_qualified_name(
        self, type_name: str, qualified_name: str
    ) -> EntityResponse | None:
        """Fetch a single entity by its type and qualifiedName.

        Uses the Atlas uniqueAttribute endpoint, which bypasses the search index
        and returns immediately after entity creation.
        """
        encoded_qn = quote(qualified_name, safe="")
        url = (
            f"{self._endpoint}{_ENTITY_API}"
            f"/uniqueAttribute/type/{type_name}?attr:qualifiedName={encoded_qn}"
        )
        response = self._api_request(url, expected_statuses={404})
        if response.status_code == 404:
            return None
        return response.json()

    def bulk_create_or_update(
        self, entities: list[AtlasEntity], merge_business_attrs: bool = False
    ) -> BulkResponse:
        """Create or update entities in batches of 50 (Purview API limit).

        When merge_business_attrs is True, includes businessAttributeUpdateBehavior=merge
        so that businessAttributes on entities are merged into existing values.
        """
        url = f"{self._endpoint}{_ENTITY_BULK_API}"
        if merge_business_attrs:
            url += "?businessAttributeUpdateBehavior=merge"
        all_results: BulkResponse = {"mutatedEntities": {}, "guidAssignments": {}}

        for i in range(0, len(entities), 50):
            batch = entities[i : i + 50]
            response = self._api_post(url, {"entities": batch})
            data = response.json()
            for action, ents in data.get("mutatedEntities", {}).items():
                all_results["mutatedEntities"].setdefault(action, []).extend(ents)
            all_results["guidAssignments"].update(data.get("guidAssignments", {}))

        return all_results

    def create_relationship(self, relationship: AtlasRelationship) -> dict:
        """Create a relationship between two Purview entities."""
        url = f"{self._endpoint}{_RELATIONSHIP_API}"
        response = self._api_post(url, relationship)
        return response.json()

    def set_business_metadata(self, guid: str, bm_name: str, attrs: dict[str, str]) -> None:
        """Set business metadata attributes on an entity (e.g. dbt_metadata)."""
        url = f"{self._endpoint}{_BUSINESS_METADATA_API.format(guid=guid, bm_name=bm_name)}"
        self._api_post(url, attrs)

    def set_labels(self, guid: str, labels: list[str]) -> None:
        """Set labels (free-text tags) on a Purview entity, replacing existing labels."""
        url = f"{self._endpoint}{_LABELS_API.format(guid=guid)}"
        self._api_post(url, labels)

    def _register_type_def(self, url: str, type_def: dict) -> None:
        """Register a type definition, creating it if new or updating it if it already exists.

        The Purview API requires POST for initial creation and PUT for updates.
        We try POST first; if it fails (type already exists), we fall back to PUT.
        Raises DbtRuntimeError if both attempts fail.
        """
        try:
            self._api_post(url, type_def)
            return
        except dbt_common.exceptions.DbtRuntimeError as e:
            logger.debug(f"Type definition POST failed (may already exist), trying PUT: {e}")

        self._api_put(url, type_def)

    def ensure_business_metadata_type(self) -> None:
        """Register the dbt_metadata business metadata type. No-op after first success."""
        if self._bm_type_ensured:
            return
        self._register_type_def(f"{self._endpoint}{_TYPEDEF_API}", _DBT_BUSINESS_METADATA_DEF)
        self._bm_type_ensured = True

    def ensure_transformation_type(self) -> None:
        """Register the dbt_transformation entity type (for lineage). No-op after first success."""
        if self._transformation_type_ensured:
            return
        self._register_type_def(f"{self._endpoint}{_TYPEDEF_API}", _DBT_TRANSFORMATION_TYPE_DEF)
        self._transformation_type_ensured = True

    def ensure_warehouse_types(self) -> None:
        """Register warehouse entity and relationship types. No-op after first success.

        Entity types must be registered before relationship types that reference them.
        """
        if self._warehouse_types_ensured:
            return
        url = f"{self._endpoint}{_TYPEDEF_API}"
        self._register_type_def(url, {"entityDefs": _WAREHOUSE_TYPE_DEFS["entityDefs"]})
        self._register_type_def(
            url, {"relationshipDefs": _WAREHOUSE_TYPE_DEFS["relationshipDefs"]}
        )
        self._warehouse_types_ensured = True

    def get_type_def_by_name(self, name: str) -> dict | None:
        """Fetch a type definition by name. Returns None if not found.

        Tries the entity/relationship typedef endpoint first, then falls back to the
        business metadata endpoint (Purview uses separate endpoints per type category).
        """
        for base in (_TYPEDEF_BY_NAME_API, _BM_TYPEDEF_BY_NAME_API):
            url = f"{self._endpoint}{base}/name/{name}"
            response = self._api_request(url, expected_statuses={404})
            if response.status_code == 404:
                continue
            result = response.json()
            if result is not None:
                return result
        return None

    def delete_type_def_by_name(self, name: str) -> bool:
        """Delete a type definition by name. Returns True if deleted, False if not found.

        Tries both the entity/relationship endpoint and the business metadata endpoint,
        mirroring get_type_def_by_name().
        """
        for base in (_TYPEDEF_BY_NAME_API, _BM_TYPEDEF_BY_NAME_API):
            url = f"{self._endpoint}{base}/name/{name}"
            response = self._api_request(url, method="delete", expected_statuses={404})
            if response.status_code != 404:
                return True
        return False

    def delete_business_metadata(self, guid: str, bm_name: str) -> None:
        """Remove all attributes of a business metadata type from an entity."""
        url = f"{self._endpoint}{_BUSINESS_METADATA_API.format(guid=guid, bm_name=bm_name)}"
        self._api_request(url, method="delete")

    def delete_entity_by_guid(self, guid: str) -> None:
        """Delete an entity by its GUID."""
        url = f"{self._endpoint}{_ENTITY_API}/guid/{guid}"
        self._api_request(url, method="delete")

    def update_entity_description(
        self, guid: str, type_name: str, qualified_name: str, name: str, description: str
    ) -> None:
        """Set the userDescription field on a Purview entity."""
        entity = {
            "typeName": type_name,
            "guid": guid,
            "attributes": {
                "qualifiedName": qualified_name,
                "name": name,
                "userDescription": description,
            },
        }
        self.bulk_create_or_update([entity])

    def update_column_descriptions(
        self, table_guid: str, column_descriptions: dict[str, str]
    ) -> None:
        """Set userDescription on column entities that belong to a table.

        Fetches the table's referred entities (columns), matches them case-insensitively
        against the provided descriptions, and updates matching columns in a single bulk call.
        """
        if not column_descriptions:
            return

        entity_data = self.get_entity_by_guid(table_guid)
        referred_entities = entity_data.get("referredEntities", {})

        lower_descs = {k.lower(): v for k, v in column_descriptions.items()}
        updates: list[AtlasEntity] = []
        for col_guid, col_entity in referred_entities.items():
            col_name = col_entity.get("attributes", {}).get("name", "")
            desc = lower_descs.get(col_name.lower())
            if desc is not None:
                updates.append(
                    {
                        "typeName": col_entity["typeName"],
                        "guid": col_guid,
                        "attributes": {
                            "qualifiedName": col_entity["attributes"]["qualifiedName"],
                            "name": col_name,
                            "userDescription": desc,
                        },
                    }
                )

        if updates:
            self.bulk_create_or_update(updates)
