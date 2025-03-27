using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Data.OleDb;
using SQLMirroring;

namespace GenericMirroring.sources
{
    public class Access
    {
        static public SimpleCache<string, DataTable> cache = new SimpleCache<string, DataTable>(TimeSpan.FromHours(10));

        public static void ExtractAccess(string filePath, Root config)
        {
            // Path to your Access database
            string databasePath = filePath;
            string fileName = Path.GetFileName(filePath);
            string fileNameWithoutExtension = Path.GetFileNameWithoutExtension(filePath);

            Logging.Log($"Exporting worksheet: {databasePath}");


            // Connection string for Access database
            string connectionString = $@"Provider=Microsoft.ACE.OLEDB.12.0;Data Source={databasePath};Persist Security Info=False;";

            try
            {
                // List of DataTables to hold the data from each table and view
                var dataTables = ConvertAllAccessTablesAndViewsToDataTables(connectionString, config);

                // Display data for demonstration
                foreach (var table in dataTables)
                {
                    string newOutputdir = $"{config.AccessMirroringConfig.outputFolder}\\{fileNameWithoutExtension}.schema\\{table.TableName}";
                    Console.WriteLine($"Object Name: {table.TableName}");
                  
                    bool firstRun = true;
                    bool changes = true;
                    if (cache.TryGetValue(helper.ComputeHash(newOutputdir), out DataTable value))
                    {
                        firstRun = false;
                        if (helper.DoDatatablesMatch(table, value))
                        {
                            // the table is in the cache and has not changed
                            changes = false;
                        }
                    }

                    if (changes)
                    {
                        cache.Add(helper.ComputeHash(newOutputdir), table);

                        string LocalLocationforTables = config.AccessMirroringConfig.outputFolder;

                        string locforTable = string.Format("{0}\\{1}.schema\\{2}\\", LocalLocationforTables, fileNameWithoutExtension, table.TableName);
                        string newfilename = helper.GetFileVersionName(locforTable);
                        string parquetFilePath = Path.Combine(locforTable, $"{newfilename}.parquet");

                        string justTablepath = string.Format("/{0}.schema/{1}/{2}.parquet", fileNameWithoutExtension, table.TableName, newfilename);
                        string justMetadatapath = string.Format("/{0}.schema/{1}/_metadata.json", fileNameWithoutExtension, table.TableName, newfilename);
                        //helper.DeleteFolders(locforTable);

                        Upload upload = new Upload();
                        if (firstRun == true)
                        {
                            helper.CreateFolders(locforTable);
                            helper.CreateJSONMetadata(locforTable, "_id_");

                            
                            upload.CopyChangesToOnelake(config, string.Format("{0}{1}", locforTable, "_metadata.json"), justMetadatapath);
                        }

                        ParquetDump.WriteDataTableToParquet(table, parquetFilePath);

                        upload.CopyChangesToOnelake(config, parquetFilePath, justTablepath);
                    }
                }
            }
            catch (Exception ex)
            {
                Logging.Log($"Error: {ex.Message}");
            }

        }

        static List<DataTable> ConvertAllAccessTablesAndViewsToDataTables(string connectionString, Root config)
        {
            var dataTables = new List<DataTable>();

            using (var connection = new OleDbConnection(connectionString))
            {
                connection.Open();

                // Get schema information for tables and views
                var schemaTable = connection.GetSchema("Tables");
                foreach (DataRow row in schemaTable.Rows)
                {
                    string objectName = row["TABLE_NAME"].ToString();
                    string objectType = row["TABLE_TYPE"].ToString();

                    // Include both tables and views
                    if (objectType == "TABLE" || objectType == "VIEW")
                    {
                        // Load object data into a DataTable
                        var dataTable = new DataTable(objectName);
                        using (var command = new OleDbCommand($"SELECT * FROM [{objectName}]", connection))
                        using (var adapter = new OleDbDataAdapter(command))
                        {
                            try
                            {
                                adapter.Fill(dataTable);

                                dataTable.Columns.Add($"__rowMarker__", typeof(int));
                                dataTable.Columns.Add($"_id_", typeof(int));

                                int rowCount = dataTable.Rows.Count;
                                for (int i = 0; i < rowCount; i++)
                                {

                                    dataTable.Rows[i]["__rowMarker__"] = 1;
                                    dataTable.Rows[i]["_id_"] = i;

                                }
                                dataTables.Add(dataTable);
                                //dataTables.Add(dataTable);
                            }
                            catch (Exception ex)
                            {
                                Logging.Log($"Error reading {objectType} '{objectName}': {ex.Message}");
                            }
                        }
                    }
                }
            }

            return dataTables;
        }



    }
}
