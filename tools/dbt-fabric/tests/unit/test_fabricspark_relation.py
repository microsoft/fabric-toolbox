from unittest.mock import Mock

import pytest

from dbt.adapters.exceptions.compilation import ApproximateMatchError
from dbt.adapters.fabricspark.fabricspark_relation import (
    FabricSparkIncludePolicy,
    FabricSparkQuotePolicy,
    FabricSparkRelation,
    FabricSparkRelationType,
)


class TestFabricSparkQuotePolicy:
    def test_database_and_schema_quoting_enabled(self):
        policy = FabricSparkQuotePolicy()
        assert policy.database is True
        assert policy.schema is True
        assert policy.identifier is False

    def test_relation_default_quote_policy(self):
        r = FabricSparkRelation.create(
            database="DBTTest",
            schema="TestSchema",
            identifier="my_model",
            type=FabricSparkRelationType.Table,
        )
        assert r.quote_policy.database is True
        assert r.quote_policy.schema is True


class TestFabricSparkIncludePolicy:
    def test_database_included(self):
        policy = FabricSparkIncludePolicy()
        assert policy.database is True
        assert policy.schema is True
        assert policy.identifier is True

    def test_relation_default_include_policy(self):
        r = FabricSparkRelation.create(
            database="my_lakehouse",
            schema="dbo",
            identifier="my_model",
            type=FabricSparkRelationType.Table,
        )
        assert r.include_policy.database is True


class TestFabricSparkRelationRendering:
    def test_renders_three_part_name(self):
        r = FabricSparkRelation.create(
            database="my_lakehouse",
            schema="dbo",
            identifier="my_model",
            type=FabricSparkRelationType.Table,
        )
        rendered = str(r)
        assert rendered == "`my_lakehouse`.`dbo`.my_model"

    def test_renders_four_part_name_with_workspace(self):
        r = FabricSparkRelation.create(
            database="my_lakehouse",
            schema="dbo",
            identifier="my_model",
            type=FabricSparkRelationType.Table,
            workspace="My Workspace",
        )
        rendered = str(r)
        assert rendered == "`My Workspace`.`my_lakehouse`.`dbo`.my_model"

    def test_workspace_omitted_when_database_excluded(self):
        r = FabricSparkRelation.create(
            database="my_lakehouse",
            schema="dbo",
            identifier="my_model",
            type=FabricSparkRelationType.Table,
            workspace="My Workspace",
        )
        without_db = r.include(database=False)
        rendered = str(without_db)
        assert "`My Workspace`" not in rendered
        assert rendered == "`dbo`.my_model"

    def test_workspace_none_renders_three_part_name(self):
        r = FabricSparkRelation.create(
            database="my_lakehouse",
            schema="dbo",
            identifier="my_model",
            type=FabricSparkRelationType.Table,
            workspace=None,
        )
        rendered = str(r)
        assert rendered == "`my_lakehouse`.`dbo`.my_model"

    def test_mixed_case_preserved_in_rendering(self):
        r = FabricSparkRelation.create(
            database="DBTTest",
            schema="TestSchema",
            identifier="my_model",
            type=FabricSparkRelationType.Table,
        )
        rendered = str(r)
        assert "`DBTTest`" in rendered
        assert "`TestSchema`" in rendered

    def test_identifier_not_quoted_by_default(self):
        r = FabricSparkRelation.create(
            database="DBTTest",
            schema="TestSchema",
            identifier="my_model",
            type=FabricSparkRelationType.Table,
        )
        rendered = str(r)
        assert "my_model" in rendered
        assert "`my_model`" not in rendered

    def test_without_identifier_renders_database_and_schema(self):
        r = FabricSparkRelation.create(
            database="my_lakehouse",
            schema="dbo",
            identifier="my_model",
            type=FabricSparkRelationType.Table,
        )
        without_id = r.without_identifier()
        rendered = str(without_id)
        assert "`my_lakehouse`" in rendered
        assert "`dbo`" in rendered
        assert "my_model" not in rendered


