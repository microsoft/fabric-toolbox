import base64
import copy
import datetime
import importlib.util
import io
import json
import pathlib
import struct
import sys
import types
import unittest
import urllib.error
from unittest import mock


class _UserDataFunctions:
    def function(self):
        return lambda function: function


fabric_module = types.ModuleType("fabric")
functions_module = types.ModuleType("fabric.functions")
functions_module.UserDataFunctions = _UserDataFunctions
fabric_module.functions = functions_module
sys.modules.setdefault("fabric", fabric_module)
sys.modules.setdefault("fabric.functions", functions_module)

module_path = pathlib.Path(__file__).with_name("function_app.py")
spec = importlib.util.spec_from_file_location("atlas_sync_function_app", module_path)
function_app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(function_app)


class _Response:
    def __init__(self, value, status=200, headers=None):
        self.payload = json.dumps(value).encode("utf-8")
        self.offset = 0
        self.status = status
        self.headers = headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, size=-1):
        if self.offset >= len(self.payload):
            return b""
        if size < 0:
            value = self.payload[self.offset :]
            self.offset = len(self.payload)
            return value
        value = self.payload[self.offset : self.offset + size]
        self.offset += len(value)
        return value


class _Clock:
    def __init__(self, value=0):
        self.value = value
        self.sleeps = []

    def monotonic(self):
        return self.value

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.value += seconds


class _SqlCursor:
    def __init__(self, rows, execute_error=None):
        self.rows = rows
        self.execute_error = execute_error
        self.executed = []
        self.closed = False

    def execute(self, query):
        self.executed.append(query)
        if self.execute_error:
            raise self.execute_error
        return self

    def fetchmany(self, size):
        return self.rows[:size]

    def close(self):
        self.closed = True


class _SqlConnection:
    def __init__(self, row_sets, execute_error=None):
        self.row_sets = list(row_sets)
        self.execute_error = execute_error
        self.cursors = []
        self.timeout = 0
        self.closed = False

    def cursor(self):
        rows = self.row_sets.pop(0) if self.row_sets else []
        cursor = _SqlCursor(rows, execute_error=self.execute_error)
        self.cursors.append(cursor)
        return cursor

    def close(self):
        self.closed = True


class _SqlDriver:
    def __init__(self, connection=None, connect_error=None):
        self.connection = connection
        self.connect_error = connect_error
        self.calls = []

    def connect(self, connection_string, **kwargs):
        self.calls.append((connection_string, kwargs))
        if self.connect_error:
            raise self.connect_error
        return self.connection


def _http_error(code, retry_after=None):
    headers = {}
    if retry_after is not None:
        headers["Retry-After"] = retry_after
    return urllib.error.HTTPError(
        "https://example.test",
        code,
        "safe test error",
        headers,
        io.BytesIO(),
    )


def _definition_part(path, value):
    payload = base64.b64encode(
        json.dumps(value).encode("utf-8")
    ).decode("ascii")
    return {
        "path": path,
        "payload": payload,
        "payloadType": "InlineBase64",
    }


class LakehouseSchemaTests(unittest.TestCase):
    def test_flattens_schema_enabled_table_payloads(self):
        payload = {
            "data": [
                {
                    "name": "smilesdb",
                    "type": "Schema",
                    "tables": [
                        {"name": "customers", "type": "Managed"},
                        {"name": "orders", "type": "Managed"},
                    ],
                }
            ]
        }

        self.assertEqual(
            [table["name"] for table in function_app._table_records(payload)],
            ["customers", "orders"],
        )

    def test_derives_tables_through_sql_endpoint_metadata(self):
        lakehouse_id = "11111111-1111-4111-8111-111111111111"
        endpoint_id = "22222222-2222-4222-8222-222222222222"
        model_id = "33333333-3333-4333-8333-333333333333"
        arts = [
            {"id": lakehouse_id, "_type": "Lakehouse", "relations": []},
            {
                "id": model_id,
                "_type": "SemanticModel",
                "relations": [{"dependentOnArtifactId": endpoint_id}],
            },
        ]
        schema = {
            lakehouse_id: [
                {
                    "name": "dbo.orders",
                    "objectType": "Managed",
                    "source": "Fabric Lakehouse Tables REST",
                    "columns": [],
                    "measures": [],
                }
            ],
            model_id: [
                {
                    "name": "orders",
                    "columns": [
                        {"name": "order_id", "dataType": "Int64"},
                        {"name": "amount", "dataType": "Decimal"},
                    ],
                    "measures": [{"name": "Revenue"}],
                }
            ]
        }
        detail = {
            "properties": {"sqlEndpointProperties": {"id": endpoint_id}}
        }

        with mock.patch.object(function_app, "_get", return_value=detail):
            function_app._derive_storage_schemas(
                "token",
                "workspace",
                arts,
                schema,
            )

        self.assertEqual(
            schema[lakehouse_id],
            [
                {
                    "name": "dbo.orders",
                    "objectType": "Managed",
                    "source": (
                        "Fabric Lakehouse Tables REST"
                        " + Downstream semantic model"
                    ),
                    "columns": [
                        {"name": "order_id", "dataType": "Int64"},
                        {"name": "amount", "dataType": "Decimal"},
                    ],
                    "measures": [],
                }
            ],
        )

    def test_does_not_repeat_an_unsupported_lakehouse_detail_request(self):
        storage = {
            "id": "lakehouse",
            "_type": "Lakehouse",
            "_detailAttempted": True,
        }

        with mock.patch.object(function_app, "_get") as get:
            endpoint_ids = function_app._storage_endpoint_ids(
                "token",
                "workspace",
                storage,
                [storage],
            )

        self.assertEqual(endpoint_ids, set())
        get.assert_not_called()

    def test_deduplicates_tables_and_preserves_columns(self):
        merged = function_app._merge_schema_tables(
            [
                {
                    "name": "Orders",
                    "columns": [{"name": "order_id", "dataType": "Int64"}],
                }
            ],
            [
                {
                    "name": "orders",
                    "columns": [
                        {"name": "order_id", "dataType": "Int64"},
                        {"name": "amount", "dataType": "Decimal"},
                    ],
                }
            ],
        )

        self.assertEqual(len(merged), 1)
        self.assertEqual(
            [column["name"] for column in merged[0]["columns"]],
            ["order_id", "amount"],
        )

    def test_schema_discriminators_are_optional_and_preserved(self):
        legacy = function_app._merge_schema_tables([
            {
                "name": "Legacy",
                "columns": [{"name": "Id", "dataType": "string"}],
                "measures": [],
            }
        ])
        enriched = function_app._merge_schema_tables([
            {
                "_mergeKey": "ontology-entity:101",
                "name": "Equipment",
                "objectType": "Ontology entity",
                "columns": [
                    {
                        "name": "Temperature",
                        "dataType": "Double",
                        "objectType": "Ontology time-series property",
                    }
                ],
                "measures": [],
            }
        ])

        self.assertNotIn("objectType", legacy[0])
        self.assertNotIn("objectType", legacy[0]["columns"][0])
        self.assertEqual(
            enriched[0]["objectType"],
            "Ontology entity",
        )
        self.assertEqual(
            enriched[0]["columns"][0]["objectType"],
            "Ontology time-series property",
        )

    def test_object_reference_helpers_use_stable_source_to_consumer_ids(self):
        item_id = "11111111-1111-4111-8111-111111111111"
        schema = function_app._finalize_schema_object_ids(
            item_id,
            "KQLDatabase",
            [
                {
                    "name": "Events",
                    "objectType": "KQL table",
                    "columns": [
                        {
                            "name": "Timestamp",
                            "dataType": "datetime",
                        }
                    ],
                    "measures": [],
                }
            ],
        )

        references = function_app._schema_object_references(
            item_id,
            schema,
        )
        edges = function_app._schema_object_edges(schema)
        atlas_edges = function_app._atlas_object_edges(
            {item_id: schema}
        )

        self.assertEqual(
            references[0]["id"],
            function_app._fabric_object_id(
                item_id,
                "kql-table",
                "Events",
            ),
        )
        self.assertEqual(references[1]["parentId"], references[0]["id"])
        self.assertEqual(references[0]["kind"], "table")
        self.assertEqual(references[1]["kind"], "column")
        self.assertEqual(
            edges,
            [
                {
                    "id": function_app._object_edge_id(
                        references[0]["id"],
                        "contains",
                        references[1]["id"],
                    ),
                    "source": references[0]["id"],
                    "target": references[1]["id"],
                    "relation": "contains",
                }
            ],
        )
        self.assertEqual(
            atlas_edges,
            [
                {
                    "source": {
                        "itemId": item_id,
                        "kind": "table",
                        "id": references[0]["id"],
                        "name": "Events",
                        "tableName": "Events",
                    },
                    "target": {
                        "itemId": item_id,
                        "kind": "column",
                        "id": references[1]["id"],
                        "name": "Timestamp",
                        "parentId": references[0]["id"],
                        "tableName": "Events",
                    },
                    "relation": "contains",
                    "confidence": "verified",
                }
            ],
        )
        public_schema = function_app._public_schema(schema)
        self.assertEqual(public_schema[0]["objectId"], references[0]["id"])
        self.assertEqual(
            public_schema[0]["columns"][0]["parentObjectId"],
            references[0]["id"],
        )
        self.assertEqual(public_schema[0]["objectType"], "KQL table")

    def test_generalized_object_edges_keep_the_complete_set(self):
        item_id = "11111111-1111-4111-8111-111111111111"
        extra_edges = [
            {
                "source": {
                    "itemId": item_id,
                    "kind": "column",
                    "id": f"source-{index}",
                    "name": f"Source {index}",
                },
                "target": {
                    "itemId": item_id,
                    "kind": "property",
                    "id": f"target-{index}",
                    "name": f"Target {index}",
                },
                "relation": "binds property",
                "confidence": "verified",
            }
            for index in range(2500)
        ]

        edges = function_app._collect_atlas_object_edges(
            {},
            extra_edges=extra_edges,
        )

        self.assertEqual(len(edges), 2500)
        self.assertTrue(
            all(edge["confidence"] == "verified" for edge in edges)
        )

    def test_lakehouse_table_api_paginates(self):
        first_url = (
            "https://api.fabric.microsoft.com/v1/workspaces/workspace/"
            "lakehouses/lake/tables?maxResults=100"
        )
        next_url = first_url + "&continuationToken=next"
        responses = {
            first_url: {
                "data": [{"name": "dbo.orders", "type": "Managed"}],
                "continuationUri": next_url,
            },
            next_url: {
                "data": [{"name": "dbo.customers", "type": "External"}],
            },
        }

        with mock.patch.object(
            function_app,
            "_get",
            side_effect=lambda _token, url: responses[url],
        ):
            tables = function_app._get_all_data(
                "token",
                "/workspaces/workspace/lakehouses/lake/tables?maxResults=100",
            )

        self.assertEqual(
            [table["name"] for table in tables],
            ["dbo.orders", "dbo.customers"],
        )


class ObjectInventoryTests(unittest.TestCase):
    def test_semantic_model_preserves_columns_measures_and_metadata(self):
        schema = function_app._item_schema(
            "token",
            "workspace",
            {
                "tables": [
                    {
                        "name": "Sales",
                        "description": "Sales facts",
                        "isHidden": False,
                        "columns": [
                            {
                                "name": "Amount",
                                "dataType": "Decimal",
                                "description": "Net amount",
                                "isHidden": False,
                            }
                        ],
                        "measures": [
                            {
                                "name": "Revenue",
                                "expression": "SUM(Sales[Amount])",
                                "description": "Total revenue",
                                "isHidden": False,
                            }
                        ],
                    }
                ]
            },
            "SemanticModel",
        )

        self.assertEqual(schema[0]["description"], "Sales facts")
        self.assertEqual(schema[0]["columns"][0]["description"], "Net amount")
        self.assertEqual(
            schema[0]["measures"][0]["expression"],
            "SUM(Sales[Amount])",
        )

    def test_warehouse_uses_scanner_tables_and_views_when_present(self):
        schema = function_app._item_schema(
            "token",
            "workspace",
            {
                "tables": [
                    {
                        "schema": "dbo",
                        "name": "Orders",
                        "columns": [{"name": "Id", "dataType": "Int64"}],
                    }
                ],
                "views": [
                    {
                        "schema": "reporting",
                        "name": "OrderSummary",
                        "columns": [{"name": "Total", "dataType": "Decimal"}],
                    }
                ],
            },
            "Warehouse",
        )

        self.assertEqual(
            [(value["name"], value["objectType"]) for value in schema],
            [("dbo.Orders", "Table"), ("reporting.OrderSummary", "View")],
        )

    def test_sql_database_reports_rest_inventory_limit(self):
        config = function_app._item_config(
            "token",
            "workspace",
            {
                "id": "database",
                "_detail": {
                    "properties": {
                        "databaseName": "Inventory",
                        "collation": "Latin1_General_100_CI_AS",
                    }
                },
            },
            "SQLDatabase",
            [],
        )
        facts = {(row["section"], row["label"]): row["value"] for row in config}

        self.assertEqual(
            facts[("SQL database", "Database name")],
            "Inventory",
        )
        self.assertIn("require SQL connectivity", facts[("Inventory", "Coverage")])

    def test_lakehouse_ignores_malformed_optional_dw_properties(self):
        for value in ("[]", "null", "42"):
            self.assertEqual(
                function_app._metadata_endpoint_ids(
                    {"DwProperties": value}
                ),
                set(),
            )

        config = function_app._item_config(
            "token",
            "workspace",
            {
                "id": "lakehouse",
                "extendedProperties": {"DwProperties": "not-json"},
                "_detail": {},
            },
            "Lakehouse",
            [],
        )
        facts = {(row["section"], row["label"]): row["value"] for row in config}

        self.assertNotIn(("SQL endpoint", "Metadata available"), facts)

        config = function_app._item_config(
            "token",
            "workspace",
            {
                "id": "lakehouse",
                "extendedProperties": {
                    "DwProperties": {"tdsEndpoint": "server.example"}
                },
                "_detail": {},
            },
            "Lakehouse",
            [],
        )
        facts = {(row["section"], row["label"]): row["value"] for row in config}
        self.assertEqual(facts[("SQL endpoint", "Metadata available")], "Yes")

    def test_sql_database_can_expose_a_real_downstream_model_subset(self):
        database_id = "11111111-1111-4111-8111-111111111111"
        model_id = "22222222-2222-4222-8222-222222222222"
        database = {
            "id": database_id,
            "_type": "SQLDatabase",
            "relations": [],
            "_detail": {},
        }
        arts = [
            database,
            {
                "id": model_id,
                "_type": "SemanticModel",
                "relations": [{"dependentOnArtifactId": database_id}],
            },
        ]
        schema = {
            model_id: [
                {
                    "name": "Customers",
                    "columns": [{"name": "Id", "dataType": "Int64"}],
                    "measures": [],
                }
            ]
        }

        function_app._derive_storage_schemas(
            "token",
            "workspace",
            arts,
            schema,
        )

        self.assertEqual(schema[database_id][0]["name"], "Customers")
        self.assertEqual(
            schema[database_id][0]["source"],
            "Downstream semantic model",
        )

    def test_report_pages_are_configured_without_fabricating_visuals(self):
        config = function_app._item_config(
            "token",
            "workspace",
            {
                "id": "report",
                "datasetId": "model",
                "_reportPages": [
                    {
                        "displayName": "Overview",
                        "name": "ReportSection",
                        "order": 0,
                    }
                ],
            },
            "Report",
            [],
        )
        facts = {(row["section"], row["label"]): row["value"] for row in config}

        self.assertEqual(
            facts[("Report pages", "Overview")],
            "ReportSection · order 0",
        )
        self.assertIn(
            "Not exposed",
            facts[("Report", "Visual and binding inventory")],
        )


