using SQLMirroring;
using System;
using Microsoft.Data.SqlClient;
using static System.Net.Mime.MediaTypeNames;
using System.IO;
using System.Runtime.Intrinsics.Arm;
using System.Data;
using GenericMirroring;
using GenericMirroring.sources;
using System.Drawing;
using Apache.Arrow;
using Newtonsoft.Json.Linq;
class Program
{
    private static Root config = null;
    static async Task Main(string[] args)
    {
        #region Load the Config
        // Path to the JSON configuration file
        string configFilePath = "mirrorconfig.json";
        string configpath = System.IO.Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);


        //    string configpath = "C:\\source\\samples\\fabric-toolbox\\open-mirroring\\GenericMirroring";
        // string configpath = "C:\\temp"; 
        string wholepath = string.Format("{0}\\{1}", configpath, configFilePath);
        string loggingfilename = $"{DateTime.Now:yyyy-MM-dd_HH-mm-ss}_logging.txt";

        // Read and parse configuration
        //DatabaseConfig config = helper.LoadData<DatabaseConfig>(wholepath);
        config = helper.LoadData<Root>(wholepath);
        if (config == null)
        {
            Console.WriteLine("Failed to load configuration.");
            return;
        }

        Console.WriteLine("Configuration loaded successfully.");
        #endregion

        helper.CreateFolders(config.LocationLogging);
        Logging.locallogging = string.Format("{0}\\{1}", config.LocationLogging, loggingfilename);

        #region Setup Excel Mirroing Watcher
        if (config.ExcelMirroringConfig != null)
        {
            string folderToWatch = config.ExcelMirroringConfig.folderToWatch;
            string outputfolder = config.ExcelMirroringConfig.outputFolder;

            if (folderToWatch.Length > 0)
            {
                helper.CreateFolders(folderToWatch);
            }

            Logging.Log(String.Format("Excel Config : Watching folder: {0}", folderToWatch));

            FileSystemWatcher watcher = new FileSystemWatcher();

            // Set the directory to monitor
            watcher.Path = folderToWatch;

            // Optionally, filter for specific files or extensions (e.g., "*.txt" for text files)
            watcher.Filters.Add("*.xlsx");

            // Watch for specific changes (created, changed, deleted, renamed)
            watcher.NotifyFilter = NotifyFilters.FileName |   // File name changes
                                   NotifyFilters.LastWrite |  // File modifications
                                   NotifyFilters.Size |
                                   NotifyFilters.CreationTime |
                                   NotifyFilters.Attributes;        // File size changes

            watcher.Created += OnCreated;
            watcher.Changed += OnCreated;
            watcher.Renamed += OnCreated;

            watcher.EnableRaisingEvents = true;

            Logging.Log("Watching...");
        }
        else
        {
            Logging.Log("No Excel config.");
        }
        #endregion

        #region Setup CSV Mirroing Watcher
        if (config.ExcelMirroringConfig != null)
        {
            string folderToWatch = config.CSVMirroringConfig.folderToWatch;
            string outputfolder = config.CSVMirroringConfig.outputFolder;

            if (folderToWatch.Length > 0)
            {
                helper.CreateFolders(folderToWatch);
            }

            Logging.Log(String.Format("CSV Config : Watching folder: {0}", folderToWatch));

            FileSystemWatcher csvWatcher = new FileSystemWatcher();

            // Set the directory to monitor
            csvWatcher.Path = folderToWatch;

            // Optionally, filter for specific files or extensions (e.g., "*.txt" for text files)
            csvWatcher.Filters.Add("*.csv");

            // Watch for specific changes (created, changed, deleted, renamed)
            csvWatcher.NotifyFilter = NotifyFilters.FileName |   // File name changes
                                   NotifyFilters.LastWrite |  // File modifications
                                   NotifyFilters.Size |
                                   NotifyFilters.CreationTime |
                                   NotifyFilters.Attributes;        // File size changes

            csvWatcher.Created += OnCreated;
            csvWatcher.Changed += OnCreated;
            csvWatcher.Renamed += OnCreated;

            csvWatcher.EnableRaisingEvents = true;

            Logging.Log("Watching...");
        }
        else
        {
            Logging.Log("No Excel config.");
        }
        #endregion

