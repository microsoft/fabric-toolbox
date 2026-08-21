import json

from dbt.tests.adapter.persist_docs.test_persist_docs import (
    BasePersistDocs,
    BasePersistDocsColumnMissing,
    BasePersistDocsCommentOnQuotedColumn,
)
from dbt.tests.util import run_dbt


class TestPersistDocsFabricSpark(BasePersistDocs):
    def test_has_comments_pglike(self, project):
        run_dbt(["docs", "generate"])
        with open("target/catalog.json") as fp:
            catalog_data = json.load(fp)
        assert "nodes" in catalog_data
        assert len(catalog_data["nodes"]) == 4
        table_node = catalog_data["nodes"]["model.test.table_model"]
        self._assert_has_table_comments(table_node)

        view_node = catalog_data["nodes"]["model.test.view_model"]
        self._assert_has_view_comments(
            view_node, has_node_comments=True, has_column_comments=False
        )

        no_docs_node = catalog_data["nodes"]["model.test.no_docs_model"]
        self._assert_has_view_comments(no_docs_node, False, False)


class TestPersistDocsColumnMissingFabricSpark(BasePersistDocsColumnMissing):
    pass


class TestPersistDocsCommentOnQuotedColumnFabricSpark(BasePersistDocsCommentOnQuotedColumn):
    pass