class RequestReliabilityTests(unittest.TestCase):
    def test_execution_budget_leaves_platform_completion_reserve(self):
        self.assertEqual(function_app.FABRIC_UDF_TIMEOUT_SECONDS, 200)
        self.assertEqual(function_app.EXECUTION_BUDGET_SECONDS, 180)
        self.assertEqual(
            function_app.FABRIC_UDF_TIMEOUT_SECONDS
            - function_app.EXECUTION_BUDGET_SECONDS,
            function_app.PLATFORM_COMPLETION_RESERVE_SECONDS,
        )

    def test_req_returns_json_and_uses_bounded_timeout(self):
        clock = _Clock()
        deadline = function_app._ExecutionDeadline(5, clock.monotonic)

        with mock.patch.object(
            function_app,
            "_open_request",
            return_value=_Response({"ok": True}),
        ) as urlopen:
            result = function_app._req(
                "token",
                "https://example.test",
                deadline=deadline,
                per_request_timeout=20,
            )

        self.assertEqual(result, {"ok": True})
        self.assertEqual(urlopen.call_args.kwargs["timeout"], 5)

    def test_req_retries_429_and_respects_numeric_retry_after(self):
        clock = _Clock()
        deadline = function_app._ExecutionDeadline(10, clock.monotonic)

        with mock.patch.object(
            function_app,
            "_open_request",
            side_effect=[
                _http_error(429, "2"),
                _Response({"ok": True}),
            ],
        ) as urlopen:
            result = function_app._req(
                "token",
                "https://example.test",
                deadline=deadline,
                sleeper=clock.sleep,
            )

        self.assertEqual(result, {"ok": True})
        self.assertEqual(clock.sleeps, [2])
        self.assertEqual(urlopen.call_count, 2)

    def test_req_respects_http_date_retry_after(self):
        clock = _Clock()
        deadline = function_app._ExecutionDeadline(10, clock.monotonic)
        now = datetime.datetime(
            2026,
            8,
            30,
            9,
            0,
            tzinfo=datetime.timezone.utc,
        )
        retry_at = "Sun, 30 Aug 2026 09:00:03 GMT"

        with mock.patch.object(
            function_app,
            "_open_request",
            side_effect=[
                _http_error(429, retry_at),
                _Response({"ok": True}),
            ],
        ):
            function_app._req(
                "token",
                "https://example.test",
                deadline=deadline,
                sleeper=clock.sleep,
                wall_clock=lambda: now,
            )

        self.assertEqual(clock.sleeps, [3])

    def test_req_retries_transient_5xx_with_capped_backoff(self):
        clock = _Clock()
        deadline = function_app._ExecutionDeadline(30, clock.monotonic)

        with mock.patch.object(
            function_app,
            "_open_request",
            side_effect=[
                _http_error(503),
                _http_error(502),
                _Response({"ok": True}),
            ],
        ):
            function_app._req(
                "token",
                "https://example.test",
                deadline=deadline,
                sleeper=clock.sleep,
            )

        self.assertEqual(clock.sleeps, [0.5, 1.0])

    def test_req_does_not_sleep_past_deadline(self):
        clock = _Clock()
        deadline = function_app._ExecutionDeadline(0.25, clock.monotonic)

        with mock.patch.object(
            function_app,
            "_open_request",
            side_effect=_http_error(503),
        ):
            with self.assertRaises(function_app.RetryAfterDeferred):
                function_app._req(
                    "token",
                    "https://example.test",
                    deadline=deadline,
                    sleeper=clock.sleep,
                )

        self.assertEqual(clock.sleeps, [])

    def test_req_does_not_retry_non_transient_4xx(self):
        clock = _Clock()
        deadline = function_app._ExecutionDeadline(10, clock.monotonic)

        with mock.patch.object(
            function_app,
            "_open_request",
            side_effect=_http_error(400),
        ) as urlopen:
            with self.assertRaises(urllib.error.HTTPError):
                function_app._req(
                    "token",
                    "https://example.test",
                    deadline=deadline,
                    sleeper=clock.sleep,
                )

        self.assertEqual(urlopen.call_count, 1)
        self.assertEqual(clock.sleeps, [])

    def test_req_rejects_oversized_upstream_payload(self):
        oversized = _Response({"value": "x" * 100})

        with (
            mock.patch.object(
                function_app,
                "MAX_UPSTREAM_RESPONSE_BYTES",
                20,
            ),
            mock.patch.object(
                function_app,
                "_open_request",
                return_value=oversized,
            ),
        ):
            with self.assertRaises(function_app.ResponseSizeExceeded):
                function_app._req(
                    "token",
                    "https://example.test",
                )

    def test_paginated_fabric_calls_reject_repeated_continuation_urls(self):
        repeated = (
            "https://api.fabric.microsoft.com/v1/workspaces/"
            "11111111-1111-4111-8111-111111111111/items"
        )
        with mock.patch.object(
            function_app,
            "_get",
            return_value={"value": [], "continuationUri": repeated},
        ):
            with self.assertRaises(function_app.PaginationError):
                function_app._get_all(
                    "token",
                    "/workspaces/11111111-1111-4111-8111-111111111111/items",
                )

    def test_paginated_data_calls_reject_repeated_continuation_urls(self):
        repeated = (
            "https://api.fabric.microsoft.com/v1/workspaces/"
            "11111111-1111-4111-8111-111111111111/lakehouses/"
            "22222222-2222-4222-8222-222222222222/tables"
        )
        with mock.patch.object(
            function_app,
            "_get",
            return_value={"data": [], "continuationUri": repeated},
        ):
            with self.assertRaises(function_app.PaginationError):
                function_app._get_all_data(
                    "token",
                    "/workspaces/11111111-1111-4111-8111-111111111111/"
                    "lakehouses/22222222-2222-4222-8222-222222222222/tables",
                )

    def test_req_enforces_wall_clock_deadline_while_reading(self):
        clock = _Clock()
        deadline = function_app._ExecutionDeadline(20, clock.monotonic)

        class _SlowResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _size=-1):
                clock.value += 3
                return b"1234"

        with (
            mock.patch.object(
                function_app,
                "RESPONSE_READ_CHUNK_BYTES",
                4,
            ),
            mock.patch.object(
                function_app,
                "_open_request",
                return_value=_SlowResponse(),
            ),
        ):
            with self.assertRaises(function_app.RequestTimeout):
                function_app._req(
                    "token",
                    "https://example.test",
                    deadline=deadline,
                    per_request_timeout=5,
                )

    def test_redirect_handler_never_forwards_authorization(self):
        handler = function_app._NoRedirectHandler()
        for target in (
            "https://attacker.example",
            "http://attacker.example",
        ):
            with self.subTest(target=target):
                self.assertIsNone(
                    handler.redirect_request(
                        mock.Mock(),
                        mock.Mock(),
                        302,
                        "Found",
                        {},
                        target,
                    )
                )

    def test_public_surface_excludes_debug_data_endpoints(self):
        for name in ("ping", "sync_items", "sync_all"):
            self.assertTrue(callable(getattr(function_app, name)))
        for name in (
            "list_items",
            "list_role_assignments",
            "get_workspace",
        ):
            self.assertFalse(hasattr(function_app, name))

    def test_sanitize_job_rejects_missing_item_identity(self):
        self.assertIsNone(
            function_app._sanitize_job(
                {"jobType": "Refresh", "status": "Completed"},
                {},
            )
        )

    def test_safe_error_codes_distinguish_slice_failures(self):
        self.assertEqual(
            function_app._safe_error_code(
                function_app.RequestTimeout("slow")
            ),
            "request-timeout",
        )
        self.assertEqual(
            function_app._safe_error_code(
                function_app.RetryAfterDeferred("later")
            ),
            "retry-after-deferred",
        )
        self.assertEqual(
            function_app._safe_error_code(
                function_app.ResponseSizeExceeded("large")
            ),
            "response-size-exceeded",
        )


class MetadataBoundaryTests(unittest.TestCase):
    def test_schema_prefers_finite_row_count_and_strips_business_rows(self):
        schema = function_app._schema_objects(
            [
                {
                    "name": "Sales",
                    "rowCount": 12,
                    "rows": [{"customer": "secret"}],
                    "sourceExpression": "let Source = Sql.Database(...)",
                    "columns": [{"name": "Amount", "values": [99]}],
                    "measures": [
                        {
                            "name": "Revenue",
                            "expression": "SUM(Sales[Amount])",
                            "sourceExpression": "let Source = ...",
                        }
                    ],
                }
            ],
            "Model table",
            "Power BI admin scanner",
            include_measures=True,
        )

        self.assertEqual(schema[0]["rows"], 12)
        self.assertEqual(
            schema[0]["measures"][0]["expression"],
            "SUM(Sales[Amount])",
        )
        serialized = json.dumps(schema)
        self.assertNotIn("customer", serialized)
        self.assertNotIn("sourceExpression", serialized)
        self.assertNotIn("Sql.Database", serialized)

    def test_schema_rejects_non_numeric_negative_and_non_finite_rows(self):
        unsafe_values = [
            [{"business": "row"}],
            {"business": "row"},
            "100",
            -1,
            float("inf"),
            float("nan"),
            True,
        ]
        for index, unsafe in enumerate(unsafe_values):
            with self.subTest(index=index):
                schema = function_app._schema_objects(
                    [{"name": "Unsafe", "rowCount": unsafe}],
                    "Table",
                    "scanner",
                )
                self.assertNotIn("rows", schema[0])

    def test_row_count_presence_prevents_fallback_to_rows(self):
        schema = function_app._schema_objects(
            [{"name": "Unsafe", "rowCount": "bad", "rows": 42}],
            "Table",
            "scanner",
        )
        self.assertNotIn("rows", schema[0])

    def test_metadata_maps_authoritative_fields_without_owner_invention(self):
        metadata = function_app._metadata_for_item(
            {
                "configuredBy": "builder@example.com",
                "modifiedBy": {"emailAddress": "editor@example.com"},
                "modifiedDateTime": "2026-08-30T10:00:00+02:00",
                "endorsementDetails": {
                    "endorsement": "Certified",
                    "certifiedBy": "certifier@example.com",
                },
                "sensitivityLabel": {
                    "labelId": "label-id",
                    "name": "Confidential",
                },
                "tags": [{"id": "tag-id", "name": "finance"}],
                "owner": {"email": "must-not-be-invented@example.com"},
            },
            True,
        )

        self.assertEqual(metadata["configuredBy"], "builder@example.com")
        self.assertEqual(metadata["modifiedBy"], "editor@example.com")
        self.assertEqual(
            metadata["modifiedDateTime"],
            "2026-08-30T08:00:00.000Z",
        )
        self.assertEqual(
            metadata["endorsement"],
            {
                "value": "Certified",
                "certifiedBy": "certifier@example.com",
            },
        )
        self.assertEqual(metadata["sensitivity"]["labelId"], "label-id")
        self.assertEqual(metadata["tags"], [
            {"id": "tag-id", "displayName": "finance"}
        ])
        self.assertNotIn("owner", metadata)

    def test_item_ids_are_normalized_for_stable_metadata_keys(self):
        item = function_app._sanitize_item({
            "id": "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
            "type": "SemanticModel",
        })
        self.assertEqual(
            item["id"],
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        )

    def test_metadata_maps_only_documented_type_specific_owner_fields(self):
        model = function_app._metadata_for_item(
            {
                "_type": "SemanticModel",
                "configuredBy": "owner@example.com",
            },
            True,
        )
        report = function_app._metadata_for_item(
            {
                "_type": "Report",
                "createdBy": "report.owner@example.com",
                "createdById": "report-owner-id",
            },
            True,
        )
        generic = function_app._metadata_for_item(
            {
                "_type": "Lakehouse",
                "configuredBy": "not-a-documented-owner@example.com",
            },
            True,
        )

        self.assertEqual(
            model["owner"],
            {
                "source": "workspaceInfo.configuredBy",
                "displayName": "owner@example.com",
                "email": "owner@example.com",
            },
        )
        self.assertEqual(
            report["owner"],
            {
                "source": "workspaceInfo.createdBy",
                "principalId": "report-owner-id",
                "displayName": "report.owner@example.com",
                "email": "report.owner@example.com",
            },
        )
        self.assertNotIn("owner", generic)

    def test_absent_metadata_fields_remain_absent(self):
        self.assertEqual(
            function_app._metadata_for_item({"id": "model"}, True),
            {
                "scannerMatched": True,
                "ownerAvailable": False,
            },
        )

    def test_type_specific_detail_adds_supported_sensitivity_and_tags(self):
        artifact = {"id": "kql", "_type": "KQLDatabase"}
        function_app._merge_detail_metadata(
            artifact,
            {
                "id": "kql",
                "sensitivityLabel": {"id": "label-id"},
                "tags": [{"id": "tag-id", "displayName": "telemetry"}],
            },
        )

        metadata = function_app._metadata_for_item(artifact, False)

        self.assertEqual(
            metadata["sensitivity"],
            {"labelId": "label-id"},
        )
        self.assertEqual(
            metadata["tags"],
            [{"id": "tag-id", "displayName": "telemetry"}],
        )

    def test_response_size_guard_fails_closed(self):
        with self.assertRaises(function_app.ResponseSizeExceeded):
            function_app._guard_response_size(
                {"items": ["0123456789"]},
                max_bytes=10,
            )

    def test_response_size_guard_accepts_small_payload(self):
        payload = {"items": []}
        self.assertIs(
            function_app._guard_response_size(payload, max_bytes=100),
            payload,
        )


