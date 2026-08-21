from pathlib import Path

import pytest

from dbt.tests.util import run_dbt, run_dbt_and_capture

model_single = """
{{ config(materialized='table', clustered_by='id') }}
select 1 as id, 'blue' as color
"""

model_multi = """
{{ config(materialized='table', clustered_by=['id', 'color']) }}
select 1 as id, 'blue' as color
"""

model_no_cluster = """
{{ config(materialized='table') }}
select 1 as id, 'blue' as color
"""

model_hive_bucketing = """
{{ config(materialized='table', clustered_by=['id'], buckets=4) }}
select 1 as id, 'blue' as color
"""

model_cluster_partition_conflict = """
{{ config(materialized='table', clustered_by=['id'], partition_by=['color']) }}
select 1 as id, 'blue' as color
"""


def _read_compiled_sql(project, model_name):
    run_dir = Path(project.project_root) / "target" / "run"
    candidates = list(run_dir.rglob(f"{model_name}.sql"))
    assert candidates, f"No compiled SQL found for {model_name} in {run_dir}"
    return candidates[0].read_text()


class TestClusteredBySingleColumn:
    @pytest.fixture(scope="class")
    def models(self):
        return {"model_single.sql": model_single}

    def test_clustered_by_single(self, project):
        results = run_dbt(["run"])
        assert len(results) == 1
        assert results[0].status == "success"

        compiled_sql = _read_compiled_sql(project, "model_single")
        assert "cluster by" in compiled_sql.lower()
        assert "id" in compiled_sql
        assert "buckets" not in compiled_sql.lower()


class TestClusteredByMultipleColumns:
    @pytest.fixture(scope="class")
    def models(self):
        return {"model_multi.sql": model_multi}

    def test_clustered_by_multi(self, project):
        results = run_dbt(["run"])
        assert len(results) == 1
        assert results[0].status == "success"

        compiled_sql = _read_compiled_sql(project, "model_multi")
        lowered = compiled_sql.lower()
        assert "cluster by" in lowered
        assert "id" in lowered
        assert "color" in lowered
        assert "buckets" not in lowered


class TestNoClusteredBy:
    @pytest.fixture(scope="class")
    def models(self):
        return {"model_no_cluster.sql": model_no_cluster}

    def test_no_clustered_by(self, project):
        results = run_dbt(["run"])
        assert len(results) == 1
        assert results[0].status == "success"

        compiled_sql = _read_compiled_sql(project, "model_no_cluster")
        assert "cluster by" not in compiled_sql.lower()


class TestClusteredByWithBuckets:
    """`clustered_by` + `buckets` falls back to Hive bucketing (unchanged dbt-spark).

    Fabric Lakehouse is Delta-only and Delta rejects Hive bucketing at runtime
    (`DELTA_OPERATION_NOT_ALLOWED_DETAIL: Bucketing is not supported for Delta tables`).
    `target/run/` is written before execution, so the run fails but the compiled
    DDL is still on disk and proves the macro emitted Hive bucketing. The error
    message itself is a second proof point.
    """

    @pytest.fixture(scope="class")
    def models(self):
        return {"model_hive.sql": model_hive_bucketing}

    def test_hive_bucketing(self, project):
        _, log_output = run_dbt_and_capture(["run"], expect_pass=False)
        lowered_log = log_output.lower()
        assert "bucketing" in lowered_log and "not supported for delta" in lowered_log

        compiled_sql = _read_compiled_sql(project, "model_hive")
        lowered = compiled_sql.lower()
        assert "clustered by" in lowered
        assert "into 4 buckets" in lowered


class TestClusteredByPartitionConflict:
    """Delta `clustered_by` + `partition_by` must raise at compile time."""

    @pytest.fixture(scope="class")
    def models(self):
        return {"model_conflict.sql": model_cluster_partition_conflict}

    def test_run_error(self, project):
        _, log_output = run_dbt_and_capture(["run"], expect_pass=False)
        assert "clustered_by" in log_output
        assert "partition_by" in log_output
