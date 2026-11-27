import time

import pytest

from fabric_assessment_tool.assessment.synapse import SqlCodeObjectDefinition
from fabric_assessment_tool.services.sql_complexity_scorer import (
    SqlComplexityScorer,
)


def make_definition(
    sql: str | None,
    *,
    object_name: str = "test_object",
    object_type: str = "PROCEDURE",
    encrypted: bool = False,
) -> SqlCodeObjectDefinition:
    return SqlCodeObjectDefinition(
        database_name="test_db",
        schema_name="dbo",
        object_name=object_name,
        object_type=object_type,
        definition=sql,
        is_encrypted=encrypted,
        created_at="2025-01-01T00:00:00",
        modified_at="2025-01-02T00:00:00",
        json_response={"object_id": 1},
    )


@pytest.mark.parametrize(
    ("sql", "expected_rule"),
    [
        ("CREATE PROC p AS EXEC sp_executesql N'SELECT 1';", "dynamic_sql"),
        ("CREATE PROC p AS DECLARE c CURSOR FOR SELECT 1;", "cursor"),
        ("CREATE PROC p AS WHILE 1 = 1 BREAK;", "loop"),
        ("CREATE PROC p AS SELECT * INTO #t FROM dbo.source;", "temporary_objects"),
        ("CREATE PROC p AS BEGIN TRAN; COMMIT;", "transactions"),
        (
            "CREATE PROC p AS BEGIN TRY SELECT 1; END TRY BEGIN CATCH THROW; END CATCH;",
            "error_handling",
        ),
        (
            "CREATE VIEW v AS SELECT * FROM otherdb.dbo.source;",
            "cross_database_reference",
        ),
        (
            "CREATE VIEW v AS SELECT * FROM OPENROWSET(BULK 'x', SINGLE_CLOB) x;",
            "external_access",
        ),
        (
            "CREATE PROC p AS MERGE dbo.t USING dbo.s ON 1 = 1 WHEN MATCHED THEN UPDATE SET x = 1;",
            "compatibility_sensitive",
        ),
    ],
)
def test_scores_documented_rules(sql, expected_rule):
    result = SqlComplexityScorer().score_object(make_definition(sql))

    assert expected_rule in result.matched_rules
    assert result.escalation_reasons


def test_comments_and_literals_do_not_trigger_standard_rules():
    sql = """
CREATE PROC p AS
-- CURSOR WHILE MERGE OPENROWSET
SELECT 'CURSOR WHILE MERGE OPENROWSET';
"""
    result = SqlComplexityScorer().score_object(make_definition(sql))

    assert "cursor" not in result.matched_rules
    assert "loop" not in result.matched_rules
    assert "external_access" not in result.matched_rules
    assert "compatibility_sensitive" not in result.matched_rules


def test_comments_do_not_trigger_dynamic_sql():
    result = SqlComplexityScorer().score_object(
        make_definition("CREATE PROC p AS -- EXEC sp_executesql\nSELECT 1;")
    )

    assert "dynamic_sql" not in result.matched_rules


def test_severe_rule_escalates_to_high():
    result = SqlComplexityScorer().score_object(
        make_definition("CREATE PROC p AS DECLARE c CURSOR FOR SELECT 1;")
    )

    assert result.complexity_level == "HIGH"
    assert result.score == 4


def test_full_redaction_keeps_hash_without_definition():
    result = SqlComplexityScorer("full").score_object(
        make_definition("CREATE VIEW v AS SELECT 1;")
    )

    assert result.definition is None
    assert result.definition_hash is not None
    assert result.definition_length > 0


def test_none_redaction_preserves_definition():
    sql = "CREATE VIEW v AS SELECT 1;"
    result = SqlComplexityScorer("none").score_object(make_definition(sql))

    assert result.definition == sql


@pytest.mark.parametrize(
    ("definition", "encrypted", "expected_status"),
    [
        (None, True, "encrypted"),
        (None, False, "permission_denied_or_hidden"),
    ],
)
def test_unavailable_definitions_are_not_scored(definition, encrypted, expected_status):
    result = SqlComplexityScorer().score_object(
        make_definition(definition, encrypted=encrypted)
    )

    assert result.definition_status == expected_status
    assert result.score is None
    assert result.complexity_level is None


def test_database_summary_and_readiness():
    definitions = [
        make_definition(
            "CREATE VIEW low_view AS SELECT 1;",
            object_name="low_view",
            object_type="VIEW",
        ),
        make_definition(
            "CREATE PROC high_proc AS DECLARE c CURSOR FOR SELECT 1;",
            object_name="high_proc",
        ),
        make_definition(None, object_name="hidden_view", object_type="VIEW"),
    ]

    assessment = SqlComplexityScorer().score_database(definitions)

    assert assessment.summary.total_objects == 3
    assert assessment.summary.scored_objects == 2
    assert assessment.summary.unavailable_definitions == 1
    assert assessment.summary.distribution["LOW"] == 1
    assert assessment.summary.distribution["HIGH"] == 1
    assert assessment.summary.objects_needing_review == 2
    assert assessment.summary.readiness_percentage == 50.0
    assert assessment.summary.readiness_indicator == "REVIEW"


def test_scores_5000_objects_under_60_seconds():
    definitions = [
        make_definition(
            "CREATE PROC p AS BEGIN IF 1 = 1 SELECT 1; END;",
            object_name=f"proc_{index}",
        )
        for index in range(5_000)
    ]

    started_at = time.perf_counter()
    assessment = SqlComplexityScorer().score_database(definitions)
    elapsed = time.perf_counter() - started_at

    assert assessment.summary.total_objects == 5_000
    assert elapsed < 60
