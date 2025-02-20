using Gen2toFabricDW;
using Microsoft.Data.SqlClient;
using System.Collections.Generic;
using System.Text.Json;
class Program
{
    private static Config config = null;
    static async Task Main(string[] args)
    {
        string configpath = System.IO.Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
        Logging.locallogging = $"{configpath}\\logging.log";
        // string configpath = "C:\\temp"; 
        string wholepath = $"{configpath}\\config.json";
        string wholepat1h = $"{configpath}\\config.json";

        string createTableSQL = "";  
        string DropableSQL = "";
        string sElapseTime = "";
        // Read and parse configuration
        config = LoadConfig<Config>(wholepath);
        if (config == null)
        {
            Log("Failed to load configuration.");
            return;
        }

        string SQLScripts = File.ReadAllText($"{configpath}\\ExternalTableSetup.ssql");
        SQLScripts = ReplaceValues(null, "", SQLScripts, "");
        string sExtractTime = SQLServer.ExecuteNonQuery(config.Gen2Connectionstring, SQLScripts, true);


        // loop through all the tables
        foreach (var table in config.Tables)
        {
            string batchvalue = "";
            
            string SQLSchemaScripts = File.ReadAllText($"{configpath}\\generatetableschema.ssql");
            SQLSchemaScripts = SQLSchemaScripts.Replace("{tableschemaname}", table.Schema);
            SQLSchemaScripts = SQLSchemaScripts.Replace("{tablename}", table.Name);
            
            SQLServer.ExecuteRS(config.Gen2Connectionstring, SQLSchemaScripts, ref createTableSQL, ref DropableSQL, table);

            if(table.DropDestinationTable== "True") 
            {
                sElapseTime = SQLServer.ExecuteFabric(config.fabricEndpoint, config.fabricWarehouse, DropableSQL);
                Log($"Drop Destination Table: {sElapseTime}");
            }

            {
                string sCreateExternalSchema = @"create schema {ss};";
                sCreateExternalSchema = sCreateExternalSchema.Replace("{ss}", table.externalTableSchema);
                sExtractTime = SQLServer.ExecuteNonQuery(config.Gen2Connectionstring, sCreateExternalSchema, true);

                string sCreateSchema = @"create schema {s};";
                sCreateSchema = sCreateSchema.Replace("{s}", table.Schema);
                sElapseTime = SQLServer.ExecuteFabric(config.fabricEndpoint, config.fabricWarehouse, sCreateSchema, true);
            }

            if (table.CreateDestination == "True")
            {
                sElapseTime = SQLServer.ExecuteFabric(config.fabricEndpoint, config.fabricWarehouse, createTableSQL);
              //  Log($"Create Table SQL: {createTableSQL}");
                Log($"Create Destination Table: {sElapseTime}");
            }

            if (table.TruncateDestination == "True")
            {
                string sTruncateTable = $"truncate table {table.Schema}.{table.Name};";
                sElapseTime = SQLServer.ExecuteFabric(config.fabricEndpoint, config.fabricWarehouse, sTruncateTable);
              //  Log($"Truncate Table SQL: {sTruncateTable}");
                Log($"Truncate Destination Table: {sElapseTime}");
            }

            string sourceRowCount = "";
            string targetRowCount = "";

            Boolean batchexportloop = true;
            Boolean firstExport = true;
            Boolean batchexport = false;

            if(table.batchcolumn.Length>0)
            { batchexport = true; }

            while (batchexportloop)
            {
                if (batchexport == false)
                { batchexportloop = false; }

                DeleteExternalTable(table);

                string batchcol = table.batchcolumn;

                string r = RandomName();
                string createExternaltable = config.SQLCreateExternalTable;
                string ExternalTableSubfolder = "extracts/{r}/";
                createExternaltable = ReplaceValues(table, r, createExternaltable, ExternalTableSubfolder);

                if (batchexport == true)
                {
                    createExternaltable = createExternaltable.Replace("{top}", $" top {config.batchsize} ");
                   
                    if (!firstExport)
                    {
                        createExternaltable = createExternaltable.Replace("{Whereclause}", " where {batchcolumn} > {colvalue} ");
  
                    }
                    else
                    {
                        createExternaltable = createExternaltable.Replace("{Whereclause}", $"  ");
                    }
                    createExternaltable = createExternaltable.Replace("{orderby}", " ORDER BY {batchcolumn} ASC ");
                }
                else
                {
                    createExternaltable = createExternaltable.Replace("{top}", $"  ");
                    createExternaltable = createExternaltable.Replace("{Whereclause}", $"  ");
                }
                createExternaltable = createExternaltable.Replace("{top}", $"  ");
                createExternaltable = createExternaltable.Replace("{Whereclause}", $"  ");
                createExternaltable = createExternaltable.Replace("{orderby}", "");

                //batchvalue
                createExternaltable = createExternaltable.Replace("{batchcolumn}", table.batchcolumn);
                createExternaltable = createExternaltable.Replace("{colvalue}", batchvalue);
                // extract table
                //Log($"Create External Table SQL: {createExternaltable}");
                Log("Extracting from Gen2..");
                sExtractTime = SQLServer.ExecuteNonQuery(config.Gen2Connectionstring, createExternaltable);
                Logging.Log($"Extract data:  RunTime {sExtractTime}");

                string sSourceCount = "Select count(*) from {s}.{t}";
                sSourceCount = ReplaceValues(table, r, sSourceCount, ExternalTableSubfolder);
                sourceRowCount = SQLServer.ExecuteScalar(config.Gen2Connectionstring, sSourceCount);
                Logging.Log($"Extract data:  Source Row Count {sourceRowCount}");

                string copyinto = config.COPYINTO_Statement;

             /*   copyinto = copyinto.Replace("{ExternalTableSubfolder}", ExternalTableSubfolder);
                copyinto = copyinto.Replace("{r}", r);
                copyinto = copyinto.Replace("{t}", table.Name);
                copyinto = copyinto.Replace("{s}", table.Schema);
                copyinto = copyinto.Replace("{ss}", table.externalTableSchema);
                copyinto = copyinto.Replace("{httpslocation}", config.httpslocation);
                copyinto = copyinto.Replace("{SASKey}", config.SASKey);*/

                copyinto = ReplaceValues(table, r, copyinto, ExternalTableSubfolder);


                Log("Starting Load into Fabric..");
                //Log($"Copy into SQL: {copyinto}");
                SQLServer.ExecuteCopyInto(config.SPN_Tenant, config.SPN_Application_ID, config.SPN_Secret, config.fabricEndpoint, config.fabricWarehouse, copyinto);

                string sDestCount = "Select count(*) from {s}.{t}";
                sDestCount = ReplaceValues(table, r, sDestCount, ExternalTableSubfolder);
                targetRowCount = SQLServer.ExecuteScalarFabric(config.fabricEndpoint, config.fabricWarehouse, sDestCount);
                Logging.Log($"Extract data:  Destination Row Count {targetRowCount}");

                if (batchexport == true)
                {
                    string oldbatchvalue = batchvalue;

                    string sCount = "select max({batchcolumn}) from {ss}.{t}";

                    sCount = ReplaceValues(table, "", sCount, "");
                    batchvalue = SQLServer.ExecuteScalar(config.Gen2Connectionstring, sCount);

                    if (batchvalue == oldbatchvalue)
                    {
                        batchexportloop = false;
                        break;
                    }
                    DeleteExternalTable(table);
                }
                firstExport = false;
            }
        }
    }

