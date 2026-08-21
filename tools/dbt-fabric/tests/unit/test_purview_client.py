from unittest.mock import MagicMock, patch

import dbt_common.exceptions
import pytest

from dbt.adapters.fabric.purview_client import (
    _API_VERSION,
    _PURVIEW_SCOPE,
    PurviewClient,
)


@pytest.fixture
def token_provider():
    mock = MagicMock()
    mock.get_access_token.return_value = "test-token"
    return mock


@pytest.fixture
def client(token_provider):
    return PurviewClient("https://test.purview.azure.com", token_provider)


class TestPurviewClientAuth:
    def test_auth_headers_use_purview_scope(self, client, token_provider):
        headers = client._get_auth_headers()
        token_provider.get_access_token.assert_called_with(scope=_PURVIEW_SCOPE)
        assert headers["Authorization"] == "Bearer test-token"

    def test_endpoint_trailing_slash_stripped(self, token_provider):
        c = PurviewClient("https://test.purview.azure.com/", token_provider)
        assert c._endpoint == "https://test.purview.azure.com"


class TestApiVersion:
    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_api_version_appended_to_urls(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"value": [], "@search.count": 0}
        mock_request.return_value = mock_response

        client.search_entities(name="test")

        call_url = mock_request.call_args[0][1]
        assert f"api-version={_API_VERSION}" in call_url


class TestSearchEntities:
    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_search_by_name(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "value": [
                {
                    "id": "guid-1",
                    "name": "fct_orders",
                    "qualifiedName": "https://app.fabric.microsoft.com/groups/a1b2c3d4/lakehouses/b2c3d4e5/tables/fct_orders",
                    "entityType": "fabric_lakehouse_table",
                }
            ],
            "@search.count": 1,
        }
        mock_request.return_value = mock_response

        results = client.search_entities(name="fct_orders")
        assert len(results) == 1
        assert results[0]["id"] == "guid-1"

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_search_filters_by_database(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "value": [
                {
                    "id": "guid-1",
                    "name": "fct_orders",
                    "qualifiedName": "https://app.fabric.microsoft.com/groups/a1b2c3d4/lakehouses/lh-dev/tables/fct_orders",
                    "entityType": "fabric_lakehouse_table",
                },
                {
                    "id": "guid-2",
                    "name": "fct_orders",
                    "qualifiedName": "https://app.fabric.microsoft.com/groups/a1b2c3d4/lakehouses/lh-prod/tables/fct_orders",
                    "entityType": "fabric_lakehouse_table",
                },
            ],
            "@search.count": 2,
        }
        mock_request.return_value = mock_response

        results = client.search_entities(name="fct_orders", database_identifiers=["lh-prod"])
        assert len(results) == 1
        assert results[0]["id"] == "guid-2"

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_search_filter_no_match_returns_empty(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "value": [
                {
                    "id": "guid-1",
                    "name": "fct_orders",
                    "qualifiedName": "https://app.fabric.microsoft.com/groups/a1b2c3d4/lakehouses/lh-dev/tables/fct_orders",
                    "entityType": "fabric_lakehouse_table",
                },
            ],
        }
        mock_request.return_value = mock_response

        results = client.search_entities(
            name="fct_orders", database_identifiers=["nonexistent-guid"]
        )
        assert results == []

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_search_pagination(self, mock_request, client):
        page1 = MagicMock()
        page1.status_code = 200
        page1.json.return_value = {
            "value": [{"id": f"guid-{i}", "name": "t", "qualifiedName": "q"} for i in range(50)],
            "@search.count": 75,
            "continuationToken": "next-page",
        }
        page2 = MagicMock()
        page2.status_code = 200
        page2.json.return_value = {
            "value": [
                {"id": f"guid-{i}", "name": "t", "qualifiedName": "q"} for i in range(50, 75)
            ],
            "@search.count": 75,
        }
        mock_request.side_effect = [page1, page2]

        results = client.search_entities(name="t")
        assert len(results) == 75

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_search_no_results_returns_empty_list(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "value": [],
            "@search.count": 0,
        }
        mock_request.return_value = mock_response

        results = client.search_entities(name="nonexistent_table")
        assert results == []

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_search_empty_database_identifiers_returns_all(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "value": [
                {
                    "id": "guid-1",
                    "name": "fct_orders",
                    "qualifiedName": "https://app.fabric.microsoft.com/groups/a1b2c3d4/lakehouses/lh-dev/tables/fct_orders",
                    "entityType": "fabric_lakehouse_table",
                },
                {
                    "id": "guid-2",
                    "name": "fct_orders",
                    "qualifiedName": "https://app.fabric.microsoft.com/groups/a1b2c3d4/lakehouses/lh-prod/tables/fct_orders",
                    "entityType": "fabric_lakehouse_table",
                },
            ],
            "@search.count": 2,
        }
        mock_request.return_value = mock_response

        results = client.search_entities(name="fct_orders", database_identifiers=[])
        assert len(results) == 2

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_search_returns_all_without_database_filter(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "value": [
                {
                    "id": "guid-1",
                    "name": "fct_orders",
                    "qualifiedName": "https://app.fabric.microsoft.com/groups/a1b2c3d4/lakehouses/lh-dev/tables/fct_orders",
                    "entityType": "fabric_lakehouse_table",
                },
                {
                    "id": "guid-2",
                    "name": "fct_orders",
                    "qualifiedName": "https://app.fabric.microsoft.com/groups/a1b2c3d4/lakehouses/lh-prod/tables/fct_orders",
                    "entityType": "fabric_lakehouse_table",
                },
            ],
            "@search.count": 2,
        }
        mock_request.return_value = mock_response

        results = client.search_entities(name="fct_orders")
        assert len(results) == 2


