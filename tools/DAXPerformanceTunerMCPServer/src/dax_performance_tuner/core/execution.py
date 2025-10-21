"""DAX query execution and preparation tools with SessionState integration."""

import re
from typing import Dict, Any, List, Tuple, Set, Optional
from collections import deque
from ..infrastructure.auth import get_access_token
from ..infrastructure.xmla import is_desktop_connection
from .analysis import calculate_improvement, compute_semantic_equivalence, select_fastest_run
from ..infrastructure.dax_executor import execute_with_dax_executor
from .session import validate_session, session_manager
from ..config import (
    DAX_EXECUTION_RUNS,
    DAX_EXECUTION_TIMEOUT_SECONDS,
    PERFORMANCE_THRESHOLDS,
)


def _get_connection_details() -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    """Get connection details from current session with auth token if needed.
    
    Returns:
        Tuple of (xmla_endpoint, dataset_name, access_token, error_message)
        If error_message is not None, other values should be ignored.
    """
    is_valid, session, error_msg = validate_session()
    if not is_valid:
        return None, None, None, error_msg or "No active optimization session found"
    
    xmla_endpoint = session.connection_info.xmla_endpoint
    dataset_name = session.connection_info.dataset_name
    
    is_desktop = is_desktop_connection(xmla_endpoint)
    
    access_token = None
    if not is_desktop:
        access_token = get_access_token()
        if not access_token:
            return None, None, None, "No access token for Power BI Service connection. Please reconnect using connect_to_dataset."
    
    return xmla_endpoint, dataset_name, access_token, None


def execute_multiple_dax_runs(
    xmla_endpoint: str, 
    dataset_name: str, 
    access_token: str, 
    dax_query: str
) -> Tuple[List[Dict[str, Any]], bool, Optional[str]]:
    """Execute DAX query multiple times with fast-fail on any failure."""
    successful_runs: List[Dict[str, Any]] = []

    success, data, err = execute_with_dax_executor(
        dax_query, xmla_endpoint, dataset_name, access_token, 
        timeout_seconds=DAX_EXECUTION_TIMEOUT_SECONDS
    )
    
    if not success:
        return [], False, err or "DAX warm-up execution failed"

    for run_num in range(DAX_EXECUTION_RUNS):
        success, data, err = execute_with_dax_executor(
            dax_query, xmla_endpoint, dataset_name, access_token,
            timeout_seconds=DAX_EXECUTION_TIMEOUT_SECONDS
        )
        
        if success:
            run_result = {
                "status": "success",
                "dax_executor_result": data
            }
            successful_runs.append(run_result)
        else:
            return [], False, err or f"DAX execution run {run_num + 1} failed"

    return successful_runs, True, None


def _normalize_name(name: str) -> str:
    return re.sub(r"[^0-9A-Za-z]", "", name).lower()


def _extract_bracket_tokens(text: str) -> Set[str]:
    bracket_pattern = re.compile(r"\[([^\]]+)\]")
    return set(bracket_pattern.findall(text))


def _extract_function_calls(text: str) -> Set[str]:
    function_pattern = re.compile(r'([\w\.]+)\s*\(')
    matches = function_pattern.findall(text)
    return {m for m in matches if '.' in m or not m.isupper()}


def _parse_define_block(query: str) -> Tuple[str, str]:
    """Parse DAX query to separate DEFINE block from main query."""
    pattern = re.compile(r'(.*?\bDEFINE\b.*?)(\bEVALUATE\b.*)', re.IGNORECASE | re.DOTALL)
    match = pattern.match(query)
    
    if match:
        return match.group(1), match.group(2)
    
    return "", query


def _find_existing_measures(define_block: str) -> Set[str]:
    """Find all already-defined measures in the DEFINE block."""
    def_pattern = re.compile(
        r"MEASURE\s+(?:'[^']+'|\w+)\s*\[\s*([^\]]+)\]", re.IGNORECASE
    )
    raw_existing_defs = set(def_pattern.findall(define_block))
    return {_normalize_name(m) for m in raw_existing_defs}


