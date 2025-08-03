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

    ## Getting Model Definitions:
    - Use the `get_tmsl_model_definition` tool to retrieve the TMSL definition of a model.
    - You can specify the workspace name and dataset name to get the model definition.
    - The tool will return the TMSL definition as a string, which can be used for further analysis or updates.

    ## Running a DAX Query:
    - You can execute DAX queries against the Power BI model using the `execute_dax_query` tool.
    - Make sure you use the correct dataset name, not the dataset ID.
    - Provide the DAX query, the workspace name, and the dataset name to get results.
    - The results will be returned in JSON format for easy consumption.

    ## Updating TMSL Definition:
    - The `update_tmsl_definition` tool allows you to update the TMSL definition for a specified dataset in a Power BI workspace.
    - Provide the workspace name, dataset name, and the new TMSL definition as a string.
    - The tool will return a success message or an error if the update fails.
    - Use this tool to modify the structure of your Power BI models dynamically.
    - eg. to add measures, calculated columns, or modify relationships in the model.

    ## The model hierarchy ##
    - **Database**: The top-level container for the model.
    - **Model**: Represents the entire model within the database.   
    - **Table**: Represents a table in the model, containing columns and measures.
    - **Column**: Represents a column in a table, which can be a data column or a calculated column.
    - **Measure**: Represents a calculation or aggregation based on the data in the model.  
    - **Partition**: Represents a partition of data within a table, often used for performance optimization.

    ## Example TMDL Definition:
    - The TMDL definition should be a valid serialized string representing the model structure.
    - It can include tables, columns, measures, relationships, and other model elements.
    - Ensure the TMDL definition is correctly formatted to avoid errors during updates.
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
def update_tmsl_definition(workspace_name: str, dataset_name: str, tmsl_definition: str) -> str:
    """Updates the TMSL definition for an Analysis Services Model.
    This tool connects to the specified Power BI workspace and dataset name, updates the TMSL definition,
    and returns a success message or an error if the update fails.
    The function connects to the Power BI service using an access token, deserializes the TMSL definition,
    updates the model, and returns the result.
    Note: The TMSL definition should be a valid serialized TMSL string.
    """   
    script_dir = os.path.dirname(os.path.abspath(__file__))
    dotnet_dir = os.path.join(script_dir, "dotnet")

    print(f"Using .NET assemblies from: {dotnet_dir}")
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.Identity.Client.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.IdentityModel.Abstractions.dll"))

    clr.AddReference("System.IO")  # Ensure System.IO is referenced for StringIO
    from System.IO import StringReader  # type: ignore

    from Microsoft.AnalysisServices import UpdateMode ,UpdateOptions # type: ignore
    from Microsoft.AnalysisServices.Tabular import Server, Model, Database, TmdlSerializer, JsonSerializer  # type: ignore
    from Microsoft.AnalysisServices.Tabular.Serialization import MetadataSerializationContext ,MetadataSerializationStyle, MetadataSerializationOptions  # type: ignore

    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"
    workspace_name_encoded = urllib.parse.quote(workspace_name)
    connection_string = f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name_encoded};Password={access_token}"
    server = Server()
    server.Connect(connection_string)
    database: Database = server.Databases.GetByName(dataset_name)
    model: Model = database.Model
    if not database:
        return f"Error: Dataset '{dataset_name}' not found in workspace '{workspace_name}'."
    try:

        createOrReplace_tmsl = f"""
        {{
            "createOrReplace": {{
                "object": {{
                    "database": "{dataset_name}"
                }},
            "database": {tmsl_definition}
            }} 
        }}       
        """
        retval = server.Execute(createOrReplace_tmsl)
        return f"""TMDL definition updated successfully for dataset '{dataset_name}' in workspace '{workspace_name}'. 
        {retval}"""
    except Exception as e:
        print(e)
        return f"Error updating TMSL definition: {e}"
    

# @mcp.tool
# def update_tmdl_definition(workspace_name: str, dataset_name: str, tmdl_definition: str) -> str:
#     """Updates the TMDL definition for an Analysis Services Model.
#     This tool connects to the specified Power BI workspace and dataset name, updates the TMDL definition,
#     and returns a success message or an error if the update fails.
#     The function connects to the Power BI service using an access token, deserializes the TMDL definition,
#     updates the model, and returns the result.
#     Note: The TMDL definition should be a valid serialized TMDL string.
#     """
#     script_dir = os.path.dirname(os.path.abspath(__file__))
#     dotnet_dir = os.path.join(script_dir, "dotnet")
#     print(f"Using .NET assemblies from: {dotnet_dir}")
#     clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
#     clr.AddReference(os.path.join(dotnet_dir, "Microsoft.Identity.Client.dll"))
#     clr.AddReference(os.path.join(dotnet_dir, "Microsoft.IdentityModel.Abstractions.dll"))

