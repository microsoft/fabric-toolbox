import inspect
from pathlib import Path

import pytest

from dbt.tests.adapter.simple_seed import fixtures, seeds
from dbt.tests.adapter.simple_seed.test_seed import (
    BaseBasicSeedTests,
    BaseSeedConfigFullRefreshOff,
    BaseSeedConfigFullRefreshOn,
    BaseSeedCustomSchema,
    BaseSeedParsing,
    BaseSeedSpecificFormats,
    BaseSeedWithEmptyDelimiter,
    BaseSeedWithUniqueDelimiter,
    BaseSeedWithWrongDelimiter,
    BaseSimpleSeedEnabledViaConfig,
    BaseSimpleSeedWithBOM,
    BaseTestEmptySeed,
)
from dbt.tests.adapter.simple_seed.test_seed_type_override import BaseSimpleSeedColumnOverride
from dbt.tests.util import copy_file, read_file, rm_dir, run_dbt

fixed_seeds__expected_sql = (
    seeds.seeds__expected_sql.replace("TIMESTAMP WITHOUT TIME ZONE", "TIMESTAMP")
    .replace("TEXT", "STRING")
    .replace("INTEGER", "INT")
    .replace('"', "")
)

fixed_properties__schema_yml = (
    fixtures.properties__schema_yml.replace("type: timestamp without time zone", "type: timestamp")
    .replace("type: text", "type: string")
    .replace("type: integer", "type: bigint")
)


def run_sql_statements(project, sql):
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt:
            project.run_sql(stmt)


class FixedSeedSetup:
    @pytest.fixture(scope="class", autouse=True)
    def setUp(self, project):
        run_sql_statements(project, fixed_seeds__expected_sql)


class TestBasicSeedTestsFabricSpark(FixedSeedSetup, BaseBasicSeedTests):
    def test_simple_seed_full_refresh_flag(self, project):
        pytest.skip("Dropping a seed table does not cascade to materialized views in Fabric")


class TestEmptySeedFabricSpark(BaseTestEmptySeed):
    pass


class TestSeedConfigFullRefreshOffFabricSpark(FixedSeedSetup, BaseSeedConfigFullRefreshOff):
    pass


@pytest.mark.skip("Dropping a seed table does not cascade to materialized views in Fabric")
class TestSeedConfigFullRefreshOnFabricSpark(FixedSeedSetup, BaseSeedConfigFullRefreshOn):
    pass


class TestSeedCustomSchemaFabricSpark(FixedSeedSetup, BaseSeedCustomSchema):
    pass


class TestSeedParsingFabricSpark(FixedSeedSetup, BaseSeedParsing):
    pass


class TestSeedSpecificFormatsFabricSpark(BaseSeedSpecificFormats):
    @pytest.fixture(scope="class")
    def seeds(self, test_data_dir):
        big_seed_path = self._make_big_seed(test_data_dir)
        big_seed = read_file(big_seed_path)
        yield {
            "big_seed.csv": big_seed,
            "seed_unicode.csv": seeds.seed__unicode_csv,
        }
        rm_dir(test_data_dir)

    def test_simple_seed(self, project):
        results = run_dbt(["seed"])
        assert len(results) == 2


class TestSeedWithEmptyDelimiterFabricSpark(FixedSeedSetup, BaseSeedWithEmptyDelimiter):
    pass


class TestSeedWithUniqueDelimiterFabricSpark(FixedSeedSetup, BaseSeedWithUniqueDelimiter):
    pass


class TestSeedWithWrongDelimiterFabricSpark(FixedSeedSetup, BaseSeedWithWrongDelimiter):
    pass


class TestSimpleSeedColumnOverrideFabricSpark(BaseSimpleSeedColumnOverride):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "schema.yml": fixed_properties__schema_yml,
        }

    @staticmethod
    def seed_enabled_types():
        return {
            "seed_id": "string",
            "birthday": "date",
        }

    @staticmethod
    def seed_tricky_types():
        return {
            "seed_id_str": "string",
            "looks_like_a_bool": "string",
            "looks_like_a_date": "string",
        }


class TestSimpleSeedEnabledViaConfigFabricSpark(BaseSimpleSeedEnabledViaConfig):
    @pytest.fixture(scope="function")
    def clear_test_schema(self, project):
        yield
        for table in ["seed_enabled", "seed_disabled", "seed_tricky"]:
            project.run_sql(f"DROP TABLE IF EXISTS {project.test_schema}.{table}")


class TestSimpleSeedWithBOMFabricSpark(BaseSimpleSeedWithBOM):
    @pytest.fixture(scope="class", autouse=True)
    def setUp(self, project):
        run_sql_statements(project, fixed_seeds__expected_sql)
        copy_file(
            Path(inspect.getfile(BaseSimpleSeedWithBOM)).parent,
            "seed_bom.csv",
            project.project_root / Path("seeds") / "seed_bom.csv",
            "",
        )
