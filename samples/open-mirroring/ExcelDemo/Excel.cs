using OfficeOpenXml;
using System.Data;
using System.Text;
using LicenseContext = OfficeOpenXml.LicenseContext;

namespace ExcelDemo
{
    static public class Excel
    {
        static public SimpleCache<string, DataTable> cache = new SimpleCache<string, DataTable>(TimeSpan.FromHours(10));
        static public void ConvertExcelToDatatable(string filePathtoExcel, AppConfig config)
        {
            try
            {
                Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

                string fileName = Path.GetFileName(filePathtoExcel);
                string fileNameWithoutExtension = Path.GetFileNameWithoutExtension(fileName);

                ExcelPackage.LicenseContext = LicenseContext.NonCommercial;

                using (var package = new ExcelPackage(new FileInfo(filePathtoExcel)))
                {
                    foreach (var worksheet in package.Workbook.Worksheets)
                    {
                        Console.WriteLine($"Exporting worksheet: {worksheet.Name}");

                        var table = new DataTable();

                        table.Columns.Add($"__rowMarker__", typeof(int));
                        table.Columns.Add($"_id_", typeof(int));

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
                                Console.WriteLine(ex.Message);
                            }
                            table.Columns.Add($"{v}", typeof(string));
                        }

                        List<String> foo = new List<String>();

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
                                    Console.WriteLine(ex.Message);
                                }
                            }
                            table.Rows.Add(rowVals);
                        }


                        string tableName = $"{fileNameWithoutExtension}.schema\\{worksheet.Name}";

                        if (cache.TryGetValue(Helper.ComputeHash(tableName), out DataTable value))
                        {
                            if (Helper.DoDatatablesMatch(table, value))
                            {
                                return;
                            }
                        }
                        cache.Add(Helper.ComputeHash(tableName), table);

                        Helper.WriteDatatabletoParquet(table, tableName, config);

                        Helper.CopyChangesToOnelake(config);
                    }
                }
            }
            catch(Exception ex)
            {
                Console.WriteLine($"Excel document could be empty {ex.Message}");
            }
        }
    }
}