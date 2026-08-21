import pytest

from dbt.tests.adapter.aliases.fixtures import MACROS__EXPECT_VALUE_SQL
from dbt.tests.adapter.aliases.test_aliases import (
    BaseAliasErrors,
    BaseAliases,
    BaseSameAliasDifferentDatabases,
    BaseSameAliasDifferentSchemas,
)


class TestAliasesFabric(BaseAliases):
    @pytest.fixture(scope="class")
    def macros(self):
        return {"expect_value.sql": MACROS__EXPECT_VALUE_SQL}


class TestAliasErrorsFabric(BaseAliasErrors):
    @pytest.fixture(scope="class")
    def macros(self):
        return {"expect_value.sql": MACROS__EXPECT_VALUE_SQL}


class TestSameAliasDifferentSchemasFabric(BaseSameAliasDifferentSchemas):
    @pytest.fixture(scope="class")
    def macros(self):
        return {"expect_value.sql": MACROS__EXPECT_VALUE_SQL}


class TestSameAliasDifferentDatabasesFabric(BaseSameAliasDifferentDatabases):
    @pytest.fixture(scope="class")
    def macros(self):
        return {"expect_value.sql": MACROS__EXPECT_VALUE_SQL}