    private static void DeleteExternalTable(Table table)
    {
        string sDropExternalTable = "if exists(select s.name,t.name from sys.tables t inner join sys.schemas s on s.schema_id = t.schema_id\r\nwhere s.name = '{ss}' and t.name ='{t}')\r\nbegin\r\n\tDROP EXTERNAL TABLE {ss}.{t}\r\nend\r\n";
        sDropExternalTable = ReplaceValues(table, "", sDropExternalTable, "");
        SQLServer.ExecuteNonQuery(config.Gen2Connectionstring, sDropExternalTable);
    }

    private static string ReplaceValues(Table? table, string r, string createExternaltable, string ExternalTableSubfolder)
    {
        ExternalTableSubfolder = ExternalTableSubfolder.Replace("{r}", r);
        createExternaltable = createExternaltable.Replace("{ExternalTableSubfolder}", ExternalTableSubfolder);
        createExternaltable = createExternaltable.Replace("{r}", r);
        if (table is not null)
        { createExternaltable = createExternaltable.Replace("{t}", table.Name);
            createExternaltable = createExternaltable.Replace("{s}", table.Schema);
            createExternaltable = createExternaltable.Replace("{ss}", table.externalTableSchema);
            createExternaltable = createExternaltable.Replace("{batchcolumn}", table.batchcolumn);
        }
        createExternaltable = createExternaltable.Replace("{httpslocation}", config.httpslocation);
        createExternaltable = createExternaltable.Replace("{SASKey}", config.SASKey);
        createExternaltable = createExternaltable.Replace("{abfslocation}", config.abfslocation);
        

        return createExternaltable;
    }

    public static string RandomName()
    {
        Random rand = new Random();

        // Choosing the size of string 
        // Using Next() string 
        int stringlen = rand.Next(4, 10);
        int randValue;
        string str = "";
        char letter;
        for (int i = 0; i < stringlen; i++)
        {

            // Generating a random number. 
            randValue = rand.Next(0, 26);

            // Generating random character by converting 
            // the random number into character. 
            letter = Convert.ToChar(randValue + 65);

            // Appending the letter to string. 
            str = str + letter;
        }

        return str;
    }
    static public T LoadConfig<T>(string filePath)
    {
        try
        {
            if (File.Exists(filePath))
            {
                string json = File.ReadAllText(filePath);
                return JsonSerializer.Deserialize<T>(json);
            }
            Log("File not found, returning default data.");
            return default;
        }
        catch (Exception ex)
        {
            Log($"Error loading data: {ex.Message}");
            return default;
        }
    }
    static public void SaveData<T>(T data, string filePath)
    {
        lock (data)
        {
            try
            {
                string json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(filePath, json);
                //Logging.Log("Data saved successfully.");
            }
            catch (Exception ex)
            {
                Log($"Error saving data: {ex.Message}");
            }
        }
    }
    static void Log(string Message) {
        Logging.Log(Message);
            }
}