def _find_existing_functions(define_block: str) -> Set[str]:
    """Find all already-defined functions in the DEFINE block."""
    # Match: FUNCTION FunctionName = ...
    func_pattern = re.compile(
        r"FUNCTION\s+([\w\.]+)\s*=", re.IGNORECASE
    )
    raw_existing_funcs = set(func_pattern.findall(define_block))
    return {_normalize_name(f) for f in raw_existing_funcs}


def _build_measure_catalog(measures_data: List[Dict]) -> Tuple[Dict[str, Tuple[str, str]], Dict[str, str]]:
    """Build measure catalog from INFO.MEASURES() data."""
    measures_info = {}
    measure_lookup = {}

    for measure in measures_data:
        measure_name = measure['measure_name']
        table_name = measure.get('table_name', measure.get('table_id', 'Unknown'))
        expression = measure['expression']
        measures_info[measure_name] = (table_name, expression)
        measure_lookup[_normalize_name(measure_name)] = measure_name

    return measures_info, measure_lookup


def _build_function_catalog(functions_data: List[Dict]) -> Tuple[Dict[str, str], Dict[str, str]]:
    """Build function catalog from $SYSTEM.TMSCHEMA_FUNCTIONS data."""
    valid_funcs = [f for f in functions_data if f.get('Name') and f.get('Expression')]
    return (
        {f['Name']: f['Expression'] for f in valid_funcs},
        {_normalize_name(f['Name']): f['Name'] for f in valid_funcs}
    )


def _collect_dependencies(
    initial_text: str,
    normalized_existing_measures: Set[str],
    normalized_existing_functions: Set[str],
    measures_info: Dict[str, Tuple[str, str]],
    measure_lookup: Dict[str, str],
    functions_info: Dict[str, str],
    function_lookup: Dict[str, str]
) -> Tuple[List[Tuple[str, str]], List[Tuple[str, str, str]]]:
    """
    Use BFS to collect all missing functions and measures with their nested dependencies.
    Returns: (functions_to_define, measures_to_define)
    """
    functions_to_define: List[Tuple[str, str]] = []  # [(function_name, expression)]
    measures_to_define: List[Tuple[str, str, str]] = []  # [(measure_name, table_name, expression)]
    
    seen_functions = set(normalized_existing_functions)
    seen_measures = set(normalized_existing_measures)
    queue = deque()
    
    bracket_tokens = _extract_bracket_tokens(initial_text)
    function_calls = _extract_function_calls(initial_text)
    
    for func_call in function_calls:
        norm_func = _normalize_name(func_call)
        if norm_func not in seen_functions and norm_func in function_lookup:
            queue.append(('function', norm_func))
    
    for bracket_tok in bracket_tokens:
        norm_measure = _normalize_name(bracket_tok)
        if norm_measure not in seen_measures and norm_measure in measure_lookup:
            queue.append(('measure', norm_measure))
    
    while queue:
        dep_type, norm_name = queue.popleft()
        
        if dep_type == 'function':
            if norm_name in seen_functions:
                continue
            
            if norm_name not in function_lookup:
                continue
                
            actual_name = function_lookup[norm_name]
            seen_functions.add(norm_name)
            
            expr = functions_info[actual_name]
            functions_to_define.append((actual_name, expr))
            
            for child_func in _extract_function_calls(expr):
                child_norm = _normalize_name(child_func)
                if child_norm not in seen_functions and child_norm in function_lookup:
                    queue.append(('function', child_norm))
            
            for child_measure in _extract_bracket_tokens(expr):
                child_norm = _normalize_name(child_measure)
                if child_norm not in seen_measures and child_norm in measure_lookup:
                    queue.append(('measure', child_norm))
        
        elif dep_type == 'measure':
            if norm_name in seen_measures:
                continue
            
            if norm_name not in measure_lookup:
                continue
                
            actual_name = measure_lookup[norm_name]
            seen_measures.add(norm_name)
            
            table_name, expr = measures_info[actual_name]
            measures_to_define.append((actual_name, table_name, expr))
            
            for child_func in _extract_function_calls(expr):
                child_norm = _normalize_name(child_func)
                if child_norm not in seen_functions and child_norm in function_lookup:
                    queue.append(('function', child_norm))
            
            for child_measure in _extract_bracket_tokens(expr):
                child_norm = _normalize_name(child_measure)
                if child_norm not in seen_measures and child_norm in measure_lookup:
                    queue.append(('measure', child_norm))
    
    return functions_to_define, measures_to_define


