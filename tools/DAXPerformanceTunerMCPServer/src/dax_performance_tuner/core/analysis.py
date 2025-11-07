"""Performance analysis utilities for DAX Performance Tuner.

Provides helpers for calculating performance deltas, judging semantic
equivalence between baseline and optimized runs, and selecting the fastest
execution result recorded by the .NET DAX executor.
"""

import json
from typing import Any, Dict, List


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
    """Compare results from current query with baseline results."""
    summary = getattr(session_state, "query_data", {}).get("summary", {})
    if not summary.get("baseline_established"):
        return {
            "evaluated": False,
            "is_equivalent": None,
            "reasons": ["No baseline available"],
        }

    baseline_record = getattr(session_state, "query_data", {}).get("baseline")
    if not baseline_record:
        return {
            "evaluated": False,
            "is_equivalent": None,
            "reasons": ["Baseline record not found"],
        }
    
    # Extract baseline results array from the results dict
    baseline_result_data = baseline_record.get("results", {})
    baseline_results = baseline_result_data.get("results", [])
    
    if not baseline_results:
        return {
            "evaluated": False,
            "is_equivalent": None,
            "reasons": ["Baseline data not found"],
        }

    # Get current results array
    current_results = current_query_data.get("results", [])
    
    # Check result count matches
    if len(current_results) != len(baseline_results):
        return {
            "evaluated": True,
            "is_equivalent": False,
            "reasons": [
                f"Number of results differs (baseline={len(baseline_results)}, current={len(current_results)})"
            ],
        }
    
    # Compare each result by ResultNumber
    all_reasons = []
    
    for current_result in current_results:
        result_num = current_result.get("ResultNumber", 0)
        
        # Find matching baseline result by ResultNumber
        baseline_result = next(
            (r for r in baseline_results if r.get("ResultNumber") == result_num), 
            None
        )
        
        if not baseline_result:
            all_reasons.append(f"Result #{result_num}: No matching baseline found")
            continue
        
        # Use the same comparison logic as before
        current_rows = current_result.get("RowCount", 0)
        baseline_rows = baseline_result.get("RowCount", 0)
        current_cols = current_result.get("ColumnCount", 0)
        baseline_cols = baseline_result.get("ColumnCount", 0)
        
        if current_rows != baseline_rows:
            all_reasons.append(
                f"Result #{result_num}: Row count differs (baseline={baseline_rows}, current={current_rows})"
            )
        if current_cols != baseline_cols:
            all_reasons.append(
                f"Result #{result_num}: Column count differs (baseline={baseline_cols}, current={current_cols})"
            )
        
        # Compare data if counts match
        if current_rows == baseline_rows and current_cols == baseline_cols:
            current_rows_data = current_result.get("Rows", [])
            baseline_rows_data = baseline_result.get("Rows", [])
            
            if _row_signatures(current_rows_data) != _row_signatures(baseline_rows_data):
                all_reasons.append(f"Result #{result_num}: Data values differ")

    return {
        "evaluated": True,
        "is_equivalent": len(all_reasons) == 0,
        "reasons": all_reasons,
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
