from dataclasses import dataclass, field
from typing import Any

from dbt.adapters.base.impl import PythonSubmissionResult


@dataclass
class LivySubmissionResult(PythonSubmissionResult):
    success: bool
    error_message: str | None = None


@dataclass
class LivySessionResult:
    statement_id: int = -1
    success: bool = False
    error_message: str | None = None
    status_code: str | None = None
    json_data: dict[str, Any] | None = field(default_factory=dict)

    def to_submission_result(self, code: str) -> LivySubmissionResult:
        return LivySubmissionResult(
            run_id=str(self.statement_id),
            compiled_code=code,
            success=self.success,
            error_message=self.error_message,
        )
