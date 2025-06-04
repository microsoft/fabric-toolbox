using SQLMirroring;
using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace GenericMirroring.sources
{
    public static class CSV
    {
        static public SimpleCache<string, DataTable> cache = new SimpleCache<string, DataTable>(TimeSpan.FromHours(10));

        static public void ExtractCSV(string filePath, Root config)
        {
            Logging.Log($"ExtractCSV {filePath}");
            Thread.Sleep(1000);
            DataTable table = ConvertCsvToDataTable(filePath);
            string tablename = Path.GetFileNameWithoutExtension(filePath);
            string fileNameWithoutExtension = "dbo";// Path.GetFileNameWithoutExtension(filePath);
            string newOutputdir = $"{config.CSVMirroringConfig.outputFolder}\\{fileNameWithoutExtension}";

            bool firstRun = true;
            if (cache.TryGetValue(helper.ComputeHash(newOutputdir), out DataTable value))
            {
                firstRun = false;
                if (helper.DoDatatablesMatch(table, value))
                {
                    // the table is in the cache and has not changed
                    return;
                }
            }
            cache.Add(helper.ComputeHash(newOutputdir), table);

            string LocalLocationforTables = config.CSVMirroringConfig.outputFolder;

            string locforTable = string.Format("{0}\\{1}.schema\\{2}\\", LocalLocationforTables, fileNameWithoutExtension, tablename);
            string newfilename = helper.GetFileVersionName(locforTable);
            string parquetFilePath = Path.Combine(locforTable, $"{newfilename}.parquet");

            string justTablepath = string.Format("/{0}.schema/{1}/{2}.parquet", fileNameWithoutExtension, tablename, newfilename);
            string justMetadatapath = string.Format("/{0}.schema/{1}/_metadata.json", fileNameWithoutExtension, tablename, newfilename);
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

        public static DataTable ConvertCsvToDataTable(string filePath)
        {
            Logging.Log($"ConvertCsvToDataTable {filePath}");

            DataTable dataTable = new DataTable();

            try
            {
                // Read all lines from the CSV file
                string[] csvLines = File.ReadAllLines(filePath);

                if (csvLines.Length == 0)
                {
                    Logging.Log("The CSV file is empty.");
                    return dataTable;
                }

                // Add columns to the DataTable using the first row
                string[] headers = csvLines[0].Split(',');

                dataTable.Columns.Add($"__rowMarker__", typeof(int));
                dataTable.Columns.Add($"_id_", typeof(int));

                foreach (string header in headers)
                {
                    // Console.WriteLine($" header-{header.Trim()}");

                    dataTable.Columns.Add(header.Trim());
                }

                // Add rows to the DataTable for each subsequent line
                for (int i = 1; i < csvLines.Length; i++)
                {
                    string[] rowValues = csvLines[i].Split(',');
                    DataRow dataRow = dataTable.NewRow();

                    dataRow[0] = 1;
                    dataRow[1] = i;

                    for (int j = 0; j < headers.Length; j++)
                    {
                        dataRow[j + 2] = rowValues[j].Trim();
                        //    Console.WriteLine($" data-{rowValues[j].Trim()}");
                    }

                    dataTable.Rows.Add(dataRow);
                }
            }
            catch (Exception ex)
            {
                Logging.Log($"Error processing CSV file: {ex.Message}");
            }

            return dataTable;
        }
    }
}