def _build_enhanced_query(
    original_query: str,
    functions_to_define: List[Tuple[str, str]],
    measures_to_define: List[Tuple[str, str, str]]
) -> str:
    if not functions_to_define and not measures_to_define:
        return original_query

    all_definition_lines = (
        [f"\tFUNCTION {name} = {expr}" for name, expr in functions_to_define] +
        [f"\tMEASURE '{table}'[{name}] = {expr}" for name, table, expr in measures_to_define]
    )
    
    define_pattern = re.compile(r'^(\s*(?://.*\n)*\s*)DEFINE(\s)', re.IGNORECASE | re.MULTILINE)
    define_match = define_pattern.search(original_query)
    
    if define_match:
        prefix = define_match.group(1)
        suffix = define_match.group(2)
        
        replacement = prefix + "DEFINE\n" + "\n".join(all_definition_lines) + suffix
        
        enhanced_query = define_pattern.sub(replacement, original_query, count=1)
    else:
        upper_query = original_query.upper()
        evaluate_pos = upper_query.find("EVALUATE")
        
        if evaluate_pos == -1:
            return original_query
        
        from_evaluate = original_query[evaluate_pos:]
        
        define_block = "DEFINE\n" + "\n".join(all_definition_lines) + "\n\n"
        enhanced_query = define_block + from_evaluate
    
    return enhanced_query


def execute_dax_query_core(
    dax_query: str, 
    execution_mode: str = "optimization"
) -> Dict[str, Any]:
    try:
        xmla_endpoint, dataset_name, access_token, error_msg = _get_connection_details()
        if error_msg:
            return {"status": "error", "error": error_msg}

        runs, all_success, recent_error = execute_multiple_dax_runs(
            xmla_endpoint, dataset_name, access_token, dax_query
        )

        if not all_success:
            return {
                "status": "error", 
                "error": recent_error or "DAX query execution failed"
            }

        fastest_run = select_fastest_run(runs)
        dax_executor_result = fastest_run.get("dax_executor_result", {})
        performance_data = dax_executor_result.get("Performance", {})
        results = dax_executor_result.get("Results", [])

        performance_analysis = None
        semantic_equivalence = None
        
        if execution_mode == "optimization":
            session_state = session_manager.get_current_session()
            
            if session_state and session_state.query_data["summary"].get("baseline_established"):
                baseline_data = session_state.query_data.get("baseline", {})
                baseline_performance = baseline_data.get("results", {}).get("performance_metrics", {})
                current_performance = {
                    "total_ms": performance_data.get("Total", 0),
                    "fe_ms": performance_data.get("FE", 0),
                    "se_ms": performance_data.get("SE", 0),
                    "se_cpu_ms": performance_data.get("SE_CPU", 0)
                }
                
                improvement_percent = calculate_improvement(baseline_performance, current_performance)
                
                performance_analysis = {
                    "baseline_total_ms": baseline_performance.get("total_ms", 0),
                    "current_total_ms": current_performance.get("total_ms", 0),
                    "improvement_percent": improvement_percent,
                    "meets_threshold": improvement_percent >= PERFORMANCE_THRESHOLDS["improvement_threshold_percent"],
                }
                
                # Simple: just pass the results array
                current_query_data = {"results": results}
                
                semantic_equivalence = compute_semantic_equivalence(session_state, current_query_data)

        session_manager.track_dax_query_execution(
            dax_query=dax_query,
            execution_mode=execution_mode,
            performance_data={
                "total_ms": performance_data.get("Total", 0),
                "fe_ms": performance_data.get("FE", 0),
                "se_ms": performance_data.get("SE", 0),
                "se_cpu_ms": performance_data.get("SE_CPU", 0),
                "se_parallelism": performance_data.get("SE_Par", 0),
                "se_queries": performance_data.get("SE_Queries", 0),
                "se_cache": performance_data.get("SE_Cache", 0),
                "query_end": performance_data.get("QueryEnd", "")
            },
            result_data=results,
            performance_analysis=performance_analysis if performance_analysis else None,
            semantic_equivalence=semantic_equivalence if semantic_equivalence else None
        )

        response_data = {
            "status": "success"
        }

        if performance_analysis:
            response_data["performance_analysis"] = performance_analysis

        if semantic_equivalence:
            response_data["semantic_equivalence"] = semantic_equivalence

        response_data.update({
            "Results": results,
            "Performance": dax_executor_result.get("Performance", {}),
            "EventDetails": dax_executor_result.get("EventDetails", [])
        })

        return response_data

    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }


