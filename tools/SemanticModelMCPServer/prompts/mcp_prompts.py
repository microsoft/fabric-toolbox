"""
MCP Prompts for the Semantic Model MCP Server

This module contains all the MCP prompts that provide guided interactions
for users working with Power BI workspaces, datasets, and Fabric lakehouses.
"""

def register_prompts(mcp):
    """Register all MCP prompts with the FastMCP instance."""
    
    # Basic workspace and dataset exploration prompts
    @mcp.prompt
    def ask_about_workspaces() -> str:
        """Ask to get a list of Power BI workspaces"""
        return "Can you get a list of workspaces?"

    @mcp.prompt
    def ask_about_datasets() -> str:
        """Ask to get a list of Power BI datasets"""
        return "Can you get a list of datasets?"

    @mcp.prompt
    def ask_about_lakehouses() -> str:
        """Ask to get a list of Fabric lakehouses"""
        return "Can you show me the lakehouses in this workspace?"

    @mcp.prompt
    def ask_about_delta_tables() -> str:
        """Ask to get a list of Delta Tables in a lakehouse"""
        return "Can you list the Delta Tables in this lakehouse?"

    @mcp.prompt
    def explore_workspace() -> str:
        """Get a comprehensive overview of a workspace including datasets, lakehouses, and notebooks"""
        return "Can you give me a complete overview of this workspace? Show me all datasets, lakehouses, notebooks, and Delta Tables."

    # Semantic model analysis and structure prompts
    @mcp.prompt
    def analyze_model_structure() -> str:
        """Ask to analyze the structure of a semantic model using TMSL"""
        return "Can you get the TMSL definition for a model and explain its structure including tables, columns, measures, and relationships?"

    @mcp.prompt
    def sample_dax_queries() -> str:
        """Get examples of useful DAX queries to run against a model"""
        return "Can you show me some useful DAX queries I can run against this model? Include queries for basic measures, top values, and data exploration."

    @mcp.prompt
    def compare_models() -> str:
        """Compare the structure of two different semantic models"""
        return "Can you help me compare the structure of two different semantic models? Show me the differences in their tables, columns, and measures."

    @mcp.prompt
    def data_lineage_exploration() -> str:
        """Explore data lineage from Delta Tables to semantic models"""
        return "Can you help me understand the data lineage? Show me the Delta Tables in the lakehouse and how they might relate to the semantic models in this workspace."

    # Model optimization and management prompts
    @mcp.prompt
    def model_optimization_suggestions() -> str:
        """Analyze a model and suggest optimizations"""
        return "Can you analyze this semantic model and suggest potential optimizations? Look at the table structure, relationships, and measures. Also run the Best Practice Analyzer to identify specific improvement opportunities."

    @mcp.prompt
    def create_calculated_measure() -> str:
        """Help create a new calculated measure in a model"""
        return "Can you help me add a new calculated measure to this semantic model? I'll provide the measure definition and you can update the TMSL."

    @mcp.prompt
    def troubleshoot_model_issues() -> str:
        """Help troubleshoot common model issues"""
        return "Can you help me troubleshoot issues with this semantic model? Check the model structure and suggest solutions for common problems."

    @mcp.prompt
    def model_performance_analysis() -> str:
        """Analyze model performance and suggest optimizations"""
        return "Can you analyze my semantic model for performance issues? Look at the DAX measures, table structures, and relationships to suggest optimizations."

    # 🆕 Best Practice Analyzer (BPA) prompts
    @mcp.prompt
    def analyze_model_best_practices() -> str:
        """Analyze a semantic model for best practice compliance using BPA"""
        return "Can you analyze my semantic model for best practice violations? Run the Best Practice Analyzer to identify issues with performance, DAX expressions, formatting, and maintenance."

    @mcp.prompt
    def generate_bpa_report() -> str:
        """Generate a comprehensive Best Practice Analyzer report"""
        return "Can you generate a comprehensive Best Practice Analyzer report for my semantic model? Show me all violations categorized by severity and type."

    @mcp.prompt
    def focus_on_critical_bpa_issues() -> str:
        """Focus on critical ERROR level BPA violations"""
        return "Can you show me only the critical errors from the Best Practice Analyzer? I want to focus on the most important issues that need immediate attention."

    @mcp.prompt
    def performance_bpa_recommendations() -> str:
        """Get performance-specific recommendations from BPA"""
        return "Can you run BPA analysis and show me only the performance-related recommendations? I want to optimize my model's query performance."

    @mcp.prompt
    def dax_best_practices_analysis() -> str:
        """Analyze DAX expressions for best practices using BPA"""
        return "Can you analyze my DAX expressions using the Best Practice Analyzer? Show me any DAX syntax issues, unqualified references, or performance anti-patterns."

    @mcp.prompt
    def validate_tmsl_with_bpa() -> str:
        """Validate TMSL definition with BPA before deployment"""
        return "Before deploying this TMSL definition, can you run Best Practice Analyzer on it to check for any issues? I want to catch problems before deployment."

    @mcp.prompt
    def model_quality_assessment() -> str:
        """Complete model quality assessment using BPA"""
        return "Can you perform a complete quality assessment of my semantic model? Use the Best Practice Analyzer to check for issues across all categories: performance, DAX, formatting, naming, and maintenance."

    @mcp.prompt
    def bpa_category_analysis() -> str:
        """Analyze specific BPA categories"""
        return "Can you show me Best Practice Analyzer violations by category? I want to understand what types of issues are most common in my model."

    @mcp.prompt
    def fix_bpa_violations() -> str:
        """Get guidance on fixing BPA violations"""
        return "Can you help me fix the violations found by the Best Practice Analyzer? Show me specific examples of how to correct the issues and provide updated code."

    @mcp.prompt
    def bpa_development_workflow() -> str:
        """Integrate BPA into development workflow"""
        return "Can you show me how to integrate Best Practice Analyzer into my semantic model development workflow? I want to catch issues early in the development process."

    @mcp.prompt
    def compare_before_after_bpa() -> str:
        """Compare model quality before and after changes using BPA"""
        return "Can you run BPA analysis on my model before and after changes to see if I've improved the quality? Show me the difference in violations."

    @mcp.prompt
    def bpa_rules_information() -> str:
        """Get information about available BPA rules and categories"""
        return "Can you show me what Best Practice Analyzer rules are available? I want to understand the different categories and severity levels."

    # Security and governance prompts
    @mcp.prompt
    def workspace_security_overview() -> str:
        """Get an overview of workspace contents for security analysis"""
        return "Can you provide a security-focused overview of this workspace? List all datasets, lakehouses, and their access patterns."

    # Lakehouse and SQL Analytics Endpoint prompts
    @mcp.prompt
    def validate_lakehouse_schema() -> str:
        """Validate lakehouse table schemas before creating DirectLake models"""
        return "Can you help me validate the schema of tables in this lakehouse? I want to check column names, data types, and table structures before creating a DirectLake semantic model."

    @mcp.prompt
    def explore_lakehouse_data() -> str:
        """Explore and query data in lakehouse tables using SQL"""
        return "Can you help me explore the data in these lakehouse tables? Show me sample data and table structures using SQL queries against the SQL Analytics Endpoint."

    @mcp.prompt
    def lakehouse_sql_examples() -> str:
        """Get examples of useful SQL queries for lakehouse exploration"""
        return "Can you show me useful SQL queries I can run against the lakehouse SQL Analytics Endpoint? Include queries for schema discovery, data validation, and table exploration."

    # DirectLake model creation and migration prompts
    @mcp.prompt
    def create_directlake_model() -> str:
        """Help create a new DirectLake semantic model from lakehouse tables"""
        return "Can you help me create a new DirectLake semantic model based on the tables in this lakehouse? Please validate the table schemas first, generate the appropriate TMSL definition, and run Best Practice Analyzer to ensure quality."

    @mcp.prompt
    def migrate_to_directlake() -> str:
        """Help migrate an existing model to DirectLake"""
        return "Can you help me migrate my existing semantic model to DirectLake? Show me the current model structure and generate a DirectLake version that connects to the lakehouse tables."

    @mcp.prompt
    def compare_lakehouse_to_model() -> str:
        """Compare lakehouse table structures with existing semantic model"""
        return "Can you compare the table structures in the lakehouse with my existing semantic model? I want to see if there are any schema differences or missing tables."

    # Troubleshooting and debugging prompts
    @mcp.prompt
    def debug_connection_issues() -> str:
        """Troubleshoot authentication and connection issues"""
        return "I'm having connection issues with the semantic model server. Can you help me debug authentication problems and check token status?"

    @mcp.prompt
    def troubleshoot_tmsl_errors() -> str:
        """Help troubleshoot TMSL deployment errors"""
        return "I'm getting errors when trying to deploy my TMSL definition. Can you help me troubleshoot and fix common TMSL issues, especially for DirectLake models?"

    # Microsoft Learn research and documentation prompts
    @mcp.prompt
    def research_dax_best_practices() -> str:
        """Research DAX best practices using Microsoft Learn"""
        return "Can you search Microsoft Learn for the latest DAX best practices and performance optimization techniques? I want to improve my DAX measures."

    @mcp.prompt
    def research_bpa_violations() -> str:
        """Research solutions for BPA violations using Microsoft Learn"""
        return "Can you help me research solutions for the violations found by the Best Practice Analyzer? Search Microsoft Learn for official guidance on the specific issues identified."

    @mcp.prompt
    def find_model_optimization_guidance() -> str:
        """Find semantic model optimization guidance for BPA issues"""
        return "Can you search Microsoft Learn for semantic model optimization techniques that address the issues found by BPA? I want to understand the reasoning behind the best practice recommendations."

    @mcp.prompt
    def find_tmsl_documentation() -> str:
        """Find TMSL documentation and examples from Microsoft Learn"""
        return "Can you search Microsoft Learn for TMSL documentation and examples? I need help understanding the correct syntax for DirectLake model definitions."

    @mcp.prompt
    def research_directlake_guidance() -> str:
        """Research DirectLake implementation guidance from Microsoft Learn"""
        return "Can you find Microsoft Learn articles about DirectLake implementation best practices? I want to understand the requirements and limitations."

    @mcp.prompt
    def explore_power_bi_features() -> str:
        """Explore Power BI features and capabilities using Microsoft Learn"""
        return "Can you search Microsoft Learn for information about the latest Power BI features and capabilities? I want to stay up to date with new functionality."

    @mcp.prompt
    def find_fabric_tutorials() -> str:
        """Find Microsoft Fabric tutorials and learning paths"""
        return "Can you find Microsoft Learn learning paths and tutorials for Microsoft Fabric? I want to improve my understanding of the platform."

    @mcp.prompt
    def research_data_modeling_patterns() -> str:
        """Research data modeling patterns and best practices"""
        return "Can you search Microsoft Learn for data modeling patterns and best practices for semantic models? I want to design better star schemas."

    @mcp.prompt
    def get_analysis_services_guidance() -> str:
        """Get Analysis Services administration and optimization guidance"""
        return "Can you find Microsoft Learn articles about Analysis Services tabular model administration and performance optimization?"

    @mcp.prompt
    def find_troubleshooting_guides() -> str:
        """Find troubleshooting guides for common issues"""
        return "Can you search Microsoft Learn for troubleshooting guides related to Power BI, Fabric, and semantic model issues I might be experiencing?"

    # Power BI Desktop Integration and Local Development Prompts
    @mcp.prompt
    def detect_local_powerbi() -> str:
        """Detect running Power BI Desktop instances"""
        return "Can you detect any Power BI Desktop instances running on my local machine? Show me the processes and connection information."

    @mcp.prompt
    def test_local_powerbi_connection() -> str:
        """Test connection to local Power BI Desktop instance"""
        return "Can you test the connection to my local Power BI Desktop instance? I want to verify I can connect for development purposes."

    @mcp.prompt
    def analyze_local_model_bpa() -> str:
        """Run Best Practice Analyzer on local Power BI Desktop model"""
        return "Can you run a Best Practice Analyzer scan on my local Power BI Desktop model? I want to check for issues before publishing."

    @mcp.prompt
    def local_development_workflow() -> str:
        """Get guidance on local Power BI Desktop development workflow"""
        return "Can you help me set up a local development workflow with Power BI Desktop? Show me how to detect instances and run analysis tools."

    @mcp.prompt
    def troubleshoot_local_connection() -> str:
        """Troubleshoot connection issues with local Power BI Desktop"""
        return "I'm having trouble connecting to my local Power BI Desktop instance. Can you help me detect the correct port and test the connection?"

    @mcp.prompt
    def local_testing_workflow() -> str:
        """Set up local testing workflow for Power BI models"""
        return "Can you help me set up a testing workflow using local Power BI Desktop instances? I want to validate models before publishing to the service."

    @mcp.prompt
    def compare_connection_types() -> str:
        """Compare different Analysis Services connection approaches"""
        return "Can you explain the differences between connecting to Power BI Desktop, Power BI Service, and Analysis Services? Show me the connection requirements and use cases."