class DefinitionMetadataTests(unittest.TestCase):
    source_id = "11111111-1111-4111-8111-111111111111"
    ontology_id = "22222222-2222-4222-8222-222222222222"
    graph_id = "33333333-3333-4333-8333-333333333333"
    agent_id = "44444444-4444-4444-8444-444444444444"

    def test_ontology_projects_safe_metadata_and_binding_lineage(self):
        artifact = {"id": self.ontology_id, "_type": "Ontology"}
        response = {
            "definition": {
                "parts": [
                    _definition_part(
                        "EntityTypes/101/definition.json",
                        {
                            "id": "101",
                            "name": "Equipment",
                            "properties": [
                                {
                                    "id": "201",
                                    "name": "Name",
                                    "valueType": "String",
                                }
                            ],
                            "timeseriesProperties": [
                                {
                                    "id": "202",
                                    "name": "Temperature",
                                    "valueType": "Double",
                                }
                            ],
                        },
                    ),
                    _definition_part(
                        "EntityTypes/101/DataBindings/binding.json",
                        {
                            "dataBindingConfiguration": {
                                "sourceTableProperties": {
                                    "sourceType": "LakehouseTable",
                                    "workspaceId": "workspace",
                                    "itemId": self.source_id,
                                    "sourceSchema": "dbo",
                                    "sourceTableName": "equipment",
                                    "businessRows": [
                                        {"customer": "must-not-leak"}
                                    ],
                                },
                                "propertyBindings": [
                                    {
                                        "sourceColumnName": "Name",
                                        "targetPropertyId": "201",
                                    }
                                ],
                            }
                        },
                    ),
                    _definition_part(
                        "RelationshipTypes/301/definition.json",
                        {
                            "id": "301",
                            "name": "contains",
                            "source": {"entityTypeId": "101"},
                            "target": {"entityTypeId": "101"},
                        },
                    ),
                    _definition_part(
                        "RelationshipTypes/301/Contextualizations/context.json",
                        {
                            "dataBindingTable": {
                                "sourceType": "LakehouseTable",
                                "itemId": self.source_id,
                                "sourceSchema": "dbo",
                                "sourceTableName": "relationships",
                            },
                            "sourceKeyRefBindings": [
                                {"sourceColumnName": "secret-key-value"}
                            ],
                        },
                    ),
                    _definition_part(
                        "EntityTypes/101/Documents/document.json",
                        {
                            "displayText": "Internal document",
                            "url": "https://secret.example/document",
                        },
                    ),
                    _definition_part(
                        "Future/part.json",
                        {"secret": "future-payload-must-not-leak"},
                    ),
                ]
            }
        }

        function_app._project_definition(artifact, response)
        config = function_app._item_config(
            "token",
            "workspace",
            artifact,
            "Ontology",
            [],
        )
        serialized = json.dumps(config)

        self.assertIn("Ontology entity types", serialized)
        self.assertIn("Ontology properties", serialized)
        self.assertIn("Ontology time-series properties", serialized)
        self.assertIn("Ontology data bindings", serialized)
        self.assertIn("Ontology relationship types", serialized)
        self.assertIn("Ontology contextualizations", serialized)
        self.assertEqual(artifact["_definitionUnknownParts"], 1)
        self.assertNotIn("must-not-leak", serialized)
        self.assertNotIn("secret-key-value", serialized)
        self.assertNotIn("secret.example", serialized)
        self.assertNotIn("future-payload", serialized)
        metadata = artifact["_artifactMetadata"]
        self.assertEqual(metadata["kind"], "ontology")
        self.assertEqual(metadata["entities"][0]["id"], "101")
        self.assertEqual(
            metadata["entities"][0]["properties"],
            [
                {
                    "id": "201",
                    "name": "Name",
                    "valueType": "String",
                    "timeSeries": False,
                },
                {
                    "id": "202",
                    "name": "Temperature",
                    "valueType": "Double",
                    "timeSeries": True,
                },
            ],
        )
        self.assertEqual(
            metadata["bindings"][0]["sourceItemId"],
            self.source_id,
        )
        self.assertEqual(
            metadata["relationships"][0],
            {
                "id": "301",
                "name": "contains",
                "sourceEntityId": "101",
                "targetEntityId": "101",
            },
        )
        metadata_serialized = json.dumps(metadata)
        for secret in (
            "must-not-leak",
            "secret-key-value",
            "secret.example",
            "future-payload",
            "Documents",
            "ResourceLinks",
        ):
            self.assertNotIn(secret, metadata_serialized)
        self.assertTrue(
            any(
                edge["source"]["kind"] == "table"
                and edge["target"]["kind"] == "entityType"
                and edge["relation"] == "binds entity"
                for edge in artifact["_objectEdges"]
            )
        )
        self.assertTrue(
            any(
                edge["source"]["kind"] == "column"
                and edge["target"]["kind"] == "property"
                and edge["relation"] == "binds property"
                for edge in artifact["_objectEdges"]
            )
        )
        schema = artifact["_definitionSchema"]
        self.assertEqual(
            [value["objectType"] for value in schema],
            ["Ontology entity", "Ontology relationship"],
        )
        self.assertEqual(
            [column["objectType"] for column in schema[0]["columns"]],
            ["Ontology property", "Ontology time-series property"],
        )
        self.assertEqual(
            schema[0]["columns"][0]["parentObjectId"],
            schema[0]["objectId"],
        )
        self.assertEqual(
            schema[1]["sourceObjectId"],
            schema[0]["objectId"],
        )
        self.assertEqual(
            schema[1]["targetObjectId"],
            schema[0]["objectId"],
        )
        object_edges = function_app._schema_object_edges(schema)
        self.assertTrue(
            any(
                edge["relation"] == "ontology relationship"
                and edge["relationObjectId"] == schema[1]["objectId"]
                for edge in object_edges
            )
        )
        atlas_edges = function_app._atlas_object_edges(
            {self.ontology_id: schema},
            extra_edges=artifact["_objectEdges"],
        )
        self.assertTrue(
            any(
                edge["source"]["kind"] == "entityType"
                and edge["target"]["kind"] == "relationshipType"
                and edge["relation"] == "relationship source"
                and edge["confidence"] == "verified"
                for edge in atlas_edges
            )
        )
        self.assertTrue(
            any(
                edge["source"]["itemId"] == self.source_id
                and edge["target"]["itemId"] == self.ontology_id
                and edge["relation"] == "binds entity"
                for edge in atlas_edges
            )
        )
        self.assertTrue(
            any(
                edge["source"]["kind"] == "relationshipType"
                and edge["target"]["kind"] == "entityType"
                and edge["relation"] == "relationship target"
                for edge in atlas_edges
            )
        )

        lineage = function_app._official_lineage(
            [
                {"id": self.source_id, "_type": "Lakehouse"},
                artifact,
            ],
            {self.source_id, self.ontology_id},
            "workspace",
        )
        self.assertIn(
            {
                "source": self.source_id,
                "target": self.ontology_id,
                "relation": "ontology binding",
            },
            lineage,
        )

    def test_ontology_entity_id_falls_back_to_definition_path(self):
        artifact = {"id": self.ontology_id, "_type": "Ontology"}
        function_app._project_definition(
            artifact,
            {
                "definition": {
                    "parts": [
                        _definition_part(
                            "EntityTypes/101/definition.json",
                            {"name": "Equipment"},
                        ),
                        _definition_part(
                            "EntityTypes/101/DataBindings/binding.json",
                            {
                                "dataBindingConfiguration": {
                                    "sourceTableProperties": {
                                        "itemId": self.source_id,
                                    }
                                }
                            },
                        ),
                    ]
                }
            },
        )

        serialized = json.dumps(artifact["_definitionFacts"])
        self.assertIn("id 101", serialized)
        self.assertIn("Equipment:binding", serialized)
        self.assertNotIn("id None", serialized)

    def test_ontology_ids_are_canonical_across_graph_mappings(self):
        entity_id = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"
        ontology = {"id": self.ontology_id, "_type": "Ontology"}
        graph = {"id": self.graph_id, "_type": "GraphModel"}
        function_app._project_definition(
            ontology,
            {
                "definition": {
                    "parts": [
                        _definition_part(
                            f"EntityTypes/{entity_id}/definition.json",
                            {
                                "id": entity_id,
                                "name": "Equipment",
                            },
                        )
                    ]
                }
            },
        )
        function_app._project_definition(
            graph,
            {
                "definition": {
                    "parts": [
                        _definition_part(
                            "graphType.json",
                            {
                                "ontologyItemId": self.ontology_id,
                                "nodeTypes": [
                                    {
                                        "alias": "EquipmentNode",
                                        "ontologyEntityTypeId": entity_id.lower(),
                                        "properties": [],
                                    }
                                ],
                                "edgeTypes": [],
                            },
                        ),
                        _definition_part(
                            "dataSources.json",
                            {"dataSources": []},
                        ),
                        _definition_part(
                            "graphDefinition.json",
                            {"nodeTables": [], "edgeTables": []},
                        ),
                    ]
                }
            },
        )

        ontology_object_id = ontology["_definitionSchema"][0]["objectId"]
        graph_source_id = graph["_definitionSchema"][0]["sourceObjectId"]
        self.assertEqual(ontology_object_id, graph_source_id)

    def test_graph_projects_types_and_mappings_without_filter_values(self):
        artifact = {"id": self.graph_id, "_type": "GraphModel"}
        one_lake_path = (
            f"abfss://{self.source_id}@onelake.dfs.fabric.microsoft.com/"
            "55555555-5555-4555-8555-555555555555/Tables/Customers"
        )
        response = {
            "definition": {
                "parts": [
                    _definition_part(
                        "graphType.json",
                        {
                            "ontologyItemId": self.ontology_id,
                            "nodeTypes": [
                                {
                                    "alias": "Customer",
                                    "ontologyEntityTypeId": "101",
                                    "labels": ["Customer"],
                                    "properties": [
                                        {"name": "Id", "type": "STRING"}
                                    ],
                                }
                            ],
                            "edgeTypes": [
                                {
                                    "alias": "Purchased",
                                    "ontologyRelationshipTypeId": "301",
                                    "sourceNodeType": {"alias": "Customer"},
                                    "destinationNodeType": {"alias": "Customer"},
                                    "properties": [],
                                }
                            ],
                        },
                    ),
                    _definition_part(
                        "dataSources.json",
                        {
                            "dataSources": [
                                {
                                    "name": "Customers",
                                    "type": "DeltaTable",
                                    "properties": {"path": one_lake_path},
                                }
                            ]
                        },
                    ),
                    _definition_part(
                        "graphDefinition.json",
                        {
                            "nodeTables": [
                                {
                                    "nodeTypeAlias": "Customer",
                                    "dataSourceName": "Customers",
                                    "propertyMappings": [
                                        {
                                            "propertyName": "Id",
                                            "sourceColumn": "CustomerId",
                                        }
                                    ],
                                    "filter": {
                                        "columnName": "Region",
                                        "operator": "Equal",
                                        "value": "secret-filter-literal",
                                    },
                                }
                            ],
                            "edgeTables": [],
                        },
                    ),
                    _definition_part(
                        "graphInstances.json",
                        {"instances": [{"name": "secret-instance"}]},
                    ),
                ]
            }
        }

        function_app._project_definition(artifact, response)
        serialized = json.dumps(
            function_app._item_config(
                "token",
                "workspace",
                artifact,
                "GraphModel",
                [],
            )
        )

        self.assertIn("Graph node types", serialized)
        self.assertIn("Graph edge types", serialized)
        self.assertIn("Graph data sources", serialized)
        self.assertIn("Graph node mappings", serialized)
        self.assertNotIn("secret-filter-literal", serialized)
        self.assertNotIn("secret-instance", serialized)
        metadata = artifact["_artifactMetadata"]
        self.assertEqual(metadata["kind"], "graphModel")
        self.assertEqual(metadata["nodeTypes"][0]["alias"], "Customer")
        self.assertEqual(metadata["edgeTypes"][0]["alias"], "Purchased")
        self.assertEqual(
            metadata["dataSources"][0]["sourceItemId"],
            "55555555-5555-4555-8555-555555555555",
        )
        self.assertEqual(metadata["mappings"][0]["kind"], "node")
        metadata_serialized = json.dumps(metadata)
        self.assertNotIn("filter", metadata_serialized.casefold())
        self.assertNotIn("instances", metadata_serialized.casefold())
        self.assertNotIn("secret-filter-literal", metadata_serialized)
        self.assertNotIn("secret-instance", metadata_serialized)
        self.assertEqual(
            [
                (value["name"], value["objectType"])
                for value in artifact["_definitionSchema"]
            ],
            [
                ("Customer", "Graph node"),
                ("Purchased", "Graph edge"),
            ],
        )
        self.assertEqual(
            artifact["_definitionSchema"][0]["columns"][0]["objectType"],
            "Graph property",
        )
        graph_schema = artifact["_definitionSchema"]
        self.assertEqual(
            graph_schema[0]["sourceObjectId"],
            function_app._fabric_object_id(
                self.ontology_id,
                "ontology-entity",
                "101",
            ),
        )
        self.assertEqual(
            graph_schema[1]["sourceObjectId"],
            function_app._fabric_object_id(
                self.ontology_id,
                "ontology-relationship",
                "301",
            ),
        )
        self.assertEqual(
            [edge["relation"] for edge in function_app._schema_object_edges(
                graph_schema
            )],
            ["generated graph node", "generated graph edge"],
        )
        atlas_edges = function_app._atlas_object_edges({
            self.graph_id: graph_schema,
        }, extra_edges=artifact["_objectEdges"])
        self.assertEqual(
            {
                (
                    edge["source"]["kind"],
                    edge["target"]["kind"],
                    edge["relation"],
                )
                for edge in atlas_edges
            },
            {
                ("entityType", "nodeType", "generated graph node"),
                (
                    "relationshipType",
                    "edgeType",
                    "generated graph edge",
                ),
                ("table", "nodeType", "maps node"),
                ("column", "property", "maps property"),
            },
        )
        self.assertIn(
            "55555555-5555-4555-8555-555555555555",
            artifact["_definitionSourceIds"],
        )

        lineage = function_app._official_lineage(
            [
                {"id": self.source_id, "_type": "Lakehouse"},
                {"id": self.ontology_id, "_type": "Ontology"},
                {
                    **artifact,
                    "_definitionSourceIds": {self.source_id},
                },
            ],
            {self.source_id, self.ontology_id, self.graph_id},
            "workspace",
        )
        self.assertIn(
            {
                "source": self.ontology_id,
                "target": self.graph_id,
                "relation": "generated graph",
            },
            lineage,
        )

    def test_data_agent_projects_sources_and_selected_tree_without_prompts(self):
        artifact = {"id": self.agent_id, "_type": "DataAgent"}
        response = {
            "definition": {
                "parts": [
                    _definition_part(
                        "Files/Config/draft/stage_config.json",
                        {"aiInstructions": "secret-agent-prompt"},
                    ),
                    _definition_part(
                        "Files/Config/published/stage_config.json",
                        {"aiInstructions": "secret-published-prompt"},
                    ),
                    _definition_part(
                        "Files/Config/published/ontology-Sales/datasource.json",
                        {
                            "artifactId": self.ontology_id,
                            "workspaceId": "workspace",
                            "displayName": "Sales ontology",
                            "type": "ontology",
                            "dataSourceInstructions": "secret-source-prompt",
                            "elements": [
                                {
                                    "id": "101",
                                    "display_name": "Customer",
                                    "type": "graph.nodeType",
                                    "is_selected": True,
                                    "children": [
                                        {
                                            "id": "201",
                                            "display_name": "CustomerId",
                                            "type": "graph.property",
                                            "is_selected": True,
                                            "description": "secret-description",
                                        }
                                    ],
                                }
                            ],
                        },
                    ),
                    _definition_part(
                        "Files/Config/published/ontology-Sales/fewshots.json",
                        {
                            "fewShots": [
                                {
                                    "question": "secret-question",
                                    "query": "secret-query",
                                }
                            ]
                        },
                    ),
                    _definition_part(
                        "Files/Config/publish_info.json",
                        {"description": "Published catalog assistant"},
                    ),
                ]
            }
        }

        function_app._project_definition(artifact, response)
        serialized = json.dumps(
            function_app._item_config(
                "token",
                "workspace",
                artifact,
                "DataAgent",
                [],
            )
        )

        self.assertIn("Published catalog assistant", serialized)
        self.assertIn("published", serialized)
        self.assertIn("Sales ontology", serialized)
        self.assertIn("CustomerId", serialized)
        for secret in (
            "secret-agent-prompt",
            "secret-published-prompt",
            "secret-source-prompt",
            "secret-description",
            "secret-question",
            "secret-query",
        ):
            self.assertNotIn(secret, serialized)
        metadata = artifact["_artifactMetadata"]
        self.assertEqual(metadata["kind"], "dataAgent")
        self.assertEqual(len(metadata["sources"]), 1)
        self.assertEqual(
            metadata["sources"][0]["artifactId"],
            self.ontology_id,
        )
        self.assertEqual(
            metadata["sources"][0]["elements"][0]["id"],
            "101",
        )
        self.assertNotIn("instructions", json.dumps(metadata).casefold())
        self.assertNotIn("fewshot", json.dumps(metadata).casefold())
        for secret in (
            "secret-agent-prompt",
            "secret-published-prompt",
            "secret-source-prompt",
            "secret-description",
            "secret-question",
            "secret-query",
        ):
            self.assertNotIn(secret, json.dumps(metadata))
        self.assertEqual(
            artifact["_definitionSchema"][0]["objectType"],
            "Data Agent source",
        )
        self.assertEqual(
            [
                column["objectType"]
                for column in artifact["_definitionSchema"][0]["columns"]
            ],
            [
                "Data Agent selected element",
                "Data Agent selected element",
            ],
        )
        agent_source = artifact["_definitionSchema"][0]
        self.assertEqual(
            agent_source["columns"][0]["sourceObjectId"],
            function_app._fabric_object_id(
                self.ontology_id,
                "ontology-entity",
                "101",
            ),
        )
        self.assertEqual(
            agent_source["columns"][0]["targetObjectId"],
            agent_source["columns"][0]["objectId"],
        )
        self.assertEqual(
            agent_source["columns"][1]["sourceObjectId"],
            function_app._fabric_object_id(
                self.ontology_id,
                "ontology-property",
                "201",
            ),
        )
        self.assertTrue(
            any(
                edge["source"]
                == agent_source["columns"][0]["sourceObjectId"]
                and edge["target"]
                == agent_source["columns"][0]["objectId"]
                and edge["relation"] == "selected by data agent"
                for edge in function_app._schema_object_edges(
                    artifact["_definitionSchema"]
                )
            )
        )
        atlas_edges = function_app._atlas_object_edges({
            self.agent_id: artifact["_definitionSchema"],
        })
        self.assertTrue(
            any(
                edge["source"]["kind"] == "entityType"
                and edge["target"]["kind"] == "selectedElement"
                and edge["relation"] == "selected by data agent"
                and edge["confidence"] == "verified"
                for edge in atlas_edges
            )
        )
        self.assertTrue(
            any(
                edge["source"]["kind"] == "dataSource"
                and edge["target"]["kind"] == "selectedElement"
                and edge["relation"] == "contains"
                for edge in atlas_edges
            )
        )

        lineage = function_app._official_lineage(
            [
                {"id": self.ontology_id, "_type": "Ontology"},
                artifact,
            ],
            {self.ontology_id, self.agent_id},
            "workspace",
        )
        self.assertIn(
            {
                "source": self.ontology_id,
                "target": self.agent_id,
                "relation": "ontology",
            },
            lineage,
        )

    def test_definition_permission_locked_and_malformed_are_item_scoped(self):
        cases = (
            (_http_error(403), "read-write-permission-required", "unsupported"),
            (_http_error(423), "encrypted-label-blocked", "unsupported"),
            (
                {
                    "definition": {
                        "parts": [
                            {
                                "path": "graphType.json",
                                "payload": "not-base64",
                                "payloadType": "InlineBase64",
                            }
                        ]
                    }
                },
                "invalid-definition",
                "failed",
            ),
        )
        for result, expected_code, expected_tracker in cases:
            with self.subTest(expected_code=expected_code):
                artifact = {"id": self.graph_id, "_type": "GraphModel"}
                trackers = {
                    "itemDetails": function_app._new_optional_tracker(),
                    "definitions": function_app._new_optional_tracker(),
                }
                errors = []
                with (
                    mock.patch.object(
                        function_app,
                        "_get",
                        return_value={"id": self.graph_id},
                    ),
                    mock.patch.object(
                        function_app,
                        "_get_definition",
                        side_effect=(
                            result if isinstance(result, Exception) else None
                        ),
                        return_value=(
                            result if isinstance(result, dict) else None
                        ),
                    ),
                ):
                    function_app._enrich_artifact(
                        "token",
                        "workspace",
                        artifact,
                        trackers,
                        errors,
                        definition_token="token",
                    )

                self.assertEqual(
                    artifact["_definitionStatus"],
                    expected_code,
                )
                self.assertEqual(
                    trackers["definitions"][expected_tracker],
                    1,
                )
                if expected_tracker == "failed":
                    self.assertEqual(
                        errors,
                        [f"definitions:{self.graph_id}: {expected_code}"],
                    )
                else:
                    self.assertEqual(errors, [])

    def test_data_agent_physical_selection_points_to_source_object(self):
        kql_id = "55555555-5555-4555-8555-555555555555"
        artifact = {"id": self.agent_id, "_type": "DataAgent"}
        function_app._project_definition(
            artifact,
            {
                "definition": {
                    "parts": [
                        _definition_part(
                            "Files/Config/draft/kusto-Telemetry/datasource.json",
                            {
                                "artifactId": kql_id,
                                "displayName": "Telemetry",
                                "type": "kusto",
                                "elements": [
                                    {
                                        "display_name": "Events",
                                        "type": "kusto.table",
                                        "is_selected": True,
                                        "children": [
                                            {
                                                "display_name": "Timestamp",
                                                "type": "kusto.column",
                                                "is_selected": True,
                                            }
                                        ],
                                    }
                                ],
                            },
                        )
                    ]
                }
            },
        )

        source = artifact["_definitionSchema"][0]
        table, column = source["columns"]
        self.assertEqual(
            table["sourceObjectId"],
            function_app._fabric_object_id(
                kql_id,
                "kql-table",
                "Events",
            ),
        )
        self.assertEqual(
            column["sourceObjectId"],
            function_app._fabric_object_id(
                kql_id,
                "kql-table-column",
                "Events/Timestamp",
            ),
        )
        self.assertEqual(table["targetObjectId"], table["objectId"])
        self.assertEqual(column["targetObjectId"], column["objectId"])
        self.assertEqual(table["parentObjectId"], source["objectId"])
        self.assertEqual(column["parentObjectId"], table["objectId"])

    def test_data_agent_live_element_types_skip_grouping_nodes(self):
        model_id = "55555555-5555-4555-8555-555555555555"
        kql_id = "66666666-6666-4666-8666-666666666666"
        artifact = {"id": self.agent_id, "_type": "DataAgent"}
        function_app._project_definition(
            artifact,
            {
                "definition": {
                    "parts": [
                        _definition_part(
                            "Files/Config/published/semantic_model-Model/datasource.json",
                            {
                                "artifactId": model_id,
                                "displayName": "Sales model",
                                "type": "semantic_model",
                                "elements": [
                                    {
                                        "display_name": "Model",
                                        "type": "semantic_model",
                                        "is_selected": True,
                                        "children": [
                                            {
                                                "display_name": "Sales",
                                                "type": "semantic_model.table",
                                                "is_selected": True,
                                                "children": [
                                                    {
                                                        "display_name": "Amount",
                                                        "type": "semantic_model.column",
                                                        "data_type": "Decimal",
                                                        "is_selected": True,
                                                    },
                                                    {
                                                        "display_name": "Revenue",
                                                        "type": "semantic_model.measure",
                                                        "data_type": "Decimal",
                                                        "is_selected": True,
                                                    },
                                                ],
                                            }
                                        ],
                                    }
                                ],
                            },
                        ),
                        _definition_part(
                            "Files/Config/published/kusto-Telemetry/datasource.json",
                            {
                                "artifactId": kql_id,
                                "displayName": "Telemetry",
                                "type": "kusto",
                                "elements": [
                                    {
                                        "display_name": "Tables",
                                        "type": "kusto",
                                        "is_selected": True,
                                        "children": [
                                            {
                                                "display_name": "Events",
                                                "type": "kusto.table",
                                                "is_selected": True,
                                                "children": [
                                                    {
                                                        "display_name": "Timestamp",
                                                        "type": "kusto.column",
                                                        "data_type": "datetime",
                                                        "is_selected": True,
                                                    }
                                                ],
                                            }
                                        ],
                                    }
                                ],
                            },
                        ),
                        _definition_part(
                            "Files/Config/published/ontology-Sales/datasource.json",
                            {
                                "artifactId": self.ontology_id,
                                "displayName": "Sales ontology",
                                "type": "ontology",
                                "elements": [
                                    {
                                        "id": "101",
                                        "display_name": "Customer",
                                        "type": "ontology.entity",
                                        "is_selected": True,
                                    }
                                ],
                            },
                        ),
                    ]
                }
            },
        )

        schema = artifact["_definitionSchema"]
        selected = [
            column
            for source in schema
            for column in source["columns"]
        ]
        self.assertEqual(
            [column["name"] for column in selected],
            [
                "Sales",
                "Amount",
                "Revenue",
                "Events",
                "Timestamp",
                "Customer",
            ],
        )
        self.assertNotIn("Model", [column["name"] for column in selected])
        self.assertNotIn("Tables", [column["name"] for column in selected])
        self.assertEqual(
            next(
                column["dataType"]
                for column in selected
                if column["name"] == "Amount"
            ),
            "Decimal",
        )
        self.assertEqual(
            next(
                column["dataType"]
                for column in selected
                if column["name"] == "Timestamp"
            ),
            "datetime",
        )

        edges = function_app._atlas_object_edges({
            self.agent_id: schema,
        })
        source_edges = [
            edge
            for edge in edges
            if edge["relation"] == "selected by data agent"
        ]
        self.assertEqual(
            {edge["source"]["kind"] for edge in source_edges},
            {"table", "column", "measure", "entityType"},
        )
        amount = next(
            edge
            for edge in source_edges
            if edge["source"]["name"] == "Amount"
        )
        self.assertEqual(amount["source"]["tableName"], "Sales")
        self.assertEqual(amount["source"]["parentPath"], ["Sales"])
        self.assertEqual(amount["target"]["parentPath"], ["Sales"])
        ontology = next(
            edge
            for edge in source_edges
            if edge["source"]["kind"] == "entityType"
        )
        self.assertEqual(ontology["source"]["itemId"], self.ontology_id)

    def test_data_agent_matching_is_independent_of_workspace_names_and_mix(self):
        source_id = "77777777-7777-4777-8777-777777777777"
        agent_id = "88888888-8888-4888-8888-888888888888"
        artifact = {"id": agent_id, "_type": "DataAgent"}
        function_app._project_definition(
            artifact,
            {
                "definition": {
                    "parts": [
                        _definition_part(
                            "Files/Config/draft/custom-source/datasource.json",
                            {
                                "artifactId": source_id,
                                "workspaceId": (
                                    "99999999-9999-4999-8999-999999999999"
                                ),
                                "displayName": "Synthetic source",
                                "type": "future_source_type",
                                "elements": [
                                    {
                                        "display_name": "arbitrary_schema",
                                        "type": "future.schema",
                                        "is_selected": True,
                                        "children": [
                                            {
                                                "display_name": "object_name",
                                                "type": "semantic_model.table",
                                                "is_selected": True,
                                                "children": [
                                                    {
                                                        "display_name": "field_name",
                                                        "type": "semantic_model.column",
                                                        "data_type": "custom_type",
                                                        "is_selected": True,
                                                    }
                                                ],
                                            }
                                        ],
                                    }
                                ],
                            },
                        )
                    ]
                }
            },
        )

        selected = artifact["_definitionSchema"][0]["columns"]
        self.assertEqual(
            [value["name"] for value in selected],
            ["object_name", "field_name"],
        )
        self.assertEqual(
            selected[0]["sourceObjectId"],
            function_app._fabric_object_id(
                source_id,
                "semantic-model-table",
                "arbitrary_schema.object_name",
            ),
        )
        edges = function_app._atlas_object_edges({
            agent_id: artifact["_definitionSchema"],
        })
        self.assertTrue(
            all(
                edge["source"]["itemId"] == source_id
                for edge in edges
                if edge["relation"] == "selected by data agent"
            )
        )
        self.assertEqual(
            function_app._source_object_kind("future_source_type"),
            "table",
        )

    def test_data_agent_metadata_truncation_is_reported(self):
        response = {
            "definition": {
                "parts": [
                    _definition_part(
                        "Files/Config/published/model-Source/datasource.json",
                        {
                            "artifactId": self.source_id,
                            "displayName": "Synthetic model",
                            "type": "semantic_model",
                            "elements": [
                                {
                                    "id": "one",
                                    "display_name": "One",
                                    "type": "semantic_model.table",
                                    "is_selected": True,
                                },
                                {
                                    "id": "two",
                                    "display_name": "Two",
                                    "type": "semantic_model.table",
                                    "is_selected": True,
                                },
                            ],
                        },
                    )
                ]
            }
        }
        artifact = {"id": self.agent_id, "_type": "DataAgent"}
        trackers = {
            "itemDetails": function_app._new_optional_tracker(),
            "definitions": function_app._new_optional_tracker(),
        }
        with (
            mock.patch.object(
                function_app,
                "MAX_ARTIFACT_METADATA_ELEMENTS",
                1,
            ),
            mock.patch.object(
                function_app,
                "_get",
                return_value={"id": self.agent_id},
            ),
            mock.patch.object(
                function_app,
                "_get_definition",
                return_value=response,
            ),
        ):
            function_app._enrich_artifact(
                "token",
                "workspace",
                artifact,
                trackers,
                [],
                definition_token="token",
            )

        self.assertTrue(artifact["_artifactMetadataTruncated"])
        self.assertEqual(
            artifact["_definitionStatus"],
            "artifact-metadata-truncated",
        )
        self.assertIn(
            "artifact-metadata-truncated",
            trackers["definitions"]["codes"],
        )

    def test_definition_lro_polls_state_then_fetches_result(self):
        operation_id = "55555555-5555-4555-8555-555555555555"
        clock = _Clock()
        deadline = function_app._ExecutionDeadline(10, clock.monotonic)
        response = {"definition": {"parts": []}}
        with (
            function_app._deadline_scope(deadline),
            mock.patch.object(
                function_app,
                "_req_response",
                side_effect=[
                    (
                        202,
                        {
                            "Location": (
                                "https://region.analysis.windows.net/"
                                f"operations/{operation_id}"
                            ),
                            "x-ms-operation-id": operation_id,
                            "Retry-After": "1",
                        },
                        {},
                    ),
                    (
                        200,
                        {
                            "Location": (
                                "https://region.analysis.windows.net/operations/"
                                f"{operation_id}/result"
                            )
                        },
                        {"status": "Succeeded"},
                    ),
                ],
            ) as request,
            mock.patch.object(
                function_app,
                "_get",
                return_value=response,
            ) as get,
            mock.patch.object(deadline, "sleep", side_effect=clock.sleep),
        ):
            result = function_app._get_definition(
                "token",
                "workspace",
                "Ontology",
                self.ontology_id,
            )

        self.assertEqual(result, response)
        self.assertEqual(
            request.call_args_list[1].args[1],
            f"{function_app.FABRIC}/operations/{operation_id}",
        )
        get.assert_called_once_with(
            "token",
            f"{function_app.FABRIC}/operations/{operation_id}/result",
        )


