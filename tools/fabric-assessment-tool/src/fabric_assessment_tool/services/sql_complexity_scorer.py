import hashlib
import re
import time
from dataclasses import dataclass
from typing import Iterable, Optional

from ..assessment.synapse import (
    SqlCodeObjectDefinition,
    SqlComplexityAssessment,
    SqlComplexityObject,
    SqlComplexitySummary,
)


@dataclass(frozen=True)
class ComplexityRule:
    code: str
    description: str
    pattern: re.Pattern[str]
    weight: int
    max_occurrences: int = 1
    severe: bool = False
    inspect_original: bool = False


class SqlComplexityScorer:
    """Assign deterministic migration-complexity scores to SQL code objects."""

    RUBRIC_VERSION = "1.0"
    LEVELS = ("LOW", "MEDIUM", "HIGH", "VERY_HIGH")
    REVIEW_LEVELS = {"HIGH", "VERY_HIGH"}

    RULES = (
        ComplexityRule(
            "dynamic_sql",
            "Uses dynamic SQL",
            re.compile(r"\bSP_EXECUTESQL\b|\bEXEC(?:UTE)?\s*\(", re.IGNORECASE),
            3,
            max_occurrences=2,
            severe=True,
            inspect_original=True,
        ),
        ComplexityRule(
            "cursor",
            "Uses a cursor",
            re.compile(r"\bCURSOR\b", re.IGNORECASE),
            4,
            severe=True,
        ),
        ComplexityRule(
            "loop",
            "Uses iterative WHILE logic",
            re.compile(r"\bWHILE\b", re.IGNORECASE),
            2,
            max_occurrences=2,
        ),
        ComplexityRule(
            "temporary_objects",
            "Uses temporary tables or table variables",
            re.compile(
                r"(?<!#)#(?!#)[A-Za-z_][A-Za-z0-9_]*"
                r"|\bDECLARE\s+@[A-Za-z_][A-Za-z0-9_]*\s+TABLE\b",
                re.IGNORECASE,
            ),
            1,
            max_occurrences=3,
        ),
        ComplexityRule(
            "transactions",
            "Contains explicit transaction handling",
            re.compile(
                r"\bBEGIN\s+TRAN(?:SACTION)?\b|\bCOMMIT(?:\s+TRAN(?:SACTION)?)?\b"
                r"|\bROLLBACK(?:\s+TRAN(?:SACTION)?)?\b",
                re.IGNORECASE,
            ),
            2,
            max_occurrences=2,
        ),
        ComplexityRule(
            "error_handling",
            "Contains explicit error handling",
            re.compile(
                r"\bBEGIN\s+(?:TRY|CATCH)\b|\bTHROW\b|\bRAISERROR\b", re.IGNORECASE
            ),
            1,
            max_occurrences=2,
        ),
        ComplexityRule(
            "branching",
            "Contains multiple conditional branches",
            re.compile(r"\bIF\b|\bCASE\b", re.IGNORECASE),
            1,
            max_occurrences=3,
        ),
        ComplexityRule(
            "cross_database_reference",
            "References a cross-database or cross-server object",
            re.compile(
                r"(?:\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*)\."
                r"(?:\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*)\."
                r"(?:\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*)",
                re.IGNORECASE,
            ),
            2,
            max_occurrences=2,
        ),
        ComplexityRule(
            "external_access",
            "Uses external data access",
            re.compile(
                r"\bOPENROWSET\b|\bOPENQUERY\b|\bBULK\s+INSERT\b"
                r"|\bEXTERNAL\s+(?:TABLE|DATA\s+SOURCE|FILE\s+FORMAT)\b",
                re.IGNORECASE,
            ),
            3,
            max_occurrences=2,
            severe=True,
        ),
        ComplexityRule(
            "compatibility_sensitive",
            "Uses compatibility-sensitive T-SQL",
            re.compile(
                r"\bMERGE\b|\bPIVOT\b|\bUNPIVOT\b|\bFOR\s+XML\b"
                r"|\bXP_[A-Za-z0-9_]+\b|\bOPENDATASOURCE\b",
                re.IGNORECASE,
            ),
            3,
            max_occurrences=2,
            severe=True,
        ),
    )

    def __init__(self, redaction_mode: str = "full"):
        if redaction_mode not in {"full", "none"}:
            raise ValueError(
                "SQL definition redaction mode must be either 'full' or 'none'"
            )
        self.redaction_mode = redaction_mode

    def score_database(
        self,
        definitions: Iterable[SqlCodeObjectDefinition],
        elapsed_seconds: float = 0.0,
        errors: Optional[list[str]] = None,
    ) -> SqlComplexityAssessment:
        started_at = time.perf_counter()
        objects = [self.score_object(definition) for definition in definitions]
        scoring_elapsed = time.perf_counter() - started_at
        return self._build_assessment(
            objects=objects,
            elapsed_seconds=elapsed_seconds + scoring_elapsed,
            errors=errors or [],
        )

    def score_object(self, definition: SqlCodeObjectDefinition) -> SqlComplexityObject:
        sql = definition.definition
        definition_status = self._definition_status(definition)
        definition_length = len(sql) if sql is not None else 0
        definition_hash = (
            hashlib.sha256(sql.encode("utf-8")).hexdigest() if sql is not None else None
        )
        line_count = len(sql.splitlines()) if sql else 0

        if definition_status != "available":
            return SqlComplexityObject(
                database_name=definition.database_name,
                schema_name=definition.schema_name,
                object_name=definition.object_name,
                object_type=definition.object_type,
                definition_status=definition_status,
                definition_length=definition_length,
                definition_hash=definition_hash,
                definition=None,
                line_count=line_count,
                score=None,
                complexity_level=None,
                matched_rules=[],
                escalation_reasons=[self._unavailable_reason(definition_status)],
                created_at=definition.created_at,
                modified_at=definition.modified_at,
            )

        normalized_sql = self._normalize_sql(sql or "")
        score, matched_rules, escalation_reasons, severe_count = self._score_sql(
            sql or "", normalized_sql, line_count, definition_length
        )
        level = self._score_level(score)
        if severe_count >= 3:
            level = "VERY_HIGH"
            escalation_reasons.append(
                "Multiple severe migration-risk patterns require specialist review"
            )
        elif severe_count and level in {"LOW", "MEDIUM"}:
            level = "HIGH"
            escalation_reasons.append(
                "A severe migration-risk pattern raises the minimum level to HIGH"
            )

        return SqlComplexityObject(
            database_name=definition.database_name,
            schema_name=definition.schema_name,
            object_name=definition.object_name,
            object_type=definition.object_type,
            definition_status=definition_status,
            definition_length=definition_length,
            definition_hash=definition_hash,
            definition=sql if self.redaction_mode == "none" else None,
            line_count=line_count,
            score=score,
            complexity_level=level,
            matched_rules=matched_rules,
            escalation_reasons=escalation_reasons,
            created_at=definition.created_at,
            modified_at=definition.modified_at,
        )

    def unavailable_assessment(
        self, reason: str, elapsed_seconds: float = 0.0
    ) -> SqlComplexityAssessment:
        return self._build_assessment(
            objects=[], elapsed_seconds=elapsed_seconds, errors=[reason]
        )

    def _score_sql(
        self,
        original_sql: str,
        normalized_sql: str,
        line_count: int,
        definition_length: int,
    ) -> tuple[int, list[str], list[str], int]:
        score = 0
        matched_rules: list[str] = []
        reasons: list[str] = []
        severe_count = 0

        size_score, size_reason = self._size_score(line_count)
        if size_score:
            score += size_score
            matched_rules.append("definition_size")
            reasons.append(size_reason)

        if definition_length > 100_000:
            score += 2
            matched_rules.append("large_definition")
            reasons.append("Definition exceeds 100,000 characters (+2)")

        statement_count = len(
            re.findall(
                r"\b(?:SELECT|INSERT|UPDATE|DELETE|MERGE)\b",
                normalized_sql,
                re.IGNORECASE,
            )
        )
        if statement_count > 50:
            score += 2
            matched_rules.append("statement_density")
            reasons.append("Contains more than 50 data statements (+2)")
        elif statement_count > 20:
            score += 1
            matched_rules.append("statement_density")
            reasons.append("Contains more than 20 data statements (+1)")

        sql_without_comments = self._strip_comments(original_sql)
        for rule in self.RULES:
            inspected_sql = (
                sql_without_comments if rule.inspect_original else normalized_sql
            )
            occurrences = len(rule.pattern.findall(inspected_sql))
            if not occurrences:
                continue

            contribution = rule.weight * min(occurrences, rule.max_occurrences)
            score += contribution
            matched_rules.append(rule.code)
            reasons.append(
                f"{rule.description} ({occurrences} match"
                f"{'es' if occurrences != 1 else ''}, +{contribution})"
            )
            if rule.severe:
                severe_count += 1

        return score, matched_rules, reasons, severe_count

    @staticmethod
    def _size_score(line_count: int) -> tuple[int, str]:
        if line_count > 1_000:
            return 4, "Definition exceeds 1,000 lines (+4)"
        if line_count > 300:
            return 3, "Definition exceeds 300 lines (+3)"
        if line_count > 100:
            return 1, "Definition exceeds 100 lines (+1)"
        return 0, ""

    @staticmethod
    def _score_level(score: int) -> str:
        if score >= 12:
            return "VERY_HIGH"
        if score >= 7:
            return "HIGH"
        if score >= 3:
            return "MEDIUM"
        return "LOW"

    @staticmethod
    def _definition_status(definition: SqlCodeObjectDefinition) -> str:
        if definition.is_encrypted:
            return "encrypted"
        if definition.definition is None:
            return "permission_denied_or_hidden"
        return "available"

    @staticmethod
    def _unavailable_reason(definition_status: str) -> str:
        if definition_status == "encrypted":
            return "Definition is encrypted and cannot be scored"
        return "Definition is unavailable because VIEW DEFINITION permission is missing or metadata is hidden"

    @classmethod
    def _build_assessment(
        cls,
        objects: list[SqlComplexityObject],
        elapsed_seconds: float,
        errors: list[str],
    ) -> SqlComplexityAssessment:
        distribution = {level: 0 for level in cls.LEVELS}
        by_type: dict[str, dict[str, int]] = {}
        scored_objects = 0
        unavailable_definitions = 0
        objects_needing_review = 0

        for obj in objects:
            type_summary = by_type.setdefault(
                obj.object_type,
                {
                    "total": 0,
                    "LOW": 0,
                    "MEDIUM": 0,
                    "HIGH": 0,
                    "VERY_HIGH": 0,
                    "unavailable": 0,
                },
            )
            type_summary["total"] += 1

            if obj.complexity_level is None:
                unavailable_definitions += 1
                objects_needing_review += 1
                type_summary["unavailable"] += 1
                continue

            scored_objects += 1
            distribution[obj.complexity_level] += 1
            type_summary[obj.complexity_level] += 1
            if obj.complexity_level in cls.REVIEW_LEVELS:
                objects_needing_review += 1

        ready_objects = distribution["LOW"] + distribution["MEDIUM"]
        readiness_percentage = (
            round((ready_objects / scored_objects) * 100, 1) if scored_objects else None
        )
        status = "completed"
        if errors or unavailable_definitions:
            status = "incomplete"
        if not objects and errors:
            status = "unavailable"

        summary = SqlComplexitySummary(
            status=status,
            rubric_version=cls.RUBRIC_VERSION,
            total_objects=len(objects),
            scored_objects=scored_objects,
            unavailable_definitions=unavailable_definitions,
            distribution=distribution,
            by_type=by_type,
            objects_needing_review=objects_needing_review,
            readiness_percentage=readiness_percentage,
            readiness_indicator=cls._readiness_indicator(readiness_percentage),
            elapsed_seconds=round(elapsed_seconds, 3),
            errors=errors,
        )
        return SqlComplexityAssessment(summary=summary, objects=objects)

    @staticmethod
    def _readiness_indicator(readiness_percentage: Optional[float]) -> str:
        if readiness_percentage is None:
            return "UNKNOWN"
        if readiness_percentage >= 80:
            return "READY"
        if readiness_percentage >= 50:
            return "REVIEW"
        return "HIGH_EFFORT"

    @staticmethod
    def _normalize_sql(sql: str) -> str:
        without_comments = SqlComplexityScorer._strip_comments(sql)
        return re.sub(r"N?'(?:''|[^'])*'", "''", without_comments)

    @staticmethod
    def _strip_comments(sql: str) -> str:
        without_comments = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
        return re.sub(r"--[^\r\n]*", " ", without_comments)
