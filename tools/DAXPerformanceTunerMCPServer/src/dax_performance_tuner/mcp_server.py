"""Register FastMCP tools backed by the core business logic functions."""

import json
from typing import Dict, Any


def register_tools_with_fastmcp(mcp):
    """Register all tools with FastMCP."""
    from .core.connection import connect_to_dataset_core
    from .core.execution import execute_dax_query_core, prepare_query_for_optimization_core
    
    # Register connect_to_dataset - SMART UNIFIED TOOL
    @mcp.tool(name="connect_to_dataset", description="""Smart connection tool - connects if enough info, discovers if not.

        **🚀 SMART BEHAVIOR:**
        This tool figures out what you need and does it automatically!
        
        **DIRECT CONNECT (has dataset_name + location):**
        • connect_to_dataset(dataset_name="Sales Model", workspace_name="Sales Analytics")
        • connect_to_dataset(dataset_name="ae86...", desktop_port=57466)
        • connect_to_dataset(dataset_name="Sales Model", xmla_endpoint="powerbi://...")
        → Result: ✅ Connected!
        
        **AUTO-MATCH (has dataset_name only):**
        • connect_to_dataset(dataset_name="Sales")
        → Searches desktop instances for matches
        → If 1 match: ✅ Auto-connects!
        → If multiple: Shows options to disambiguate
        
        **DISCOVER DATASETS (has location, no dataset_name):**
        • connect_to_dataset(workspace_name="Sales Analytics")
        • connect_to_dataset(desktop_port=57466)
        → Returns: List of available datasets at that location
        
        **DISCOVER DESKTOP INSTANCES (no parameters):**
        • connect_to_dataset()
        → Returns: All desktop instances with their datasets
        → Use location="service" to discover Power BI Service workspaces instead
        
        **PARAMETERS (all optional):**
        • dataset_name: Dataset to connect to (or partial name to search)
        • workspace_name: Power BI workspace name (service only)
        • desktop_port: Desktop instance port (desktop only)
        • xmla_endpoint: Full XMLA endpoint URL
        • location: Explicit location - "desktop" or "service" (optional, auto-detects if not provided)
        
        **The tool will guide you on next steps if more info is needed!**""")
    def connect_to_dataset_wrapper(
        dataset_name: str = None, 
        workspace_name: str = None, 
        xmla_endpoint: str = None, 
        desktop_port: int = None,
        location: str = None
    ):
        try:
            result = connect_to_dataset_core(
                dataset_name=dataset_name, 
                workspace_name=workspace_name, 
                xmla_endpoint=xmla_endpoint,
                desktop_port=desktop_port,
                location=location
            )
            return json.dumps(result, indent=2, default=str)
        except Exception as e:
            return json.dumps({"status": "error", "error": str(e)}, indent=2, default=str)
    
    @mcp.tool(name="execute_dax_query", description="""Execute optimized DAX queries with performance measurement and comparison to baseline.

        **🚨 CRITICAL WORKFLOW REQUIREMENT 🚨**
        **BEFORE EVERY QUERY EXECUTION, YOU MUST:**
        1. **REVIEW THE `prepared_query_for_optimization` OUTPUT** - To formulate an optimization plan based on deep analysis of the baseline results and research articles
              
        **AFTER EVERY QUERY EXECUTION, YOU MUST:**
        1. **ANALYZE THE COMPLETE RESPONSE** - Don't just look at status/performance summary
        2. **EXAMINE THE Performance OBJECT** - Look at FE/SE split, SE_Queries count, SE_Par values
        3. **EXAMINE EVERY EVENT IN EventDetails** - Look for CallbackDataID, large Rows/KB values, FE/SE patterns
        4. **IDENTIFY SPECIFIC BOTTLENECKS** - What's causing poor performance? Callbacks? Large materializations? Too many SE queries?
        5. **PROPOSE CONCRETE OPTIMIZATIONS** - Based on the analysis framework, what specific DAX patterns should be changed?
        
        **DO NOT PROCEED TO NEXT OPTIMIZATION WITHOUT COMPLETING THIS ANALYSIS**

        **OPTIMIZATION TARGET CLARITY:**
        • **OPTIMIZE THE MEASURE AND USER-DEFINED FUNCTION DEFINITIONS, NOT THE QUERY STRUCTURE**
        • Keep the same SUMMARIZECOLUMNS grouping structure from baseline
        • Focus on replacing inefficient patterns in measures and functions with optimized DAX
        • Must return IDENTICAL results to baseline for valid optimization

        **HANDLING DAX SYNTAX ERRORS:**
        • If you encounter a syntax error, don't immediately abandon the optimization approach
        • Attempt to understand the root cause and adjust syntax before abandoning the optimization approach
        • Only abandon the optimization approach after it is clear that all reasonable syntax variations have been exhausted

        **INPUT:** dax_query (string)""") 
    def execute_dax_query_wrapper(dax_query: str):
        try:
            result = execute_dax_query_core(dax_query=dax_query, execution_mode="optimization")
            return json.dumps(result, indent=2, default=str)
        except Exception as e:
            return json.dumps({"status": "error", "error": str(e)}, indent=2, default=str)
    
    @mcp.tool(name="prepare_query_for_optimization", description="""Comprehensive DAX query preparation, baseline execution, and analysis setup.

        **WHEN TO USE**
        • Always call FIRST before any optimization attempts
        • Re-run ONLY if the original query text (grouping columns / structural query shape) changes
        • Do NOT re-run just because you changed measure internals for optimization—use `execute_dax_query` for those iterations

        **OUTPUT OBJECTS & HOW TO READ THEM (LLM MUST STUDY CAREFULLY)**
        1. prepared_query
        - `original_query`: User-provided raw DAX
        - `enhanced_query`: Same query with all dependent measures inlined (this is the canonical text for analysis)
        - `measures_added`: Count of inlined measures appended
        - `formatting`: Whether automatic reformatting succeeded
        2. baseline_execution
        - `Result`: Row/column counts and data sample (for semantic comparison later)
        - `Performance` (High-level metrics):
        • Total (ms) – overall baseline time
        • FE vs SE – distribution; high FE% ⇒ formula engine heavy patterns (iterators, callbacks, context transition)
        • SE_Queries – count of storage engine queries (goal: minimize by enabling fusion)
        • SE_CPU & SE_Par – parallelism; low parallelism might indicate FE bottlenecks or serialized callbacks
        - `EventDetails` (Execution waterfall – MUST analyze line-by-line):
        • Look for: large `Rows` / `KB`, repeated scans of same grain, presence of `CallbackDataID`, `EncodeCallback`, long FE gaps between SE scans
        • Compare early vs late scans to detect semi‑joins (IN tuples / VAND lists) created by FE shaping
        • Identify redundant similar xmSQL patterns → opportunity for consolidation or vertical fusion
        3. research_articles
        - `articles`: Array containing (a) general optimization framework (ALWAYS include) and (b) targeted pattern articles
        - Each article may have `matched_patterns` showing exact substrings from the query triggering it—treat these as hypothesis seeds, not guaranteed issues
        - **⚠️ POTENTIAL OPTIMIZATIONS, NOT GUARANTEES:** Articles represent potential optimization opportunities based on pattern detection. They are NOT guaranteed to improve performance in your specific query context. Pattern matching is intentionally broad to avoid missing opportunities, which means false positives will occur.
        - **⚠️ VALIDATION REQUIRED:** Articles may be flagged even when the detected pattern is not problematic. ALWAYS cross-validate pattern matches against actual query behavior in `EventDetails` before applying optimizations. A pattern match without corresponding performance symptoms in EventDetails should NOT be optimized.
        - LLM MUST read ALL returned articles before proposing an optimization plan. Skipping this step leads to incomplete or incorrect optimization reasoning.
        - **RESEARCH UTILIZATION (MANDATORY) — DO NOT IGNORE**
            The research section is NOT supplemental; it is a first‑class input to your reasoning process:
            • The "general optimization framework" article provides the canonical method to interpret `Performance` + `EventDetails` (follow it step-by-step: high-level metrics → scan/event decomposition → callback / materialization diagnosis → fusion opportunities).
            • Each additional article was surfaced because pattern matching detected code fragments or structural hints of potential anti‑patterns in the query (e.g. filtered table arguments, repeated measure evaluation, context transitions, lack of fusion, dimension-iterator misuse).
            • **CRITICAL VALIDATION STEP:** For each flagged article, analyze BOTH the matched pattern AND the baseline execution symptoms. A pattern match alone does NOT confirm the issue exists—you must find corresponding evidence in `EventDetails` (callbacks, large materializations, excessive SE queries, poor parallelism, etc.) that aligns with the article's described symptoms.
            • You must explicitly map: (a) observed symptoms in `EventDetails` (Rows, KB, callbacks, repeated scans, IN tuple explosions) TO (b) relevant research article sections and (c) concrete optimization tactics.
            • If an article's suspected pattern is ultimately a false positive, state WHY (e.g. small cardinality, additive measure reuse already fused, benign context transition, pattern exists but doesn't manifest as bottleneck in EventDetails) so it is not retried in later iterations.
            • Prioritize optimizations where: (1) article guidance aligns with multiple observed symptoms AND (2) pattern match corresponds to actual performance issue in EventDetails AND (3) change can be confined to measure body without altering query grouping.
            • Document (internally or aloud) a short plan: Pattern Match → Symptom Validation in EventDetails → Article Reference → Proposed Rewrite Pattern → Expected Impact (e.g. fewer SE_Queries, reduced FE time, elimination of VAND list, improved fusion).
            • Only after forming that plan with validated symptoms should you produce an optimized measure version for execution.
        4. model_metadata
        - `summary`: Table/column/measure counts
        - `relationships`: Cardinality + direction (use to reason about filter propagation and join reduction opportunities)
        - `columns` + `measures`: Only those relevant to the query scope, enabling validation of referenced names and potential additive behavior

        **LLM MUST THINK ALOUD (OPTIONAL BUT ENCOURAGED)**
        It may output a reasoning section enumerating: baselines metrics, suspected bottlenecks, article references, proposed changes, and risk of semantic drift.

        **INPUT REQUIRED:** Raw DAX query with measure references (e.g. `EVALUATE SUMMARIZECOLUMNS('Product'[Category], "Total Sales", [Total Sales])`).
        **DO NOT PASS** already inlined / modified optimization attempts here—use only original user intent query.
                """)
    def prepare_query_for_optimization_wrapper(query: str):
        try:
            result = prepare_query_for_optimization_core(query=query)
            return json.dumps(result, indent=2, default=str)
        except Exception as e:
            return json.dumps({"status": "error", "error": str(e)}, indent=2, default=str)
    

    
    # Register get_session_status
    @mcp.tool(name="get_session_status", description="""Review comprehensive session status and get intelligent next step recommendations.

        Provides comprehensive session overview including performance progress, analysis history, and context-aware recommendations for next steps.

        **GUIDANCE:**
        • Use frequently to stay oriented and avoid duplication of completed work
        • Essential for understanding current analysis status and progress toward optimization goals
        • Purely informational for strategic planning

        **INPUT:** No parameters required.""")
    def get_session_status_wrapper():
        from .core.session import session_manager
        
        try:
            session = session_manager.get_current_session()
            if not session:
                return json.dumps({
                    "status": "error",
                    "error": "No active optimization session found",
                }, indent=2, default=str)

            connection = session.connection_info
            session_payload: Dict[str, Any] = {
                "created_at": session.created_at.isoformat(),
                "last_updated": session.last_updated.isoformat(),
                "query_data": session.query_data,
                "connection_info": {
                    "workspace_name": connection.workspace_name,
                    "dataset_name": connection.dataset_name,
                    "xmla_endpoint": connection.xmla_endpoint,
                }
            }

            return json.dumps({
                "status": "success",
                "session": session_payload,
            }, indent=2, default=str)
        except Exception as e:
            return json.dumps({"status": "error", "error": str(e)}, indent=2, default=str)
