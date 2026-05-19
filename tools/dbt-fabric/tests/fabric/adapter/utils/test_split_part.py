import pytest

from dbt.tests.adapter.utils.test_split_part import BaseSplitPart


class TestSplitPartFabric(BaseSplitPart):
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "models": {
                "+materialized": "table"  # no support for nested CTEs in Views yet
            },
        }
