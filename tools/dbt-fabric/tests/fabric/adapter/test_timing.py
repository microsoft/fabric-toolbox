import json

import pytest

from dbt.tests.util import get_run_results, run_dbt, run_dbt_and_capture

MODEL_SQL = """
{{ config(materialized='table') }}
select 1 as id
"""

ON_RUN_END_MACRO = """
{% macro log_timing_info(results) %}
    {% set timing_data = [] %}
    {% for result in results %}
        {% set entry = {
            "unique_id": result.node.unique_id,
            "timings": []
        } %}
        {% for timing in result.timing %}
            {% do entry["timings"].append({
                "name": timing.name,
                "has_started_at": timing.started_at is not none,
                "has_completed_at": timing.completed_at is not none
            }) %}
        {% endfor %}
        {% do timing_data.append(entry) %}
    {% endfor %}
    {{ log("TIMING_JSON=" ~ tojson(timing_data), info=true) }}
{% endmacro %}
"""


class TestModelTimingPopulated:
    @pytest.fixture(scope="class")
    def models(self):
        return {"timing_model.sql": MODEL_SQL}

    @pytest.fixture(scope="class")
    def macros(self):
        return {"log_timing_info.sql": ON_RUN_END_MACRO}

    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "on-run-end": ["{{ log_timing_info(results) }}"],
        }

    def test_run_result_timing_populated(self, project):
        results = run_dbt(["run"])

        model_result = [r for r in results if r.node.name == "timing_model"][0]

        assert len(model_result.timing) >= 2, (
            f"Expected at least 2 timing entries (compile + execute), got {len(model_result.timing)}"
        )

        timing_names = {t.name for t in model_result.timing}
        assert "compile" in timing_names, "Missing 'compile' timing entry"
        assert "execute" in timing_names, "Missing 'execute' timing entry"

        for timing in model_result.timing:
            assert timing.started_at is not None, f"Timing '{timing.name}' has no started_at"
            assert timing.completed_at is not None, f"Timing '{timing.name}' has no completed_at"
            assert timing.completed_at >= timing.started_at, (
                f"Timing '{timing.name}': completed_at before started_at"
            )

    def test_run_results_json_timing(self, project):
        run_results = get_run_results(project.project_root)
        assert run_results is not None

        model_results = [
            r for r in run_results["results"] if r["unique_id"] == "model.test.timing_model"
        ]
        assert len(model_results) == 1
        result = model_results[0]

        assert len(result["timing"]) >= 2

        for entry in result["timing"]:
            assert entry["name"] in ("compile", "execute")
            assert entry["started_at"] is not None
            assert entry["completed_at"] is not None

    def test_on_run_end_timing_accessible(self, project):
        results, log_output = run_dbt_and_capture(["run"])

        assert "TIMING_JSON=" in log_output
        json_str = log_output.split("TIMING_JSON=")[1].split("\n")[0].strip()
        timing_data = json.loads(json_str)

        model_entries = [e for e in timing_data if e["unique_id"] == "model.test.timing_model"]
        assert len(model_entries) == 1
        entry = model_entries[0]

        assert len(entry["timings"]) >= 2
        timing_names = {t["name"] for t in entry["timings"]}
        assert "compile" in timing_names
        assert "execute" in timing_names

        for timing in entry["timings"]:
            assert timing["has_started_at"] is True, (
                f"Timing '{timing['name']}' not accessible in on-run-end context"
            )
            assert timing["has_completed_at"] is True, (
                f"Timing '{timing['name']}' not accessible in on-run-end context"
            )