class KqlAndSqlMetadataTests(unittest.TestCase):
    kql_id = "11111111-1111-4111-8111-111111111111"
    eventhouse_id = "22222222-2222-4222-8222-222222222222"
    sql_id = "33333333-3333-4333-8333-333333333333"

    def test_sql_access_token_is_packed_for_attrs_before(self):
        token = "header.payload.synthetic-signature-value"
        token_bytes = token.encode("utf-16le")

        packed = function_app._pack_sql_access_token(token)

        self.assertEqual(
            packed,
            struct.pack(
                f"<I{len(token_bytes)}s",
                len(token_bytes),
                token_bytes,
            ),
        )
        self.assertNotIn(token.encode("utf-8"), packed)
        with self.assertRaises(ValueError):
            function_app._pack_sql_access_token("short")

    def test_sql_endpoint_and_database_identity_are_allowlisted(self):
        self.assertEqual(
            function_app._sql_endpoint(
                "server.database.fabric.microsoft.com,1433"
            ),
            ("server.database.fabric.microsoft.com", 1433),
        )
        self.assertEqual(
            function_app._sql_endpoint(
                "https://server.database.fabric.microsoft.com:1433"
            ),
            ("server.database.fabric.microsoft.com", 1433),
        )
        self.assertEqual(
            function_app._sql_database_name("Catalog 2026"),
            "Catalog 2026",
        )
        for endpoint in (
            "http://server.database.fabric.microsoft.com",
            "https://server.database.fabric.microsoft.com.evil.test",
            "server.database.fabric.microsoft.com;UID=attacker",
            "server.database.fabric.microsoft.com,1444",
            "-server.database.fabric.microsoft.com,1433",
            "localhost,1433",
        ):
            with self.subTest(endpoint=endpoint):
                with self.assertRaises(ValueError):
                    function_app._sql_endpoint(endpoint)
        for database_name in ("", "Catalog;UID=attacker", "Catalog{Name}"):
            with self.subTest(database_name=database_name):
                with self.assertRaises(ValueError):
                    function_app._sql_database_name(database_name)

    def test_sql_catalog_collection_maps_only_system_metadata(self):
        token = "header.payload.synthetic-signature-value"
        connection = _SqlConnection(
            [
                [
                    ("dbo", "Customers", "U", "CustomerId", "uniqueidentifier", 1),
                    ("dbo", "Customers", "U", "Name", "nvarchar", 2),
                    ("reporting", "CustomerSummary", "V", "CustomerId", "uniqueidentifier", 1),
                ],
                [
                    ("dbo", "Customers", "PK_Customers", "CustomerId", 1),
                ],
                [
                    (
                        "FK_Customers_Accounts",
                        "dbo",
                        "Customers",
                        "AccountId",
                        "dbo",
                        "Accounts",
                        "AccountId",
                        1,
                    ),
                ],
            ]
        )
        driver = _SqlDriver(connection=connection)
        artifact = {
            "id": self.sql_id,
            "_type": "SQLDatabase",
            "_detail": {
                "properties": {
                    "serverFqdn": (
                        "server.database.fabric.microsoft.com,1433"
                    ),
                    "databaseName": "Synthetic Catalog",
                    "connectionString": "Password=must-not-be-used",
                }
            },
        }

        with mock.patch.object(
            function_app.importlib,
            "import_module",
            return_value=driver,
        ):
            function_app._collect_sql_schema(token, artifact)

        connection_string, kwargs = driver.calls[0]
        self.assertEqual(
            connection_string,
            (
                "Server=tcp:server.database.fabric.microsoft.com,1433;"
                "Database=Synthetic Catalog;"
                "Encrypt=yes;"
                "TrustServerCertificate=no;"
                "ApplicationIntent=ReadOnly;"
            ),
        )
        self.assertEqual(kwargs["autocommit"], True)
        self.assertLessEqual(kwargs["timeout"], function_app.REQUEST_TIMEOUT_SECONDS)
        self.assertEqual(
            kwargs["attrs_before"],
            {
                function_app.SQL_COPT_SS_ACCESS_TOKEN:
                    function_app._pack_sql_access_token(token)
            },
        )
        self.assertEqual(
            [cursor.executed[0] for cursor in connection.cursors],
            [
                function_app.SQL_OBJECTS_QUERY,
                function_app.SQL_PRIMARY_KEYS_QUERY,
                function_app.SQL_FOREIGN_KEYS_QUERY,
            ],
        )
        self.assertTrue(all(cursor.closed for cursor in connection.cursors))
        self.assertTrue(connection.closed)
        self.assertEqual(
            [
                (value["name"], value["objectType"])
                for value in artifact["_sqlSchema"]
            ],
            [
                ("dbo.Customers", "SQL table"),
                ("reporting.CustomerSummary", "SQL view"),
            ],
        )
        self.assertEqual(
            [column["name"] for column in artifact["_sqlSchema"][0]["columns"]],
            ["CustomerId", "Name"],
        )
        serialized = json.dumps(artifact)
        self.assertNotIn(token, serialized)
        self.assertNotIn("must-not-be-used", json.dumps({
            "schema": artifact["_sqlSchema"],
            "facts": artifact["_sqlMetadataFacts"],
        }))
        self.assertNotIn(
            "Synthetic Catalog",
            " ".join(cursor.executed[0] for cursor in connection.cursors),
        )
        self.assertIn("PK_Customers", serialized)
        self.assertIn("FK_Customers_Accounts", serialized)

    def test_sql_driver_import_auth_and_query_failures_are_safe(self):
        artifact = {
            "id": self.sql_id,
            "_type": "SQLDatabase",
            "_detail": {
                "properties": {
                    "serverFqdn": (
                        "server.database.fabric.microsoft.com,1433"
                    ),
                    "databaseName": "Catalog",
                }
            },
        }
        with mock.patch.object(
            function_app.importlib,
            "import_module",
            side_effect=ImportError("private import path"),
        ):
            with self.assertRaises(function_app.SqlRuntimeUnavailable):
                function_app._collect_sql_schema("token", artifact)

        auth_driver = _SqlDriver(
            connect_error=RuntimeError(
                "SQLSTATE:28000 login failed secret-token"
            )
        )
        with mock.patch.object(
            function_app.importlib,
            "import_module",
            return_value=auth_driver,
        ):
            with self.assertRaisesRegex(
                function_app.SqlAuthorizationError,
                "^SQL authentication failed$",
            ):
                function_app._collect_sql_schema(
                    "header.payload.secret-token-signature",
                    artifact,
                )

        connection = _SqlConnection(
            [[]],
            execute_error=RuntimeError("query internals secret-token"),
        )
        query_driver = _SqlDriver(connection=connection)
        with mock.patch.object(
            function_app.importlib,
            "import_module",
            return_value=query_driver,
        ):
            with self.assertRaisesRegex(
                function_app.SqlCatalogQueryError,
                "^SQL catalog query failed$",
            ):
                function_app._collect_sql_schema(
                    "header.payload.secret-token-signature",
                    artifact,
                )
        self.assertTrue(connection.cursors[0].closed)
        self.assertTrue(connection.closed)

    def test_sql_catalog_row_limit_fails_instead_of_silently_truncating(self):
        connection = _SqlConnection([
            [("dbo", f"Table{index}", "U", None, None, None) for index in range(3)]
        ])
        deadline = function_app._ExecutionDeadline(10)

        with self.assertRaises(function_app.ResponseSizeExceeded):
            function_app._sql_fetch_rows(
                connection,
                function_app.SQL_OBJECTS_QUERY,
                2,
                deadline,
            )

        self.assertTrue(connection.cursors[0].closed)

    def test_sql_token_uses_live_catalog(self):
        artifact = {"id": self.sql_id, "_type": "SQLDatabase"}
        trackers = {
            "itemDetails": function_app._new_optional_tracker(),
            "sqlSchema": function_app._new_optional_tracker(),
        }
        live_schema = [
            {
                "name": "dbo.Live",
                "objectType": "SQL table",
                "source": "Fabric SQL system catalog",
                "columns": [],
                "measures": [],
            }
        ]

        def collect(_token, value):
            value["_sqlSchema"] = live_schema
            value["_sqlMetadataFacts"] = []

        with (
            mock.patch.object(
                function_app,
                "_get",
                return_value={
                    "id": self.sql_id,
                    "properties": {
                        "serverFqdn": (
                            "server.database.fabric.microsoft.com,1433"
                        ),
                        "databaseName": "Catalog",
                    },
                },
            ),
            mock.patch.object(
                function_app,
                "_collect_sql_schema",
                side_effect=collect,
            ) as collect_sql,
        ):
            function_app._enrich_artifact(
                "fabric-token",
                "workspace",
                artifact,
                trackers,
                [],
                sql_token="sql-token",
            )

        collect_sql.assert_called_once_with("sql-token", artifact)
        self.assertEqual(artifact["_sqlSchema"], live_schema)
        self.assertEqual(artifact["_sqlSchemaStatus"], "complete")

    def test_kql_schema_uses_readonly_management_command(self):
        schema_document = {
            "Databases": {
                "Telemetry": {
                    "Tables": {
                        "Events": {
                            "Name": "Events",
                            "OrderedColumns": [
                                {"Name": "Timestamp", "CslType": "datetime"},
                                {"Name": "DeviceId", "CslType": "string"},
                            ],
                        }
                    },
                    "MaterializedViews": {
                        "LatestEvents": {
                            "Name": "LatestEvents",
                            "Schema": {
                                "OrderedColumns": [
                                    {"Name": "DeviceId", "CslType": "string"}
                                ]
                            },
                            "Query": "secret-materialized-view-query",
                        }
                    },
                    "Functions": {
                        "NormalizeDevice": {
                            "Name": "NormalizeDevice",
                            "Body": "secret-function-body",
                        }
                    },
                }
            }
        }
        response = {
            "Tables": [
                {
                    "TableName": "PrimaryResult",
                    "Rows": [[json.dumps(schema_document)]],
                }
            ]
        }
        artifact = {
            "id": self.kql_id,
            "_type": "KQLDatabase",
            "displayName": "Telemetry",
            "_detail": {
                "displayName": "Telemetry",
                "properties": {
                    "queryServiceUri": (
                        "https://cluster.z1.kusto.fabric.microsoft.com"
                    )
                },
            },
        }
        with mock.patch.object(
            function_app,
            "_req",
            return_value=response,
        ) as request:
            function_app._collect_kql_schema("kusto-token", artifact)

        kwargs = request.call_args.kwargs
        self.assertEqual(kwargs["headers"]["x-ms-readonly"], "true")
        self.assertEqual(kwargs["method"], "POST")
        self.assertIn(".show database", kwargs["body"]["csl"])
        self.assertEqual(
            [table["name"] for table in artifact["_kqlSchema"]],
            ["Events", "LatestEvents", "NormalizeDevice"],
        )
        self.assertEqual(
            [table["objectType"] for table in artifact["_kqlSchema"]],
            [
                "KQL table",
                "KQL materialized view",
                "KQL function",
            ],
        )
        self.assertEqual(
            artifact["_kqlFunctions"],
            [{"name": "NormalizeDevice", "parameters": []}],
        )
        self.assertEqual(
            artifact["_artifactMetadata"],
            {
                "kind": "kql",
                "functions": [
                    {"name": "NormalizeDevice", "parameters": []}
                ],
                "materializedViews": [
                    {
                        "name": "LatestEvents",
                        "columns": [
                            {
                                "name": "DeviceId",
                                "dataType": "string",
                            }
                        ],
                    }
                ],
            },
        )
        metadata_serialized = json.dumps(
            artifact["_artifactMetadata"]
        )
        self.assertNotIn("secret-function-body", metadata_serialized)
        self.assertNotIn(
            "secret-materialized-view-query",
            metadata_serialized,
        )
        serialized = json.dumps(
            function_app._item_config(
                "token",
                "workspace",
                artifact,
                "KQLDatabase",
                artifact["_kqlSchema"],
            )
        )
        self.assertNotIn("secret-function-body", serialized)
        self.assertNotIn("secret-materialized-view-query", serialized)

    def test_kql_parent_relation_is_authoritative(self):
        lineage = function_app._official_lineage(
            [
                {"id": self.eventhouse_id, "_type": "Eventhouse"},
                {
                    "id": self.kql_id,
                    "_type": "KQLDatabase",
                    "_detail": {
                        "properties": {
                            "parentEventhouseItemId": self.eventhouse_id
                        }
                    },
                },
            ],
            {self.eventhouse_id, self.kql_id},
            "workspace",
        )
        self.assertEqual(
            lineage,
            [
                {
                    "source": self.eventhouse_id,
                    "target": self.kql_id,
                    "relation": "KQL database",
                }
            ],
        )

    def test_kql_functions_are_not_silently_truncated(self):
        schema_document = {
            "Databases": {
                "Telemetry": {
                    "Tables": {},
                    "Functions": {
                        f"Function{index}": {"Name": f"Function{index}"}
                        for index in range(5)
                    },
                }
            }
        }
        schema, functions, _views = function_app._kusto_schema(
            schema_document,
            "Telemetry",
        )

        self.assertEqual(len(schema), 5)
        self.assertEqual(len(functions), 5)
        self.assertTrue(
            all(value["objectType"] == "KQL function" for value in schema)
        )

    def test_kql_columns_are_not_silently_truncated(self):
        schema_document = {
            "Databases": {
                "Telemetry": {
                    "Tables": {
                        "Events": {
                            "Name": "Events",
                            "Schema": {
                                "OrderedColumns": [
                                    {"Name": "One", "CslType": "string"},
                                    {"Name": "Two", "CslType": "long"},
                                ]
                            },
                        }
                    }
                }
            }
        }
        with mock.patch.object(
            function_app,
            "MAX_SCHEMA_COLUMNS_PER_OBJECT",
            1,
        ):
            schema, _functions, _views = function_app._kusto_schema(
                schema_document,
                "Telemetry",
            )

        self.assertEqual(
            [column["name"] for column in schema[0]["columns"]],
            ["One", "Two"],
        )

    def test_kql_token_absence_is_explicit_and_nonfatal(self):
        artifact = {"id": self.kql_id, "_type": "KQLDatabase"}
        trackers = {
            "itemDetails": function_app._new_optional_tracker(),
            "kqlSchema": function_app._new_optional_tracker(),
        }
        with mock.patch.object(
            function_app,
            "_get",
            return_value={
                "id": self.kql_id,
                "displayName": "Telemetry",
                "properties": {
                    "queryServiceUri": (
                        "https://cluster.z1.kusto.fabric.microsoft.com"
                    )
                },
            },
        ):
            function_app._enrich_artifact(
                "token",
                "workspace",
                artifact,
                trackers,
                [],
            )

        self.assertEqual(
            artifact["_kqlSchemaStatus"],
            "token-unavailable",
        )
        self.assertEqual(trackers["kqlSchema"]["unsupported"], 1)

    def test_sql_metadata_fixture_projection_is_allowlisted(self):
        value = {
            "tables": [
                {
                    "schema": "dbo",
                    "name": "Customers",
                    "rowCount": [{"name": "secret-business-row"}],
                    "rows": [{"name": "secret-business-row"}],
                    "primaryKey": ["CustomerId"],
                    "columns": [
                        {
                            "name": "CustomerId",
                            "dataType": "uniqueidentifier",
                            "values": ["secret-value"],
                        },
                        {"name": "Name", "dataType": "nvarchar"},
                    ],
                    "moduleDefinition": "secret-sql-module",
                }
            ],
            "views": [
                {
                    "schema": "reporting",
                    "name": "CustomerSummary",
                    "columns": [{"name": "CustomerId", "dataType": "uuid"}],
                    "definition": "secret-view-definition",
                }
            ],
            "foreignKeys": [
                {
                    "name": "FK_Customers_Accounts",
                    "sourceTable": "dbo.Customers",
                    "targetTable": "dbo.Accounts",
                    "query": "secret-query",
                }
            ],
            "credentials": "secret-credential",
        }

        schema, facts = function_app._sql_metadata_projection(value)
        artifact = {
            "id": self.sql_id,
            "_type": "SQLDatabase",
            "_sqlSchema": schema,
            "_sqlMetadataFacts": facts,
            "_sqlSchemaStatus": "complete",
            "_detail": {
                "properties": {
                    "databaseName": "Catalog",
                    "serverFqdn": "server.database.fabric.microsoft.com,1433",
                    "connectionString": "Password=secret-password",
                }
            },
        }
        serialized = json.dumps({
            "schema": schema,
            "config": function_app._item_config(
                "token",
                "workspace",
                artifact,
                "SQLDatabase",
                schema,
            ),
        })

        self.assertEqual(
            [(table["name"], table["objectType"]) for table in schema],
            [
                ("dbo.Customers", "SQL table"),
                ("reporting.CustomerSummary", "SQL view"),
            ],
        )
        self.assertNotIn("rows", schema[0])
        for secret in (
            "secret-business-row",
            "secret-value",
            "secret-sql-module",
            "secret-view-definition",
            "secret-query",
            "secret-credential",
            "secret-password",
        ):
            self.assertNotIn(secret, serialized)

    def test_sql_without_token_reports_token_absence(self):
        artifact = {"id": self.sql_id, "_type": "SQLDatabase"}
        trackers = {
            "itemDetails": function_app._new_optional_tracker(),
            "sqlSchema": function_app._new_optional_tracker(),
        }
        with mock.patch.object(
            function_app,
            "_get",
            return_value={
                "id": self.sql_id,
                "properties": {
                    "databaseName": "Catalog",
                    "serverFqdn": "server.database.fabric.microsoft.com,1433",
                },
            },
        ):
            function_app._enrich_artifact(
                "token",
                "workspace",
                artifact,
                trackers,
                [],
            )

        self.assertEqual(
            artifact["_sqlSchemaStatus"],
            "token-unavailable",
        )
        self.assertEqual(trackers["sqlSchema"]["unsupported"], 1)

    def test_sql_item_failures_are_isolated_with_precise_codes(self):
        cases = (
            (
                function_app.SqlRuntimeUnavailable("runtime"),
                "tds-runtime-unavailable",
                "unsupported",
            ),
            (
                function_app.SqlAuthorizationError("auth"),
                "authorization-failed",
                "unsupported",
            ),
            (
                function_app.SqlConnectionError("connect"),
                "sql-connection-failed",
                "failed",
            ),
            (
                function_app.SqlCatalogQueryError("query"),
                "sql-catalog-query-failed",
                "failed",
            ),
        )
        for error, expected_code, expected_status in cases:
            with self.subTest(expected_code=expected_code):
                artifact = {"id": self.sql_id, "_type": "SQLDatabase"}
                trackers = {
                    "itemDetails": function_app._new_optional_tracker(),
                    "sqlSchema": function_app._new_optional_tracker(),
                }
                errors = []
                with (
                    mock.patch.object(
                        function_app,
                        "_get",
                        return_value={
                            "id": self.sql_id,
                            "properties": {
                                "serverFqdn": (
                                    "server.database.fabric.microsoft.com,1433"
                                ),
                                "databaseName": "Catalog",
                            },
                        },
                    ),
                    mock.patch.object(
                        function_app,
                        "_collect_sql_schema",
                        side_effect=error,
                    ),
                ):
                    function_app._enrich_artifact(
                        "fabric-token",
                        "workspace",
                        artifact,
                        trackers,
                        errors,
                        sql_token="sql-token",
                    )

                self.assertEqual(
                    artifact["_sqlSchemaStatus"],
                    expected_code,
                )
                self.assertEqual(
                    trackers["sqlSchema"][expected_status],
                    1,
                )
                if expected_status == "failed":
                    self.assertEqual(
                        errors,
                        [f"sqlSchema:{self.sql_id}: {expected_code}"],
                    )
                else:
                    self.assertEqual(errors, [])


