from pathlib import Path

import pytest

from dbt.tests.util import run_dbt

model_single_cluster = """
{{ config(materialized='table', cluster_by='id') }}
select 1 as id, 'blue' as color
"""

model_multi_cluster = """
{{ config(materialized='table', cluster_by=['id', 'color']) }}
select 1 as id, 'blue' as color, cast('2024-01-01' as date) as date_day
"""

model_no_cluster = """
{{ config(materialized='table') }}
select 1 as id, 'blue' as color
"""

model_cluster_contract = """
{{ config(materialized='table', cluster_by=['id', 'color']) }}
select 1 as id, cast('blue' as varchar(100)) as color
"""

model_cluster_contract_schema = """
version: 2
models:
  - name: model_cluster_contract
    config:
      contract:
        enforced: true
    columns:
      - name: id
        data_type: int
      - name: color
        data_type: varchar(100)
"""

model_cluster_incremental = """
{{ config(materialized='incremental', cluster_by=['id'], unique_key='id') }}
select 1 as id, 'blue' as color
"""


def _read_compiled_sql(project, model_name):
    run_dir = Path(project.project_root) / "target" / "run"
    candidates = list(run_dir.rglob(f"{model_name}.sql"))
    assert candidates, f"No compiled SQL found for {model_name} in {run_dir}"
    return candidates[0].read_text()


class TestClusterBySingleColumn:
    @pytest.fixture(scope="class")
    def models(self):
        return {"model_single.sql": model_single_cluster}

    def test_cluster_by_single(self, project):
        results = run_dbt(["run"])
        assert len(results) == 1
        assert results[0].status == "success"

        compiled_sql = _read_compiled_sql(project, "model_single")
        assert "CLUSTER BY" in compiled_sql
        assert "[id]" in compiled_sql


class TestClusterByMultipleColumns:
    @pytest.fixture(scope="class")
    def models(self):
        return {"model_multi.sql": model_multi_cluster}

    def test_cluster_by_multi(self, project):
        results = run_dbt(["run"])
        assert len(results) == 1
        assert results[0].status == "success"

        compiled_sql = _read_compiled_sql(project, "model_multi")
        assert "CLUSTER BY" in compiled_sql
        assert "[id]" in compiled_sql
        assert "[color]" in compiled_sql


class TestClusterByNoCluster:
    @pytest.fixture(scope="class")
    def models(self):
        return {"model_no_cluster.sql": model_no_cluster}

    def test_no_cluster_by(self, project):
        results = run_dbt(["run"])
        assert len(results) == 1
        assert results[0].status == "success"

        compiled_sql = _read_compiled_sql(project, "model_no_cluster")
        assert "CLUSTER BY" not in compiled_sql


class TestClusterByWithContract:
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "model_cluster_contract.sql": model_cluster_contract,
            "schema.yml": model_cluster_contract_schema,
        }

    def test_cluster_by_with_contract(self, project):
        results = run_dbt(["run"])
        assert len(results) == 1
        assert results[0].status == "success"

        compiled_sql = _read_compiled_sql(project, "model_cluster_contract")
        assert "CLUSTER BY" in compiled_sql
        assert "[id]" in compiled_sql
        assert "[color]" in compiled_sql


class TestClusterByIncremental:
    @pytest.fixture(scope="class")
    def models(self):
        return {"model_cluster_incr.sql": model_cluster_incremental}

    def test_cluster_by_incremental(self, project):
        results = run_dbt(["run"])
        assert len(results) == 1
        assert results[0].status == "success"

        compiled_sql = _read_compiled_sql(project, "model_cluster_incr")
        assert "CLUSTER BY" in compiled_sql
        assert "[id]" in compiled_sql

        results = run_dbt(["run"])
        assert len(results) == 1
        assert results[0].status == "success"