        #region Setup Access Mirroing Watcher
        if (config.AccessMirroringConfig != null)
        {
            string folderToWatch = config.AccessMirroringConfig.folderToWatch;
            string outputfolder = config.AccessMirroringConfig.outputFolder;

            if (folderToWatch.Length > 0)
            {
                helper.CreateFolders(folderToWatch);
            }

            Logging.Log(String.Format("Access Config : Watching folder: {0}", folderToWatch));

            FileSystemWatcher accessWatcher = new FileSystemWatcher();

            // Set the directory to monitor
            accessWatcher.Path = folderToWatch;

            // Optionally, filter for specific files or extensions (e.g., "*.txt" for text files)
            accessWatcher.Filters.Add("*.accdb");

            // Watch for specific changes (created, changed, deleted, renamed)
            accessWatcher.NotifyFilter = NotifyFilters.FileName |   // File name changes
                                   NotifyFilters.LastWrite |  // File modifications
                                   NotifyFilters.Size |
                                   NotifyFilters.CreationTime |
                                   NotifyFilters.Attributes;        // File size changes

            accessWatcher.Created += OnCreated;
            accessWatcher.Changed += OnCreated;
            accessWatcher.Renamed += OnCreated;

            accessWatcher.EnableRaisingEvents = true;

            Logging.Log("Watching...");
        }
        else
        {
            Logging.Log("No Access config.");
        }
        #endregion

        // Power loop

