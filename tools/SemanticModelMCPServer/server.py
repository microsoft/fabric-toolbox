from fastmcp import FastMCP
import logging
import clr
import os
import sys
from core.auth import get_access_token
from tools.fabric_metadata import list_workspaces, list_datasets, get_workspace_id
import urllib.parse

mcp = FastMCP(
    name="Model Browser", 
    instructions="""
    A tool to browse and manage semantic models in Microsoft Fabric.

    ## Available Tools:
    - List Power BI Workspaces
    - List Power BI Datasets
    - Get Power BI Workspace ID
    - Get Model Definition

    ## Usage:
    - You can ask questions about Power BI workspaces, datasets, and models.
    - Use the tools to retrieve information about your Power BI environment.
    - The tools will return JSON formatted data for easy parsing.
    ## Example Queries:
    - "Can you get a list of workspaces?"
    - "What datasets are available in workspace 'Contoso 100M'?"
    - "Get the workspace ID for 'DAX Performance Tuner Testing'."
    - "Retrieve the model definition for 'Contoso 100M' in workspace 'DAX Performance Tuner Testing'."

    ## Note:
    - Ensure you have the necessary permissions to access Power BI resources.
    - The tools will return errors if access tokens are not valid or if resources are not found.
    - The tools are designed to work with the Power BI REST API and Microsoft Analysis Services.
    - The model definition tool retrieves TMSL and TMDL definitions for Analysis Services Models.   

    ## TMSL and TMDL Definitions:
    - TMSL (Tabular Model Scripting Language) is used to define and manage tabular models in Analysis Services.
    - TMDL (Tabular Model Definition Language) is a newer format for defining tabular models, providing a more structured approach.
    - The `get_model_definition` tool retrieves both TMSL and TMDL definitions for the specified model in the given workspace.

    ## Running a DAX Query:
    - You can execute DAX queries against the Power BI model using the `execute_dax_query` tool.
    - Make sure you use the correct dataset name, not the dataset ID.
    - Provide the DAX query, the workspace name, and the dataset name to get results.
    - The results will be returned in JSON format for easy consumption.
    """
)

@mcp.prompt
def ask_about_workspaces() -> str:
    """Ask to get a list of Power BI workspaces"""
    return f"Can you get a list of workspaces?"

@mcp.tool
def list_powerbi_workspaces() -> str:
    """Lists available Power BI workspaces for the current user."""
    return list_workspaces()

@mcp.tool
def list_powerbi_datasets(workspace_id: str) -> str:
    """Lists all datasets in a specified Power BI workspace."""
    return list_datasets(workspace_id)

@mcp.tool
def get_powerbi_workspace_id(workspace_name: str) -> str:
    """Gets the workspace ID for a given workspace name."""
    return get_workspace_id(workspace_name)


@mcp.tool
def execute_dax_query(workspace_name:str, dataset_name: str, dax_query: str, dataset_id: str = None) -> list[dict]:
    """Executes a DAX query against the Power BI model.
    This tool connects to the specified Power BI workspace and dataset name, executes the provided DAX query,
    Use the dataset_name to specify the model to query and NOT the dataset ID.
    The function connects to the Power BI service using an access token, executes the DAX query,
    and returns the results.
    """  
    script_dir = os.path.dirname(os.path.abspath(__file__))
    dotnet_dir = os.path.join(script_dir, "dotnet")
    
    print(f"Using .NET assemblies from: {dotnet_dir}")
    #clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.Identity.Client.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.IdentityModel.Abstractions.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.AdomdClient.dll"))

    from Microsoft.AnalysisServices.AdomdClient import AdomdConnection ,AdomdDataReader  # type: ignore

    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"

    workspace_name_encoded = urllib.parse.quote(workspace_name)
    # Use URL-encoded workspace name and standard XMLA connection format
    # The connection string format is: Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name};Password={access_token};Catalog={dataset_name};
    connection_string = f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name_encoded};Password={access_token};Catalog={dataset_name};"

    connection = AdomdConnection(connection_string)
    connection.Open()
    command = connection.CreateCommand()
    command.CommandText = dax_query
    reader: AdomdDataReader = command.ExecuteReader()
    results = []
    while reader.Read():
        row = {}
        for i in range(reader.FieldCount):
            row[reader.GetName(i)] = reader.GetValue(i)
        results.append(row)

    connection.Close()
    return results



@mcp.tool
def get_model_definition(workspace_name:str = None, dataset_name:str=None, definition_type:str="tmdl") -> str:
    """Gets tmsl and tmdl definition for an Analysis Services Model."""
    

    script_dir = os.path.dirname(os.path.abspath(__file__))
    dotnet_dir = os.path.join(script_dir, "dotnet")
    
    print(f"Using .NET assemblies from: {dotnet_dir}")
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.Identity.Client.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.IdentityModel.Abstractions.dll"))
    
    from Microsoft.AnalysisServices.Tabular import Server,Model, Table, Column, Measure, Partition, Database, JsonSerializer,TmdlSerializer # type: ignore

    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"

    # Use URL-encoded workspace name and standard XMLA connection format

    workspace_name = urllib.parse.quote(workspace_name)
    connection_string = f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name};Password={access_token}"

    server: Server = Server()
    server.Connect(connection_string)
    database: Database = server.Databases.GetByName(dataset_name)

    if definition_type is None or definition_type.lower() == "tmsl":
        tmsl_definition = TmdlSerializer.SerializeDatabase(database)
        return tmsl_definition
    elif definition_type.lower() == "tmdl":
        tmdl_definition = TmdlSerializer.SerializeDatabase(database)
        return tmdl_definition
    else:
        return "Error: Invalid definition type specified. Use 'tmsl' or 'tmdl'."


def main():
    """Main entry point for the Semantic Model MCP Server."""

    logging.info("Starting Semantic Model MCP Server")
    mcp.run()

if __name__ == "__main__":
    main()
