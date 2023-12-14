# sp_KillQueries

This tool will kill queries that meet specified criteria inclucding: 
* database name
* login name
* query text snippet
* elapsed time
* command type
* program name
* query hash

It may be useful to configure this to run at a specific interval via a Fabric Pipeline to kill certain queries. The interval should be as long as possible to avoid adding extra load to your endpoint. It is not recommended to set this up to run more than every minute and most likley every 5-15 minutes is frequent enough for most scenarios. 

Example Pipeline configuration: 
![KillQuery_30minTimeoutExample.png](https://github.com/microsoft/Fabric_Toolbox/blob/main/collateral/screenshots/KillQuery_30minTimeoutExample.png)