        while (true)
        {
            #region SQL Server loop
            foreach (DatabaseConfig dbC in config.SQLChangeTrackingConfig)
            {
                #region SQL Change Tracking
                if (dbC != null)
                {
                    if (dbC.Enabled == "True")
                    {
                        if (dbC.ConnectionString != null || dbC.ConnectionString.Length > 0)
                        {
                            // only run the SQL code, when there is a connection string.

                            string databaseName = dbC.DatabaseName;
                            string connectionString = helper.UpdateString(dbC.ConnectionString, databaseName);
                            string ChangeTrackingSQL = helper.UpdateString(dbC.ChangeTrackingSQL, databaseName);
                            string ChangeTrackingTable = dbC.ChangeTrackingTable;
                            string LocalLocationforTables = dbC.LocalLocationforTables;


                            if (dbC.ChangeTrackingEnabled == null || dbC.ChangeTrackingEnabled == string.Empty)
                            {
                                Logging.Log("Enabled CT at database.");
                                SQLServer.ExecuteNonQuery(connectionString, ChangeTrackingSQL);
                                dbC.ChangeTrackingEnabled = "Enabled";
                                helper.SaveData(config, wholepath);
                            }

                            foreach (TableConfig table in dbC.Tables)
                            {
                                string tableName = string.Format("{0}.{1}", table.SchemaName, table.TableName);

                                //Log("Scanning::{0}", tableName);

                                if (table.LastUpdate == null) table.LastUpdate = DateTime.Now;
                                if (table.SecondsBetweenChecks == null || table.SecondsBetweenChecks == 0) table.SecondsBetweenChecks = 15;

                                #region Enable CT on table
                                if (table.Status == null)
                                {
                                    Logging.Log(String.Format("Starting from scratch {0} ", tableName));

                                    string TableCt = helper.UpdateString(ChangeTrackingTable, tableName);

                                    SQLServer.ExecuteNonQuery(connectionString, TableCt);

                                    table.Status = "Enabled";

                                    helper.SaveData(config, wholepath);
                                }
                                #endregion

                                #region Check for changes
                                if (table.Status == "Running")
                                {
                                    // Get Initial Snapshot
                                    if (table.LastUpdate.AddSeconds(table.SecondsBetweenChecks) < DateTime.Now)
                                    {

                                        //Logging.Log(String.Format("Checking for updates: {0} ", tableName));

                                        string extractQuery = dbC.ChangeIncrementalSQL;
                                        extractQuery = UpdateQuery(dbC, table, tableName, extractQuery);

                                        string locforTable = string.Format("{0}\\{1}.schema\\{2}\\", LocalLocationforTables, table.SchemaName, table.TableName);
                                        string newfilename = helper.GetFileVersionName(locforTable);
                                        string parquetFilePath = Path.Combine(locforTable, $"{newfilename}.parquet");

                                        string justTablepath = string.Format("/{0}.schema/{1}/{2}.parquet", table.SchemaName, table.TableName, newfilename);
                                        string justMetadatapath = string.Format("/{0}.schema/{1}/_metadata.json", table.SchemaName, table.TableName, newfilename);
                                        string removePath = string.Format("{0}.schema/{1}", table.SchemaName, table.TableName, newfilename);

                                        if (SQLServer.ExecuteRSWritePQ(connectionString, extractQuery, parquetFilePath))
                                        {
                                            Logging.Log(String.Format("Found upates : {0} ", tableName));

                                            Upload upload = new Upload();
                                            upload.CopyChangesToOnelake(config, parquetFilePath, justTablepath);
                                            table.DeltaVersion = newfilename;
                                            dbC.Highwatermark = SQLServer.ExecuteScalar(connectionString, dbC.HighwatermarkSQL);
                                        }

                                        table.LastUpdate = DateTime.Now;
                                        helper.SaveData(config, wholepath);
                                    }
                                }
                                #endregion

                                #region Get a copy of the table / snapshot
                                if (table.Status == "Enabled")
                                {
                                    // Get Initial Snapshot
                                    string extractQuery = dbC.FullDataExtractQuery;
                                    extractQuery = UpdateQuery(dbC, table, tableName, extractQuery);

                                    Logging.Log(String.Format("Generating Snapshot: {0} ", tableName));

                                    string locforTable = string.Format("{0}\\{1}.schema\\{2}\\", LocalLocationforTables, table.SchemaName, table.TableName);

                                    helper.DeleteFolders(locforTable);

                                    helper.CreateFolders(locforTable);
                                    helper.CreateJSONMetadata(locforTable, table.KeyColumn);
                                    string newfilename = helper.GetFileVersionName(locforTable);
                                    string parquetFilePath = Path.Combine(locforTable, $"{newfilename}.parquet");


                                    string justTablepath = string.Format("/{0}.schema/{1}/{2}.parquet", table.SchemaName, table.TableName, newfilename);
                                    string justMetadatapath = string.Format("/{0}.schema/{1}/_metadata.json", table.SchemaName, table.TableName, newfilename);
                                    string removePath = string.Format("{0}.schema/{1}", table.SchemaName, table.TableName, newfilename);


                                    Upload upload = new Upload();
                                    upload.RemoveChangesToOnelake(config, removePath);

                                    SQLServer.ExecuteRSWritePQ(connectionString, extractQuery, parquetFilePath);

                                    await upload.CopyChangesToOnelake(config, String.Format("{0}{1}", locforTable, "_metadata.json"), justMetadatapath);
                                    await upload.CopyChangesToOnelake(config, parquetFilePath, justTablepath);

                                    dbC.Highwatermark = SQLServer.ExecuteScalar(connectionString, dbC.HighwatermarkSQL);
                                    table.DeltaVersion = newfilename;
                                    table.Status = "Running";
                                    table.LastUpdate = DateTime.Now;
                                    helper.SaveData(config, wholepath);
                                }
                                #endregion
                                Thread.Sleep(1000);

                            }
                        }
                    }
                }

                #endregion  
            }
            #endregion

            #region Sharepoint loop
            try
            {

                if (config.SharepointMirroringConfig != null)
                {
                    SharepointConfig shConfig = config.SharepointMirroringConfig;
                    if (shConfig.Enabled == "True")
                    {
                        //Logging.Log($"Sharepoint...");

                        foreach (SharepointLists list in shConfig.sharepointLists)
                        {
                            if (list.LastUpdate == null) list.LastUpdate = DateTime.Now;
                            if (list.interval_seconds == null || list.interval_seconds == 0) list.interval_seconds = 60;

                            // normal syncing
                            if (list.LastUpdate.AddSeconds(list.interval_seconds) < DateTime.Now)
                            {
                                string t = await Sharepoint.ExtractSharepoint(shConfig, list);
                                DataTable dataTable = new DataTable("FieldsTable");
                                DataTable dt = Sharepoint.ConvertListoDataTable(list, t, dataTable);


                                string sName = list.Table;
                                string sSchema = list.Schema;
                                DateTime? _lastUpdate = list.LastUpdate;
                                string? sStatus = list.Status;
                                string LocalLocationforTables = shConfig.LocalLocationforTables;

                                string locforTable = string.Format("{0}\\{1}.schema\\{2}\\", LocalLocationforTables, sSchema, sName);


                                {

                                    string newfilename = helper.GetFileVersionName(locforTable);
                                    string parquetFilePath = Path.Combine(locforTable, $"{newfilename}.parquet");

                                    string justTablepath = string.Format("/{0}.schema/{1}/{2}.parquet", sSchema, sName, newfilename);
                                    string justMetadatapath = string.Format("/{0}.schema/{1}/_metadata.json", sSchema, sName, newfilename);
                                    string removePath = string.Format("{0}.schema/{1}", sSchema, sName, newfilename);

                                    if (sStatus == "Running")
                                    {
                                        if (Sharepoint.CheckforChanges(locforTable, dataTable))
                                        {
                                            if (dataTable.Rows.Count > 0)
                                            {
                                                ParquetDump.WriteDataTableToParquet(dataTable, parquetFilePath);
                                                Upload upload = new Upload();
                                                upload.CopyChangesToOnelake(config, parquetFilePath, justTablepath);
                                            }
                                        }
                                        list.LastUpdate = DateTime.Now;
                                        helper.SaveData(config, wholepath);
                                    }

                                    if (sStatus is null || sStatus.Length == 0)
                                    {
                                        // Inital run, setup, everything
                                        helper.DeleteFolders(locforTable);

                                        helper.CreateFolders(locforTable);
                                        helper.CreateJSONMetadata(locforTable, "id");

                                        Upload upload = new Upload();
                                        upload.RemoveChangesToOnelake(config, removePath);
                                        upload.CopyChangesToOnelake(config, String.Format("{0}{1}", locforTable, "_metadata.json"), justMetadatapath);

                                        //SQLServer.ExecuteRSWritePQ(connectionString, extractQuery, parquetFilePath);


                                        list.Status = "Running";
                                        list.LastUpdate = DateTime.Now;
                                        helper.SaveData(config, wholepath);

                                    }

                                }
                                shConfig.LastUpdate = DateTime.Now;
                                helper.SaveData(config, wholepath);
                            }


                        }
                    }
                }
            }
            catch (Exception e)
            {
                Logging.Log($"Sharepoint Error {e.Message}");
            }

            #endregion

        }

