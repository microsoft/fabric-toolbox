using SQLMirroring;
using System;
using Microsoft.Data.SqlClient;
using static System.Net.Mime.MediaTypeNames;
using System.IO;
using System.Runtime.Intrinsics.Arm;
using System.Data;

class Program
{
    static void Main(string[] args)
    {

        // Path to the JSON configuration file
        string configFilePath = "mirrorconfig.json";
        //  string configpath = System.IO.Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
        string configpath = "C:\\Users\\maprycem\\source\\repos\\SQLMirroring"; 
        string wholepath = string.Format("{0}\\{1}", configpath, configFilePath);


        // Read and parse configuration
        //DatabaseConfig config = helper.LoadData<DatabaseConfig>(wholepath);
        Root config = helper.LoadData<Root>(wholepath);
        if (config == null)
        {
            Console.WriteLine("Failed to load configuration.");
            return;
        }

        Console.WriteLine("Configuration loaded successfully.");

        // Connection string (replace with your own values)
        
        string databaseName = config.DatabaseConfig.DatabaseName;
        string connectionString = helper.UpdateString(config.DatabaseConfig.ConnectionString, databaseName);
        string ChangeTrackingSQL = helper.UpdateString( config.DatabaseConfig.ChangeTrackingSQL, databaseName);
        String ChangeTrackingTable = config.DatabaseConfig.ChangeTrackingTable;

        string LocalLocationforTables = config.DatabaseConfig.LocalLocationforTables;


        //Console.WriteLine("Enabled CT at database.");
        ExecuteNonQuery(connectionString, ChangeTrackingSQL);

        //Console.WriteLine("Enabled CT at tables");

        while (true) {

            foreach (TableConfig table in config.DatabaseConfig.Tables)
            {
                string tableName = string.Format("{0}.{1}", table.SchemaName, table.TableName);

                //Console.WriteLine("Scanning::{0}", tableName);

                if (table.LastUpdate == null) table.LastUpdate = DateTime.Now;
                if (table.SecondsBetweenChecks == null || table.SecondsBetweenChecks == 0) table.SecondsBetweenChecks = 15;

                if (table.Status == null)
                {
                    Console.WriteLine(String.Format("Starting from scratch {0} ", tableName));

                    string TableCt = helper.UpdateString(ChangeTrackingTable, tableName);

                    ExecuteNonQuery(connectionString, TableCt);

                    table.Status = "Enabled";

                    helper.SaveData(config, wholepath);
                }


                if (table.Status == "Running")
                {
                    // Get Initial Snapshot
                    if (table.LastUpdate.AddSeconds(table.SecondsBetweenChecks) < DateTime.Now)
                    {

                        Console.WriteLine(String.Format("Checking for updates: {0} ", tableName));

                        string extractQuery = config.DatabaseConfig.ChangeIncrementalSQL;
                        extractQuery = extractQuery.Replace("{KeyColumn}",   table.KeyColumn);
                        extractQuery = extractQuery.Replace("{OtherColumns}", table.OtherColumns);
                        extractQuery = extractQuery.Replace("{AdditionalColumns}", table.AdditionalColumns);
                        extractQuery = extractQuery.Replace("{t}", tableName);
                        extractQuery = extractQuery.Replace("{h}", config.DatabaseConfig.Highwatermark);
                        
                        string locforTable = string.Format("{0}\\{1}.schema\\{2}\\", LocalLocationforTables, table.SchemaName, table.TableName);
                        string newfilename = helper.GetFileVersionName(locforTable);
                        string parquetFilePath = Path.Combine(locforTable, $"{newfilename}.parquet");

                        string justTablepath = string.Format("/{0}.schema/{1}/{2}.parquet", table.SchemaName, table.TableName, newfilename);
                        string justMetadatapath = string.Format("/{0}.schema/{1}/_metadata.json", table.SchemaName, table.TableName, newfilename);
                        string removePath = string.Format("{0}.schema/{1}", table.SchemaName, table.TableName, newfilename);

                        if(ExecuteRSWritePQ(connectionString, extractQuery, parquetFilePath))
                        {  
                            Upload.CopyChangesToOnelake(config, parquetFilePath, justTablepath);
                            table.DeltaVersion = newfilename;
                            config.DatabaseConfig.Highwatermark = ExecuteScalar(connectionString, config.DatabaseConfig.HighwatermarkSQL);
                        }

                        table.LastUpdate = DateTime.Now;
                        helper.SaveData(config, wholepath);
                    }
                }

                if (table.Status == "Enabled")
                {
                    // Get Initial Snapshot
                    string extractQuery = table.FullDataExtractQuery;
                    extractQuery = extractQuery.Replace("{KeyColumn}", table.KeyColumn);
                    extractQuery = extractQuery.Replace("{OtherColumns}", table.OtherColumns);
                    extractQuery = extractQuery.Replace("{AdditionalColumns}", table.AdditionalColumns);
                    extractQuery = extractQuery.Replace("{t}", tableName);

                    Console.WriteLine(String.Format("Generating Snapshot: {0} ", tableName));

                    string locforTable = string.Format("{0}\\{1}.schema\\{2}\\", LocalLocationforTables, table.SchemaName, table.TableName);

                    helper.DeleteFolders(locforTable);

                    helper.CreateFolders(locforTable);
                    helper.CreateJSONMetadata(locforTable, table.KeyColumn);
                    string newfilename = helper.GetFileVersionName(locforTable);
                    string parquetFilePath = Path.Combine(locforTable, $"{newfilename}.parquet");


                    string justTablepath = string.Format("/{0}.schema/{1}/{2}.parquet", table.SchemaName, table.TableName, newfilename);
                    string justMetadatapath = string.Format("/{0}.schema/{1}/_metadata.json", table.SchemaName, table.TableName, newfilename);
                    string removePath = string.Format("{0}.schema/{1}", table.SchemaName, table.TableName, newfilename);

                    Upload.RemoveChangesToOnelake(config, removePath);

                    ExecuteRSWritePQ(connectionString, extractQuery, parquetFilePath);

                    Upload.CopyChangesToOnelake(config, String.Format("{0}{1}", locforTable, "_metadata.json"), justMetadatapath);
                    Upload.CopyChangesToOnelake(config, parquetFilePath, justTablepath);

                    config.DatabaseConfig.Highwatermark = ExecuteScalar(connectionString, config.DatabaseConfig.HighwatermarkSQL);
                    table.DeltaVersion = newfilename;
                    table.Status = "Running";
                    table.LastUpdate = DateTime.Now;
                    helper.SaveData(config, wholepath);
                }

                Thread.Sleep(5000);
            }

        }

        Console.ReadLine();

      
    }