class TestBulkCreateOrUpdate:
    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_single_batch(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "mutatedEntities": {"CREATE": [{"guid": "g1"}]},
            "guidAssignments": {"-1": "g1"},
        }
        mock_request.return_value = mock_response

        entities = [
            {
                "typeName": "fabric_lakehouse_table",
                "attributes": {
                    "qualifiedName": "https://app.fabric.microsoft.com/groups/a1b2c3d4/lakehouses/b2c3d4e5/tables/fct_orders"
                },
            }
        ]
        result = client.bulk_create_or_update(entities)
        assert "g1" in result["guidAssignments"].values()

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_empty_entities_makes_no_api_call(self, mock_request, client):
        result = client.bulk_create_or_update([])

        assert mock_request.call_count == 0
        assert result == {"mutatedEntities": {}, "guidAssignments": {}}

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_batching_at_50(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "mutatedEntities": {"UPDATE": []},
            "guidAssignments": {},
        }
        mock_request.return_value = mock_response

        entities = [
            {"typeName": "t", "attributes": {"qualifiedName": f"e{i}"}} for i in range(120)
        ]
        client.bulk_create_or_update(entities)
        assert mock_request.call_count == 3  # 50 + 50 + 20


class TestRetry:
    @patch("dbt.adapters.fabric.purview_client.time.sleep")
    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_429_retry(self, mock_request, mock_sleep, client):
        throttled = MagicMock()
        throttled.status_code = 429
        throttled.headers = {"Retry-After": "1"}

        success = MagicMock()
        success.status_code = 200
        success.json.return_value = {"value": [], "@search.count": 0}

        mock_request.side_effect = [throttled, success]

        results = client.search_entities(name="test")
        assert results == []
        mock_sleep.assert_called_once_with(1)

    @patch("dbt.adapters.fabric.purview_client.time.sleep")
    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_429_retry_exhaustion_raises_error(self, mock_request, mock_sleep, client):
        throttled = MagicMock()
        throttled.status_code = 429
        throttled.headers = {"Retry-After": "1"}

        mock_request.return_value = throttled

        with pytest.raises(dbt_common.exceptions.DbtRuntimeError, match="rate limited"):
            client._api_request("https://test.purview.azure.com/some/path")

        assert mock_request.call_count == 11
        assert mock_sleep.call_count == 10

    @patch("dbt.adapters.fabric.purview_client.time.sleep")
    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_429_invalid_retry_after_falls_back_to_5(self, mock_request, mock_sleep, client):
        throttled = MagicMock()
        throttled.status_code = 429
        throttled.headers = {"Retry-After": "Thu, 01 Dec 2025 16:00:00 GMT"}

        success = MagicMock()
        success.status_code = 200
        success.json.return_value = {}

        mock_request.side_effect = [throttled, success]

        client._api_request("https://test.purview.azure.com/some/path")

        mock_sleep.assert_called_once_with(5)