class LineageTests(unittest.TestCase):
    def test_uses_only_official_id_based_lineage_and_deduplicates(self):
        artifacts = [
            {"id": "flow-source", "_type": "Dataflow", "displayName": "Shared"},
            {
                "id": "flow",
                "_type": "Dataflow",
                "displayName": "Shared",
                "upstreamDataflows": [
                    {
                        "targetDataflowId": "flow-source",
                        "groupId": "workspace",
                    },
                    {
                        "targetDataflowId": "outside",
                        "groupId": "other-workspace",
                    },
                ],
                "upstreamDatamarts": [
                    {
                        "targetDatamartId": "mart-source",
                        "groupId": "workspace",
                    },
                ],
            },
            {"id": "mart-source", "_type": "Datamart"},
            {
                "id": "mart",
                "_type": "Datamart",
                "upstreamDatamarts": [
                    {
                        "targetDatamartId": "mart-source",
                        "groupId": "workspace",
                    },
                    {
                        "targetDatamartId": "mart",
                        "groupId": "workspace",
                    },
                ],
            },
            {"id": "model-source", "_type": "SemanticModel"},
            {
                "id": "model",
                "_type": "SemanticModel",
                "displayName": "Shared",
                "upstreamDataflows": [
                    {"targetDataflowId": "flow"},
                    {"targetDataflowId": "flow"},
                ],
                "upstreamDatamarts": [
                    {"targetDatamartId": "mart"},
                ],
                "upstreamDatasets": [
                    {
                        "targetDatasetId": "model-source",
                        "groupId": "workspace",
                    },
                ],
            },
            {
                "id": "report",
                "_type": "Report",
                "datasetId": "model",
                "relations": [
                    {
                        "dependentOnArtifactId": "model",
                        "relationType": "Datasource",
                    }
                ],
            },
            {
                "id": "dashboard",
                "_type": "Dashboard",
                "tiles": [
                    {"reportId": "report", "datasetId": "model"},
                    {"reportId": "outside", "datasetId": "outside"},
                ],
            },
        ]

        lineage = function_app._official_lineage(
            artifacts,
            {
                "flow-source",
                "flow",
                "mart-source",
                "mart",
                "model-source",
                "model",
                "report",
                "dashboard",
            },
            "workspace",
        )

        self.assertIn(
            {
                "source": "flow-source",
                "target": "flow",
                "relation": "dataflow",
            },
            lineage,
        )
        self.assertIn(
            {
                "source": "mart-source",
                "target": "flow",
                "relation": "datamart",
            },
            lineage,
        )
        self.assertIn(
            {"source": "flow", "target": "model", "relation": "dataflow"},
            lineage,
        )
        self.assertIn(
            {"source": "mart-source", "target": "mart", "relation": "datamart"},
            lineage,
        )
        self.assertIn(
            {"source": "mart", "target": "model", "relation": "datamart"},
            lineage,
        )
        self.assertIn(
            {
                "source": "model-source",
                "target": "model",
                "relation": "semantic model",
            },
            lineage,
        )
        self.assertIn(
            {"source": "model", "target": "report", "relation": "report"},
            lineage,
        )
        self.assertIn(
            {
                "source": "report",
                "target": "dashboard",
                "relation": "dashboard report",
            },
            lineage,
        )
        self.assertIn(
            {
                "source": "model",
                "target": "dashboard",
                "relation": "dashboard dataset",
            },
            lineage,
        )
        self.assertEqual(
            sum(
                edge["source"] == "flow" and edge["target"] == "model"
                for edge in lineage
            ),
            1,
        )
        self.assertFalse(any(edge["source"] == "outside" for edge in lineage))
        self.assertFalse(any(edge["source"] == edge["target"] for edge in lineage))

    def test_rejects_malformed_scanner_lineage_collections(self):
        cases = (
            ("relations", {}),
            ("upstreamDataflows", "invalid"),
            ("upstreamDatamarts", [None]),
            ("upstreamDatasets", [1]),
            ("tiles", {"datasetId": "model"}),
        )
        for name, value in cases:
            artifact_type = (
                "Dashboard"
                if name == "tiles"
                else "SemanticModel"
            )
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    function_app._official_lineage(
                        [
                        {
                            "id": "item",
                            "_type": artifact_type,
                            name: value,
                        }
                        ],
                        {"item"},
                        "workspace",
                    )

    def test_rejects_malformed_lineage_workspace_identifiers(self):
        for group_id in ([], {}, False, 0, ""):
            with self.subTest(group_id=group_id):
                with self.assertRaises(ValueError):
                    function_app._official_lineage(
                        [
                        {
                            "id": "source",
                            "_type": "Dataflow",
                        },
                        {
                            "id": "target",
                            "_type": "SemanticModel",
                            "upstreamDataflows": [
                                {
                                    "targetDataflowId": "source",
                                    "groupId": group_id,
                                }
                            ],
                        },
                        ],
                        {"source", "target"},
                        "workspace",
                    )


