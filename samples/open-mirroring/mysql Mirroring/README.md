# MySQL Mirroring

## Purpose
This notebook demostates how to Mirror MySQL into Fabric.  

## How it works
The notebook uses triggers to record the changes on the tables.   There are other ways to record the changes in MySQL, like the binlog, but using triggers requires no client installation. 

The Open Mirroring part is using the [OpenMirroringSDK](https://github.com/microsoft/fabric-toolbox/tree/main/tools/OpenMirroringPythonSDK) 


1. The snapshot is just a query of the base table.
1. The Mirrored table is created
1. Triggers and created and a CDC table is created to record the changes. 
1. Any updates, deleted, inserts are recorded in the CDC table.
1. When the CDC records are collected, the are marked as extracted.
1. The changes are written to parquet and uploaded the the Mirrored table

