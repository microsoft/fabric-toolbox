# Create SQL Database with a collation

[![Create Fabric SQL Database Video](https://img.youtube.com/vi/fgGZLCyz7Xg/0.jpg)](https://youtu.be/fgGZLCyz7Xg)


This [notebook](CreateSQLDB.ipynb) demonstrates how to create a new SQL Database in Microsoft Fabric with a specific collation setting using the Fabric REST API. It performs the following steps:



- Imports necessary modules for REST API interaction and exception handling.

- Initializes a Fabric REST client and retrieves the workspace ID.

- Constructs a request payload specifying the database name, description, and custom collation.

- Executes a POST request to the Fabric API to create the database, handles errors, and displays the creation status.



This approach allows you to provision SQL Databases with any collation requirements directly from your notebook in Microsoft Fabric, supporting enterprise customization and internationalization scenarios.


## Futher Reading

- [Documentation](https://learn.microsoft.com/en-us/fabric/database/sql/deploy-rest-api?tabs=5dot1)


- [API reference](https://learn.microsoft.com/en-us/rest/api/fabric/sqldatabase/items/create-sql-database?tabs=HTTP#newsqldatabasecreationpayload)


