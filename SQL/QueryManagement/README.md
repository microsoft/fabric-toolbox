# sp_KillQueries

This tool will kill queries that meet specified criteria inclucding: 
* database name
* login name
* query text snippet
* elapsed time
* command type
* program name
* query hash

It may be useful to configure this to run at a specific interval via a Fabric Pipeline to kill certain queries. 

Example Pipeline configuration: 
