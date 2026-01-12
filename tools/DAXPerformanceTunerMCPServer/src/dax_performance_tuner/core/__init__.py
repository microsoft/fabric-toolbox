"""
DAX Performance Tuner Core Package

Core functionality for Power BI authentication, REST API client, XMLA connections,
and real Analysis Services trace collection. Provides the foundational infrastructure
that tools depend on for authentic DAX performance analysis.
"""

from .session import session_manager, SessionState
from .analysis import calculate_improvement, compute_semantic_equivalence, select_fastest_run

__all__ = [
    # Session management
    'session_manager',
    'SessionState',
    
    # Analysis and optimization
    'calculate_improvement',
    'compute_semantic_equivalence',
    'select_fastest_run'
]
