# Snowflake Mirroring

## Purpose
This notebook demostates how to Mirror a Snowflake databse into Fabric.   While you can use the first party Snowflake Mirroring, this solution allows you to Mirror tables, views and dynamic tables.   

## How it works
The notebook creates a stream for the table/view/dynamic table.   

The Open Mirroring part is using the [OpenMirroringSDK](https://github.com/microsoft/fabric-toolbox/tree/main/tools/OpenMirroringPythonSDK) 


1. The snapshot is just a select * from table/view or dynamic table.
1. A stream is created on the table/view or dynamic table.
1. When changes are collected;
    1.  We issue a select * from stream
    1.  We create a new stream





