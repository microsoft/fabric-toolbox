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
from dbt.tests.util import copy_file, run_dbt

fixed_seeds___expected_sql = (
    seeds.seeds__expected_sql.replace("TIMESTAMP WITHOUT TIME ZONE", "datetime2(6)")
    .replace("TEXT", "varchar(100)")
    .replace("INTEGER", "int")
)
fixed_properties__schema_yml = (
    fixtures.properties__schema_yml.replace("type: timestamp without time zone", "type: datetime2")
    .replace("type: text", "type: varchar")
    .replace("type: integer", "type: int")
    .replace("type: boolean", "type: int")
)

fixed_macros__schema_test = """
{% test column_type(model, column_name, type) %}

    {% set cols = adapter.get_columns_in_relation(model) %}

    {% set col_types = {} %}
    {% for col in cols %}
        {% do col_types.update({col.name: col.data_type}) %}
    {% endfor %}

    {% set col_type = col_types.get(column_name) %}

    {% set validation_message = 'Got a column type of ' ~ col_type ~ ', expected ' ~ type %}

    {% set val = 0 if col_type and col_type.startswith(type) else 1 %}
    {% if val == 1 and execute %}
        {{ log(validation_message, info=True) }}
    {% endif %}

    select '{{ validation_message }}' as validation_error
    from (select 1 as id) as nothing
    where {{ val }} = 1

{% endtest %}

"""


fixed_seeds__tricky_csv = """
seed_id,seed_id_str,a_bool,looks_like_a_bool,a_date,looks_like_a_date,relative,weekday
1,1,1,true,2019-01-01 12:32:30,2019-01-01 12:32:30,tomorrow,Saturday
2,2,1,True,2019-01-01 12:32:31,2019-01-01 12:32:31,today,Sunday
3,3,1,TRUE,2019-01-01 12:32:32,2019-01-01 12:32:32,yesterday,Monday
4,4,0,false,2019-01-01 01:32:32,2019-01-01 01:32:32,tomorrow,Saturday
5,5,0,False,2019-01-01 01:32:32,2019-01-01 01:32:32,today,Sunday
6,6,0,FALSE,2019-01-01 01:32:32,2019-01-01 01:32:32,yesterday,Monday
""".lstrip()


class FixedSeedSetup:
    @pytest.fixture(scope="class", autouse=True)
    def setUp(self, project):
        project.run_sql(fixed_seeds___expected_sql)


class TestBasicSeedTestsFabric(FixedSeedSetup, BaseBasicSeedTests):
    def test_simple_seed_full_refresh_flag(self, project):
        pytest.skip(
            "This test assumes that if you drop a table, that it will cascade to all views"
        )


class TestEmptySeedFabric(BaseTestEmptySeed):
    pass


class TestSeedConfigFullRefreshOffFabric(FixedSeedSetup, BaseSeedConfigFullRefreshOff):
    pass


@pytest.mark.skip("This test assumes that if you drop a table, that it will cascade to all views")
class TestSeedConfigFullRefreshOnFabric(FixedSeedSetup, BaseSeedConfigFullRefreshOn):
    pass


class TestSeedCustomSchemaFabric(FixedSeedSetup, BaseSeedCustomSchema):
    pass


class TestSeedParsingFabric(FixedSeedSetup, BaseSeedParsing):
    pass


class TestSeedSpecificFormatsFabric(BaseSeedSpecificFormats):
    pass


class TestSeedWithEmptyDelimiterFabric(FixedSeedSetup, BaseSeedWithEmptyDelimiter):
    pass


class TestSeedWithUniqueDelimiterFabric(FixedSeedSetup, BaseSeedWithUniqueDelimiter):
    pass


class TestSeedWithWrongDelimiterFabric(FixedSeedSetup, BaseSeedWithWrongDelimiter):
    def test_seed_with_wrong_delimiter(self, project):
        """Testing failure of running dbt seed with a wrongly configured delimiter"""
        seed_result = run_dbt(["seed"], expect_pass=False)
        assert "Incorrect syntax near" in seed_result.results[0].message


class TestSimpleSeedColumnOverrideFabric(BaseSimpleSeedColumnOverride):
    @pytest.fixture(scope="class")
    def seeds(self):
        return {
            "seed_enabled.csv": seeds.seeds__enabled_in_config_csv,
            "seed_disabled.csv": seeds.seeds__disabled_in_config_csv,
            "seed_tricky.csv": fixed_seeds__tricky_csv,
        }

    @pytest.fixture(scope="class")
    def models(self):
        return {
            "schema.yml": fixed_properties__schema_yml,
        }

    @staticmethod
    def seed_enabled_types():
        return {
            "seed_id": "varchar(100)",
            "birthday": "date",
        }

    @staticmethod
    def seed_tricky_types():
        return {
            "seed_id_str": "varchar(100)",
            "looks_like_a_bool": "varchar(100)",
            "looks_like_a_date": "varchar(100)",
        }

    @pytest.fixture(scope="class")
    def macros(self):
        return {"schema_test.sql": fixed_macros__schema_test}


class BaseSimpleSeedEnabledViaConfigFabric(BaseSimpleSeedEnabledViaConfig):
    @pytest.fixture(scope="class")
    def seeds(self):
        return {
            "seed_enabled.csv": seeds.seeds__enabled_in_config_csv,
            "seed_disabled.csv": seeds.seeds__disabled_in_config_csv,
            "seed_tricky.csv": fixed_seeds__tricky_csv,
        }

    @pytest.fixture(scope="function")
    def clear_test_schema(self):
        pass


class TestSimpleSeedEnabledViaConfigFabricDisabled(BaseSimpleSeedEnabledViaConfigFabric):
    @pytest.mark.skip("Tests have to be split up into multiple classes")
    def test_simple_seed_selection(self, clear_test_schema, project):
        super().test_simple_seed_selection(clear_test_schema, project)

    @pytest.mark.skip("Tests have to be split up into multiple classes")
    def test_simple_seed_exclude(self, clear_test_schema, project):
        super().test_simple_seed_exclude(clear_test_schema, project)


class TestSimpleSeedEnabledViaConfigFabricSelection(BaseSimpleSeedEnabledViaConfigFabric):
    @pytest.mark.skip("Tests have to be split up into multiple classes")
    def test_simple_seed_with_disabled(self, clear_test_schema, project):
        super().test_simple_seed_with_disabled(clear_test_schema, project)

    @pytest.mark.skip("Tests have to be split up into multiple classes")
    def test_simple_seed_exclude(self, clear_test_schema, project):
        super().test_simple_seed_exclude(clear_test_schema, project)


class TestSimpleSeedEnabledViaConfigFabricExclude(BaseSimpleSeedEnabledViaConfigFabric):
    @pytest.mark.skip("Tests have to be split up into multiple classes")
    def test_simple_seed_with_disabled(self, clear_test_schema, project):
        super().test_simple_seed_with_disabled(clear_test_schema, project)

    @pytest.mark.skip("Tests have to be split up into multiple classes")
    def test_simple_seed_selection(self, clear_test_schema, project):
        super().test_simple_seed_selection(clear_test_schema, project)


class TestSimpleSeedWithBOMFabric(BaseSimpleSeedWithBOM):
    @pytest.fixture(scope="class", autouse=True)
    def setUp(self, project):
        project.run_sql(fixed_seeds___expected_sql)
        copy_file(
            Path(inspect.getfile(BaseSimpleSeedWithBOM)).parent,
            "seed_bom.csv",
            project.project_root / Path("seeds") / "seed_bom.csv",
            "",
        )
