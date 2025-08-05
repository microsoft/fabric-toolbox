import clr
import os
import sys
import urllib.parse


# Add the parent directory to Python path to import from core
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

from core.auth import get_access_token

def get_directory():
    """Returns the directory of the current script."""
    return os.path.dirname(os.path.abspath(__file__))



mytmdl = """
createOrReplace
    database Sales
        compatibilityLevel: 1567

    model Model    
        culture: en-US    

    table Sales
        
        partition 'Sales-Partition' = m
            mode: import
            source = 
                let
                    Source = Sql.Database(Server, Database)
                    …
        
        measure 'Sales Amount' = SUMX('Sales', 'Sales'[Quantity] * 'Sales'[Net Price])
            formatString: $ #,##0
    
        column 'Product Key'
            dataType: int64
            isHidden
            sourceColumn: ProductKey
            summarizeBy: None
    
        column Quantity
            dataType: int64
            isHidden
            sourceColumn: Quantity
            summarizeBy: None

        column 'Net Price'
            dataType: int64
            isHidden
            sourceColumn: "Net Price"
            summarizeBy: none

    table Product
        
        partition 'Product-Partition' = m
            mode: import
            source = 
                let
                    Source = Sql.Database(Server, Database),
                    …

        column 'Product Key'
            dataType: int64
            isKey
            sourceColumn: ProductKey
            summarizeBy: none

    relationship cdb6e6a9-c9d1-42b9-b9e0-484a1bc7e123
        fromColumn: Sales.'Product Key'
        toColumn: Product.'Product Key'

    role Role_Store1
        modelPermission: read

        tablePermission Store = 'Store'[Store Code] IN {1,10,20,30}
"""


def runquery(workspace_name: str, dataset_name: str) -> str:
    script_dir = get_directory()
    # Go up one level to get to the SemanticModelMCPServer directory
    server_dir = os.path.dirname(script_dir)
    dotnet_dir = os.path.join(server_dir, "dotnet")
    
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

def get_tmdl_model_definition_direct(workspace_name: str, dataset_name: str) -> str:
    """Gets tmdl definition for an Analysis Services Model."""

    script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    print(script_dir)
    dotnet_dir = os.path.join(script_dir, "dotnet")
    
    print(f"Using .NET assemblies from: {dotnet_dir}")
    #clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.Identity.Client.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.IdentityModel.Abstractions.dll"))

    from Microsoft.AnalysisServices.Tabular import Server, Model, Table, Column, Measure, Partition, Database, JsonSerializer, TmdlSerializer # type: ignore

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

def get_tmsl_model_definition_direct(workspace_name: str, dataset_name: str) -> str:
    """Gets tmsl definition for an Analysis Services Model."""

    script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    print(script_dir)
    dotnet_dir = os.path.join(script_dir, "dotnet")
    
    print(f"Using .NET assemblies from: {dotnet_dir}")
    #clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.Identity.Client.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.IdentityModel.Abstractions.dll"))

    from Microsoft.AnalysisServices.Tabular import Server, JsonSerializer, SerializeOptions # type: ignore

    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"

    # Use URL-encoded workspace name and standard XMLA connection format
    workspace_name_encoded = urllib.parse.quote(workspace_name)
    connection_string = f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name_encoded};Password={access_token}"

    options = SerializeOptions()
    options.IgnoreTimestamps = True

    server = Server()
    server.Connect(connection_string)
    database = server.Databases.GetByName(dataset_name)
    json_definition = JsonSerializer.SerializeDatabase(database,options)

    return json_definition

