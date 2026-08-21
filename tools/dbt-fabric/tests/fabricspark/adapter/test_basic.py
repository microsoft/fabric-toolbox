import pytest

from dbt.tests.adapter.basic import expected_catalog
from dbt.tests.adapter.basic.test_adapter_methods import BaseAdapterMethod
from dbt.tests.adapter.basic.test_base import BaseSimpleMaterializations
from dbt.tests.adapter.basic.test_docs_generate import (
    BaseDocsGenerate,
    BaseDocsGenReferences,
)
from dbt.tests.adapter.basic.test_empty import BaseEmpty
from dbt.tests.adapter.basic.test_ephemeral import BaseEphemeral
from dbt.tests.adapter.basic.test_generic_tests import BaseGenericTests
from dbt.tests.adapter.basic.test_get_catalog_for_single_relation import (
    BaseGetCatalogForSingleRelation,
)
from dbt.tests.adapter.basic.test_incremental import (
    BaseIncremental,
    BaseIncrementalBadStrategy,
    BaseIncrementalNotSchemaChange,
)
from dbt.tests.adapter.basic.test_singular_tests import BaseSingularTests
from dbt.tests.adapter.basic.test_singular_tests_ephemeral import (
    BaseSingularTestsEphemeral,
)
from dbt.tests.adapter.basic.test_snapshot_check_cols import BaseSnapshotCheckCols
from dbt.tests.adapter.basic.test_snapshot_timestamp import BaseSnapshotTimestamp
from dbt.tests.adapter.basic.test_table_materialization import BaseTableMaterialization
from dbt.tests.adapter.basic.test_validate_connection import BaseValidateConnection
from dbt.tests.util import AnyInteger, run_dbt


class TestSimpleMaterializationsSpark(BaseSimpleMaterializations):
    pass


class TestSingularTestsSpark(BaseSingularTests):
    pass


class TestSingularTestsEphemeralSpark(BaseSingularTestsEphemeral):
    pass


class TestEmptySpark(BaseEmpty):
    pass


class TestEphemeralSpark(BaseEphemeral):
    pass


class TestIncrementalSpark(BaseIncremental):
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {"name": "incremental", "models": {"+materialized": "table"}}


class TestIncrementalNotSchemaChangeFabric(BaseIncrementalNotSchemaChange):
    pass


class TestGenericTestsSpark(BaseGenericTests):
    pass


class TestSnapshotCheckColsSpark(BaseSnapshotCheckCols):
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {"name": "snapshot_strategy_check_cols", "models": {"+materialized": "table"}}


class TestSnapshotTimestampSpark(BaseSnapshotTimestamp):
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {"name": "snapshot_strategy_timestamp", "models": {"+materialized": "table"}}


class TestBaseCachingSpark(BaseAdapterMethod):
    pass


class TestValidateConnectionSpark(BaseValidateConnection):
    pass


class TestDocsGenerateSpark(BaseDocsGenerate):
    @pytest.fixture(scope="class")
    def expected_catalog(self, project, profile_user):
        return expected_catalog.base_expected_catalog(
            project,
            role=None,
            id_type="bigint",
            text_type="string",
            time_type="timestamp",
            view_type="view",
            table_type="table",
            model_stats=expected_catalog.no_stats(),
        )


class TestDocsGenReferencesSpark(BaseDocsGenReferences):
    @pytest.fixture(scope="class")
    def expected_catalog(self, project, profile_user):
        catalog = expected_catalog.expected_references_catalog(
            project,
            role=None,
            id_type="bigint",
            text_type="string",
            time_type="timestamp",
            bigint_type="bigint",
            view_type="view",
            table_type="table",
            model_stats=expected_catalog.no_stats(),
        )
        for section in catalog.values():
            for node in section.values():
                for col in node.get("columns", {}).values():
                    col["index"] = AnyInteger()
        return catalog


class TestTableMaterializationSpark(BaseTableMaterialization):
    pass


@pytest.mark.skip(reason="Capability not implemented in FabricSpark.")
class TestGetCatalogForSingleRelationSpark(BaseGetCatalogForSingleRelation):
    pass


class TestIncrementalBadStrategySpark(BaseIncrementalBadStrategy):
    def test_incremental_invalid_strategy(self, project):
        results = run_dbt(["seed"])
        assert len(results) == 2

        results = run_dbt(["run"], expect_pass=False)
        assert len(results.results) == 1
        assert "Invalid incremental strategy provided: bad_strategy" in results.results[0].message