    static SqlDataReader ExecuteRS(string connectionString, string query)
    {
        try
        {

            SqlDataReader reader;
            // Create and open a connection to SQL Server
            using (SqlConnection connection = new SqlConnection(connectionString))
            {
                connection.Open();
                //Console.WriteLine("Connection to SQL Server successful.");

                // Create a command object
                using (SqlCommand command = new SqlCommand(query, connection))
                {

                    // Execute the command and process the results
                    /*  using (reader = command.ExecuteReader())
                      {
                          // Loop through the rows
                          while (reader.Read())
                          {
                              // Example: Access data by column index
                              Console.WriteLine($"Column1: {reader[0]}, Column2: {reader[1]}");
                          }
                     using var tempFile = new FileStream(parquetFilePath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None, 1024 * 256, FileOptions.DeleteOnClose);

                var sqr = ExecuteRSWritePQ(connectionString, extractQuery, tempFile);

                if (sqr != null) {

                     ParquetWrite.WriteDatareaderToParquet(sqr, tempFile);
                  }
                
                    
                    } */
                    reader = command.ExecuteReader();
            }
            }
            return reader;
        }
        catch (Exception ex)
        {
            // Handle any errors that may have occurred
            Console.WriteLine($"An error occurred: {ex.Message}");
            return null;
        }
    }
    static Boolean ExecuteRSWritePQ(string connectionString, string query, string filePath)
    {
        try
        {

            SqlDataReader reader;
            // Create and open a connection to SQL Server
            using (SqlConnection connection = new SqlConnection(connectionString))
            {
                connection.Open();
                //Console.WriteLine("Connection to SQL Server successful.");

                // Create a command object
                using (SqlCommand command = new SqlCommand(query, connection))
                {
                    reader = command.ExecuteReader();

                    if (reader.HasRows)
                    {
                        
                        
                        SQLMirroring.ParquetDump.WriteDataTableToParquet(reader, filePath);
                        return true;
                    }
                    else
                    {
                        return false;
                    }

                }
            }
        }
        catch (Exception ex)
        {
            // Handle any errors that may have occurred
            Console.WriteLine($"An error occurred: {ex.Message}");
            return false;
        }
    }

    static void ExecuteNonQuery(string connectionString, string query)
    {
        try
        {
            // Create and open a connection to SQL Server
            using (SqlConnection connection = new SqlConnection(connectionString))
            {
                connection.Open();
                //Console.WriteLine("ExecuteNonQuery:Connection to SQL Server successful.");

                // Create a command object
                using (SqlCommand command = new SqlCommand(query, connection))
                {
                    command.ExecuteNonQuery();
                }
            }
        }
        catch (Exception ex)
        {
            // Handle any errors that may have occurred
            Console.WriteLine($"ExecuteNonQuery:An error occurred: {ex.Message}");
        }
    }


    static string ExecuteScalar(string connectionString, string query)
    {
        try
        {

            string reader;
            // Create and open a connection to SQL Server
            using (SqlConnection connection = new SqlConnection(connectionString))
            {
                connection.Open();
                //Console.WriteLine("Connection to SQL Server successful.");

                // Create a command object
                using (SqlCommand command = new SqlCommand(query, connection))
                {
                    reader  = command.ExecuteScalar().ToString();  
                }
            }
            return reader;
        }
        catch (Exception ex)
        {
            // Handle any errors that may have occurred
            Console.WriteLine($"An error occurred: {ex.Message}");
            return string.Empty;
        }
    }

}
