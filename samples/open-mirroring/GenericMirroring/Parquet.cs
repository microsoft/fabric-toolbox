using ParquetSharp;
using System.Data;
using System.Runtime.Intrinsics.Arm;
using GenericMirroring;

namespace SQLMirroring
{
    public static class ParquetDump
    {
        static public void WriteDataTableToParquet(DataTable table, string filePath)
        {
            try
            {
                var columnFields = new Column[table.Columns.Count];
                for (int i = 0; i < table.Columns.Count; i++)
                {
                    var column = table.Columns[i];
                    var colType = column.DataType;
                    columnFields[i] = new Column(colType, column.ColumnName);
                    // Log($"CCC {column.ColumnName} {column.DataType}"); 
                }
                // Write Parquet file
                using (var file = new FileStream(filePath, FileMode.Create, FileAccess.Write))
                {
                    using (var parquetWriter = new ParquetFileWriter(file, columnFields))
                    {

                        using (var rowGroupWriter = parquetWriter.AppendRowGroup())
                        {
                            // Write each column
                            int colcount = 0;
                            foreach (DataColumn column in table.Columns)
                            {
                                var columnData = new object[table.Rows.Count];
                                for (int i = 0; i < table.Rows.Count; i++)
                                {
                                    columnData[i] = table.Rows[i][column];
                                }

                                try
                                {
                                    if (column.DataType == System.Type.GetType("System.Int32"))
                                    {
                                        int[]? intArray = Array.ConvertAll(columnData, item => Convert.ToInt32(item ?? 0));  // Convert.ToInt32(item));
                                        using (var valueWriter = rowGroupWriter.NextColumn().LogicalWriter<int>())
                                        {
                                            valueWriter.WriteBatch(intArray);
                                        }
                                    }
                                    else if (column.DataType == System.Type.GetType("System.String"))
                                    {
                                        string[] stringArray = Array.ConvertAll(columnData, obj => obj?.ToString() ?? string.Empty);

                                        // Convert to type-specific array
                                        using (var valueWriter = rowGroupWriter.NextColumn().LogicalWriter<string>())
                                        {
                                            valueWriter.WriteBatch(stringArray);
                                        }
                                    }
                                    else if (column.DataType == System.Type.GetType("System.DateTime"))
                                    {
                                        DateTime[] stringArray = Array.ConvertAll(columnData, item => Convert.ToDateTime(item));

                                        // Convert to type-specific array
                                        using (var valueWriter = rowGroupWriter.NextColumn().LogicalWriter<DateTime>())
                                        {
                                            valueWriter.WriteBatch(stringArray);
                                        }
                                    }
                                    else if (column.DataType == System.Type.GetType("System.Object"))
                                    {

                                        string[] stringArray = Array.ConvertAll(columnData, obj => obj?.ToString() ?? string.Empty);
                                        // Convert to type-specific array
                                        using (var valueWriter = rowGroupWriter.NextColumn().LogicalWriter<string>())
                                        {
                                            valueWriter.WriteBatch(stringArray);
                                        }
                                    }
                                    else
                                    {
                                        string[] stringArray = Array.ConvertAll(columnData, obj => obj?.ToString() ?? string.Empty);

                                        // Convert to type-specific array
                                        using (var valueWriter = rowGroupWriter.NextColumn().LogicalWriter<string>())
                                        {
                                            valueWriter.WriteBatch(stringArray);
                                        }
                                    }
                                    colcount++;
                                }
                                catch (Exception ex)
                                {
                                    Logging.Log($"WriteDataTableToParquet:loop" +
                                        $"-{ex.Message}");
                                }
                            }
                        }
                        parquetWriter.Close();
                    }
                }
                Thread.Sleep(1000);
            }
            catch (Exception ex)
            {
                Logging.Log($"WriteDataTableToParquet-{ex.Message}");
            }
        }

        static public void WriteDataTableToParquet(IDataReader rdr, string filePath)
        {
            DataTable dataTable = new DataTable();
            dataTable.Load(rdr);

            WriteDataTableToParquet(dataTable, filePath);

        }


    }
}
