-- Get the Edition
SELECT db_name(), DATABASEPROPERTYEX(db_name(), 'Edition')  AS Edition;  

-- Whats the workspace id?
 SELECT DATABASEPROPERTYEX('master', 'workspaceid') AS workspaceid ;
 
 -- What is the artifact id?
SELECT DATABASEPROPERTYEX(db_name(), 'ArtifactId') AS ArtifactId; 

-- Put it all together
SELECT db_name(), DATABASEPROPERTYEX(db_name(), 'Edition') as Edition, DATABASEPROPERTYEX('master', 'workspaceid') AS WorkSpaceId, DATABASEPROPERTYEX(db_name(), 'ArtifactId') AS ArtifactId; 
