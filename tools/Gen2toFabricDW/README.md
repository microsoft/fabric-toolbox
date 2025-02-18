# Gen2 to Fabric DW 
A utility to copy tables from a Synapse Dedicated SQL Pool / SQL DW Gen2 to Fabric DW.  

It does the following;
1. Extract the table schema from the Dedicated SQL pool.
1. Create the table on the Fabric DW.
1. Extract the data from the table using an external table to ADLS in parquet.
1. Run Copy into on Fabric Data Warehouse to import the parquet files into the Warehouse.

## Details
The utility uses a SaS key to authenticate with ADLS so it can read and write to the storage account.   
The performance of the extract is dependant the number of rows and the size of synapse data warehouse. 
You the config file to pick which tables need to be copied.

TODO:
1. Batching : If the table is very large, i.e. TB and the DWU is small, the table can be broken down into smaller batches.  This reduces the CPU/memory overhead, but the table needs a column that can work as a high watermark.

