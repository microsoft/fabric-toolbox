"""FastMCP server entry point for the DAX Performance Tuner toolkit.

ATTRIBUTION NOTICE:
This tool references optimization guidance and patterns from community sources including
SQLBI. All third-party content remains property of respective copyright holders.
See ATTRIBUTION.md in the repository root for complete attribution details.
"""

from fastmcp import FastMCP
from dax_performance_tuner import __version__, __title__

# Registry-based tool registration  
from dax_performance_tuner.mcp_server import register_tools_with_fastmcp

# Initialize FastMCP
mcp = FastMCP(
  "DAX Performance Tuner - Workflow-Driven Optimization Framework",
    instructions="""
This is an MCP tool that enables a workflow-driven, research-driven, and testing-driven DAX optimization framework with specialized tools.

**CRITICAL WORKFLOW ENFORCEMENT:**
- ALWAYS read the complete JSON response from EVERY tool call
- Follow the 2-stage optimization workflow systematically
- Complete each stage fully before advancing to the next
- **ANALYZE QUERY RESULTS IN DEPTH** - Don't just look at status, examine Performance object and EventDetails array

**2-STAGE OPTIMIZATION WORKFLOW:**

**STAGE 1 - CONNECTION ESTABLISHMENT:**
**CALL THIS TOOL FIRST TO ESTABLISH CONNECTION**
• Use connect_to_dataset with workspace_name + dataset_name or xmla_endpoint + dataset_name
• Verify successful connection to Power BI dataset
• Only proceed once connection is confirmed

**STAGE 2 - COMPREHENSIVE BASELINE & OPTIMIZATION:**
• **SINGLE COMPREHENSIVE STEP: Call prepare_query_for_optimization** with the original user query
  - Automatically inlines all measure and user-defined function definitions from the original query
  - Executes baseline performance measurement with comprehensive trace analysis
  - Extracts relevant model metadata for the specific query context
  - Retrieves targeted DAX research articles based on detected patterns
  - Provides complete foundation for optimization work
• **CRITICAL: Focus on the measure and user-defined function definitions shown in the prepared query - these are what you'll optimize, not the query structure**
• **MANDATORY: Perform deep analysis of all baseline results based on research articles provided**
• Baseline provides: performance metrics, complete measure and function definitions to optimize, server timings, model context, and research guidance

**OPTIMIZATION ITERATIONS:**
• **OPTIMIZATION TARGET: Optimize the MEASURE AND USER-DEFINED FUNCTION DEFINITIONS from baseline, not the query structure**
• Keep the same SUMMARIZECOLUMNS grouping as baseline - focus on optimizing measure and function logic
• **OPTIMIZATION STRATEGY: Use the comprehensive analysis from prepare_query_for_optimization:**
  - **Baseline Performance Analysis**: FE/SE split, callback patterns, materialization sizes
  - **Model Metadata**: Schema information to ensure syntactically correct optimizations
  - **Research Articles**: Targeted optimization guidance based on detected patterns
  - **DAX Optimization Guidance**: Apply the comprehensive optimization guidance provided below
• Based on this analysis, develop specific optimizations that address identified bottlenecks:
  - Observe baseline performance symptoms (high FE %, many SE queries, CallbackDataID/EncodeCallback, large materializations vs final row count)
  - Map symptoms to optimization themes (Fusion opportunities, Callback reduction, Cardinality pruning, Iterator simplification, Variable caching)
  - Apply specific DAX patterns from the guidance and research articles
• **Semantic Equivalence Requirement:**
  - Optimized query MUST return identical row count, column structure, and values to baseline
  - Changing aggregation levels or grouping structure = automatic failure
• Use execute_dax_query for testing optimization attempts with automatic baseline comparison
• **After each optimization attempt, analyze results deeply:**
  - Compare Performance metrics to baseline
  - Check if bottlenecks were addressed
  - Identify additional optimization opportunities if needed
• **Success Criteria:** ≥10% performance improvement + semantic equivalence
• **Continue until optimization goals are achieved**

**ITERATIVE OPTIMIZATION WORKFLOW:**
• **After Successful Optimization**: When you achieve ≥10% improvement with semantic equivalence:
  - Present the optimized results to the user
  - Ask if they would like to use the optimized query as a new baseline for further optimization
  - If user agrees, call prepare_query_for_optimization with the optimized query
  - This establishes the optimized query as the new baseline for additional optimization rounds
  - Continue this iterative process to achieve cumulative performance improvements
• **Iterative Benefits**: Multiple optimization rounds can achieve compound improvements (e.g., 79% → 83% → potentially higher)
• **Stop Conditions**: When improvements fall below 10% threshold or user declines further optimization
"""
)

# Register all tools
register_tools_with_fastmcp(mcp)


def main():
    """Start the MCP server with the registered optimization tools."""
    print(f"Starting {__title__} v{__version__} – workflow-driven DAX optimization ready.")
    mcp.run()


if __name__ == "__main__":
    main()
