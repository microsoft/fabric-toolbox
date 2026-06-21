import pytest

from dbt.tests.adapter.persist_docs.test_persist_docs import (
    BasePersistDocs,
    BasePersistDocsColumnMissing,
    BasePersistDocsCommentOnQuotedColumn,
)


@pytest.mark.skip("Persist docs is not supported in Fabric")
class TestPersistDocsFabric(BasePersistDocs):
    pass


@pytest.mark.skip("Persist docs is not supported in Fabric")
class TestPersistDocsColumnMissingFabric(BasePersistDocsColumnMissing):
    pass


@pytest.mark.skip("Persist docs is not supported in Fabric")
class TestPersistDocsCommentOnQuotedColumnFabric(BasePersistDocsCommentOnQuotedColumn):
    pass
