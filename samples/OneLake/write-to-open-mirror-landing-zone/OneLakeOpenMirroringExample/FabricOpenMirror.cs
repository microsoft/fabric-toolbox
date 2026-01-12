using System.Text.Json;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using OneLakeOpenMirroringExample.Storage;

namespace OneLakeOpenMirroringExample;

public class FabricOpenMirror(StorageClient storageClient)
{
    public async Task CreateTableAsync(OpenMirroredTableId table, params string[] keyColumns)
    {
        await using var metadataFile = await OpenWriteAsync(table, "_metadata.json");
        var json = new { keyColumns };
        await metadataFile.WriteData(stream => JsonSerializer.SerializeAsync(stream, json));
    }
    
    public async Task<MirrorFile> CreateNextTableDataFileAsync(OpenMirroredTableId table)
    {
        var tableLocation = GetTableLocation(table);
        var listBlobs = tableLocation.GetBlobsAsync();
        var tableFound = false;
        BlobItem? lastDataFile = null;
        // Parquet files will be first in the folder because other files and folders all start with an underscore.
        // So we can just take the last Parquet file to get our sequence number.
        await foreach (var blob in listBlobs)
        {
            tableFound = true;
            if (blob.Name.EndsWith(".parquet") && blob.Properties.ContentLength > 0)
            {
                lastDataFile = blob;
            }
            else
            {
                break;
            }
        }
        if (!tableFound)
        {
            throw new ArgumentException($"Table not found.", nameof(table));
        }

        long lastFileNumber = 0;
        
        if (lastDataFile is not null)
        {
            var dataFileName = Path.GetFileName(lastDataFile.Name);
            lastFileNumber = long.Parse(dataFileName.Split('.')[0]);
        }
        
        var blobFile = await OpenWriteAsync(table, $"{++lastFileNumber:D20}.parquet");
        return new MirrorFile(blobFile)
        {
            FileSequenceNumber = lastFileNumber
        };
    }

    private async Task<BlobFile> OpenWriteAsync(OpenMirroredTableId table, string fileName)
    {
        var tableLocation = GetTableLocation(table);
        var blobFile = await tableLocation.CreateFileAsync(fileName);
        return blobFile;
    }

    private IStoragePath GetTableLocation(OpenMirroredTableId table)
    {
        var tablePath = table.GetTablePath();
        return storageClient.GetPath(table.WorkspaceName, tablePath);
    }
}