using System.Data;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;

namespace ExcelDemo
{
    internal static class Helper
    {
        public static void CreateDir(string folder)
        {
            if (!Directory.Exists(folder))
            {
                Directory.CreateDirectory(folder);
            }
        }

        static void CreateJSONMetadata(string outputpath)
        { CreateJSONMetadata(outputpath, "_id_"); }

        static void CreateJSONMetadata(string outputpath, string keycolumn)
        {
            string filePath = $"{outputpath}\\_metadata.json";

            if (!File.Exists(filePath))
            {
                // Content to write
                StringBuilder sb = new StringBuilder();
                sb.Append("{  \"keyColumns\" : [ \"");
                sb.Append(keycolumn);
                sb.Append("\" ]   }");

                // Write content to the file (overwrites if it already exists)
                File.WriteAllText(filePath, sb.ToString());
            }
        }

        static string GetFileVersionName(string folder)
        {
            double versionnumber = 0;
            // Check if the directory exists
            if (Directory.Exists(folder))
            {
                // Get all files in the directory
                string[] files = Directory.GetFiles(folder);

                // Display the files
                foreach (var file in files)
                {
                    Console.WriteLine(file);
                    double v = 0;
                    string fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file);

                    if (double.TryParse(fileNameWithoutExtension, out v))
                    {
                        if (v > versionnumber) versionnumber = v;
                    }
                }
            }

            versionnumber++;

            return versionnumber.ToString("00000000000000000000");
        }

        public static string ComputeHash(string input)
        {
            // Convert the input string to a byte array
            byte[] inputBytes = System.Text.Encoding.UTF8.GetBytes(input);

            // Create an instance of SHA256
            using (SHA256 sha256 = SHA256.Create())
            {
                // Compute the hash
                byte[] hashBytes = sha256.ComputeHash(inputBytes);

                // Convert the hash to a hexadecimal string
                StringBuilder sb = new StringBuilder();
                foreach (byte b in hashBytes)
                {
                    sb.Append(b.ToString("x2"));
                }
                return sb.ToString();
            }
        }

        public static DataTable AppendColumns(DataTable table)
        {
            return AppendColumns(table, "_id_");
        }
        public static DataTable AppendColumns(DataTable table, string IdColumnName)
        {
            int rowid = 1;

            table.Columns.Add($"__rowMarker__", typeof(int));
            table.Columns.Add($"{IdColumnName}", typeof(int));


            // Print each row
            foreach (DataRow row in table.Rows)
            {


                row["__rowMarker__"] = 1;
                row[IdColumnName] = rowid;
                rowid++;


            }
            return table;
        }
        public static void PrintDataTable(DataTable table)
        {
            // Print column names
            foreach (DataColumn column in table.Columns)
            {
                Console.Write(column.ColumnName + "\t");
            }
            Console.WriteLine();

            // Print each row
            foreach (DataRow row in table.Rows)
            {
                foreach (var item in row.ItemArray)
                {
                    Console.Write(item + "\t");
                }
                Console.WriteLine();
            }
        }


        public static void WriteDatatabletoParquet(DataTable table, string tablename, AppConfig config)
        {

            string newOutputdir = $"{config.outputFolder}\\{tablename}";

            CreateDir(newOutputdir);
            CreateJSONMetadata(newOutputdir);
            string newfilename = GetFileVersionName(newOutputdir);
            string csvFilePath = Path.Combine(newOutputdir, $"{newfilename}.parquet");

            Parquet.WriteDataTableToParquet(table, csvFilePath);

        }


        static public Boolean DoDatatablesMatch(DataTable table1, DataTable table2)
        {

            Boolean rt = false;
            // Compare schemas (columns)
            if (table1.Columns.Count != table2.Columns.Count)
            {
                //Console.WriteLine("Schemas do not match: Different column counts.");
                return rt;
            }

            for (int i = 0; i < table1.Columns.Count; i++)
            {
                if (table1.Columns[i].ColumnName != table2.Columns[i].ColumnName ||
                    table1.Columns[i].DataType != table2.Columns[i].DataType)
                {
                    // Console.WriteLine($"Schemas do not match: Column {i + 1} differs.");
                    return rt;
                }
            }
            //Console.WriteLine("Schemas match.");

            // Compare row counts
            if (table1.Rows.Count != table2.Rows.Count)
            {
                //Console.WriteLine("Row counts do not match.");
                return rt;
            }

            //Console.WriteLine("Comparing data...");

            // Compare rows
            for (int i = 0; i < table1.Rows.Count; i++)
            {
                for (int j = 0; j < table1.Columns.Count; j++)
                {
                    if (!Equals(table1.Rows[i][j], table2.Rows[i][j]))
                    {
                        Console.WriteLine($"Difference found at Row {i + 1}, Column {table1.Columns[j].ColumnName}: " +
                                          $"Table1='{table1.Rows[i][j]}', Table2='{table2.Rows[i][j]}'");
                        return rt;
                    }
                }
            }

            //Console.WriteLine("Comparison complete.");
            return true;

        }

        public static void CopyChangesToOnelake(AppConfig config)
        {
            // this is a cheat, I could not get the rest api to work, copying files to onelake, so I fell back to using AZCOPY

            //var ps1File = @"C:\temp\di\OpenMirroring\ExcelDemo\./copy_files_tmp.ps1";
            var ps1File = $"{config.azcopyFolder}\\copy_files_tmp.ps1";

            StringBuilder psScript = new StringBuilder();
            psScript.AppendLine($"$env:AZCOPY_AUTO_LOGIN_TYPE = \"SPN\";\r\n");
            psScript.AppendLine($"$env:AZCOPY_SPA_APPLICATION_ID = \"{config.SPN_Application_ID}\";\r\n");
            psScript.AppendLine($"$env:AZCOPY_SPA_CLIENT_SECRET = \"{config.SPN_Secret}\";\r\n");
            psScript.AppendLine($"$env:AZCOPY_TENANT_ID = \"{config.SPN_Tenant_ID}\";\r\n");
            psScript.AppendLine($"$env:AZCOPY_PATH = \"{config.azcopyPath}\"");
            psScript.AppendLine($"{config.azcopyPath} copy \"{config.outputFolder}\\*\" \"{config.MirrorLandingZone.Replace(".dfs.",".blob.")}\" --overwrite=true --from-to=LocalBlob --blob-type Detect --follow-symlinks --check-length=true --put-md5 --follow-symlinks --disable-auto-decoding=false  --recursive --trusted-microsoft-suffixes=onelake.blob.fabric.microsoft.com --log-level=INFO;\r\n");

            File.WriteAllText(ps1File, psScript.ToString());

            var startInfo = new ProcessStartInfo()
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy ByPass -File \"{ps1File}\"",
                UseShellExecute = false
            };
            Process.Start(startInfo);

            Thread.Sleep(500);
            //File.Delete(ps1File);

        }
    }
}
