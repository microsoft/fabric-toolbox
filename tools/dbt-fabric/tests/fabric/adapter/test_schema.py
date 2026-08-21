import os

import pytest

from dbt.adapters.fabric.fabric_adapter import FabricAdapter
from dbt.tests.util import run_dbt, run_sql_with_adapter


class TestSchemaCreation:
    @pytest.fixture(scope="class")
    def test_user(self):
        return os.getenv("DBT_TEST_USER_1", "dbo")

    @pytest.fixture(scope="class")
    def models(self):
        return {
            "dummy.sql": """
{{ config(schema='with_custom_auth') }}
select 1 as id
""",
        }

    @pytest.fixture(scope="class")
    def dbt_profile_target_update(self, test_user: str):
        return {"schema_authorization": f"{test_user}"}

    @pytest.fixture(scope="class")
    def initialization(initialization: None, adapter: FabricAdapter, test_user: str) -> None:
        if test_user != "dbo":
            # Fabric only seems to recognize users as soon as you have granted them something
            # You cannot grant something to dbo
            run_sql_with_adapter(adapter, f"grant select on schema :: dbo to [{test_user}]")

    @staticmethod
    def _verify_schema_owner(schema_name, owner, project):
        get_schema_owner = f"""
select p.name
from sys.schemas s
join sys.database_principals p
on s.principal_id = p.principal_id
where s.name = '{schema_name}'
        """
        result = project.run_sql(get_schema_owner, fetch="one")
        first_record = result[0]
        assert first_record == owner, f"Schema owner for {schema_name} is not {owner}"

    def test_schema_creation(self, project, unique_schema, test_user: str):
        res = run_dbt(["run"])
        assert len(res) == 1

        self._verify_schema_owner(unique_schema, test_user, project)
        self._verify_schema_owner(unique_schema + "_with_custom_auth", test_user, project)
