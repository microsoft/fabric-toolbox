using Azure.Core;
using Azure.Identity;
using Azure.Storage.Files.DataLake;
using System;
using System.IO;
using System.Threading.Tasks;

class Program
{
    static async Task Main(string[] args)
    {
        if (args.Length !=4)
        {
            Console.WriteLine("CopyWarehouse.exe");
            Console.WriteLine("usage:");
            Console.WriteLine("CopyWarehouse {source-workspace-id} {warehouse-id} {destination-workspace-id} {lakehouse-id}");
            return;
        }

        // Source (OneLake)
        string sourceAccountUrl = "https://onelake.dfs.fabric.microsoft.com/";
        string sourceFileSystemName = $"{args[0]}";
        string sourceFolderPath = $"/{args[1]}/Tables/";

        // Destination (Fabric Lakehouse)
        string destinationAccountUrl = "https://onelake.dfs.fabric.microsoft.com/";
        string destinationFileSystemName = $"{args[2]}";
        string destinationFolderPath = $"{args[3]}/Tables/";

        Console.WriteLine($"Copy from {sourceFileSystemName} {sourceFolderPath} ");
        Console.WriteLine($"Copy to {destinationFileSystemName} {destinationFolderPath} ");


        // Authenticate using DefaultAzureCredential
        var credential = new DefaultAzureCredential();

        var dlco = new DataLakeClientOptions();
        dlco.Retry.NetworkTimeout.Add(new TimeSpan(1,0,0));


        // Create source and destination DataLake clients
        var sourceDataLakeServiceClient = new DataLakeServiceClient(new Uri(sourceAccountUrl), credential, dlco);
        var destinationDataLakeServiceClient = new DataLakeServiceClient(new Uri(destinationAccountUrl), credential, dlco);

        // Get file system clients
        var sourceFileSystemClient = sourceDataLakeServiceClient.GetFileSystemClient(sourceFileSystemName);
        var destinationFileSystemClient = destinationDataLakeServiceClient.GetFileSystemClient(destinationFileSystemName);

        

        

       // Copy folder contents
       await CopyFolderAsync(sourceFileSystemClient, sourceFolderPath, destinationFileSystemClient, destinationFolderPath);

        Console.WriteLine("Copy Complete.");
    }

    static async Task CopyFolderAsync(
        DataLakeFileSystemClient sourceFileSystemClient,
        string sourceFolderPath,
        DataLakeFileSystemClient destinationFileSystemClient,
        string destinationFolderPath)
    {
        // Get the source directory client
        DataLakeDirectoryClient sourceDirectoryClient = sourceFileSystemClient.GetDirectoryClient(sourceFolderPath);

        // Ensure destination folder exists
        DataLakeDirectoryClient destinationDirectoryClient = destinationFileSystemClient.GetDirectoryClient(destinationFolderPath);
        // await destinationDirectoryClient.CreateIfNotExistsAsync();
        // List all paths in the source directory

        double conentl = 0;

        await foreach (var pathItem in sourceDirectoryClient.GetPathsAsync())
        {
            string relativePath = pathItem.Name.Substring(sourceFolderPath.TrimStart('/').Length).TrimStart('/');
            string destinationPath = Path.Combine(destinationFolderPath, relativePath).Replace("\\", "/");

            if (pathItem.IsDirectory == true)
            {
                // Recursively copy subdirectories
                await CopyFolderAsync(sourceFileSystemClient, pathItem.Name, destinationFileSystemClient, destinationPath);
            }
            else
            {
                // Copy file
                Console.WriteLine($"Copying file: {pathItem.Name} to {destinationPath}");
                await CopyFileAsync(sourceFileSystemClient, pathItem.Name, destinationFileSystemClient, destinationPath);
                conentl = conentl +  Convert.ToDouble  (  pathItem.ContentLength);
            }
        }
    }

    static async Task CopyFileAsync(
        DataLakeFileSystemClient sourceFileSystemClient,
        string sourceFilePath,
        DataLakeFileSystemClient destinationFileSystemClient,
        string destinationFilePath)
    {
        // Get source file client
        var sourceFileClient = sourceFileSystemClient.GetFileClient(sourceFilePath);

        // Get destination file client
        var destinationFileClient = destinationFileSystemClient.GetFileClient(destinationFilePath);

        if(destinationFileClient.Exists())
        {
            Console.WriteLine("File Exists.");
            return;
        }

        // Read from source file
        using var stream = await sourceFileClient.OpenReadAsync();

        // Upload to destination file
        await destinationFileClient.UploadAsync(stream, overwrite: true);
    }
}
