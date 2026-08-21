import pytest

from dbt.tests.adapter.dbt_show.fixtures import (
    models__second_ephemeral_model,
)
from dbt.tests.adapter.dbt_show.test_dbt_show import (
    BaseShowLimit,
    BaseShowSqlHeader,
)
from dbt.tests.util import run_dbt


class TestFabricShowLimit(BaseShowLimit):
    @pytest.mark.parametrize(
        "args,expected",
        [
            ([], 5),  # default limit
            (["--limit", 3], 3),  # fetch 3 rows
            (["--limit", -1], 7),  # fetch all rows
        ],
    )
    def test_limit(self, project, args, expected):
        run_dbt(["build"])
        dbt_args = ["show", "--inline", models__second_ephemeral_model, *args]
        results = run_dbt(dbt_args)
        assert len(results.results[0].agate_table) == expected
        # ensure limit was injected in compiled_code when limit specified in command args
        limit = results.args.get("limit")
        if limit > 0:
            assert (
                f"offset 0 rows fetch first {limit} rows only"
                in results.results[0].node.compiled_code
            )


class TestFabricShowSqlHeader(BaseShowSqlHeader):
    pass