class TestFabricSparkRelationCasePreservation:
    def test_matches_preserves_case_when_quoted(self):
        r = FabricSparkRelation.create(
            database="DBTTest",
            schema="TestSchema",
            identifier="my_model",
            type=FabricSparkRelationType.Table,
        )
        assert r.matches(
            database="DBTTest",
            schema="TestSchema",
            identifier="my_model",
        )

    def test_lowered_search_raises_approximate_match_error(self):
        """With quote_policy.database/schema=True, matches() uses exact
        case-sensitive comparison. Lowercased search terms will not
        exact-match mixed-case stored values but will approximate-match,
        raising ApproximateMatchError instead of silently returning True."""
        r = FabricSparkRelation.create(
            database="DBTTest",
            schema="TestSchema",
            identifier="my_model",
            type=FabricSparkRelationType.Table,
            dbt_created=True,
        )
        with pytest.raises(ApproximateMatchError):
            r.matches(
                database="dbttest",
                schema="testschema",
                identifier="my_model",
            )


class TestFabricSparkRelationWorkspace:
    def test_incorporate_preserves_workspace(self):
        r = FabricSparkRelation.create(
            database="my_lakehouse",
            schema="dbo",
            identifier="my_model",
            type=FabricSparkRelationType.Table,
            workspace="My Workspace",
        )
        r2 = r.incorporate(path={"identifier": "new_model"})
        assert r2.workspace == "My Workspace"
        assert "`My Workspace`" in str(r2)
        assert "new_model" in str(r2)

    def test_incorporate_can_set_workspace(self):
        r = FabricSparkRelation.create(
            database="my_lakehouse",
            schema="dbo",
            identifier="my_model",
            type=FabricSparkRelationType.Table,
        )
        assert r.workspace is None
        r2 = r.incorporate(workspace="Other WS")
        assert r2.workspace == "Other WS"
        assert "`Other WS`" in str(r2)

    def test_incorporate_can_clear_workspace(self):
        r = FabricSparkRelation.create(
            database="my_lakehouse",
            schema="dbo",
            identifier="my_model",
            type=FabricSparkRelationType.Table,
            workspace="My Workspace",
        )
        r2 = r.incorporate(workspace=None)
        assert r2.workspace is None
        assert "`My Workspace`" not in str(r2)
        assert str(r2) == "`my_lakehouse`.`dbo`.my_model"

    def test_incorporate_can_override_workspace(self):
        r = FabricSparkRelation.create(
            database="my_lakehouse",
            schema="dbo",
            identifier="my_model",
            type=FabricSparkRelationType.Table,
            workspace="Original WS",
        )
        r2 = r.incorporate(workspace="New WS")
        assert r2.workspace == "New WS"
        assert "`New WS`" in str(r2)
        assert "`Original WS`" not in str(r2)

    def test_create_from_pulls_workspace_from_config(self):
        quoting = Mock()
        quoting.quoting = {}
        relation_config = Mock()
        relation_config.database = "my_lakehouse"
        relation_config.schema = "dbo"
        relation_config.identifier = "my_model"
        relation_config.quoting_dict = {}
        relation_config.config = {"workspace_name": "Config Workspace"}
        relation_config.catalog_name = None
        r = FabricSparkRelation.create_from(quoting, relation_config)
        assert r.workspace == "Config Workspace"
        assert "`Config Workspace`" in str(r)

    def test_create_from_without_workspace_config(self):
        quoting = Mock()
        quoting.quoting = {}
        relation_config = Mock()
        relation_config.database = "my_lakehouse"
        relation_config.schema = "dbo"
        relation_config.identifier = "my_model"
        relation_config.quoting_dict = {}
        relation_config.config = {}
        relation_config.catalog_name = None
        r = FabricSparkRelation.create_from(quoting, relation_config)
        assert r.workspace is None
        assert str(r) == "`my_lakehouse`.`dbo`.my_model"

    def test_create_from_workspace_kwarg_takes_precedence(self):
        quoting = Mock()
        quoting.quoting = {}
        relation_config = Mock()
        relation_config.database = "my_lakehouse"
        relation_config.schema = "dbo"
        relation_config.identifier = "my_model"
        relation_config.quoting_dict = {}
        relation_config.config = {"workspace_name": "Config WS"}
        relation_config.catalog_name = None
        r = FabricSparkRelation.create_from(quoting, relation_config, workspace="Kwarg WS")
        assert r.workspace == "Kwarg WS"
        assert "`Kwarg WS`" in str(r)
