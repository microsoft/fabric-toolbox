using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using OneLakeOpenMirroringExample.Storage;

namespace OneLakeOpenMirroringExample.Tests
{
    public class FabricOpenMirrorJanitorTests
    {
        private FabricOpenMirrorJanitor janitor;
        private OpenMirroredTableId tableId;
        private BlobContainerClient workspaceContainer;
        private StorageClient storageClient;
        private FabricOpenMirror mirror;
        
        [SetUp]
        public async Task Setup()
        {
            storageClient = await AzuriteHost.GetStorageClientUsingAzurite();
            mirror = new FabricOpenMirror(storageClient);
            janitor = new FabricOpenMirrorJanitor(storageClient);
            tableId = new OpenMirroredTableId(Guid.NewGuid().ToString(), "TestDatabase", "TestTable");
            var blobServiceClient = await AzuriteHost.GetBlobServiceClientUsingAzurite();
            var createContainerResponse = await blobServiceClient.CreateBlobContainerAsync(tableId.WorkspaceName);
            workspaceContainer = createContainerResponse.Value;
        }

        [Test]
        public async Task when_cleaning_up_a_table_in_fabric_it_should_delete_processed_and_ready_to_delete_folders()
        {
            janitor = new FabricOpenMirrorJanitor(StorageClient.CreateOneLakeClient(new DefaultAzureCredential()));
            tableId = new OpenMirroredTableId($"TomTestWorkspace", "HousePriceOpenMirror.MountedRelationalDatabase",
                "PricePaid");

            await janitor.CleanUpTableAsync(tableId);
        }

        [Test]
        public async Task when_table_does_not_exist_it_should_not_throw_exception()
        {
            Exception? caught = null;
            try
            {
                await janitor.CleanUpTableAsync(tableId);
            }
            catch (Exception e)
            {
                caught = e;
            }

            Assert.That(caught, Is.Null);
        }

        [Test]
        public async Task when_table_exists_with_no_processed_or_ready_to_delete_folders_it_should_not_take_any_action()
        {
            await CreateTable();
            await janitor.CleanUpTableAsync(tableId);

            var mirroredTableContents = await GetMirroredTableItems();

            var metadataFile = mirroredTableContents.Single(x => x.Name.EndsWith("_metadata.json"));
            var dataFile = mirroredTableContents.Single(x => x.Name.EndsWith(".parquet"));
            Assert.Multiple(() =>
            {
                Assert.That(metadataFile, Is.Not.Null);
                Assert.That(dataFile, Is.Not.Null);
            });
        }

        [Test]
        public async Task when_table_has_processed_and_ready_to_delete_folders_it_should_delete_them()
        {
            await workspaceContainer.UploadBlobAsync(
                tableId.GetTablePath() + "_ProcessedFiles/processed-file.parquet",
                new BinaryData([1, 2, 3]));
            await workspaceContainer.UploadBlobAsync(
                tableId.GetTablePath() + "_FilesReadyToDelete/processed-file.parquet", 
                new BinaryData([1, 2, 3]));

            await janitor.CleanUpTableAsync(tableId);

            var mirroredTableContents = await GetMirroredTableItems();

            Assert.Multiple(() =>
            {
                Assert.That(mirroredTableContents.Any(x => x.Name.Contains("_ProcessedFiles/")), Is.False);
                Assert.That(mirroredTableContents.Any(x => x.Name.Contains("_FilesReadyToDelete/")), Is.False);
            });
        }
        
        private async Task CreateTable()
        {
            await mirror.CreateTableAsync(tableId, "key1");
            var file = await mirror.CreateNextTableDataFileAsync(tableId);
            await file.WriteData(async x => await x.WriteAsync(new byte[] { 1, 2, 3, 4 }));
            await file.DisposeAsync();
        }

        private async Task<BlobItem[]> GetMirroredTableItems()
        {
            var blobs = workspaceContainer.GetBlobsAsync(prefix: tableId.GetTablePath());
            var blobList = await blobs.ToArrayAsync();
            return blobList;
        }
    }
}