def update_tmdl_definition(workspace_name: str, dataset_name: str, tmdl_definition: str) -> str:
    """Updates the TMDL definition for an Analysis Services Model."""
    script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dotnet_dir = os.path.join(script_dir, "dotnet") 
    print(f"Using .NET assemblies from: {dotnet_dir}")
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.Identity.Client.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.IdentityModel.Abstractions.dll"))

    from Microsoft.AnalysisServices.Tabular import Server, Model, Database, TmdlSerializer, JsonSerializer  # type: ignore
    from Microsoft.AnalysisServices import XmlaResult , XmlaError # type: ignore

    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"
    workspace_name_encoded = urllib.parse.quote(workspace_name)
    connection_string = f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name_encoded};Password={access_token}"

    server = Server()
    server.Connect(connection_string)
    # database: Database = server.Databases.GetByName(dataset_name)
    # model: Model = database.Model
    # if not database:
    #     return f"Error: Dataset '{dataset_name}' not found in workspace '{workspace_name}'."
    try:

#         print(1)
#         new_tmdl = f"""
# createOrReplace
#     {tmdl_definition}

#         """
#         print(2)
#         new_tmdl = new_tmdl.replace("Family","FamilyGuy")
#         print(new_tmdl)

        r = server.Execute(tmdl_definition)
        print("======================")
        item: XmlaResult
        for item in r:
           # print(item)
           # help(item)
            z = item.get_Messages()
            zz: XmlaError
            for zz in z:
                print(zz)
                print(type(zz))
                print(zz.Description)
            # print(z)
            # print(type(z))

        print("======================")

        print("TMDL definition updated successfully.")
        return f"TMDL definition updated successfully for dataset '{dataset_name}' in workspace '{workspace_name}'."
    except Exception as e:
        print(e)
        return f"Error updating TMDL definition: {e}"

def update_tmsl_definition(workspace_name: str, dataset_name: str, tmsl_definition: str) -> str:
    """Updates the TMSL definition for an Analysis Services Model."""   
    script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dotnet_dir = os.path.join(script_dir, "dotnet") 
    print(f"Using .NET assemblies from: {dotnet_dir}")
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.Identity.Client.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.IdentityModel.Abstractions.dll"))


    from Microsoft.AnalysisServices.Tabular import Server, Model, Database, TmdlSerializer, JsonSerializer  # type: ignore
    from Microsoft.AnalysisServices import XmlaResult , XmlaError # type: ignore

    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"
    workspace_name_encoded = urllib.parse.quote(workspace_name)
    connection_string = f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name_encoded};Password={access_token}"

    server = Server()
    server.Connect(connection_string)

    try:

        print(1)
        new_tmsl = f"""
        {{
            "createOrReplace": {{
                "object": {{
                    "database": "{dataset_name}"
                }},
            "database": {tmsl_definition}
            }} 
        }}       
        """
        
        print(2)
        new_tmsl = new_tmsl.replace("Family","FamilyGuy")
        print(new_tmsl)
        print(3)
        r = server.Execute(new_tmsl)
        print("======================")
        item: XmlaResult
        for item in r:
           # print(item)
           # help(item)
            z = item.get_Messages()
            zz: XmlaError
            for zz in z:
                print(zz)
                print(type(zz))
                print(zz.Description)
            # print(z)
            # print(type(z))

        print("======================")

        print("TMDL definition updated successfully.")
        return f"TMDL definition updated successfully for dataset '{dataset_name}' in workspace '{workspace_name}'."
    except Exception as e:
        print(e)
        return f"Error updating TMDL definition: {e}"



# Run the function
try:
    # result = get_tmdl_model_definition_direct("DAX Performance Tuner Testing", "Retail Analysis Sample PBIX")
    # print(444)
    # update_tmdl_definition("DAX Performance Tuner Testing", "Retail Analysis Sample PBIX2", mytmdl)
    # print(555)
    # #print(result)

    tmsl = get_tmsl_model_definition_direct("DAX Performance Tuner Testing", "Retail Analysis Sample PBIX")
    print(tmsl)
    update_tmsl_definition("DAX Performance Tuner Testing", "Retail Analysis Sample PBIX",tmsl)
    #result = runquery("DAX Performance Tuner Testing", "Contoso 100M")
    #result = get_directory()
    print("done")
except Exception as e:
    print(f"Error: {e}")