import pytest

from dbt.tests.adapter.utils.fixture_get_intervals_between import (
    models__test_get_intervals_between_yml,
)
from dbt.tests.adapter.utils.test_get_intervals_between import BaseGetIntervalsBetween


class TestGetIntervalsBetweenFabricSpark(BaseGetIntervalsBetween):
    model_sql = """
        SELECT
            {{ get_intervals_between("'2023-09-01'", "'2023-09-12'", "day") }} as intervals,
            11 as expected
    """

    @pytest.fixture(scope="class")
    def models(self):
        return {
            "test_get_intervals_between.yml": models__test_get_intervals_between_yml,
            "test_get_intervals_between.sql": self.interpolate_macro_namespace(
                self.model_sql, "get_intervals_between"
            ),
        }
