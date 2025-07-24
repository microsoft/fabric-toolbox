# Excel Mirroring

## Purpose
This notebook demostates how to Mirror Excel workbooks into Fabric.  
It shows that Mirroring can be done 100% in Fabric using just a notebook. 

## How it works
The notebook uses some simple code to extract the Excel document and the [OpenMirroringSDK](https://github.com/microsoft/fabric-toolbox/tree/main/tools/OpenMirroringPythonSDK) 

1. This notebook scans a folder in the Onelake, 
1. It finds all the Excel files.
1. It extracts each sheet to a parquet file
1. If needed it will create the Mirrored table.
1. It uploads the parquet file to the Mirrored table.