        Console.ReadLine();


    }


    private static string UpdateQuery(DatabaseConfig dbC, TableConfig table, string tableName, string extractQuery)
    {
        extractQuery = extractQuery.Replace("{KeyColumn}", table.KeyColumn);
        extractQuery = extractQuery.Replace("{OtherColumns}", table.OtherColumns);
        extractQuery = extractQuery.Replace("{AdditionalColumns}", table.AdditionalColumns);
        extractQuery = extractQuery.Replace("{t}", tableName);
        extractQuery = extractQuery.Replace("{t1}", table.TableName);
        extractQuery = extractQuery.Replace("{h}", dbC.Highwatermark);
        extractQuery = extractQuery.Replace("{SoftDelete}", table.SoftDelete);
        return extractQuery;
    }

    private static void OnCreated(object sender, FileSystemEventArgs e)
    {
        Logging.Log($"Change found {e.FullPath}");
        string fileExtension = Path.GetExtension(e.FullPath).ToLower();

        switch (fileExtension)
        {
            case ".xlsx":
                Excel.ImportFile(e.FullPath, config);
                break;
            case ".csv":
                CSV.ExtractCSV(e.FullPath, config);
                break;
            case ".accdb":
                Access.ExtractAccess(e.FullPath, config);
                break;
        }

    }


}
