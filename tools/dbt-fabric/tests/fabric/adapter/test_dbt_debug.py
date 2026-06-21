from dbt.tests.adapter.dbt_debug.test_dbt_debug import (
    BaseDebugInvalidProjectPostgres,
    BaseDebugPostgres,
    BaseDebugProfileVariable,
)


class TestDebugFabric(BaseDebugPostgres):
    pass


class TestDebugProfileVariableFabric(BaseDebugProfileVariable):
    pass


class TestDebugInvalidProjectFabric(BaseDebugInvalidProjectPostgres):
    pass
