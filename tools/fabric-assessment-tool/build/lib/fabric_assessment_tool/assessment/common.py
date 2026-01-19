from dataclasses import dataclass
from typing import Any, List, Optional


@dataclass
class AssessmentStatus:
    """Assessment status information."""

    status: str  # e.g., "in_progress", "completed", "failed"
    description: Optional[str] = None