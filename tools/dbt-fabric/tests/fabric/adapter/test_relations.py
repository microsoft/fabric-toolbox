from dbt.tests.adapter.relations.test_changing_relation_type import BaseChangeRelationTypeValidator
from dbt.tests.adapter.relations.test_dropping_schema_named import BaseDropSchemaNamed


class TestChangeRelationTypesFabric(BaseChangeRelationTypeValidator):
    pass


class TestDropSchemaNamedFabric(BaseDropSchemaNamed):
    pass