def prepare_query_for_optimization_core(query: str) -> Dict[str, Any]:
    try:
        xmla_endpoint, dataset_name, access_token, error_msg = _get_connection_details()
        if error_msg:
            return {"status": "error", "error": error_msg}

        session_manager.establish_new_baseline_for_current_session(query)
        define_block, main_query = _parse_define_block(query)

        # Find already-defined measures and functions
        normalized_existing_measures = _find_existing_measures(define_block)
        normalized_existing_functions = _find_existing_functions(define_block)

        try:
            from .metadata import get_complete_model_definition, execute_dmv_query

            metadata_result = get_complete_model_definition(xmla_endpoint, dataset_name)
            if isinstance(metadata_result, dict) and metadata_result.get("status") == "error":
                error_msg = (
                    "Failed to access model metadata for measure definitions: "
                    f"{metadata_result.get('error', 'Unknown error')}"
                )
                return {
                    "status": "error",
                    "error": error_msg
                }

            measures_data = metadata_result.get("measures", [])

            if not measures_data:
                # No measures in model - just use the query as-is
                measures_info = []
                measure_lookup = {}
            else:
                measures_info, measure_lookup = _build_measure_catalog(measures_data)
            
            functions_query = "SELECT * FROM $SYSTEM.TMSCHEMA_FUNCTIONS"
            functions_result = execute_dmv_query(xmla_endpoint, dataset_name, functions_query)
            
            if isinstance(functions_result, dict) and functions_result.get("status") == "error":
                # Functions query failed - continue without functions (some models may not have UDFs)
                functions_data = []
            else:
                functions_data = functions_result
            
            # Build function catalog
            functions_info, function_lookup = _build_function_catalog(functions_data)

        except Exception as e:
            return {
                "status": "error",
                "error": f"Failed to access or parse model metadata: {str(e)}"
            }

        full_query_text = (define_block or "") + main_query
        functions_to_define, measures_to_define = _collect_dependencies(
            full_query_text,
            normalized_existing_measures,
            normalized_existing_functions,
            measures_info,
            measure_lookup,
            functions_info,
            function_lookup
        )

        # Build the enhanced query with function and measure definitions
        enhanced_query = _build_enhanced_query(
            query, functions_to_define, measures_to_define
        )

        # STEP 2: Execute baseline query
        baseline_execution = execute_dax_query_core(
            dax_query=enhanced_query,
            execution_mode="baseline"
        )

        try:
            from .metadata import get_limited_metadata
            limited_metadata_result = get_limited_metadata(enhanced_query, xmla_endpoint, dataset_name)
            
            if isinstance(limited_metadata_result, dict) and limited_metadata_result.get("status") == "error":
                model_metadata = limited_metadata_result
            else:
                model_metadata = limited_metadata_result
        except Exception as e:
            model_metadata = {"status": "error", "error": f"Failed to get model metadata: {str(e)}"}

        try:
            from .research import get_dax_research_core
            research_articles = get_dax_research_core(target_query=enhanced_query)
        except Exception as e:
            research_articles = {"status": "error", "error": f"Failed to get DAX research: {str(e)}"}

        return {
            "status": "success",
            "prepared_query": {
                "enhanced_query": enhanced_query,
                "original_query": query,
                "functions_added": len(functions_to_define) if functions_to_define else 0,
                "measures_added": len(measures_to_define) if measures_to_define else 0
            },
            "baseline_execution": baseline_execution,
            "research_articles": research_articles,
            "model_metadata": model_metadata
        }

    except Exception as e:
        return {
            "status": "error",
            "error": f"Query preparation workflow failed: {str(e)}"
        }