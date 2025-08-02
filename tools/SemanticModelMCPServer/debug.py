import clr
import os
import sys
from core.auth import get_access_token
import urllib.parse



def runquery(workspace_name: str, dataset_name: str) -> str:
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
    connection_string = f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name_encoded};Password={access_token};Catalog={dataset_name};"

    connection = AdomdConnection(connection_string)
    connection.Open()
    command = connection.CreateCommand()
    command.CommandText = f"""
    EVALUATE
    SUMMARIZECOLUMNS(
        'Product'[Category],
        "Sales Amount", [Sales Amount],
        "Total Quantity", [Total Quantity],
        "Margin %", [Margin %]
    )
    ORDER BY [Sales Amount] DESC
    """
    reader: AdomdDataReader = command.ExecuteReader()
    results = []
    while reader.Read():
        row = {}
        for i in range(reader.FieldCount):
            row[reader.GetName(i)] = reader.GetValue(i)
        results.append(row)

    connection.Close()
    return results


def get_model_definition_direct(workspace_name: str, dataset_name: str) -> str:
    """Gets tmsl definition for an Analysis Services Model."""
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    dotnet_dir = os.path.join(script_dir, "dotnet")
    
    print(f"Using .NET assemblies from: {dotnet_dir}")
    #clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.Identity.Client.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.IdentityModel.Abstractions.dll"))

    from Microsoft.AnalysisServices.Tabular import Server, Model, Table, Column, Measure, Partition, Database, JsonSerializer, TmdlSerializer # type: ignore
    #from Microsoft.AnalysisServices.Tabular.Extensions import ToTmdl # type: ignore


    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"

    # Use URL-encoded workspace name and standard XMLA connection format
    workspace_name_encoded = urllib.parse.quote(workspace_name)
    connection_string = f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name_encoded};Password={access_token}"



    server = Server()
    server.Connect(connection_string)
    database = server.Databases.GetByName(dataset_name)
    json_definition = JsonSerializer.SerializeDatabase(database)

    tmdlDocuments = TmdlSerializer.SerializeDatabase(database)

    return tmdlDocuments

# Run the function
try:
    #result = get_model_definition_direct("DAX Performance Tuner Testing", "Contoso 100M")
    result = runquery("DAX Performance Tuner Testing", "Contoso 100M")
    print(result)
except Exception as e:
    print(f"Error: {e}")