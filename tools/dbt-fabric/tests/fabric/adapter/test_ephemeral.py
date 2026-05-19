import pytest

from dbt.tests.adapter.ephemeral.test_ephemeral import (
    BaseEphemeralErrorHandling,
    BaseEphemeralMulti,
    BaseEphemeralNested,
)


@pytest.mark.skip(reason="Nested CTEs not supported in Views")
class TestEphemeral(BaseEphemeralMulti):
    pass


@pytest.mark.skip(reason="Nested CTEs not supported in Views")
class TestEphemeralNested(BaseEphemeralNested):
    pass


class TestEphemeralErrorHandling(BaseEphemeralErrorHandling):
    pass