class SyncOrchestrationTests(unittest.TestCase):
    workspace_id = "11111111-1111-4111-8111-111111111111"

    def _run_sync(
        self,
        items,
        scan,
        role_assignments=None,
        jobs_error=None,
        defer_enrichment="",
        scanner_user_info=True,
    ):
        scan = copy.deepcopy(scan)
        if scanner_user_info:
            for values in scan.values():
                if not isinstance(values, list):
                    continue
                for value in values:
                    if isinstance(value, dict):
                        value.setdefault("users", [])
        role_assignments = role_assignments or [
            {
                "role": "Admin",
                "principal": {
                    "id": "admin-id",
                    "displayName": "Administrator",
                    "type": "User",
                },
            }
        ]

        def get_all(_token, path):
            if path.endswith("/items"):
                return items
            if path.endswith("/roleAssignments"):
                return role_assignments
            if "/jobs/instances" in path:
                if jobs_error:
                    raise jobs_error
                return []
            raise AssertionError(path)

        with (
            mock.patch.object(
                function_app,
                "_get",
                return_value={
                    "id": self.workspace_id,
                    "displayName": "Atlas workspace",
                },
            ),
            mock.patch.object(
                function_app,
                "_get_all",
                side_effect=get_all,
            ),
            mock.patch.object(
                function_app,
                "_scan_workspace",
                return_value=scan,
            ),
        ):
            return function_app.sync_all(
                "token",
                self.workspace_id,
                definitionToken="token",
                deferEnrichment=defer_enrichment,
            )

    def test_sync_all_can_defer_per_item_enrichment(self):
        items = [
            {
                "id": "flow",
                "type": "Dataflow",
                "displayName": "Flow",
            }
        ]
        scan = {"dataflows": [{"objectId": "flow"}]}

        with mock.patch.object(function_app, "_enrich_artifact") as enrich:
            result = self._run_sync(
                items,
                scan,
                defer_enrichment="true",
            )

        enrich.assert_not_called()
        self.assertEqual(result["syncMode"], "base")
        self.assertEqual(result["enrichmentItemIds"], ["flow"])
        self.assertEqual(result["jobs"], [])

    def test_sync_items_returns_completed_deep_metadata(self):
        sql_id = "22222222-2222-4222-8222-222222222222"
        items = [
            {
                "id": sql_id,
                "type": "SQLDatabase",
                "displayName": "SQL",
            }
        ]

        def get_all(_token, path):
            if path.endswith("/items"):
                return items
            if "/jobs/instances" in path:
                return []
            raise AssertionError(path)

        with (
            mock.patch.object(
                function_app,
                "_get_all",
                side_effect=get_all,
            ),
            mock.patch.object(
                function_app,
                "_enrich_artifact",
                side_effect=lambda _token, _ws, artifact, *_args, **_kwargs: (
                    artifact.update(
                        {
                            "sensitivity": {
                                "labelId": "label-1",
                                "displayName": "Confidential",
                            },
                            "tags": [{"id": "tag-1", "displayName": "Finance"}],
                        }
                    )
                ),
            ),
            mock.patch.object(
                function_app,
                "_item_schema",
                return_value=[
                    {
                        "name": "dbo.Customers",
                        "objectType": "SQL table",
                        "columns": [],
                        "measures": [],
                    }
                ],
            ),
            mock.patch.object(
                function_app,
                "_item_config",
                return_value=[
                    {
                        "itemId": sql_id,
                        "section": "SQL database",
                        "label": "Database",
                        "value": "SQL",
                    }
                ],
            ),
        ):
            result = function_app.sync_items(
                "token",
                self.workspace_id,
                json.dumps([sql_id]),
                correlationId=self.workspace_id,
            )

        self.assertEqual(result["correlationId"], self.workspace_id)
        self.assertEqual(result["completedItemIds"], [sql_id])
        self.assertEqual(result["remainingItemIds"], [])
        self.assertEqual(
            result["schema"][sql_id][0]["name"],
            "dbo.Customers",
        )
        self.assertEqual(len(result["config"]), 1)
        self.assertEqual(
            result["itemMetadata"][sql_id]["sensitivity"]["labelId"],
            "label-1",
        )
        self.assertEqual(
            result["itemMetadata"][sql_id]["tags"][0]["id"],
            "tag-1",
        )

    def test_deferred_storage_derivation_skips_lakehouse_detail_calls(self):
        storage = {
            "id": "lake",
            "_type": "Lakehouse",
        }

        with mock.patch.object(function_app, "_get") as get:
            endpoint_ids = function_app._storage_endpoint_ids(
                "token",
                self.workspace_id,
                storage,
                [storage],
                resolve_details=False,
            )

        get.assert_not_called()
        self.assertEqual(endpoint_ids, set())

    def test_storage_detail_permission_failures_remain_best_effort(self):
        storage = {
            "id": "66666666-6666-4666-8666-666666666666",
            "_type": "Lakehouse",
        }
        with mock.patch.object(
            function_app,
            "_get",
            side_effect=_http_error(403),
        ):
            self.assertEqual(
                function_app._storage_endpoint_ids(
                    "token",
                    self.workspace_id,
                    storage,
                    [storage],
                ),
                set(),
            )

        with mock.patch.object(
            function_app,
            "_get",
            side_effect=_http_error(500),
        ):
            with self.assertRaises(urllib.error.HTTPError):
                function_app._storage_endpoint_ids(
                    "token",
                    self.workspace_id,
                    storage,
                    [storage],
                )

    def test_sync_items_returns_a_continuation_before_the_deadline(self):
        one_id = "33333333-3333-4333-8333-333333333333"
        two_id = "44444444-4444-4444-8444-444444444444"
        items = [
            {"id": one_id, "type": "Lakehouse", "displayName": "One"},
            {"id": two_id, "type": "Lakehouse", "displayName": "Two"},
        ]
        processed = []

        class _Deadline:
            def remaining(self):
                return 20 if processed else 180

            def checkpoint(self, reserve_seconds=0):
                if self.remaining() <= reserve_seconds:
                    raise function_app.DeadlineExceeded(
                        "execution deadline exhausted"
                    )

        def get_all(_token, path):
            if path.endswith("/items"):
                return items
            if "/jobs/instances" in path:
                return []
            raise AssertionError(path)

        def enrich(_token, _ws, artifact, *_args, **_kwargs):
            processed.append(artifact["id"])

        with (
            mock.patch.object(
                function_app,
                "_ExecutionDeadline",
                return_value=_Deadline(),
            ),
            mock.patch.object(
                function_app,
                "_get_all",
                side_effect=get_all,
            ),
            mock.patch.object(
                function_app,
                "_enrich_artifact",
                side_effect=enrich,
            ),
            mock.patch.object(
                function_app,
                "_item_schema",
                return_value=[],
            ),
            mock.patch.object(
                function_app,
                "_item_config",
                return_value=[],
            ),
        ):
            result = function_app.sync_items(
                "token",
                self.workspace_id,
                json.dumps([one_id, two_id]),
            )

        self.assertEqual(result["completedItemIds"], [one_id])
        self.assertEqual(result["remainingItemIds"], [two_id])

    def test_sync_items_requeues_an_item_that_exhausts_its_slice(self):
        graph_id = "55555555-5555-4555-8555-555555555555"
        items = [
            {"id": graph_id, "type": "GraphModel", "displayName": "Graph"}
        ]

        def get_all(_token, path):
            if path.endswith("/items"):
                return items
            raise AssertionError(path)

        with (
            mock.patch.object(
                function_app,
                "_get_all",
                side_effect=get_all,
            ),
            mock.patch.object(
                function_app,
                "_enrich_artifact",
                side_effect=function_app.DeadlineExceeded(
                    "execution deadline exhausted"
                ),
            ),
        ):
            result = function_app.sync_items(
                "token",
                self.workspace_id,
                json.dumps([graph_id]),
            )

        self.assertEqual(result["completedItemIds"], [])
        self.assertEqual(result["remainingItemIds"], [graph_id])

    def test_sync_items_requeues_an_item_after_request_timeout(self):
        item_id = "77777777-7777-4777-8777-777777777777"
        with (
            mock.patch.object(
                function_app,
                "_get_all",
                return_value=[
                    {
                        "id": item_id,
                        "type": "GraphModel",
                        "displayName": "Graph",
                    }
                ],
            ),
            mock.patch.object(
                function_app,
                "_enrich_artifact",
                side_effect=function_app.RequestTimeout("slow response"),
            ),
        ):
            result = function_app.sync_items(
                "token",
                self.workspace_id,
                json.dumps([item_id]),
            )

        self.assertEqual(result["completedItemIds"], [])
        self.assertEqual(result["remainingItemIds"], [item_id])
        self.assertEqual(result["errors"], [])

    def test_sync_items_isolates_invalid_item_metadata(self):
        item_id = "88888888-8888-4888-8888-888888888888"

        def get_all(_token, path):
            if path.endswith("/items"):
                return [
                    {
                        "id": item_id,
                        "type": "SQLDatabase",
                        "displayName": "SQL",
                    }
                ]
            if "/jobs/instances" in path:
                return []
            raise AssertionError(path)

        with (
            mock.patch.object(
                function_app,
                "_get_all",
                side_effect=get_all,
            ),
            mock.patch.object(function_app, "_enrich_artifact"),
            mock.patch.object(
                function_app,
                "_item_schema",
                side_effect=ValueError("unexpected order"),
            ),
        ):
            result = function_app.sync_items(
                "token",
                self.workspace_id,
                json.dumps([item_id]),
            )

        self.assertEqual(result["completedItemIds"], [item_id])
        self.assertEqual(result["remainingItemIds"], [])
        self.assertEqual(result["itemFailures"], {item_id: "invalid-response"})
        self.assertEqual(
            result["errors"],
            [f"enrichment:{item_id}: invalid-response"],
        )

    def test_sync_items_rejects_non_uuid_item_ids(self):
        with self.assertRaisesRegex(ValueError, "valid UUID"):
            function_app.sync_items(
                "token",
                self.workspace_id,
                '["not-an-item-id"]',
            )

        with self.assertRaisesRegex(ValueError, "valid UUID"):
            function_app.sync_items(
                "token",
                self.workspace_id,
                json.dumps([
                    "99999999-9999-4999-8999-999999999999",
                ]),
                correlationId="not-a-correlation-id",
            )

    def test_role_assignment_preserves_guest_evidence(self):
        result = function_app._sanitize_role_assignment({
            "role": "Viewer",
            "principal": {
                "id": "99999999-9999-4999-8999-999999999999",
                "displayName": "Guest User",
                "type": "User",
                "userType": "Guest",
                "userDetails": {
                    "userPrincipalName": "guest@example.com",
                    "userType": "Guest",
                },
            },
        })

        self.assertEqual(result["principal"]["userType"], "Guest")
        self.assertEqual(
            result["principal"]["userDetails"]["userType"],
            "Guest",
        )

    def test_sync_all_returns_v2_envelope_and_keeps_top_level_items(self):
        items = [
            {
                "id": "flow",
                "type": "Dataflow",
                "displayName": "Flow",
                "businessRows": [{"secret": True}],
            },
            {
                "id": "model",
                "type": "SemanticModel",
                "displayName": "Model",
            },
            {
                "id": "dashboard",
                "type": "Dashboard",
                "displayName": "Dashboard",
            },
            {
                "id": "unknown",
                "type": "FutureFabricItem",
                "displayName": "Future",
            },
        ]
        scan = {
            "dataflows": [{"objectId": "flow"}],
            "datasets": [
                {
                    "id": "model",
                    "tables": [
                        {
                            "name": "Sales",
                            "rows": [{"secret": "business row"}],
                            "measures": [
                                {
                                    "name": "Revenue",
                                    "expression": "SUM(Sales[Amount])",
                                }
                            ],
                        }
                    ],
                    "upstreamDataflows": [
                        {"targetDataflowId": "flow"}
                    ],
                    "users": [
                        {
                            "graphId": "principal-id",
                            "displayName": "Reader",
                            "principalType": "User",
                            "datasetUserAccessRight": "Read",
                        },
                        {
                            "identifier": "EntireTenant",
                            "displayName": "EntireTenant",
                            "principalType": "None",
                            "userType": "EntireTenant",
                            "datasetUserAccessRight": "Read",
                        },
                    ],
                    "configuredBy": "builder@example.com",
                    "modifiedBy": "editor@example.com",
                    "endorsementDetails": {
                        "endorsement": "Certified",
                        "certifiedBy": "certifier@example.com",
                    },
                    "sensitivityLabel": {"labelId": "label-id"},
                    "tags": [{"id": "tag-id"}],
                }
            ],
            "dashboards": [
                {
                    "id": "dashboard",
                    "tiles": [{"datasetId": "model"}],
                }
            ],
        }

        result = self._run_sync(items, scan)

        self.assertEqual(result["schemaVersion"], 2)
        self.assertEqual(
            result["capabilities"],
            {
                "endorsement": {"status": "complete"},
                "sensitivity": {"status": "complete", "code": "label-ids"},
                "tags": {"status": "complete", "code": "tag-ids"},
                "ownership": {"status": "complete", "code": "type-specific"},
                "definitionEnrichment": {
                    "status": "unsupported",
                    "code": "not-applicable",
                },
                "kqlSchema": {
                    "status": "unsupported",
                    "code": "not-applicable",
                },
                "sqlSchema": {
                    "status": "unsupported",
                    "code": "not-applicable",
                },
                "objectLineage": {"status": "complete"},
            },
        )
        self.assertEqual(
            [item["id"] for item in result["items"]],
            ["flow", "model", "dashboard", "unknown"],
        )
        self.assertNotIn("businessRows", result["items"][0])
        self.assertEqual(
            result["schema"]["model"][0]["measures"][0]["expression"],
            "SUM(Sales[Amount])",
        )
        self.assertNotIn("rows", result["schema"]["model"][0])
        self.assertEqual(
            result["itemMetadata"]["model"]["configuredBy"],
            "builder@example.com",
        )
        self.assertEqual(result["access"][0]["principalId"], "principal-id")
        self.assertEqual(result["access"][1]["principalId"], "entire-tenant")
        self.assertTrue(result["access"][1]["tenantWide"])
        self.assertIn(
            {"source": "flow", "target": "model", "relation": "dataflow"},
            result["lineage"],
        )
        for section in (
            "workspace",
            "items",
            "roleAssignments",
            "scanner",
            "schema",
            "lineage",
            "access",
            "config",
        ):
            self.assertEqual(
                result["sections"][section]["status"],
                "complete",
            )
        self.assertEqual(
            set(result["sections"]),
            {
                "workspace",
                "items",
                "roleAssignments",
                "scanner",
                "schema",
                "lineage",
                "access",
                "config",
                "jobs",
                "itemDetails",
                "lakehouseTables",
                "reportPages",
                "definitions",
                "kqlSchema",
                "sqlSchema",
            },
        )

    def test_sync_all_marks_malformed_lineage_as_failed(self):
        result = self._run_sync(
            [
                {
                    "id": "model",
                    "type": "SemanticModel",
                    "displayName": "Model",
                }
            ],
            {
                "datasets": [
                    {
                        "id": "model",
                        "upstreamDatasets": {},
                    }
                ]
            },
        )

        self.assertEqual(result["lineage"], [])
        self.assertEqual(
            result["sections"]["lineage"],
            {"status": "failed", "code": "invalid-response"},
        )
        self.assertIn("lineage: invalid-response", result["errors"])
        serialized = json.dumps(result)
        self.assertNotIn("business row", serialized)
        self.assertNotIn("datasourceDetails", serialized)
        self.assertNotIn("datasetExpressions", serialized)

    def test_empty_successful_workspace_has_complete_required_sections(self):
        result = self._run_sync([], {})

        self.assertEqual(result["items"], [])
        self.assertEqual(result["schema"], {})
        self.assertEqual(result["lineage"], [])
        self.assertEqual(result["access"], [])
        self.assertEqual(result["config"], [])
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["sections"]["scanner"]["status"], "complete")
        self.assertEqual(result["sections"]["schema"]["status"], "complete")

    def test_optional_unsupported_jobs_do_not_fail_required_snapshot(self):
        result = self._run_sync(
            [
                {
                    "id": "model",
                    "type": "SemanticModel",
                    "displayName": "Model",
                }
            ],
            {"datasets": [{"id": "model", "tables": []}]},
            jobs_error=_http_error(404),
        )

        self.assertEqual(
            result["sections"]["jobs"],
            {"status": "unsupported", "code": "endpoint-unsupported"},
        )
        self.assertEqual(result["sections"]["scanner"]["status"], "complete")
        self.assertEqual(result["sections"]["config"]["status"], "complete")
        self.assertEqual(result["errors"], [])

    def test_missing_scanner_user_information_is_not_complete_access(self):
        result = self._run_sync(
            [
                {
                    "id": "model",
                    "type": "SemanticModel",
                    "displayName": "Model",
                }
            ],
            {"datasets": [{"id": "model", "tables": []}]},
            scanner_user_info=False,
        )

        self.assertEqual(
            result["sections"]["access"],
            {
                "status": "failed",
                "code": "scanner-user-information-unavailable",
            },
        )
        self.assertIn(
            "access: scanner-user-information-unavailable",
            result["errors"],
        )

    def test_optional_transient_job_failure_uses_safe_code(self):
        result = self._run_sync(
            [
                {
                    "id": "model",
                    "type": "SemanticModel",
                    "displayName": "Model",
                }
            ],
            {"datasets": [{"id": "model", "tables": []}]},
            jobs_error=_http_error(503),
        )

        self.assertEqual(
            result["sections"]["jobs"],
            {"status": "failed", "code": "transient-upstream"},
        )
        self.assertEqual(result["errors"], ["jobs: transient-upstream"])
        self.assertNotIn("safe test error", json.dumps(result))

    def test_scanner_failure_marks_required_sections_with_safe_errors(self):
        with (
            mock.patch.object(
                function_app,
                "_get",
                return_value={
                    "id": self.workspace_id,
                    "displayName": "Atlas workspace",
                },
            ),
            mock.patch.object(
                function_app,
                "_get_all",
                side_effect=lambda _token, path: (
                    []
                    if path.endswith("/items")
                    else [
                        {
                            "role": "Admin",
                            "principal": {
                                "id": "admin",
                                "displayName": "Admin",
                                "type": "User",
                            },
                        }
                    ]
                ),
            ),
            mock.patch.object(
                function_app,
                "_scan_workspace",
                side_effect=RuntimeError("secret tenant detail"),
            ),
        ):
            result = function_app.sync_all("token", self.workspace_id)

        self.assertEqual(result["sections"]["scanner"]["status"], "failed")
        self.assertEqual(result["sections"]["access"]["status"], "failed")
        self.assertEqual(
            result["capabilities"]["endorsement"],
            {"status": "failed", "code": "upstream-failure"},
        )
        self.assertEqual(
            result["capabilities"]["ownership"],
            {"status": "failed", "code": "upstream-failure"},
        )
        self.assertNotIn("secret tenant detail", json.dumps(result))

    def test_definition_permission_failure_preserves_other_item_enrichment(self):
        ontology_id = "22222222-2222-4222-8222-222222222222"
        graph_id = "33333333-3333-4333-8333-333333333333"
        ontology_definition = {
            "definition": {
                "parts": [
                    _definition_part(
                        "EntityTypes/101/definition.json",
                        {
                            "id": "101",
                            "name": "Customer",
                            "properties": [
                                {
                                    "id": "201",
                                    "name": "CustomerId",
                                    "valueType": "String",
                                }
                            ],
                        },
                    )
                ]
            }
        }

        def get_definition(
            _token,
            _workspace,
            artifact_type,
            _artifact_id,
        ):
            if artifact_type == "Ontology":
                return ontology_definition
            raise _http_error(403)

        with mock.patch.object(
            function_app,
            "_get_definition",
            side_effect=get_definition,
        ):
            result = self._run_sync(
                [
                    {
                        "id": ontology_id,
                        "type": "Ontology",
                        "displayName": "Sales ontology",
                    },
                    {
                        "id": graph_id,
                        "type": "GraphModel",
                        "displayName": "Sales graph",
                    },
                ],
                {},
            )

        self.assertEqual(
            result["sections"]["definitions"],
            {"status": "complete", "code": "partial-unsupported"},
        )
        self.assertEqual(result["sections"]["config"]["status"], "complete")
        self.assertEqual(result["sections"]["schema"]["status"], "complete")
        serialized = json.dumps(result["config"])
        self.assertIn("Ontology entity types", serialized)
        self.assertIn("read-write-permission-required", serialized)
        self.assertEqual(
            result["schema"][ontology_id][0]["objectType"],
            "Ontology entity",
        )
        self.assertIn("objectId", result["schema"][ontology_id][0])
        self.assertIn(
            "parentObjectId",
            result["schema"][ontology_id][0]["columns"][0],
        )
        self.assertEqual(
            result["artifactMetadata"][ontology_id]["kind"],
            "ontology",
        )
        self.assertNotIn(
            "artifactMetadata",
            result["itemMetadata"][ontology_id],
        )
        self.assertEqual(
            result["objectEdges"],
            [
                {
                    "source": {
                        "itemId": ontology_id,
                        "kind": "entityType",
                        "id": function_app._fabric_object_id(
                            ontology_id,
                            "ontology-entity",
                            "101",
                        ),
                        "name": "Customer",
                    },
                    "target": {
                        "itemId": ontology_id,
                        "kind": "property",
                        "id": function_app._fabric_object_id(
                            ontology_id,
                            "ontology-property",
                            "201",
                        ),
                        "name": "CustomerId",
                        "parentId": function_app._fabric_object_id(
                            ontology_id,
                            "ontology-entity",
                            "101",
                        ),
                        "tableName": "Customer",
                    },
                    "relation": "contains",
                    "confidence": "verified",
                }
            ],
        )
        self.assertEqual(result["errors"], [])


