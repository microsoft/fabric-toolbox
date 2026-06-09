This solution leverages the new Save As Fabric REST API for Dataflow Gen 2 along with a Fabric notebook to accelerate migration of Gen 1 Dataflows to Gen 2.

To use it:
- Download the ipynb file and import it into a new Fabric Workspace
- Run the notebook. This will:
	- create a Lakehouse to store migration files
	- deploy notebooks and a semantic model/report to the workspace
	- Note: this notebook will access this Fabric Toolbox folder to read in the json file with the item definitions. If you are not able to access the internet from your notebook, please download the json file and update the path accordingly.
	- If the Inventory Report is not visible in the Workspace, just do a refresh of the browser.
- If desired, run the "Dataflow Inventory" notebook to get information on the Dataflows in your tenant
	- View the Inventory Report to decide which Dataflows to migrate
- Use the "Create DFG2s from DFG1s" notebook to automatically create Gen 2 Dataflows from your Gen 1 Dataflows
	- Use the appropriate cell based on your migration approach
		- Add any additional code to filter to a subset of dataflows if the default scope is too broad
- Note: The Save As REST API will maintain the connections and refresh schedule from your Gen 1 Dataflows but any incremental refresh settings will need to be recreated prior to initial refresh
- Check back for later versions of this tool, as additional notebooks are planned to help update downstream items with the GUIDs from the newly created Gen 2 Dataflows

- Note - This YouTube video walks through how to use this accelerator - https://youtu.be/We-qUkec4wI
