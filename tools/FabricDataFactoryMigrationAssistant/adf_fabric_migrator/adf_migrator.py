import json
import uuid
from pathlib import Path

# Import your local modules
# Assuming files are: parser.py, connector_mapper.py, adf_migrator.py, models.py
from parser import ADFParser, ComponentType
from connector_mapper import ConnectorMapper
from adf_migrator import convert_adf_to_fabric 

def main():
    # 1. Initialize Components
    # ------------------------
    parser = ADFParser()  # FIXED: Removed .__init__()
    mapper = ConnectorMapper() #
    
    # 2. Load ARM Template
    # --------------------
    arm_path = Path("arm_template.json")
    if not arm_path.exists():
        print(f"Error: {arm_path} not found.")
        return

    content = arm_path.read_text(encoding="utf-8")
    print(f"Loaded ARM template ({len(content)} bytes)")

    # 3. Parse Components
    # -------------------
    # - Parser extracts components
    components = parser.parse_arm_template(content)
    print(f"Found {len(components)} components")

    # Summarize
    summary = parser.get_component_summary(components)
    print(f"Pipelines: {summary.by_type.get('pipeline', 0)}")
    print(f"LinkedServices: {summary.by_type.get('linkedService', 0)}")

    # 4. Build Dynamic Resolution Map (The "Generic" Logic)
    # -----------------------------------------------------
    resolution_map = {
        "objectId": str(uuid.uuid4()),
        "workspaceId": "95e132cd-cf5f-4e15-a9e1-7506994aa23c", # Replace with config/env var
        "linkedServiceToConnectionId": {},
        "notebookIdByActivityName": {},
        # Default placeholders
        "defaultNotebookId": "placeholder_notebook_id",
        "warehouseConnectionId": "placeholder_warehouse_conn",
        "lakehouseConnectionId": "placeholder_lakehouse_conn",
        "lakehouseArtifactId": "placeholder_artifact_id"
    }

    print("\n--- Mapping Connectors ---")
    for component in components:
        if component.type == ComponentType.LINKED_SERVICE:
            ls_name = component.name
            # Extract type safely using models logic or raw definition
            ls_type = component.definition.get("properties", {}).get("type") or component.definition.get("type")
            
            # Use Mapper to validate support
            mapping = mapper.map_connector({"type": ls_type})
            
            # Generate a deterministic placeholder UUID for this connection
            # In a real scenario, you would look up the real ID from a config file here
            connection_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, ls_name))
            resolution_map["linkedServiceToConnectionId"][ls_name] = connection_id
            
            print(f"Mapped '{ls_name}' ({ls_type}) -> Fabric '{mapping.fabric_type}' (ID: {connection_id})")

    # 5. Transform Pipelines
    # ----------------------
    print("\n--- Transforming Pipelines ---")
    output_dir = Path("fabric_output")
    output_dir.mkdir(exist_ok=True)

    for component in components:
        if component.type == ComponentType.PIPELINE:
            # - Use the converter function with the map we just built
            fabric_pipeline = convert_adf_to_fabric(
                {"name": component.name, "properties": component.definition["properties"]}, 
                resolution_map
            )
            
            # Save to file
            out_file = output_dir / f"{component.name}.json"
            with open(out_file, "w") as f:
                json.dump(fabric_pipeline, f, indent=4)
            
            print(f"Converted: {component.name} -> {out_file}")

if __name__ == "__main__":
    main()