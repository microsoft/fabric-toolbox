"""
Session management primitives for the DAX Performance Tuner workflow.

The module exposes a minimal in-memory session store that captures:
- Connection metadata
- DAX query executions (baseline + optimizations)
- Derived performance insights for the best optimization so far
- Lightweight audit information for tool executions
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, Optional, Tuple
import threading


def _create_empty_query_data() -> Dict[str, Any]:
    """Create empty query data structure."""
    return {
        "summary": {
            "original_query": None,
            "baseline_established": False,
            "best_optimization_query_id": None,
            "best_improvement_percentage": 0.0,
            "meets_improvement_threshold": False,
            "best_optimization_equivalent": False
        },
        "baseline": {},      
        "optimizations": {}  
    }


@dataclass
class ConnectionInfo:
    """Canonical connection information structure."""
    xmla_endpoint: str
    dataset_name: str
    workspace_name: str

@dataclass 
class SessionState:
    
    connection_info: ConnectionInfo
    created_at: datetime = field(default_factory=datetime.now)
    last_updated: datetime = field(default_factory=datetime.now)
    query_data: Dict[str, Any] = field(default_factory=_create_empty_query_data)

    def update_timestamp(self) -> None:
        self.last_updated = datetime.now()
    
    def track_query_execution(self, query: str, execution_mode: str, results: Dict[str, Any], 
                             error: Optional[str] = None) -> str:
        if execution_mode == "baseline":
            query_id = "baseline"
        else:
            optimization_queries = self.query_data.get("optimizations", {})
            current_count = len(optimization_queries) + 1
            query_id = f"optimization_{current_count}"
        
        query_record = {
            "query_id": query_id,
            "query_text": query,
            "execution_mode": execution_mode,
            "executed_at": datetime.now().isoformat(),
            "results": results,
            "error": error,
            "success": error is None
        }
        
        if execution_mode == "baseline":
            self.query_data["baseline"] = query_record
        else:
            if "optimizations" not in self.query_data:
                self.query_data["optimizations"] = {}
            self.query_data["optimizations"][query_id] = query_record
            
        if execution_mode == "baseline" and error is None:
            self.query_data.setdefault("summary", {})["baseline_established"] = True
        
        if not self.query_data.get("summary", {}).get("original_query"):
            self.query_data.setdefault("summary", {})["original_query"] = query
        
        if execution_mode != "baseline":
            self._update_performance_summary(query_id, results)

        self.update_timestamp()
        return query_id
    
    def reset_query_data(self) -> None:
        self.query_data = _create_empty_query_data()
        self.update_timestamp()
    
    def establish_new_baseline(self, query: str) -> None:
        self.reset_query_data()
        self.query_data["summary"]["original_query"] = query
        self.update_timestamp()

    def _update_performance_summary(self, query_id: str, results: Dict[str, Any]) -> None:
        performance_analysis = results.get("performance_analysis")
        if not isinstance(performance_analysis, dict):
            return

        improvement = performance_analysis.get("improvement_percent")
        if improvement is None:
            return

        summary = self.query_data["summary"]
        current_best = summary.get("best_improvement_percentage", 0.0)
        
        if improvement > current_best:
            summary["best_improvement_percentage"] = improvement
            summary["best_optimization_query_id"] = query_id
            summary["meets_improvement_threshold"] = bool(performance_analysis.get("meets_threshold"))

            semantic_equivalence = results.get("semantic_equivalence")
            if isinstance(semantic_equivalence, dict):
                summary["best_optimization_equivalent"] = bool(semantic_equivalence.get("is_equivalent"))


class SessionManager:
    
    def __init__(self):
        self._current_session: Optional[SessionState] = None
        self._lock = threading.Lock()
    
    def create_session(self, workspace_name: str, dataset_name: str, xmla_endpoint: str) -> None:
        with self._lock:
            connection_info = ConnectionInfo(
                xmla_endpoint=xmla_endpoint,
                dataset_name=dataset_name,
                workspace_name=workspace_name
            )
            
            session_state = SessionState(
                connection_info=connection_info
            )
            
            session_state.update_timestamp()
            
            self._current_session = session_state
    
    def get_current_session(self) -> Optional[SessionState]:
        with self._lock:
            return self._current_session
    
    def establish_new_baseline_for_current_session(self, query: str) -> bool:
        with self._lock:
            if not self._current_session:
                return False
            self._current_session.establish_new_baseline(query)
            return True
    
    def track_dax_query_execution(
        self,
        dax_query: str,
        execution_mode: str,
        performance_data: Dict[str, Any],
        result_data: Any,  # Now expects array of results
        error: Optional[str] = None,
        performance_analysis: Optional[Dict[str, Any]] = None,
        semantic_equivalence: Optional[Dict[str, Any]] = None
    ) -> Optional[str]:
        session = self.get_current_session()
        if not session:
            return None
        
        with self._lock:
            query_results = {
                "performance_metrics": performance_data,
                "results": result_data  # Array of results, each with ResultNumber
            }
            
            if performance_analysis is not None:
                query_results["performance_analysis"] = performance_analysis
            
            if semantic_equivalence is not None:
                query_results["semantic_equivalence"] = semantic_equivalence
            
            query_id = session.track_query_execution(
                query=dax_query,
                execution_mode=execution_mode,
                results=query_results,
                error=error
            )
            
            return query_id
    


session_manager = SessionManager()



def validate_session() -> Tuple[bool, Optional[SessionState], Optional[str]]:
    """Validate that an active session exists. Returns (is_valid, session_state, error_message)."""
    session_state = session_manager.get_current_session()
    
    if not session_state:
        return False, None, "No active optimization session found"
    
    return True, session_state, None