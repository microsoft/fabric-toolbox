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
        return "Can you analyze this semantic model and suggest potential optimizations? Look at the table structure, relationships, and measures."

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
        return "Can you help me create a new DirectLake semantic model based on the tables in this lakehouse? Please validate the table schemas first and then generate the appropriate TMSL definition."

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
