import pytest

from dbt.tests.util import run_dbt

seed_csv = """id,name,value
1,alice,100
2,bob,200
3,charlie,300
""".lstrip()

model_sql = """
select * from {{ ref('test_seed') }}
"""


class TestRowsAffected:
    @pytest.fixture(scope="class")
    def seeds(self):
        return {"test_seed.csv": seed_csv}

    @pytest.fixture(scope="class")
    def models(self):
        return {"test_model.sql": model_sql}

    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "name": "test_rows_affected",
            "models": {"+materialized": "table"},
        }

    def test_rows_affected_is_positive(self, project, logs_dir):
        run_dbt(["seed"])
        results = run_dbt(["run"])
        assert len(results) == 1
        result = results[0]
        assert result.adapter_response["rows_affected"] > 0, (
            f"Expected rows_affected > 0, got {result.adapter_response['rows_affected']}"
        )
