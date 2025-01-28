# Mirroring SQL Server using Change Tracking

## Mirroring from SQL Server 2008 - SQL Server 2022
The aim of this POC (Proof of Concept) code, was to show how easy it is to setup Open Mirroring and Mirroring some tables from a SQL Server to it.

There is a [youtube video](https://youtu.be/Gg3YlGyy5P8), containing demoing the solution and how to setup the solution and most importantly what to put in the config file.

This solution uses [Change tracking a feature of SQL Server 2008 and above](https://learn.microsoft.com/en-us/sql/relational-databases/track-changes/about-change-tracking-sql-server?view=sql-server-ver16), but I did all my testing on SQL Server 2017 (in docker), but it should work on almost any version of SQL Server from 2008 to 2022.


This solution will:
1. Enable Change Tracking on the database and on the table.
1. Create a snapshot or initial extract from SQL Server
1. Upload the extracted data (in parquet file) to the Mirroring Landing zone.
1. On a custom schedule per table, extract any changes on the table and upload them to the landing zone.

# Instructions
1. Compile the solution using VSCode or Visual Studio 2022 - I used Community Edition.
1. Edit the config file, to include the SQL Server, tables you want to Mirror and the SPN Application ID, SPN Secret and SPN Tenant. (All the details are in the [youtube video](https://youtu.be/Gg3YlGyy5P8), there is a [seperate youtube video](https://youtu.be/85xWqWHfWbU)for creating an SPN)
1. [Create the Mirrored database](https://youtu.be/tiHHw2Hj848) , Copy the Landing Zone to the config file. 
1. Run the program.
 