class OptionalEndpointStatusTests(unittest.TestCase):
    def _trackers(self):
        return {
            "itemDetails": function_app._new_optional_tracker(),
            "lakehouseTables": function_app._new_optional_tracker(),
            "reportPages": function_app._new_optional_tracker(),
        }

    def test_lakehouse_optional_404s_are_unsupported_not_failed(self):
        trackers = self._trackers()
        errors = []
        with (
            mock.patch.object(
                function_app,
                "_get",
                side_effect=_http_error(404),
            ),
            mock.patch.object(
                function_app,
                "_get_all_data",
                side_effect=_http_error(404),
            ),
        ):
            function_app._enrich_artifact(
                "token",
                "workspace",
                {"id": "lake", "_type": "Lakehouse"},
                trackers,
                errors,
            )

        out = {"sections": {}, "errors": errors}
        function_app._finish_optional_section(
            out,
            "itemDetails",
            trackers["itemDetails"],
        )
        function_app._finish_optional_section(
            out,
            "lakehouseTables",
            trackers["lakehouseTables"],
        )
        self.assertEqual(
            out["sections"]["itemDetails"]["status"],
            "unsupported",
        )
        self.assertEqual(
            out["sections"]["lakehouseTables"]["status"],
            "unsupported",
        )
        self.assertEqual(errors, [])

    def test_paginated_report_pages_are_explicitly_unsupported(self):
        trackers = self._trackers()
        errors = []
        function_app._enrich_artifact(
            "token",
            "workspace",
            {
                "id": "report",
                "_type": "Report",
                "reportType": "PaginatedReport",
            },
            trackers,
            errors,
        )
        out = {"sections": {}, "errors": errors}
        function_app._finish_optional_section(
            out,
            "reportPages",
            trackers["reportPages"],
        )
        self.assertEqual(
            out["sections"]["reportPages"],
            {"status": "unsupported", "code": "report-type-unsupported"},
        )
        self.assertEqual(errors, [])

    def test_report_page_5xx_is_failed_with_safe_code(self):
        trackers = self._trackers()
        errors = []
        with mock.patch.object(
            function_app,
            "_get",
            side_effect=_http_error(503),
        ):
            function_app._enrich_artifact(
                "token",
                "workspace",
                {"id": "report", "_type": "Report"},
                trackers,
                errors,
            )
        out = {"sections": {}, "errors": errors}
        function_app._finish_optional_section(
            out,
            "reportPages",
            trackers["reportPages"],
        )
        self.assertEqual(
            out["sections"]["reportPages"],
            {"status": "failed", "code": "transient-upstream"},
        )
        self.assertEqual(errors, ["reportPages: transient-upstream"])