class TestEnsureBusinessMetadataType:
    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_registers_once(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}
        mock_request.return_value = mock_response

        client.ensure_business_metadata_type()
        client.ensure_business_metadata_type()

        assert mock_request.call_count == 1

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_raises_when_registration_fails(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.text = "Bad Request"
        mock_request.return_value = mock_response

        with pytest.raises(dbt_common.exceptions.DbtRuntimeError):
            client.ensure_business_metadata_type()


class TestEnsureTransformationType:
    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_registers_once(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}
        mock_request.return_value = mock_response

        client.ensure_transformation_type()
        client.ensure_transformation_type()

        assert mock_request.call_count == 1

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_falls_back_to_put_when_post_fails(self, mock_request, client):
        post_fail = MagicMock()
        post_fail.status_code = 409
        post_fail.text = "Conflict"

        put_success = MagicMock()
        put_success.status_code = 200
        put_success.json.return_value = {}

        mock_request.side_effect = [post_fail, put_success]

        client.ensure_transformation_type()
        methods = [call[0][0] for call in mock_request.call_args_list]
        assert methods == ["post", "put"]


class TestEnsureWarehouseTypes:
    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_registers_entities_then_relationships(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}
        mock_request.return_value = mock_response

        client.ensure_warehouse_types()

        assert mock_request.call_count == 2
        bodies = [call[1]["json"] for call in mock_request.call_args_list]
        assert "entityDefs" in bodies[0]
        assert "relationshipDefs" in bodies[1]

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_registers_once(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}
        mock_request.return_value = mock_response

        client.ensure_warehouse_types()
        client.ensure_warehouse_types()

        assert mock_request.call_count == 2  # entity + rel, not repeated

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_warehouse_entity_type_names(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}
        mock_request.return_value = mock_response

        client.ensure_warehouse_types()

        bodies = [call[1]["json"] for call in mock_request.call_args_list]
        entity_names = [e["name"] for e in bodies[0]["entityDefs"]]
        assert "fabric_warehouse_schema" in entity_names
        assert "fabric_warehouse_table" in entity_names
        assert "fabric_warehouse_table_column" in entity_names

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_warehouse_relationship_type_names(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}
        mock_request.return_value = mock_response

        client.ensure_warehouse_types()

        bodies = [call[1]["json"] for call in mock_request.call_args_list]
        rel_names = [r["name"] for r in bodies[1]["relationshipDefs"]]
        assert "fabric_warehouse_schema_warehouses" in rel_names
        assert "fabric_warehouse_table_schemas" in rel_names
        assert "fabric_warehouse_table_columns" in rel_names

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_warehouse_table_has_dataset_supertype(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}
        mock_request.return_value = mock_response

        client.ensure_warehouse_types()

        bodies = [call[1]["json"] for call in mock_request.call_args_list]
        for entity_def in bodies[0]["entityDefs"]:
            if entity_def["name"] == "fabric_warehouse_table":
                assert "DataSet" in entity_def["superTypes"]
                assert "Purview_Table" in entity_def["superTypes"]
                return
        pytest.fail("fabric_warehouse_table entity def not found")

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_warehouse_column_has_data_type_attribute(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}
        mock_request.return_value = mock_response

        client.ensure_warehouse_types()

        bodies = [call[1]["json"] for call in mock_request.call_args_list]
        for entity_def in bodies[0]["entityDefs"]:
            if entity_def["name"] == "fabric_warehouse_table_column":
                attr_names = [a["name"] for a in entity_def.get("attributeDefs", [])]
                assert "data_type" in attr_names
                data_type_attr = next(
                    a for a in entity_def["attributeDefs"] if a["name"] == "data_type"
                )
                assert data_type_attr["isOptional"] is False
                return
        pytest.fail("fabric_warehouse_table_column entity def not found")

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_warehouse_relationships_use_composition(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}
        mock_request.return_value = mock_response

        client.ensure_warehouse_types()

        put_bodies = [call[1]["json"] for call in mock_request.call_args_list]
        for body in put_bodies:
            for rel_def in body.get("relationshipDefs", []):
                if rel_def["name"].startswith("fabric_warehouse_"):
                    assert rel_def["relationshipCategory"] == "COMPOSITION"


class TestGetTypeDefByName:
    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_both_endpoints_404_returns_none(self, mock_request, client):
        not_found = MagicMock()
        not_found.status_code = 404
        not_found.text = "Not Found"

        mock_request.return_value = not_found

        result = client.get_type_def_by_name("nonexistent_type")
        assert result is None
        assert mock_request.call_count == 2

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_typedef_returns_null_but_bm_endpoint_succeeds(self, mock_request, client):
        typedef_response = MagicMock()
        typedef_response.status_code = 200
        typedef_response.json.return_value = None

        bm_response = MagicMock()
        bm_response.status_code = 200
        bm_response.json.return_value = {"name": "dbt_metadata", "category": "BUSINESS_METADATA"}

        mock_request.side_effect = [typedef_response, bm_response]

        result = client.get_type_def_by_name("dbt_metadata")
        assert result == {"name": "dbt_metadata", "category": "BUSINESS_METADATA"}
        assert mock_request.call_count == 2


class TestDeleteTypeDefByName:
    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_404_returns_false(self, mock_request, client):
        not_found = MagicMock()
        not_found.status_code = 404
        not_found.text = "Not Found"

        mock_request.return_value = not_found

        result = client.delete_type_def_by_name("nonexistent_type")
        assert result is False


class TestBusinessMetadata:
    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_set_business_metadata(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_request.return_value = mock_response

        client.set_business_metadata("guid-1", "dbt_metadata", {"dbt_model_id": "model.test.x"})

        call_args = mock_request.call_args
        call_url = call_args[0][1]
        assert "guid-1" in call_url
        assert "dbt_metadata" in call_url
        assert "isOverwrite=true" in call_url
        assert f"api-version={_API_VERSION}" in call_url

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_delete_business_metadata(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 204
        mock_request.return_value = mock_response

        client.delete_business_metadata("guid-1", "dbt_metadata")

        call_args = mock_request.call_args
        assert call_args[0][0] == "delete"
        call_url = call_args[0][1]
        assert "guid-1" in call_url
        assert "dbt_metadata" in call_url


class TestDeleteEntity:
    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_delete_entity_by_guid(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_request.return_value = mock_response

        client.delete_entity_by_guid("guid-1")

        call_args = mock_request.call_args
        assert call_args[0][0] == "delete"
        assert "guid-1" in call_args[0][1]


class TestLabels:
    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_set_labels(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_request.return_value = mock_response

        client.set_labels("guid-1", ["finance", "daily"])

        call_args = mock_request.call_args
        assert call_args[0][0] == "post"
        call_url = call_args[0][1]
        assert "guid-1" in call_url
        assert "labels" in call_url
        assert call_args[1]["json"] == ["finance", "daily"]


class TestBulkMergeBusinessAttrs:
    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_merge_business_attrs_adds_query_param(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "mutatedEntities": {},
            "guidAssignments": {},
        }
        mock_request.return_value = mock_response

        entities = [{"typeName": "t", "attributes": {"qualifiedName": "q"}}]
        client.bulk_create_or_update(entities, merge_business_attrs=True)

        call_url = mock_request.call_args[0][1]
        assert "businessAttributeUpdateBehavior=merge" in call_url

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_no_merge_by_default(self, mock_request, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "mutatedEntities": {},
            "guidAssignments": {},
        }
        mock_request.return_value = mock_response

        entities = [{"typeName": "t", "attributes": {"qualifiedName": "q"}}]
        client.bulk_create_or_update(entities)

        call_url = mock_request.call_args[0][1]
        assert "businessAttributeUpdateBehavior" not in call_url


class TestUpdateColumnDescriptions:
    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_updates_matching_columns(self, mock_request, client):
        get_response = MagicMock()
        get_response.status_code = 200
        get_response.json.return_value = {
            "entity": {"typeName": "fabric_lakehouse_table"},
            "referredEntities": {
                "col-guid-1": {
                    "typeName": "fabric_lakehouse_column",
                    "attributes": {
                        "name": "user_id",
                        "qualifiedName": "https://app.fabric.microsoft.com/groups/a1b2c3d4/lakehouses/b2c3d4e5/tables/fct_orders/columns/user_id",
                    },
                },
                "col-guid-2": {
                    "typeName": "fabric_lakehouse_column",
                    "attributes": {
                        "name": "email",
                        "qualifiedName": "https://app.fabric.microsoft.com/groups/a1b2c3d4/lakehouses/b2c3d4e5/tables/fct_orders/columns/email",
                    },
                },
            },
        }

        bulk_response = MagicMock()
        bulk_response.status_code = 200
        bulk_response.json.return_value = {"mutatedEntities": {}, "guidAssignments": {}}

        mock_request.side_effect = [get_response, bulk_response]

        client.update_column_descriptions("table-guid", {"user_id": "The user identifier"})

        bulk_call = mock_request.call_args_list[1]
        body = bulk_call[1]["json"]
        assert len(body["entities"]) == 1
        assert body["entities"][0]["attributes"]["userDescription"] == "The user identifier"

    @patch("dbt.adapters.fabric.purview_client.requests.request")
    def test_case_insensitive_column_matching(self, mock_request, client):
        get_response = MagicMock()
        get_response.status_code = 200
        get_response.json.return_value = {
            "entity": {"typeName": "fabric_lakehouse_table"},
            "referredEntities": {
                "col-guid-1": {
                    "typeName": "fabric_lakehouse_column",
                    "attributes": {
                        "name": "User_ID",
                        "qualifiedName": "https://app.fabric.microsoft.com/groups/a1b2c3d4/lakehouses/b2c3d4e5/tables/fct_orders/columns/User_ID",
                    },
                },
            },
        }

        bulk_response = MagicMock()
        bulk_response.status_code = 200
        bulk_response.json.return_value = {"mutatedEntities": {}, "guidAssignments": {}}

        mock_request.side_effect = [get_response, bulk_response]

        client.update_column_descriptions("table-guid", {"user_id": "The user identifier"})

        bulk_call = mock_request.call_args_list[1]
        body = bulk_call[1]["json"]
        assert len(body["entities"]) == 1
