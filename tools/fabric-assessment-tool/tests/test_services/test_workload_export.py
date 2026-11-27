import json

from fabric_assessment_tool.services.structured_export_service import JSONExporter


def test_redacted_pool_export_removes_command_text(tmp_path):
    data = {
        "workspace_info": {},
        "sql_pools": {
            "dedicated_pools": [
                {
                    "name": "pool1",
                    "workload": {
                        "sql_text_redacted": True,
                        "requests": [
                            {
                                "request_id": "QID1",
                                "command": None,
                                "json_response": {"command": "SELECT secret"},
                            }
                        ],
                    },
                }
            ]
        },
    }

    JSONExporter()._export_synapse_details(data, tmp_path)
    output = json.loads(
        (tmp_path / "resources" / "sql_pools" / "dedicated_pool_pool1.json").read_text()
    )

    serialized = json.dumps(output)
    assert '"command"' not in serialized
    assert "SELECT secret" not in serialized


def test_opt_in_pool_export_preserves_command_text(tmp_path):
    data = {
        "workspace_info": {},
        "sql_pools": {
            "dedicated_pools": [
                {
                    "name": "pool1",
                    "workload": {
                        "sql_text_redacted": False,
                        "requests": [{"request_id": "QID1", "command": "SELECT 1"}],
                    },
                }
            ]
        },
    }

    JSONExporter()._export_synapse_details(data, tmp_path)
    output = json.loads(
        (tmp_path / "resources" / "sql_pools" / "dedicated_pool_pool1.json").read_text()
    )

    assert output["pool_data"]["workload"]["requests"][0]["command"] == "SELECT 1"
