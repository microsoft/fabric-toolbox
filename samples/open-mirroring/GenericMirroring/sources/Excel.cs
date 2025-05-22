using Microsoft.Identity.Client;
using SQLMirroring;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using LicenseContext = OfficeOpenXml.LicenseContext;
using OfficeOpenXml;
using Parquet.Schema;
using System.Reflection.PortableExecutable;
using Microsoft.Data.SqlClient;
using Azure.Identity;
using Microsoft.Identity.Client.Platforms.Features.DesktopOs.Kerberos;
using System.Security.Cryptography.X509Certificates;
using System.Xml.Schema;
using GenericMirroring.destination;

namespace GenericMirroring.sources
{
    public static class Excel
    {
        public static void ImportFile(string FullPathtoExcelDocument, Root config)
        {
            Thread.Sleep(500);

            string fileExtension = Path.GetExtension(FullPathtoExcelDocument).ToLower();

            Logging.Log($"Importing: {FullPathtoExcelDocument}");
            Logging.Log($"fileExtension: {fileExtension}");

            if (FullPathtoExcelDocument.Contains("~")) // ignore temp files
            {
                return;
            }

            if (fileExtension == ".xlsx")
                ConvertExcelToDatatable(FullPathtoExcelDocument, config);

        }

        static public SimpleCache<string, DataTable> cache = new SimpleCache<string, DataTable>(TimeSpan.FromHours(10));
        static public void ConvertExcelToDatatable(string filePathtoExcel, Root config)
        {
            try
            {
                string colID = "_id_";
                Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

                string fileName = Path.GetFileName(filePathtoExcel);
                string fileNameWithoutExtension = Path.GetFileNameWithoutExtension(fileName);

                ExcelPackage.LicenseContext = LicenseContext.NonCommercial;

                using (var package = new ExcelPackage(new FileInfo(filePathtoExcel)))
                {
                    foreach (var worksheet in package.Workbook.Worksheets)
                    {
                        Logging.Log($"Exporting worksheet: {worksheet.Name}");

                        var table = new DataTable();

                        table.TableName = $"{fileNameWithoutExtension}.{worksheet.Name}";

                        table.Columns.Add($"__rowMarker__", typeof(int));
                        table.Columns.Add($"{colID}", typeof(int));

                        if (worksheet.Dimension == null)
                            return;

                        int rowCount = worksheet.Dimension.Rows;
                        int colCount = worksheet.Dimension.Columns;


                        string v = "";
                        for (int i = 1; i <= colCount; i++)
                        {
                            try
                            {
                                v = worksheet.Cells[1, i]?.Text ?? "";
                            }
                            catch (Exception ex)
                            {
                                Logging.Log(ex.Message);
                            }
                            table.Columns.Add($"{v}", typeof(string));
                        }

                        List<string> foo = new List<string>();

                        object[] rowVals = new object[colCount + 2];

                        for (int row = 2; row <= rowCount; row++)
                        {
                            rowVals[0] = 1;
                            rowVals[1] = row - 1;

                            v = "";
                            for (int i = 1; i <= colCount; i++)
                            {
                                try
                                {
                                    v = worksheet.Cells[row, i]?.Text ?? "";
                                    rowVals[i + 1] = v;
                                    foo.Add(v);
                                }
                                catch (Exception ex)
                                {
                                    Logging.Log(ex.Message);
                                }
                            }
                            table.Rows.Add(rowVals);
                        }


                        string tableName = $"{fileNameWithoutExtension}.schema\\{worksheet.Name}";
                        bool firstRun = true;
                        if (cache.TryGetValue(helper.ComputeHash(tableName), out DataTable value))
                        {
                            firstRun = false;
                            if (helper.DoDatatablesMatch(table, value))
                            {
                                // the table is in the cache and has not changed
                                return;
                            }
                        }
                        // TODO: Code here to work out which rows have changed.

                        cache.Add(helper.ComputeHash(tableName), table);

                        string LocalLocationforTables = config.ExcelMirroringConfig.outputFolder;

                        string locforTable = string.Format("{0}\\{1}.schema\\{2}\\", LocalLocationforTables, fileNameWithoutExtension, worksheet.Name);
                        string newfilename = helper.GetFileVersionName(locforTable);
                        string parquetFilePath = Path.Combine(locforTable, $"{newfilename}.parquet");

                        string justTablepath = string.Format("/{0}.schema/{1}/{2}.parquet", fileNameWithoutExtension, worksheet.Name, newfilename);
                        string justMetadatapath = string.Format("/{0}.schema/{1}/_metadata.json", fileNameWithoutExtension, worksheet.Name, newfilename);
                        string justMetadataDirpath = string.Format("/{0}.schema/{1}/", fileNameWithoutExtension, worksheet.Name, newfilename);

                        //helper.DeleteFolders(locforTable);

                        Upload upload = new Upload();

                        if (firstRun == true)
                        {
                            helper.CreateFolders(locforTable);
                            helper.CreateJSONMetadata(locforTable, colID);
                            upload.CopyChangesToOnelake(config, string.Format("{0}", locforTable, "_metadata.json"), justMetadataDirpath);
                        }

                        ParquetDump.WriteDataTableToParquet(table, parquetFilePath);
                        upload.CopyChangesToOnelake(config, parquetFilePath, justTablepath);

                        if (config.FalseMirroredDB.Enabled.ToLower() == "true" || config.FalseMirroredDB.Enabled.ToLower() == "yes" || config.FalseMirroredDB.Enabled.ToLower() == "enabled")
                        {
                            var sqlConnection = AntiMirror.GetSqlConnection(config);

                            using (sqlConnection)
                            {
                                sqlConnection.Open();
                                // Step 2: Insert Data
                                AntiMirror.CreateSqlTableFromDataTableAsync(sqlConnection, table, colID, fileNameWithoutExtension);
                                AntiMirror.BulkInsertDataTableAsync(sqlConnection, table, colID);
                            }

                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Logging.Log($"Excel document could be empty {ex.Message}");
            }
        }

        static public bool DoDatatablesMatch(DataTable table1, DataTable table2)
        {

            bool rt = false;
            // Compare schemas (columns)
            if (table1.Columns.Count != table2.Columns.Count)
            {
                //Logging.Log("Schemas do not match: Different column counts.");
                return rt;
            }

            for (int i = 0; i < table1.Columns.Count; i++)
            {
                if (table1.Columns[i].ColumnName != table2.Columns[i].ColumnName ||
                    table1.Columns[i].DataType != table2.Columns[i].DataType)
                {
                    // Logging.Log($"Schemas do not match: Column {i + 1} differs.");
                    return rt;
                }
            }
            //Logging.Log("Schemas match.");

            // Compare row counts
            if (table1.Rows.Count != table2.Rows.Count)
            {
                //Logging.Log("Row counts do not match.");
                return rt;
            }

            //Logging.Log("Comparing data...");

            // Compare rows
            for (int i = 0; i < table1.Rows.Count; i++)
            {
                for (int j = 0; j < table1.Columns.Count; j++)
                {
                    if (!Equals(table1.Rows[i][j], table2.Rows[i][j]))
                    {
                        Logging.Log($"Difference found at Row {i + 1}, Column {table1.Columns[j].ColumnName}: " +
                                          $"Table1='{table1.Rows[i][j]}', Table2='{table2.Rows[i][j]}'");
                        return rt;
                    }
                }
            }

            //Logging.Log("Comparison complete.");
            return true;

        }

    }
}
