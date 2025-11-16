# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {
# META     "name": "jupyter",
# META     "jupyter_kernel_name": "python3.11"
# META   },
# META   "dependencies": {}
# META }

# CELL ********************

%pip install ms-fabric-cli==1.2.0 --quiet

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

import subprocess
import os
import json
from zipfile import ZipFile 
import shutil
import re
import requests
import zipfile
from io import BytesIO
import yaml
import sempy.fabric as fabric
import uuid

class FabDeployCLI:
    src_workspace_id = ""
    src_workspace_name = ""
    trg_workspace_id = ""
    trg_workspace_name = ""
    deployment_order = []
    mapping_table =  []
    workspace_name = ""
    capacity_name = ""
    eventhouse_name = ""
    repo_owner = ""
    repo_name = ""
    branch = ""
    folder_prefix = ""
    github_token = ""
    pipeline_parameters = {}

    def __download_folder_as_zip(self, repo_owner, repo_name, output_zip, branch="main", folder_to_extract="src",  remove_folder_prefix = "", github_token = ""):
        # Construct the URL for the GitHub API to download the repository as a zip file
        url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/zipball/{branch}"
        headers = None

        if github_token != "":
        # Replace with your actual GitHub token
            headers = {
                "Authorization": f"token {github_token}",
                "Accept": "application/vnd.github.v3+json"
            }

        response = requests.get(url, headers=headers)
        response.raise_for_status()

        folder_to_extract = f"/{folder_to_extract}" if folder_to_extract[0] != "/" else folder_to_extract
        
        # Ensure the directory for the output zip file exists
        os.makedirs(os.path.dirname(output_zip), exist_ok=True)
        
        # Create a zip file in memory
        with zipfile.ZipFile(BytesIO(response.content)) as zipf:
            with zipfile.ZipFile(output_zip, 'w') as output_zipf:
                for file_info in zipf.infolist():
                    parts = file_info.filename.split('/')
                    if  re.sub(r'^.*?/', '/', file_info.filename).startswith(folder_to_extract): 
                        # Extract only the specified folder
                        file_data = zipf.read(file_info.filename)  
                        if folder_prefix != "":
                            parts.remove(remove_folder_prefix)
                        output_zipf.writestr(('/'.join(parts[1:])), file_data)

    def __uncompress_zip_to_folder(self, zip_path, extract_to):
        # Ensure the directory for extraction exists
        os.makedirs(extract_to, exist_ok=True)
        
        # Uncompress all files from the zip into the specified folder
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_to)
        
        # Delete the original zip file
        os.remove(zip_path)

    def __run_fab_command(self, command, capture_output: bool = False, silently_continue: bool = False, raw_output: bool = False):
        result = subprocess.run(["fab", "-c", command], capture_output=capture_output, text=True)
        if (not(silently_continue) and (result.returncode > 0 or result.stderr)):
            raise Exception(f"Error running fab command. exit_code: '{result.returncode}'; stderr: '{result}'")    
        if (capture_output and not raw_output): 
            output = result.stdout.strip()
            return output
        elif (capture_output and raw_output):
            return result

    def __fab_get_workspace_id(self, name):
        result = self.__run_fab_command(f"get /{name} -q id" , capture_output = True, silently_continue= True)
        return result

    def __fab_workspace_exists(self, name):
        id = self.__run_fab_command(f"get /{name} -q id" , capture_output = True, silently_continue= True)
        return(id)

    def __fab_get_id(self, name):
        id = self.__run_fab_command(f"get /{self.trg_workspace_name}/{name} -q id" , capture_output = True, silently_continue= True)
        return(id)

    def __fab_get_item(self, name):
        item = self.__run_fab_command(f"get /{self.trg_workspace_name}/{name}" , capture_output = True, silently_continue= True)
        return(item)

    def fab_get_eventstream_connection_string(self, name, connection_name):
        connection_id = ""
        item_id = self.__fab_get_id(name)

        item = self.__run_fab_command(f"api -X get /workspaces/{self.trg_workspace_id}/eventstreams/{item_id}/topology" , capture_output = True, silently_continue= True)
        topology = json.loads(item)

        sources = topology.get("text",{}).get("sources",[])
        source_id = list(filter(lambda source: source["name"] == connection_name, sources))
        if len(source_id):
            connection_id = source_id[0].get("id")

        destinations = topology.get("text",{}).get("destinations",[])
        destination_id = list(filter(lambda destination: destination["name"] == connection_name, destinations))
        if len(destination_id):
            connection_id = destination_id[0].get("id")

        connection = self.__run_fab_command(f"api -X get /workspaces/{self.trg_workspace_id}/eventstreams/{item_id}/sources/{connection_id}/connection" , capture_output = True, silently_continue= True)
        connection = json.loads(connection)
        connection = connection.get("text",{}).get("accessKeys",{}).get("primaryConnectionString")
        return(connection)

    def __fab_get_display_name(self, name):
        display_name = self.__run_fab_command(f"get /{self.trg_workspace_name}/{name} -q displayName" , capture_output = True, silently_continue= True)
        return(display_name)

    def __fab_get_kusto_query_uri(self, name):
        connection = self.__run_fab_command(f"get /{self.trg_workspace_name}/{name} -q properties.queryServiceUri -f", capture_output = True, silently_continue= True)
        return(connection)

    def __fab_get_kusto_ingest_uri(self, name):
        connection = self.__run_fab_command(f"get /{self.trg_workspace_name}/{name} -q properties.ingestionServiceUri -f", capture_output = True, silently_continue= True)
        return(connection)

    def __fab_get_folders(self):
        response = self.__run_fab_command(f"api workspaces/{self.trg_workspace_id}/folders", capture_output = True, silently_continue= True)
        return(json.loads(response).get('text',{}).get('value',[]))

    def __fab_add_schedule(self, name):
        item = self.__run_fab_command(f"get /{self.trg_workspace_name}/{name} -q schedules" , capture_output = True, silently_continue= True)

        if len(json.loads(item)) == 0:
            schedule = self.__get_schedule_by_name(name)

            return self.__run_fab_command(f"job run-sch /{self.trg_workspace_name}/{name} -i {json.dumps(schedule)}" , capture_output = True, silently_continue=True)

        return f"""Job schedule for '{name}' already exists...
    * Job schedule {item}""" 

    def __get_id_by_name(self, name):
        for it in self.deployment_order:
            if it.get("name") == name:
                    return it.get("id")
        return None

    def __get_schedule_by_name(self, name):
        for it in self.deployment_order:
            if it.get("name") == name:
                    return it.get("schedule")
        return None

    def __copy_to_tmp(self, name,child=None,type=None):
        child_path = "" if child is None else f".children/{child}/"
        type_path = "" if type is None else f"{type}/"
        shutil.rmtree("./builtin/tmp",  ignore_errors=True)
        path2zip = "./builtin/src/src.zip"
        with  ZipFile(path2zip) as archive:
            for file in archive.namelist():
                if file.startswith(f'src/{type_path}{name}/{child_path}'):
                    archive.extract(file, './builtin/tmp')
        return(f"./builtin/tmp/src/{type_path}{name}/{child_path}" )

    def __get_mapping_table_new_from_type(self, type):
        result = ""
        filtered_data = list(filter(lambda item: item['Type'] == type, self.mapping_table))
        if len(filtered_data) > 0:
            result=filtered_data[0]["new"]
        return result

    def __get_mapping_table_new_from_old(self, old):
        result = ""
        filtered_data = list(filter(lambda item: item['old'] == old, self.mapping_table))
        if len(filtered_data) > 0:
            result=filtered_data[0]["new"]
        return result

    def __get_mapping_table_new_from_type_item(self, type,item):
        result = ""
        filtered_data = list(filter(lambda table: table["Type"] == type and table["Item"] == item, self.mapping_table))
        if len(filtered_data) > 0:
            result=filtered_data[0]["new"]
        return result

    def __get_mapping_table_parent_type(self, type,item,parent_type):
        parent_item = self.__get_mapping_table_new_from_type_item(type,item)
        result = self.__get_mapping_table_new_from_type_item(parent_type,parent_item)
        return result

    def __replace_ids_in_folder(self, folder_path, mapping_table):
        for root, _, files in os.walk(folder_path):
            for file_name in files:
                if file_name.endswith(('.py', '.json', '.pbir', '.platform', '.ipynb', '.py', '.tmdl')) and not file_name.endswith('report.json'):
                    file_path = os.path.join(root, file_name)
                    with open(file_path, 'r', encoding='utf-8') as file:
                        content = file.read()
                        for mapping in mapping_table:  
                            content = content.replace(mapping["old"], mapping["new"])
                    with open(file_path, 'w', encoding='utf-8') as file:
                        file.write(content)

    def __replace_kqldb_parent_eventhouse(self, folder_path,parent_eventhouse):
        property_file = f"{folder_path}/DatabaseProperties.json"
        with open(property_file, 'r', encoding='utf-8') as file:
            content = json.load(file)
            content["parentEventhouseItemId"] = self.__fab_get_id(parent_eventhouse)
        with open(property_file, 'w', encoding='utf-8') as file:
            json.dump(content,file,indent=4)

    def __replace_eventstream_destination(self, folder_path,it_destinations):
        property_file = f"{folder_path}/eventstream.json"
        with open(property_file, "r", encoding="utf-8") as file:
            content = json.load(file)
            destinations = content.get("destinations",[])
            for destination in destinations:
                if destination.get("type") != "CustomEndpoint":
                    filtered_data = list(filter(lambda table: table["name"] == destination.get("name") and table["type"] == destination.get("type"), it_destinations))
                    if len(filtered_data) > 0:        
                        destination["properties"]["workspaceId"] = self.__get_mapping_table_new_from_type_item("Workspace Id",self.trg_workspace_name)
                        destination["properties"]["itemId"] = self.__get_mapping_table_new_from_type_item("KQL DB ID",filtered_data[0].get("itemName"))
                        if destination.get("properties",{}).get("databaseName") is not None:
                            destination["properties"]["databaseName"] = self.__get_mapping_table_new_from_type_item("KQL DB Name",filtered_data[0].get("itemName"))
        with open(property_file, 'w', encoding='utf-8') as file:
            json.dump(content,file,indent=4)

    def __replace_kqldashboard_datasources(self, folder_path,it_datasources):
        property_file = f"{folder_path}/RealTimeDashboard.json"
        with open(property_file, "r", encoding="utf-8") as file:
            content = json.load(file)
            datasources = content.get("dataSources",[])
            for datasource in datasources:
                filtered_data = list(filter(lambda table: table["name"] == datasource.get("name"), it_datasources))
                if len(filtered_data) > 0:        
                    datasource["workspace"] = self.__get_mapping_table_new_from_type_item("Workspace Id",self.trg_workspace_name)
                    datasource["database"] = self.__get_mapping_table_new_from_type_item("KQL DB ID",filtered_data[0].get("itemName"))
                    datasource["clusterUri"] = self.__get_mapping_table_parent_type("KQL DB Eventhouse",filtered_data[0].get("itemName"),"Kusto Query Uri")
        with open(property_file, 'w', encoding='utf-8') as file:
            json.dump(content,file,indent=4)

    def __replace_kqlqueryset_datasources(self, folder_path,it_datasources):
        property_file = f"{folder_path}/RealTimeQueryset.json"
        with open(property_file, "r", encoding="utf-8") as file:
            content = json.load(file)
            datasources = content.get("queryset",{}).get("dataSources",[])
            for datasource in datasources:
                filtered_data = list(filter(lambda table: str(table["itemName"]).replace(".KQLDatabase","") == datasource.get("databaseItemName"), it_datasources))
                if len(filtered_data) > 0:        
                    datasource["databaseItemId"] = self.__get_mapping_table_new_from_type_item("KQL DB ID",filtered_data[0].get("itemName"))
                    datasource["clusterUri"] = self.__get_mapping_table_parent_type("KQL DB Eventhouse",filtered_data[0].get("itemName"),"Kusto Query Uri")
                    print(content.get("queryset",{}).get("dataSources",[]))
        with open(property_file, 'w', encoding='utf-8') as file:
            json.dump(content,file,indent=4)

    def __replace_pbi_report_definition(self, folder_path,datasource):
        property_file = f"{folder_path}/definition.pbir"
        sm_name = datasource.replace(".SemanticModel","")
        ws_id = self.__get_mapping_table_new_from_type("Workspace Id")
        sm_id = self.__get_mapping_table_new_from_type_item("Semantic Model ID",datasource)
        pbir_definition = {
            "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/1.0.0/schema.json",
            "version": "4.0",
            "datasetReference": {
                "byPath": None,
                "byConnection": {
                "connectionString": f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{ws_id};Initial Catalog={sm_name};Integrated Security=ClaimsToken",
                "pbiServiceModelId": None,
                "pbiModelVirtualServerName": "sobe_wowvirtualserver",
                "pbiModelDatabaseName": sm_id,
                "connectionType": "pbiServiceXmlaStyleLive",
                "name": "EntityDataSource"
                }
            }
        }
        with open(property_file, 'w', encoding='utf-8') as file:
            json.dump(pbir_definition,file,indent=4)

    def __replace_pipeline_parameter(self, folder_path, it_parameters):
        property_file = f"{folder_path}/pipeline-content.json"
        with open(property_file, "r", encoding="utf-8") as file:
            content = json.load(file)
            properties = content.get("properties",{}).get("parameters",{})
            for parameter in it_parameters:
                if parameter["type"] == "kusto_query_uri":
                    pipeline_parameter = properties.get(parameter["name"],{})
                    pipeline_parameter["defaultValue"] = self.__get_mapping_table_parent_type("KQL DB Eventhouse",parameter["source"],"Kusto Query Uri")
                elif parameter["type"] == "kusto_ingest_uri":
                    pipeline_parameter = properties.get(parameter["name"],{})
                    pipeline_parameter["defaultValue"] = self.__get_mapping_table_parent_type("KQL DB Eventhouse",parameter["source"],"Kusto Ingest Uri")
                elif parameter["type"] == "kusto_database":
                    pipeline_parameter = properties.get(parameter["name"],{})
                    pipeline_parameter["defaultValue"] = str(parameter["source"]).replace(".KQLDatabase","")
                elif parameter["type"] == "variable":
                    pipeline_parameter = properties.get(parameter["name"],{})
                    pipeline_parameter["defaultValue"] = self.pipeline_parameters[parameter["source"]]
        with open(property_file, 'w', encoding='utf-8') as file:
            json.dump(content,file,indent=4)    

    def __replace_pipeline_activities(self, folder_path, it_acitivities):
        property_file = f"{folder_path}/pipeline-content.json"
        with open(property_file, "r", encoding="utf-8") as file:
            content = json.load(file)
            activities = content.get("properties",{}).get("activities",[])
            for activity in activities:
                if activity["type"] == "TridentNotebook":
                    filtered_data = list(filter(lambda act: act["name"] == activity.get("name"), it_acitivities))
                    activity["typeProperties"]["workspaceId"] = self.__get_mapping_table_new_from_type_item("Workspace Id",self.trg_workspace_name)
                    activity["typeProperties"]["notebookId"] = self.__get_mapping_table_new_from_type_item("Notebook ID",filtered_data[0].get("itemName"))
        with open(property_file, 'w', encoding='utf-8') as file:
            json.dump(content,file,indent=4)       


    def __deploy_item(self, name,child=None,it=None):
        parent = ""
        cli_parameter = ""

        # Copy and replace IDs in the item
        tmp_path = self.__copy_to_tmp(name,child,it.get("type"))
        
        if child is not None:
            parent = name
            name = child     

        if ".KQLDatabase" in name:
            if child is not None:
                parent = parent if self.eventhouse_name == "" or self.eventhouse_name is None else f"{self.eventhouse_name}.Eventhouse"
            if it["parent"] is not None:
                parent = it["parent"] if self.eventhouse_name == "" or self.eventhouse_name is None else f"{self.eventhouse_name}.Eventhouse"
            self.mapping_table.append({"Type": "KQL DB Eventhouse", "Item": name, "old": it["parent"], "new": parent })  
            self.__replace_kqldb_parent_eventhouse(tmp_path,parent)
        elif ".Eventhouse" in name:
            name = name if self.eventhouse_name == "" or self.eventhouse_name is None else f"{self.eventhouse_name}.Eventhouse"
        elif ".Eventstream" in name:
            self.__replace_eventstream_destination(tmp_path,it["destinations"]) 
        elif ".Notebook" in name:
            cli_parameter = cli_parameter + " --format .py"
        elif ".DataPipeline" in name: 
            self.__replace_pipeline_parameter(tmp_path,it["parameters"])
            self.__replace_pipeline_activities(tmp_path,it["acitivities"])
        elif ".SemanticModel" in name:
            self.__replace_ids_in_folder(tmp_path, self.mapping_table)
        elif ".KQLDashboard" in name:
            self.__replace_kqldashboard_datasources(tmp_path, it["datasources"])
        elif ".KQLQueryset" in name:
            self.__replace_kqlqueryset_datasources(tmp_path, it["datasources"])
        elif ".Report" in name:
            self.__replace_pbi_report_definition(tmp_path,it["datasource"])

        print("")
        print("#############################################")
        print(f"Deploying {name}")      
        
        self.__run_fab_command(f"import  /{self.trg_workspace_name}/{name} -i {tmp_path} -f {cli_parameter} ", silently_continue= True)

        new_id = self.__fab_get_id(name)

        if ".KQLDatabase" in name:
            self.mapping_table.append({"Type": "KQL DB ID", "Item": name, "old": it["id"], "new": new_id })
        elif ".Eventhouse" in name:
            query_uri = self.__fab_get_kusto_query_uri(name)
            ingest_uri = self.__fab_get_kusto_ingest_uri(name)
            self.mapping_table.append({"Type": "Kusto Query Uri", "Item": name, "old": it["kustoQueryUri"], "new": query_uri })        
            self.mapping_table.append({"Type": "Kusto Ingest Uri", "Item": name, "old": it["kustoIngestUri"], "new": ingest_uri })
            self.mapping_table.append({"Type": "Eventhouse ID", "Item": name, "old": it["id"], "new": new_id })
        elif ".Eventstream" in name:
            for customEndpointName in it.get("customEndpointName",[]):
                self.mapping_table.append({"Type": "Connection String Eventstream", "Item": name, "old": customEndpointName, "new": self.fab_get_eventstream_connection_string(name,customEndpointName) })
            self.mapping_table.append({"Type": "Eventstream ID", "Item": name, "old": it["id"], "new": new_id })
        elif ".Notebook" in name:
            self.mapping_table.append({"Type": "Notebook ID", "Item": name, "old": it["id"], "new": new_id })
        elif ".DataPipeline" in name:
            self.mapping_table.append({"Type": "Pipeline ID", "Item": name, "old": it["id"], "new": new_id })
        elif ".Report" in name:
            self.mapping_table.append({"Type": "Report ID", "Item": name, "old": it["id"], "new": new_id })
        elif ".SemanticModel" in name:
            self.mapping_table.append({"Type": "Semantic Model ID", "Item": name, "old": it["id"], "new": new_id })
        elif ".KQLDashboard" in name:
            self.mapping_table.append({"Type": "KQLDashboard ID", "Item": name, "old": it["id"], "new": new_id })

    def __init__(self, repo_owner="", repo_name="", branch="", folder_prefix="", github_token=""):
        
        # Set environment parameters for Fabric CLI
        token = notebookutils.credentials.getToken('pbi')
        os.environ['FAB_TOKEN'] = token
        os.environ['FAB_TOKEN_ONELAKE'] = token  

        self.repo_owner = repo_owner
        self.repo_name = repo_name
        self.branch = branch
        self.folder_prefix = folder_prefix
        self.github_token = github_token
        
      

    def run(self, workspace_name, capacity_name= "", eventhouse_name = "", exclude = [], type_exclude = [], pipeline_parameters = {}):
        
        self.__download_folder_as_zip(self.repo_owner, self.repo_name, output_zip = "./builtin/src/src.zip", branch = self.branch, folder_to_extract= f"{folder_prefix}/src", remove_folder_prefix = f"{self.folder_prefix}", github_token=self.github_token)
        self.__download_folder_as_zip(self.repo_owner, self.repo_name, output_zip = "./builtin/config/config.zip", branch = self.branch, folder_to_extract= f"{folder_prefix}/config" , remove_folder_prefix = f"{self.folder_prefix}", github_token=self.github_token)
        self.__uncompress_zip_to_folder(zip_path = "./builtin/config/config.zip", extract_to= "./builtin")

        base_path = './builtin/'

        self.eventhouse_name = eventhouse_name
        self.pipeline_parameters = pipeline_parameters

        deploy_order_path = os.path.join(base_path, 'config/deployment_order.json')
        with open(deploy_order_path, 'r') as file:
                self.deployment_order = json.load(file)

        #deploy workspace idempotent
        if "NotFound" in self.__fab_workspace_exists(f"{workspace_name}.Workspace"):
            if capacity_name == "" or capacity_name is None:
                raise "Workspace doesn´t exist and capacity_name not provided"
            self.__run_fab_command(f"mkdir {workspace_name}.Workspace -P capacityname={capacity_name}.Capacity")
            print(f"New Workspace Create")

        self.src_workspace_name = "Workspace.src"
        self.src_workspace_id = self.__get_id_by_name(self.src_workspace_name)

        self.trg_workspace_id = self.__fab_get_workspace_id(f"{workspace_name}.Workspace")
        self.trg_workspace_name = f"{workspace_name}.Workspace"

        print(f"Target Workspace Id: {self.trg_workspace_id}")
        print(f"Target Workspace Name: {self.trg_workspace_name}")

        self.mapping_table.append({"Type": "Workspace Id", "Item": self.trg_workspace_name, "old": self.__get_id_by_name(self.src_workspace_name), "new": self.trg_workspace_id })
        self.mapping_table.append({"Type": "Workspace Blank Id", "Item": self.trg_workspace_name, "old": "00000000-0000-0000-0000-000000000000", "new": self.trg_workspace_id })
        self.mapping_table.append({"Type": "Workspace Name", "Item": self.trg_workspace_name, "old": self.src_workspace_name, "new": self.trg_workspace_name.replace(".Workspace", "") })

        exclude = exclude + [self.src_workspace_name]

        for it in self.deployment_order:
            new_id = None            
            name = it["name"]
            type = it.get("type")

            if name in exclude:
                continue    
            
            if type in type_exclude:
                continue

            self.__deploy_item(name,None,it)

            for child in it.get("children",[]):
                child_name = child["name"]
                self.__deploy_item(name,child_name,child)

    def fab_update_environments_spark_monitor(self,evironments, eventstream_name):
        
        for environment in evironments:
            workspace = environment.get("workspace_id")            
            environment = environment.get("environment_id")
            print("################### UPDATING ENVIRONMENT")
            print("workspace: " + workspace)
            print("Environment: " + environment)
            connection_string = self.__get_mapping_table_new_from_type_item("Connection String Eventstream",eventstream_name)
            StringSparkProperties = json.dumps(
                {
                    "sparkProperties":
                        {
                            "spark.synapse.diagnostic.emitters": "SparkEmitter",
                            "spark.synapse.diagnostic.emitter.SparkEmitter.type": "AzureEventHub",
                            "spark.synapse.diagnostic.emitter.SparkEmitter.secret": connection_string,
                            "spark.fabric.pools.skipStarterPools": "true"
                        }
                }
            )
            response = self.__run_fab_command(f"api -X patch /workspaces/{workspace}/environments/{environment}/staging/sparkcompute -i  {StringSparkProperties}", silently_continue= True)
            response = self.__run_fab_command(f"api -X post /workspaces/{workspace}/environments/{environment}/staging/publish ", silently_continue= True)
            print("################### FINISH UPDATING ENVIRONMENT")

    def update_capcity_events_eventstream(self,workspace, item_name = "CapacityEvents"):
        tmp_path = "./builtin/tmp/export/"

        token = notebookutils.credentials.getToken('pbi')
        os.environ['FAB_TOKEN'] = token
        os.environ['FAB_TOKEN_ONELAKE'] = token 

        shutil.rmtree(tmp_path,  ignore_errors=True)

        os.makedirs(os.path.dirname(tmp_path), exist_ok=True)

        self.__run_fab_command(f"export  /{workspace}.Workspace/{item_name}.Eventstream -o {tmp_path} -f ", silently_continue= True)

        property_file = f"{tmp_path}{item_name}.Eventstream/eventstream.json"

        new_sources = []
        new_input_nodes = []

        dfCapacities = fabric.list_capacities()
        dfCapacities = dfCapacities.query("Sku != 'PP3'")

        with open(property_file, "r", encoding="utf-8") as file:
            content = json.load(file)
            sources = content.get("sources",[])
            for index, row in dfCapacities.iterrows():
                capacity_id = row['Id']
                name = row['Display Name']
                sku = row['Sku']
                name = f"{name.replace(' ','')}-{sku}"
                filtered_data = list(filter(lambda table: table.get("properties",{}).get("capacityId") == capacity_id, sources))
                if len(filtered_data) > 0:
                    new_source = filtered_data.pop()
                    new_input_node = {"name":new_source.get("name")}
                else:
                    new_source = {
                        "id": str(uuid.uuid4()),
                        "name": name,
                        "type": "FabricCapacityUtilizationEvents",
                        "properties": {
                            "eventScope": "Capacity",
                            "capacityId": capacity_id,
                            "includedEventTypes": [
                            "Microsoft.Fabric.Capacity.State",
                            "Microsoft.Fabric.Capacity.Summary"
                            ],
                            "filters": []
                        }
                    }
                    new_input_node = {"name":name}
                new_sources.append(new_source)
                new_input_nodes.append(new_input_node)
            content['sources'] = new_sources

            for stream in content['streams']:
                if stream["type"] == "DefaultStream":
                    stream["inputNodes"] = new_input_nodes

        with open(property_file, 'w', encoding='utf-8') as file:
            json.dump(content,file,indent=4)

        self.__run_fab_command(f"import  /{workspace}.Workspace/{item_name}.Eventstream -i {tmp_path}/{item_name}.Eventstream -f ", silently_continue= True)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

workspace_id = fabric.get_notebook_workspace_id()

workspace_name = fabric.list_workspaces(filter=f"id eq '{workspace_id}'").at[0,'Name']

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

workspace_name

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

fabDeployCLI = FabDeployCLI()

fabDeployCLI.update_capcity_events_eventstream(workspace_name)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }
