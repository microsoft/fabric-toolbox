
from adf_fabric_migrator import ADFParser, PipelineTransformer, ConnectorMapper
import json
from pathlib import Path

# Initialize parser
parser = ADFParser().__init__()
print(parser)
# Load ARM template
arm_path = Path("arm_template.json")
content = arm_path.read_text(encoding="utf-8")

# Parse components
components = parser.parse_arm_template(content)
print(f"Found {len(components)} components")

# Summarize
summary = parser.get_component_summary(components)
print(f"Pipelines: {summary.by_type.get('pipeline', 0)}")
print(f"Datasets: {summary.by_type.get('dataset', 0)}")
print(f"LinkedServices: {summary.by_type.get('linkedService', 0)}")

# Transform pipelines
transformer = PipelineTransformer()
for component in components:
    if component.type.value == "pipeline":
        fabric_pipeline = transformer.transform_pipeline_definition(
            component.definition,
            component.name
        )
        print(f"Transformed pipeline: {component.name}")

# Map connectors
mapper = ConnectorMapper()
for component in components:
    if component.type.value == "linkedService":
        ls_type = component.definition.get("properties", {}).get("type", "")
        mapping = mapper.map_connector({"type": ls_type})
        print(f"{ls_type} -> {mapping.fabric_type} ({mapping.mapping_confidence.value})")
