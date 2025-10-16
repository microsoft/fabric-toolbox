"""Performance analysis utilities for DAX Performance Tuner.

Provides helpers for calculating performance deltas, judging semantic
equivalence between baseline and optimized runs, and selecting the fastest
execution result recorded by the .NET DAX executor.
"""

import json
from typing import Any, Dict, List, Optional


def _row_signatures(rows: Any) -> List[str]:
    if not isinstance(rows, list):
        return []

    signatures: List[str] = []
    for row in rows:
        try:
            signatures.append(json.dumps(row, sort_keys=True, default=str))
        except TypeError:
            signatures.append(repr(row))
    signatures.sort()
    return signatures


def calculate_improvement(
    baseline_metrics: Dict[str, Any],
    optimized_metrics: Dict[str, Any]
) -> float:
    try:
        baseline_total = float(baseline_metrics.get("total_ms", 0))
        optimized_total = float(optimized_metrics.get("total_ms", 0))
    except (TypeError, ValueError):
        return 0.0

    if baseline_total <= 0:
        return 0.0

    improvement = ((baseline_total - optimized_total) / baseline_total) * 100
    return round(improvement, 2)


def compute_semantic_equivalence(
    session_state: Any,
    current_query_data: Dict[str, Any]
) -> Dict[str, Any]:
    summary = getattr(session_state, "query_data", {}).get("summary", {})
    if not summary.get("baseline_established"):
        return {
            "evaluated": False,
            "is_equivalent": None,
            "reasons": ["No baseline available"],
        }

    baseline_record = getattr(session_state, "query_data", {}).get("baseline")
    baseline_results = baseline_record.get("results") if baseline_record else None
    if not baseline_results:
        return {
            "evaluated": False,
            "is_equivalent": None,
            "reasons": ["Baseline data not found"],
        }

    current_meta = current_query_data.get("result_metadata", {})
    baseline_meta = baseline_results.get("result_metadata", {})

    current_rows = current_meta.get("row_count")
    baseline_rows = baseline_meta.get("row_count")
    current_cols = current_meta.get("column_count")
    baseline_cols = baseline_meta.get("column_count")
    current_data = current_query_data.get("data", {})
    baseline_data_content = baseline_results.get("data", {})

    current_rows_data = current_data.get("rows", [])
    baseline_rows_data = baseline_data_content.get("rows", [])

    # Build equivalence analysis
    reasons = []
    if current_rows != baseline_rows:
        reasons.append(
            f"Row count differs (baseline={baseline_rows}, current={current_rows})"
        )
    if current_cols != baseline_cols:
        reasons.append(
            f"Column count differs (baseline={baseline_cols}, current={current_cols})"
        )

    if not reasons:
        if _row_signatures(current_rows_data) != _row_signatures(baseline_rows_data):
            reasons.append("Data values differ")

    return {
        "evaluated": True,
        "is_equivalent": len(reasons) == 0,
        "reasons": reasons,
    }


def select_fastest_run(runs: List[Dict[str, Any]]) -> Dict[str, Any]:
    best_run = None
    best_total_time = float("inf")

    for run in runs:
        try:
            dax_executor_result = run.get("dax_executor_result", {})
            performance = dax_executor_result.get("Performance", {})

            total_time = performance.get("Total")
            if total_time is not None:
                total_time_val = float(total_time)
                if total_time_val < best_total_time:
                    best_total_time = total_time_val
                    best_run = run

        except (KeyError, ValueError, TypeError):
            continue

    if best_run is None and runs:
        best_run = runs[0]

    return best_run
