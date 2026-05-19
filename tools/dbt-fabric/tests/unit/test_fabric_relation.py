from dbt.adapters.fabric.fabric_relation import FabricRelation
from dbt.adapters.fabric.relation_configs import FabricRelationType


class TestFabricRelationQuoted:
    def test_simple_identifier(self):
        r = FabricRelation.create(
            database="mydb",
            schema="dbo",
            identifier="my_table",
            type=FabricRelationType.Table,
        )
        assert r.quoted("my_column") == "[my_column]"

    def test_identifier_with_bracket(self):
        r = FabricRelation.create(
            database="mydb",
            schema="dbo",
            identifier="my_table",
            type=FabricRelationType.Table,
        )
        assert r.quoted("my]col") == "[my]]col]"

    def test_identifier_with_multiple_brackets(self):
        r = FabricRelation.create(
            database="mydb",
            schema="dbo",
            identifier="my_table",
            type=FabricRelationType.Table,
        )
        assert r.quoted("a]b]c") == "[a]]b]]c]"


class TestFabricRelationRenderLimited:
    def test_no_limit(self):
        r = FabricRelation.create(
            database="mydb",
            schema="dbo",
            identifier="my_table",
            type=FabricRelationType.Table,
        )
        assert r.render_limited() == "[mydb].[dbo].[my_table]"

    def test_limit_zero(self):
        r = FabricRelation.create(
            database="mydb",
            schema="dbo",
            identifier="my_table",
            type=FabricRelationType.Table,
            limit=0,
        )
        result = r.render_limited()
        assert "where 1=0" in result
        assert "[mydb].[dbo].[my_table]" in result
        assert "select *" in result

    def test_limit_positive(self):
        r = FabricRelation.create(
            database="mydb",
            schema="dbo",
            identifier="my_table",
            type=FabricRelationType.Table,
            limit=10,
        )
        result = r.render_limited()
        assert "TOP 10" in result
        assert "[mydb].[dbo].[my_table]" in result
        assert "select TOP 10 *" in result


class TestFabricRelationRendering:
    def test_renders_three_part_bracketed_name(self):
        r = FabricRelation.create(
            database="mydb",
            schema="dbo",
            identifier="my_table",
            type=FabricRelationType.Table,
        )
        assert str(r) == "[mydb].[dbo].[my_table]"

    def test_quote_policy_defaults(self):
        r = FabricRelation.create(
            database="mydb",
            schema="dbo",
            identifier="my_table",
            type=FabricRelationType.Table,
        )
        assert r.quote_policy.database is True
        assert r.quote_policy.schema is True
        assert r.quote_policy.identifier is True
