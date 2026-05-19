import pytest
from dbt_common.events.base_types import EventMsg

import dbt.tests.adapter.functions.files as files
from dbt.tests.adapter.functions.test_udafs import (
    BasicPythonUDAF,
    BasicSQLUDAF,
    PythonUDAFDefaultArgSupport,
)
from dbt.tests.adapter.functions.test_udfs import (
    DeterministicUDF,
    ErrorForUnsupportedType,
    NonDeterministicUDF,
    PythonUDFDefaultArgSupport,
    PythonUDFEntryPointRequired,
    PythonUDFNotSupported,
    PythonUDFRuntimeVersionRequired,
    PythonUDFSupported,
    PythonUDFVolatilitySupport,
    StableUDF,
    UDFsBasic,
)
from dbt.tests.util import run_dbt

my_udf_sql = """
SELECT @price * 2
""".strip()


class TestUDFsBasicFabric(UDFsBasic):
    def is_function_create_event(self, event: EventMsg) -> bool:
        return (
            event.data.node_info.node_name == "price_for_xlarge"
            and "CREATE OR ALTER FUNCTION" in event.data.sql
        )

    def check_function_volatility(self, sql: str):
        pass

    @pytest.fixture(scope="class")
    def functions(self):
        return {
            "price_for_xlarge.sql": my_udf_sql,
            "price_for_xlarge.yml": files.MY_UDF_YML,
        }


class TestErrorForUnsupportedTypeFabric(ErrorForUnsupportedType):
    pass


class TestPythonUDFNotSupportedFabric(PythonUDFNotSupported):
    pass


class TestSqlUDFDefaultArgSupportFabric(TestUDFsBasicFabric):
    @pytest.fixture(scope="class")
    def functions(self):
        return {
            "price_for_xlarge.sql": my_udf_sql,
            "price_for_xlarge.yml": files.MY_UDF_WITH_DEFAULT_ARG_YML,
        }

    def test_udfs(self, project, sql_event_catcher):
        result = run_dbt(["build", "--debug"], callbacks=[sql_event_catcher.catch])
        assert len(result.results) == 1

        assert "= 100" in sql_event_catcher.caught_events[0].data.sql

        result = run_dbt(
            ["show", "--inline", "SELECT {{ function('price_for_xlarge') }}(DEFAULT)"]
        )
        assert len(result.results) == 1
        assert result.results[0].agate_table.rows[0].values()[0] == 200


@pytest.mark.skip(reason="Aggregate functions don't exist in T-SQL.")
class TestBasicSQLUDAFFabric(BasicSQLUDAF):
    pass


@pytest.mark.skip(reason="Functions in T-SQL don't have volatility.")
class TestDeterministicUDFFabric(DeterministicUDF):
    pass


@pytest.mark.skip(reason="Functions in T-SQL don't have volatility.")
class TestStableUDFFabric(StableUDF):
    pass


@pytest.mark.skip(reason="Functions in T-SQL don't have volatility.")
class TestNonDeterministicUDFFabric(NonDeterministicUDF):
    pass


@pytest.mark.skip(reason="Python functions are not supported.")
class TestPythonUDFSupportedFabric(PythonUDFSupported):
    pass


@pytest.mark.skip(reason="Python functions are not supported.")
class TestPythonUDFRuntimeVersionRequiredFabric(PythonUDFRuntimeVersionRequired):
    pass


@pytest.mark.skip(reason="Python functions are not supported.")
class TestPythonUDFEntryPointRequiredFabric(PythonUDFEntryPointRequired):
    pass


@pytest.mark.skip(reason="Python functions are not supported.")
class TestPythonUDFDefaultArgSupportFabric(PythonUDFDefaultArgSupport):
    pass


@pytest.mark.skip(reason="Python functions are not supported.")
class TestPythonUDFVolatilitySupportFabric(PythonUDFVolatilitySupport):
    pass


@pytest.mark.skip(reason="Python functions are not supported.")
class TestBasicPythonUDAFFabric(BasicPythonUDAF):
    pass


@pytest.mark.skip(reason="Python functions are not supported.")
class TestPythonUDAFDefaultArgSupportFabric(PythonUDAFDefaultArgSupport):
    pass
