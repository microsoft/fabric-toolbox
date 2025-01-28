using ExcelDemo;
using System.Text.Json;
using System.Text.Json.Serialization;

class Program
{
    public static AppConfig config = null;
    static void Main(string[] args)
    {
        var AppConfigPath = @"C:\source\OpenMirroring\OpenMirroring\ExcelDemo\AppConfig.json";

        string jsonString = File.ReadAllText(AppConfigPath);

        // Deserialize the JSON file into the Config object
        config = JsonSerializer.Deserialize<AppConfig>(jsonString);

        Console.WriteLine("Open Mirroring Excel Demo");

        Helper.CreateDir(config.folderToWatch);

        Console.WriteLine($"Watching {config.folderToWatch}");

        using FileSystemWatcher watcher = new FileSystemWatcher();

        // Set the directory to monitor
        watcher.Path = config.folderToWatch;

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

        Console.ReadLine();
    }
    private static void OnCreated(object sender, FileSystemEventArgs e)
    {
        ImportFile(e.FullPath);
    }

    private static void ImportFile(string FullPathtoExcelDocument)
    {
        Thread.Sleep(500);

        string fileExtension = Path.GetExtension(FullPathtoExcelDocument).ToLower();

        Console.WriteLine($"Importing: {FullPathtoExcelDocument}");
        Console.WriteLine($"fileExtension: {fileExtension}");

        if (FullPathtoExcelDocument.Contains("~")) // ignore temp files
        {
            return;
        }

        if (fileExtension == ".xlsx")
            Excel.ConvertExcelToDatatable(FullPathtoExcelDocument, config);
    }


}