class PaginationAndScannerOptionTests(unittest.TestCase):
    def test_value_pagination_supports_continuation_uri(self):
        first = "https://api.fabric.microsoft.com/v1/items"
        second = first + "?continuationToken=next"
        responses = {
            first: {"value": [{"id": "one"}], "continuationUri": second},
            second: {"value": [{"id": "two"}]},
        }
        with mock.patch.object(
            function_app,
            "_get",
            side_effect=lambda _token, url: responses[url],
        ):
            values = function_app._get_all("token", "/items")
        self.assertEqual([value["id"] for value in values], ["one", "two"])

    def test_scanner_request_excludes_sensitive_unused_options(self):
        calls = []

        def request(_token, url, method="GET", body=None):
            calls.append((url, method, body))
            return {"id": "scan-id"}

        def get(_token, url):
            if "/scanStatus/" in url:
                return {"status": "Succeeded"}
            return {"workspaces": [{"id": "workspace"}]}

        with (
            mock.patch.object(function_app, "_req", side_effect=request),
            mock.patch.object(function_app, "_get", side_effect=get),
        ):
            function_app._scan_workspace("token", "workspace")

        scanner_url = calls[0][0]
        self.assertIn("datasetSchema=True", scanner_url)
        self.assertIn("datasetExpressions=True", scanner_url)
        self.assertIn("lineage=True", scanner_url)
        self.assertIn("getArtifactUsers=True", scanner_url)
        self.assertNotIn("datasourceDetails", scanner_url)


if __name__ == "__main__":
    unittest.main()
