# Refresh Tables in the SQL Endpoint

There is a public REST API for synchronising the delta tables in Onelake with the SQL Analytics Endpoint.

## New REST API
A REST API has been released, which follows the long running operation (LRO) implementation.   It is slightly different from the old REST API.   Please update any references to the old REST API, to use this new one.

### User Data Function example
[Using a service principal](./RefreshTableinSQLEndpoint.py) - This example is for a User Data Function.   Copy and paste the code into a new User Data Function and add the libraries.   This can be called from other services in Fabric, i.e. notebooks and pipelines.


### Notebooks examples
[Using users context](MDSyncNewRESTAPI.ipynb) - This uses the authenication token of the current user.

[Using a service principal](./MDSyncNewRESTPIAPISP.ipynb) - This allows you to use a service prinipal


## Old
[REST API](./refresh-tables-in-sql-endpoint.ipynb) is an example of using the current REST API.

