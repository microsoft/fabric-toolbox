# dw-requests

This query simplifies the querying of dmvs in warehouse to show you what user queries are currently running and who is running them. In Fabric Data Warehouse we aligned closer to SQL DMVs, so if for users that are familiar with Synapse Dedicated Pools DMV output this will give you a similar view to what was available there. 

You can also install this as a view to abstract away the code. 

# sp_KillQueries

A stored procedure will kill queries that meet specified criteria passed as parameters. 
These criteria include: 
* database name
* login name
* query text snippet
* elapsed time
* command type
* program name
* query hash

It may be useful to configure this to run at a specific interval via a Fabric Pipeline to kill certain queries. The interval should be as long as possible to avoid adding extra load to your endpoint. It is not recommended to set this up to run more than every minute and most likley every 5-15 minutes is frequent enough for most scenarios. 

Example Pipeline configuration: 
![KillQuery_30minTimeoutExample.png](https://github.com/microsoft/fabric-toolbox/blob/main/data-warehouse/collateral/screenshots/KillQuery_30minTimeoutExample.png)


Future functionality being considered: 
* Use role membership as a criteria
* Introduce 'exclude parameters' - query does does not have "xyz"
* Instructions on how to set up pipeline to send notifications after kill

# copy-dmv-to-table

This allows you to save the results of a dmv into a table. At the time of this writing, you cannot directly CTAS a DMV into a table until we support 'mixed-mode execution' of queries.

# queries-running-at-a-given-time

If you plug in a timeframe, it will show you what queries were in the running state at that time. 