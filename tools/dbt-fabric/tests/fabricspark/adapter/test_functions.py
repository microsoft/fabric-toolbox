import pytest

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
    SqlUDFDefaultArgSupport,
    StableUDF,
    UDFsBasic,
)

_SKIP_REASON = "Fabric Lakehouse does not support CREATE FUNCTION via Spark SQL"


@pytest.mark.skip(_SKIP_REASON)
class TestUDFsBasicFabricSpark(UDFsBasic):
    pass


class TestErrorForUnsupportedTypeFabricSpark(ErrorForUnsupportedType):
    pass


class TestPythonUDFNotSupportedFabricSpark(PythonUDFNotSupported):
    pass


@pytest.mark.skip(_SKIP_REASON)
class TestSqlUDFDefaultArgSupportFabricSpark(SqlUDFDefaultArgSupport):
    pass


@pytest.mark.skip(_SKIP_REASON)
class TestBasicSQLUDAFFabricSpark(BasicSQLUDAF):
    pass


@pytest.mark.skip(_SKIP_REASON)
class TestDeterministicUDFFabricSpark(DeterministicUDF):
    pass


@pytest.mark.skip(_SKIP_REASON)
class TestStableUDFFabricSpark(StableUDF):
    pass


@pytest.mark.skip(_SKIP_REASON)
class TestNonDeterministicUDFFabricSpark(NonDeterministicUDF):
    pass


@pytest.mark.skip(_SKIP_REASON)
class TestPythonUDFSupportedFabricSpark(PythonUDFSupported):
    pass


class TestPythonUDFRuntimeVersionRequiredFabricSpark(PythonUDFRuntimeVersionRequired):
    pass


class TestPythonUDFEntryPointRequiredFabricSpark(PythonUDFEntryPointRequired):
    pass


@pytest.mark.skip(_SKIP_REASON)
class TestPythonUDFDefaultArgSupportFabricSpark(PythonUDFDefaultArgSupport):
    pass


@pytest.mark.skip(_SKIP_REASON)
class TestPythonUDFVolatilitySupportFabricSpark(PythonUDFVolatilitySupport):
    pass


@pytest.mark.skip(_SKIP_REASON)
class TestBasicPythonUDAFFabricSpark(BasicPythonUDAF):
    pass


@pytest.mark.skip(_SKIP_REASON)
class TestPythonUDAFDefaultArgSupportFabricSpark(PythonUDAFDefaultArgSupport):
    pass
