import pytest

from dbt.tests.adapter.store_test_failures_tests import fixtures
from dbt.tests.adapter.store_test_failures_tests.basic import (
    StoreTestFailuresAsExceptions,
    StoreTestFailuresAsGeneric,
    StoreTestFailuresAsInteractions,
    StoreTestFailuresAsProjectLevelEphemeral,
    StoreTestFailuresAsProjectLevelOff,
    StoreTestFailuresAsProjectLevelView,
)
from dbt.tests.adapter.store_test_failures_tests.test_store_test_failures import (
    BaseStoreTestFailures,
    BaseStoreTestFailuresLimit,
)

tests__passing_test = """
select * from {{ ref('fine_model') }}
where 1=0
"""


class TestFabricStoreTestFailures(BaseStoreTestFailures):
    @pytest.fixture(scope="class")
    def tests(self):
        return {
            "failing_test.sql": fixtures.tests__failing_test,
            "passing_test.sql": tests__passing_test,
        }


class TestFabricStoreTestFailuresAsGeneric(StoreTestFailuresAsGeneric):
    pass


class TestFabricStoreTestFailuresAsExceptions(StoreTestFailuresAsExceptions):
    pass


class TestFabricStoreTestFailuresAsInteractions(StoreTestFailuresAsInteractions):
    pass


class TestFabricStoreTestFailuresAsProjectLevelEphemeral(StoreTestFailuresAsProjectLevelEphemeral):
    pass


class TestFabricStoreTestFailuresAsProjectLevelOff(StoreTestFailuresAsProjectLevelOff):
    pass


class TestFabricStoreTestFailuresAsProjectLevelView(StoreTestFailuresAsProjectLevelView):
    pass


class TestFabricStoreTestFailuresLimit(BaseStoreTestFailuresLimit):
    pass
