from typing import Any, NotRequired, TypedDict


class PurviewEntityRef(TypedDict):
    """Lightweight reference to a Purview entity, as returned by search."""

    id: str
    name: str
    entityType: str
    qualifiedName: str


class AtlasEntityRef(TypedDict):
    """Reference to an entity by GUID and type, used in lineage inputs/outputs."""

    guid: str
    typeName: str


class AtlasEntity(TypedDict):
    """Entity payload for the Atlas bulk create/update API."""

    typeName: str
    attributes: dict[str, Any]
    guid: NotRequired[str]
    relationshipAttributes: NotRequired[dict[str, Any]]
    businessAttributes: NotRequired[dict[str, dict[str, str]]]
    labels: NotRequired[list[str]]


class MutatedEntity(TypedDict):
    """Entity in a bulk_create_or_update response's mutatedEntities list."""

    guid: str
    attributes: NotRequired[dict[str, Any]]


class BulkResponse(TypedDict):
    """Response from the Atlas bulk create/update API."""

    mutatedEntities: dict[str, list[MutatedEntity]]
    guidAssignments: dict[str, str]


class AtlasEntityData(TypedDict):
    """Full entity data as returned by get_entity_by_guid or get_entity_by_qualified_name."""

    guid: str
    typeName: str
    attributes: dict[str, Any]
    businessAttributes: NotRequired[dict[str, dict[str, str]]]


class EntityResponse(TypedDict):
    """Response from Atlas get-entity-by-GUID or get-entity-by-qualifiedName."""

    entity: AtlasEntityData
    referredEntities: NotRequired[dict[str, AtlasEntityData]]


class DbtMetadataAttrs(TypedDict, total=False):
    """Attributes for the dbt_metadata business metadata type."""

    dbt_model_id: str
    dbt_tags: str
    dbt_materialization: str
    dbt_meta: str
    dbt_tests: str
    dbt_test_status: str
    dbt_last_sync: str


class AtlasRelationship(TypedDict):
    """Relationship payload for the Atlas relationship API."""

    typeName: str
    end1: AtlasEntityRef
    end2: AtlasEntityRef
    attributes: NotRequired[dict[str, Any]]
