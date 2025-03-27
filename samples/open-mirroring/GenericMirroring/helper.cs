using GenericMirroring;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Security.Cryptography;
using System.Data;

namespace SQLMirroring
{
    static public class helper
    {
        static public Root ReadConfig(string filePath)
        {
            try
            {
                string json = File.ReadAllText(filePath);
                return JsonSerializer.Deserialize<Root>(json);
            }
            catch (Exception ex)
            {
                Logging.Log($"Error reading configuration file: {ex.Message}");
                return null;
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
                    Logging.Log($"Error saving data: {ex.Message}");
                }
            }
        }

        static public T LoadData<T>(string filePath)
        {
            try
            {
                if (File.Exists(filePath))
                {
                    string json = File.ReadAllText(filePath);
                    return JsonSerializer.Deserialize<T>(json);
                }
                Logging.Log("File not found, returning default data.");
                return default;
            }
            catch (Exception ex)
            {
                Logging.Log($"Error loading data: {ex.Message}");
                return default;
            }
        }


        static public string UpdateString(string orginalString, string d)
        {
            return orginalString.Replace("{d}", d);
        }

        static public void DeleteFolders(string path)
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, true);
                // Log($"The folder '{path}' has been deleted.");
            }
        }

        static public void CreateFolders(string path)
        {
            if (!Directory.Exists(path))
            {
                Directory.CreateDirectory(path);
                //Log($"The folder '{path}' has been created.");
            }
        }

        static public void CreateJSONMetadata(string outputpath, string keycolumn)
        {
            string filePath = $"{outputpath}\\_metadata.json";

            if (!File.Exists(filePath))
            {

                // Content to write
                StringBuilder sb = new StringBuilder();
                sb.Append("{  \"keyColumns\" : [ \"");
                sb.Append(keycolumn);
                sb.Append("\" ]   }");

                File.WriteAllText(filePath, sb.ToString());

                //Log($"Config File '{filePath}' has been rewritten.");
            }
        }

        static public string GetFileVersionName(string folder)
        {
            double versionnumber = 0;
            // Check if the directory exists
            if (Directory.Exists(folder))
            {
                // Get all files in the directory
                string[] files = Directory.GetFiles(folder);

                foreach (var file in files)
                {
                    //Log(file);
                    double v = 0;
                    string fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file);

                    if (double.TryParse(fileNameWithoutExtension, out v))
                    {
                        if (v > versionnumber) versionnumber = v;
                    }
                }
            }
            else
            {
                Logging.Log("Directory does not exist.");
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

        static public Boolean DoDatatablesMatch(DataTable table1, DataTable table2)
        {
            // TODO : put some code in to work out the rows that have change.

            Boolean rt = false;
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


        static public Boolean IsEnabled(string? value)
        {
            Boolean rt = false;
            if (value != null)
            {
                if (value == "1" || value.ToLower() == "true" || value.ToLower() == "yes" || value.ToLower() == "enabled")
                {
                    rt = true;
                }
            }

            return rt;
        }
    }
}
