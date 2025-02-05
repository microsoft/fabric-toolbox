using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace SQLMirroring
{
    static public class helper { 
    static public Root ReadConfig(string filePath)
    {
        try
        {
            string json = File.ReadAllText(filePath);
            return JsonSerializer.Deserialize<Root>(json);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error reading configuration file: {ex.Message}");
            return null;
        }
    }

        static public void SaveData<T>(T data, string filePath)
        {
            lock(data)
            { 
                try
                {
                    string json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true });
                    File.WriteAllText(filePath, json);
                    //Console.WriteLine("Data saved successfully.");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error saving data: {ex.Message}");
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
                Console.WriteLine("File not found, returning default data.");
                return default;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error loading data: {ex.Message}");
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
               // Console.WriteLine($"The folder '{path}' has been deleted.");
            }
        }

        static public void CreateFolders(string path)
        {
            if (!Directory.Exists(path))
            {
                Directory.CreateDirectory(path);
                //Console.WriteLine($"The folder '{path}' has been created.");
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

                //Console.WriteLine($"Config File '{filePath}' has been rewritten.");
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
                    //Console.WriteLine(file);
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
                Console.WriteLine("Directory does not exist.");
            }

            versionnumber++;

            return versionnumber.ToString("00000000000000000000");
        }

    }
}
