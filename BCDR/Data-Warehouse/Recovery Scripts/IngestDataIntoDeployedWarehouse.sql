/*
===============================================
Script DW Ingestion from LH Shortcuts
===============================================

This script creates the script to ingest all tables from the source Lakehouse into the destination Warehouse.  

Be sure to update the following variables before running: 
	1. *LHName* -- Use DB statement at the top (this should be your Lakehouse containing shortcuts to your data), 
	2. *LHName* -- LHName this should be your recovery Lakehouse (same as #1)
	3. *myDW*		-- Your destination warehouse name that you are copying data into

Run this script against the Recovered Lakehouse containing shortcuts to your data

Copy all results from this script to a new query window and execute in batches to ingest data from the LH into the deployed schema in your new warehouse.

**** This script is provided as-is with no guarantees that it will meet your particular scenario. **** 
**** Use at your own risk. **** 
**** Copy and modify it for your particular use case. ****
*/

Use *LHName*;

DECLARE @LHName varchar(256)
SET @LHName = '*LHName*'

DECLARE @DWName varchar(256)
SET @DWName = '*myDW*'

SELECT 
name, 
substring(name,0,charindex('__',name)) as schemaname, 
substring(name, charindex('__',name)+2,datalength(name)) as tablename,

'INSERT INTO '+@DWName+'.'+cast(substring(name,0,charindex('__',name)) as varchar(256))+'.'+cast(substring(name, charindex('__',name)+2,datalength(name)) as varchar(256))+
' SELECT * FROM '+@LHName+'.'+cast(schema_name(schema_id) as varchar(256))+'.'+cast(name as varchar(256))+';'
from sys.tables
