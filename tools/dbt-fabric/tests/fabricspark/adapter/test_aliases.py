import pytest

from dbt.tests.adapter.aliases.fixtures import MACROS__EXPECT_VALUE_SQL
from dbt.tests.adapter.aliases.test_aliases import (
    BaseAliasErrors,
    BaseAliases,
    BaseSameAliasDifferentDatabases,
    BaseSameAliasDifferentSchemas,
)


class TestAliasesFabricSpark(BaseAliases):
    @pytest.fixture(scope="class")
    def macros(self):
        return {"expect_value.sql": MACROS__EXPECT_VALUE_SQL}


class TestAliasErrorsFabricSpark(BaseAliasErrors):
    @pytest.fixture(scope="class")
    def macros(self):
        return {"expect_value.sql": MACROS__EXPECT_VALUE_SQL}


class TestSameAliasDifferentSchemasFabricSpark(BaseSameAliasDifferentSchemas):
    @pytest.fixture(scope="class")
    def macros(self):
        return {"expect_value.sql": MACROS__EXPECT_VALUE_SQL}


class TestSameAliasDifferentDatabasesFabricSpark(BaseSameAliasDifferentDatabases):
    @pytest.fixture(scope="class")
    def macros(self):
        return {"expect_value.sql": MACROS__EXPECT_VALUE_SQL}
