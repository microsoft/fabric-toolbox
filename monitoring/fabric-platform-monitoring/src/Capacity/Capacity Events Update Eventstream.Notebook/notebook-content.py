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

%pip install fabric-deployment-tool --quiet

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

from sempy import fabric
import fabric_deployment_tool

workspace_id = fabric.get_notebook_workspace_id()
workspace_name = fabric.list_workspaces(filter=f"id eq '{workspace_id}'").at[0,'Name']

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

fabDeploymentTool = fabric_deployment_tool.FabDeploymentTool()

fabDeploymentTool.update_capcity_events_eventstream(workspace_name)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }
