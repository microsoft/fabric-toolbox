# Properies about the Warehouse / SQL Anayltics Endpoint

## What is the Edition?
The Edition tells us if we are connecting to a Warehouse or SQL Anayltics Endpoint (SQL AE)

`SELECT db_name(), DATABASEPROPERTYEX(db_name(), 'Edition')  AS Edition; ` 

|Edition      |Type                                                        |
|-------------|-----------------------------------------------------------|
|DataWarehouse|Fabric Warehouse                                           |
|LakeWarehouse|SQL Anayltics Endpoint (for Lakehouse or Mirrored database)|


## What is the Item ID
The Item ID (Guid) was previously known as the Artifact Id.

`SELECT DATABASEPROPERTYEX(db_name(), 'ArtifactId') AS ArtifactId;` 


## What is the Workspace ID
This is the ID (Guid) for the Fabric Workspace.    This needs to be the 'master' database.

 `SELECT DATABASEPROPERTYEX('master', 'workspaceid') AS workspaceid;`
