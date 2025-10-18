using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using OneLakeOpenMirroringExample.Storage;

namespace OneLakeOpenMirroringExample.Tests;

public class FabricOpenMirrorTests
{
    private FabricOpenMirror fabricOpenMirror;
    private BlobServiceClient blobServiceClient;
    private OpenMirroredTableId tableId;
    private BlobContainerClient workspaceContainer;
    
    [SetUp]
    public async Task Setup()
    {
        blobServiceClient = await AzuriteHost.GetBlobServiceClientUsingAzurite();
        fabricOpenMirror = new FabricOpenMirror(new StorageClient(blobServiceClient));
        
        tableId = GetTableId();
        var createContainerResponse = await blobServiceClient.CreateBlobContainerAsync(tableId.WorkspaceName);
        workspaceContainer = createContainerResponse.Value;
    }

    protected virtual OpenMirroredTableId GetTableId() => new OpenMirroredTableId($"workspace-{Guid.NewGuid()}", "database", "table");

    [Test]
    public async Task when_creating_a_new_table_it_should_write_the_metadata()
    {
        await fabricOpenMirror.CreateTableAsync(tableId, "key1", "key2");
        
        var metadataBlobClient = workspaceContainer.GetBlobClient($"{tableId.GetTablePath()}_metadata.json");
        var metadataContents = await metadataBlobClient.DownloadContentAsync();
        var json = metadataContents.Value.Content.ToString();
        Assert.That(json, Is.EqualTo("{\"keyColumns\":[\"key1\",\"key2\"]}"));
    }

    [Test]
    public async Task when_writing_to_a_table_that_does_not_exist_it_should_fail()
    {
        var nonExistentTableId = new OpenMirroredTableId(
            tableId.WorkspaceName, 
            "non-existent-database", 
            "non-existent-table");

        ArgumentException? exception = null;
        try
        {
            await fabricOpenMirror.CreateNextTableDataFileAsync(nonExistentTableId);
        }
        catch (ArgumentException e)
        {
            exception = e;
        }
        
        
        Assert.That(exception!.Message, Does.Contain("Table not found."));
    }

    public class when_table_exists : FabricOpenMirrorTests
    {
        [SetUp]
        public async Task CreateTable() => await fabricOpenMirror.CreateTableAsync(tableId, "key");
        
        [Test]
        public async Task when_writing_to_the_table_for_the_first_time_it_should_create_a_new_file_starting_at_001()
        {
            var fileSequenceNumber = await WriteToTable();

            var blobList = await GetMirroredTableItems();
            Assert.Multiple(() =>
            {
                Assert.That(blobList[0].Name, Does.EndWith("00000000000000000001.parquet"));
                Assert.That(fileSequenceNumber, Is.EqualTo(1));
            });
        }

        [Test]
        public async Task when_writing_to_the_table_for_the_second_time_it_should_create_a_new_file_next_in_sequence()
        {
            await WriteToTable();
            var fileSequenceNumber = await WriteToTable();
            
            var blobList = await GetMirroredTableItems();
            
            Assert.Multiple(() =>
            {
                Assert.That(blobList[1].Name, Does.EndWith("00000000000000000002.parquet"));
                Assert.That(fileSequenceNumber, Is.EqualTo(2));
            });
        }
        
        [Test]
        public async Task when_writing_to_the_table_for_the_third_time_it_should_create_a_new_file_next_in_sequence()
        {
            await WriteToTable();
            await WriteToTable();
            var fileSequenceNumber = await WriteToTable();
            
            var blobList = await GetMirroredTableItems();
            
            Assert.Multiple(() =>
            {
                Assert.That(blobList[2].Name, Does.EndWith("00000000000000000003.parquet"));
                Assert.That(fileSequenceNumber, Is.EqualTo(3));
            });
        }
        
        [Test]
        public async Task when_writing_to_the_table_for_the_third_time_after_first_file_is_cleaned_up_it_should_create_a_new_file_next_in_sequence()
        {
            await WriteToTable();
            await WriteToTable();
            await workspaceContainer.DeleteBlobAsync($"{tableId.GetTablePath()}00000000000000000001.parquet");
            var fileSequenceNumber = await WriteToTable();
            
            var blobList = await GetMirroredTableItems();
            
            Assert.That(blobList[1].Name, Does.EndWith("00000000000000000003.parquet"));
            Assert.That(fileSequenceNumber, Is.EqualTo(3));
        }

        [Test]
        public async Task when_current_data_file_is_zero_bytes_it_should_not_create_a_new_file()
        {
            await WriteToTable(writeData: false);
            var fileSequenceNumber = await WriteToTable();
            
            var blobList = await GetMirroredTableItems();
            
            Assert.Multiple(() =>
            {
                Assert.That(blobList.Length, Is.EqualTo(2));
                Assert.That(blobList[0].Name, Does.EndWith("00000000000000000001.parquet"));
                Assert.That(fileSequenceNumber, Is.EqualTo(1));
            });
        }

        [Test]
        public async Task when_table_has_files_ready_to_delete_it_should_create_file_next_in_sequence()
        {
            await WriteToTable();
            await WriteToTable();
            
            // the first file will move to read to delete folder, the last file is left so we know the sequence number
            await workspaceContainer.DeleteBlobAsync($"{tableId.GetTablePath()}00000000000000000001.parquet");
            await workspaceContainer.UploadBlobAsync($"{tableId.GetTablePath()}_FilesReadyToDelete/00000000000000000001.parquet", BinaryData.Empty);
            
            var fileSequenceNumber = await WriteToTable();
            var blobList = await GetMirroredTableItems();
            Assert.Multiple(() =>
            {
                Assert.That(blobList[0].Name, Does.EndWith("00000000000000000002.parquet"));
                Assert.That(blobList[1].Name, Does.EndWith("00000000000000000003.parquet"));
                Assert.That(fileSequenceNumber, Is.EqualTo(3));
            });   
        }

        public class with_a_schema : when_table_exists
        {
            override protected OpenMirroredTableId GetTableId() => base.GetTableId() with { Schema = "MySchema" };

            [Test]
            public async Task it_should_be_written_to_the_schema_folder()
            {
                var blobs = workspaceContainer.GetBlobsAsync(prefix: $"{tableId.MirroredDatabaseName}/Files/LandingZone/{tableId.Schema}.schema/{tableId.TableName}/");

                var blobCount = await blobs.CountAsync();

                Assert.That(blobCount, Is.GreaterThan(0));
            }
        }

        private async Task<BlobItem[]> GetMirroredTableItems()
        {
            var blobs = workspaceContainer.GetBlobsAsync(prefix: tableId.GetTablePath());
            var blobList = await blobs.ToArrayAsync();
            return blobList;
        }

        private async Task<long> WriteToTable(bool writeData = true)
        {
            await using var mirrorDataFile = await fabricOpenMirror.CreateNextTableDataFileAsync(tableId);
            if (writeData)
            {
                await mirrorDataFile.WriteData(async stream =>
                {
                    await using var streamWriter = new StreamWriter(stream);
                    await streamWriter.WriteAsync("Hello, World!");
                });
            }

            return mirrorDataFile.FileSequenceNumber;
        }
    }
}