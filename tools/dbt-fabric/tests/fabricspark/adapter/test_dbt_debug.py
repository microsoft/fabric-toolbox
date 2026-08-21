from dbt.tests.adapter.dbt_debug.test_dbt_debug import (
    BaseDebugInvalidProjectPostgres,
    BaseDebugPostgres,
    BaseDebugProfileVariable,
)


class TestDebugFabricSpark(BaseDebugPostgres):
    pass


class TestDebugProfileVariableFabricSpark(BaseDebugProfileVariable):
    pass


class TestDebugInvalidProjectFabricSpark(BaseDebugInvalidProjectPostgres):
    pass
