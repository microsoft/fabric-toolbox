# CopyWarehouse
This tool can be used to copy or backup a Fabric Warehouse to a Lakehouse.

You can use it to scale out a warehouse and create read-only replicas, but coping the Warehouse to lakehouse in a different workspace.

## Usage
CopyWarehouse.exe {source-workspace-id} {warehouse-id} {destination-workspace-id} {lakehouse-id}

Use the guid's or ID's for the Fabric workspace, warehouse and lakehouses. (It does not work with name.)
The destination Fabric lakehouse must exist before running the binary.


## Instructions
1. Download the C# project from Github
1. Open the .csproj file in VSCode and Visual Studio 2022 (I used Community Edition.)
1. Compile the project.
1. Run the binary

## Improvements
This is an open source project, so feel free to submit bug fixes and improvements.