#     from Microsoft.AnalysisServices.Tabular import Server, Model, Database, TmdlSerializer  # type: ignore
#     from Microsoft.AnalysisServices.Tabular.Serialization import MetadataSerializationContext ,MetadataSerializationStyle # type: ignore

#     access_token = get_access_token()
#     if not access_token:
#         return "Error: No valid access token available"
#     workspace_name_encoded = urllib.parse.quote(workspace_name)
#     connection_string = f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name_encoded};Password={access_token}"
#     server: Server = Server()
#     server.Connect(connection_string)
#     database: Database = server.Databases.GetByName(dataset_name)
#     model: Model = database.Model

#     if not database:
#         return f"Error: Dataset '{dataset_name}' not found in workspace '{workspace_name}'."
#     try:
#         context = MetadataSerializationContext.Create(MetadataSerializationStyle.Tmdl)
#         context.ReadFromDocument(tmdl_definition)
#         print(context)
#         model = context.UpdateModel()
#         server.Update(database, "Update TMDL definition")
#         return f"TMDL definition updated successfully for dataset '{dataset_name}' in workspace '{workspace_name}'."
#     except Exception as e:
#         return f"Error updating TMDL definition: {str(e)}"
#     finally:
#         server.Disconnect()

# @mcp.tool
# def update_tmdl_definition(workspace_name: str, dataset_name: str, tmdl_definition: str) -> str:
#     """Updates the TMDL definition for an Analysis Services Model.
#     This tool connects to the specified Power BI workspace and dataset name, updates the TMDL definition,
#     and returns a success message or an error if the update fails.
#     The function connects to the Power BI service using an access token, deserializes the TMDL definition,
#     updates the model, and returns the result.
#     Note: The TMDL definition should be a valid serialized TMDL string.
#     """
#     script_dir = os.path.dirname(os.path.abspath(__file__))
#     dotnet_dir = os.path.join(script_dir, "dotnet")
#     print(f"Using .NET assemblies from: {dotnet_dir}")
#     clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
#     clr.AddReference(os.path.join(dotnet_dir, "Microsoft.Identity.Client.dll"))
#     clr.AddReference(os.path.join(dotnet_dir, "Microsoft.IdentityModel.Abstractions.dll"))

#     from Microsoft.AnalysisServices.Tabular import Server, Model, Database, TmdlSerializer  # type: ignore
#     access_token = get_access_token()
#     if not access_token:
#         return "Error: No valid access token available"
#     workspace_name_encoded = urllib.parse.quote(workspace_name)
#     connection_string = f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name_encoded};Password={access_token}"
#     server: Server = Server()
#     server.Connect(connection_string)
#     database: Database = server.Databases.GetByName(dataset_name)
#     if not database:
#         return f"Error: Dataset '{dataset_name}' not found in workspace '{workspace_name}'."
#     try:
#         tmdl_model = TmdlSerializer.Deserialize(tmdl_definition)
#         database.Model = tmdl_model
#         server.Update(database, "Update TMDL definition")
#         return f"TMDL definition updated successfully for dataset '{dataset_name}' in workspace '{workspace_name}'."
#     except Exception as e:
#         return f"Error updating TMDL definition: {str(e)}"
#     finally:
#         server.Disconnect()


@mcp.tool
def get_tmsl_model_definition(workspace_name:str = None, dataset_name:str=None) -> str:
    """Gets tmsl definition for an Analysis Services Model.
    This tool connects to the specified Power BI workspace and dataset name, retrieves the model definition,
    and returns the TMSL definition as a string.
    The function connects to the Power BI service using an access token, retrieves the model definition,
    and returns the result.
    Note: The workspace_name and dataset_name should be valid names in the Power BI service.
    """
    

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

    tmsl_definition = TmdlSerializer.SerializeDatabase(database)
    return tmsl_definition

    # if definition_type is None or definition_type.lower() == "tmsl":
    #     tmsl_definition = TmdlSerializer.SerializeDatabase(database)
    #     return tmsl_definition
    # elif definition_type.lower() == "tmdl":
    #     tmdl_definition = TmdlSerializer.SerializeDatabase(database)
    #     return tmdl_definition
    # else:
    #     return "Error: Invalid definition type specified. Use 'tmsl' or 'tmdl'."


def main():
    """Main entry point for the Semantic Model MCP Server."""

    logging.info("Starting Semantic Model MCP Server")
    mcp.run()

if __name__ == "__main__":
    main()
