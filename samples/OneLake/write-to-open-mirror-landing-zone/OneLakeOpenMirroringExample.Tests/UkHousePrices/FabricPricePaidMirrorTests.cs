using System.Runtime.CompilerServices;
using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using OneLakeOpenMirroringExample.Storage;
using OneLakeOpenMirroringExample.UkHousePrices;

namespace OneLakeOpenMirroringExample.Tests.UkHousePrices;

[TestFixture]
public class FabricPricePaidMirrorTests
{
    TestSetup setup;

    class TestSetup
    {
        public required BlobServiceClient BlobServiceClient { get; init; }
        public required TestPricePaidReader PricePaidReader { get; init; }
        public required OpenMirroredTableId TableId { get; init; }
        public required BlobContainerClient WorkspaceContainer { get; init; }
        public required FabricPricePaidMirror FabricPricePaidMirror { get; init; }

        public static async Task<TestSetup> UsingEmulator()
        {
            var blobServiceClient = await AzuriteHost.GetBlobServiceClientUsingAzurite();
            var pricePaidReader = new TestPricePaidReader();
            var tableId = new OpenMirroredTableId($"workspace-{Guid.NewGuid()}", "database", "table");
            var createContainerResponse = await blobServiceClient.CreateBlobContainerAsync(tableId.WorkspaceName);
            var workspaceContainer = createContainerResponse.Value;
            var fabricPricePaidMirror = new FabricPricePaidMirror(new FabricOpenMirror(new StorageClient(blobServiceClient)), pricePaidReader)
            {
                Settings = new FabricPricePaidMirrorSettings { RowsPerRowGroup = 1 }
            };

            return new TestSetup
            {
                BlobServiceClient = blobServiceClient,
                PricePaidReader = pricePaidReader,
                TableId = tableId,
                WorkspaceContainer = workspaceContainer,
                FabricPricePaidMirror = fabricPricePaidMirror
            };
        }

        public static TestSetup UsingFabric()
        {
            var defaultAzureCredential = new DefaultAzureCredential();
            var blobServiceClient = new BlobServiceClient(new Uri("https://onelake.blob.fabric.microsoft.com/"), defaultAzureCredential);
            var pricePaidReader = new TestPricePaidReader();
            var tableId = new OpenMirroredTableId($"TomTestWorkspace", "HousePriceOpenMirror.MountedRelationalDatabase", "PricePaid");
            var workspaceContainer = blobServiceClient.GetBlobContainerClient(tableId.WorkspaceName);
            var oneLakeClient = StorageClient.CreateOneLakeClient(defaultAzureCredential);
            var fabricPricePaidMirror = new FabricPricePaidMirror(new FabricOpenMirror(oneLakeClient), pricePaidReader)
            {
                Settings = new FabricPricePaidMirrorSettings { RowsPerRowGroup = 1 }
            };

            return new TestSetup
            {
                BlobServiceClient = blobServiceClient,
                PricePaidReader = pricePaidReader,
                TableId = tableId,
                WorkspaceContainer = workspaceContainer,
                FabricPricePaidMirror = fabricPricePaidMirror
            };
        }
    }

    [SetUp]
    public async Task Setup() => setup = await TestSetup.UsingEmulator();

    public class when_copying_to_mirror_successfully : FabricPricePaidMirrorTests
    {
        [Test]
        public async Task it_should_write_data_to_table()
        {
            await setup.FabricPricePaidMirror.SeedMirrorAsync(setup.TableId);
            var mirroredData = await GetMirroredBlobItem();
        
            var mirroredDataClient = setup.WorkspaceContainer.GetBlobClient(mirroredData!.Name);
            var mirroredDataContents = await mirroredDataClient.DownloadContentAsync();
        
            var readData = await PricePaidMirroredDataFormat.Read(mirroredDataContents.Value.Content.ToStream()).SingleAsync();
            Assert.Multiple(() =>
            {
                Assert.That(mirroredData, Is.Not.Null);
                Assert.That(mirroredData!.Properties.ContentLength, Is.GreaterThan(0));
                Assert.That(readData.TransactionId, Is.EqualTo(setup.PricePaidReader.TransactionId));
                Assert.That(readData.Price, Is.EqualTo(100000));
                Assert.That(readData.DateOfTransfer, Is.EqualTo(new DateTime(2023, 1, 1)));
                Assert.That(readData.Postcode, Is.EqualTo("AB12 3CD"));
                Assert.That(readData.PropertyType, Is.EqualTo(nameof(PropertyType.Detached)));
                Assert.That(readData.OldNew, Is.True);
                Assert.That(readData.Duration, Is.EqualTo(nameof(DurationType.Freehold)));
                Assert.That(readData.PrimaryAddressableObjectName, Is.EqualTo("123 Main St"));
                Assert.That(readData.SecondaryAddressableObjectName, Is.EqualTo("Flat 1"));
                Assert.That(readData.Street, Is.EqualTo("Main St"));
                Assert.That(readData.Locality, Is.EqualTo("Locality"));
                Assert.That(readData.TownCity, Is.EqualTo("Town"));
                Assert.That(readData.District, Is.EqualTo("District"));
                Assert.That(readData.County, Is.EqualTo("County"));
                Assert.That(readData.CategoryType, Is.EqualTo(nameof(CategoryType.AdditionalPricePaid)));
                Assert.That(readData.__rowMarker__, Is.EqualTo(0)); // RecordStatus.Added
            });
        }

        
        [Test]
        public async Task it_should_not_commit_partially_written_data()
        {
            long? lengthDuringWrite = null;
                        
            setup.PricePaidReader.ActionBetweenRowGroups = async () =>
            {
                var mirrorTemporaryData = await GetMirroredBlobTemporaryItem();
                lengthDuringWrite = mirrorTemporaryData!.Properties.ContentLength;
            };
            
            await setup.FabricPricePaidMirror.SeedMirrorAsync(setup.TableId);
            
            Assert.That(lengthDuringWrite, Is.EqualTo(0));
        }
    }
    
    public class when_copying_to_mirror_fails : FabricPricePaidMirrorTests
    {

        [Test]
        public async Task after_a_row_group_is_written_it_should_not_leave_a_partially_complete_blob()
        {
            setup.PricePaidReader.ThrowsAfterFirstRowGroup = true;

            var previouslyMirroredFile = await GetMirroredBlobItem();

            var threw = true;
            try
            {
                await setup.FabricPricePaidMirror.SeedMirrorAsync(setup.TableId);
            }
            catch (Exception)
            {
                threw = true;
            }

            var mirroredData = await GetMirroredBlobItem();
            var mirroredTemporaryData = await GetMirroredBlobTemporaryItem();

            Assert.Multiple(() =>
            {
                Assert.That(threw, Is.True);
                if (previouslyMirroredFile == null)
                { 
                    Assert.That(mirroredData, Is.Null);
                }
                else
                {
                    Assert.That(mirroredData!.Name, Is.EqualTo(previouslyMirroredFile.Name));
                }
                Assert.That(mirroredTemporaryData, Is.Not.Null);
                Assert.That(mirroredTemporaryData!.Properties.ContentLength, Is.EqualTo(0));
            });
        }
    }

    public class when_using_fabric
    {
        public class in_success_cases : when_copying_to_mirror_successfully
        {
            [SetUp]
            public void UseFabric() => setup = TestSetup.UsingFabric();
        }

        public class in_failure_cases : when_copying_to_mirror_fails
        {
            [SetUp]
            public void UseFabric() => setup = TestSetup.UsingFabric();
        }
    }

    
    private async Task<BlobItem?> GetMirroredBlobItem()
    {
        var blobs = setup.WorkspaceContainer.GetBlobsAsync(prefix: $"{setup.TableId.MirroredDatabaseName}/Files/LandingZone/{setup.TableId.TableName}/");
        var mirroredData = await blobs
            .Where(x => Path.GetDirectoryName(x.Name).EndsWith(setup.TableId.TableName))
            .LastOrDefaultAsync(x => x.Name.EndsWith(".parquet"));
        return mirroredData;
    }

    private async Task<BlobItem?> GetMirroredBlobTemporaryItem()
    {
        var blobs = setup.WorkspaceContainer.GetBlobsAsync(prefix: $"{setup.TableId.MirroredDatabaseName}/Files/LandingZone/{setup.TableId.TableName}/");
        var mirroredData = await blobs
            .Where(x => Path.GetDirectoryName(x.Name).EndsWith(setup.TableId.TableName))
            .LastOrDefaultAsync(x => x.Name.EndsWith(".parquet.temp"));
        return mirroredData;
    }

    private class TestPricePaidReader : IPricePaidDataReader
    {
        public string TransactionId { get; private set; } = Guid.NewGuid().ToString();

        public bool ThrowsAfterFirstRowGroup { get; set; }
        
        public Func<Task> ActionBetweenRowGroups { get; set; } = () => Task.CompletedTask;
        
        public async IAsyncEnumerable<PricePaid> ReadCompleteData([EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            yield return new PricePaid
            {
                RecordStatus = RecordStatus.Added,
                Price = 100000,
                Postcode = "AB12 3CD",
                DateOfTransfer = new DateTime(2023, 1, 1),
                TransactionId = TransactionId,
                PropertyType = PropertyType.Detached,
                IsNew = true,
                DurationType = DurationType.Freehold,
                CategoryType = CategoryType.AdditionalPricePaid,
                PrimaryAddressableObjectName = "123 Main St",
                SecondaryAddressableObjectName = "Flat 1",
                Street = "Main St",
                Locality = "Locality",
                TownCity = "Town",
                District = "District",
                County = "County"
            };
            await Task.Yield();
            if (ThrowsAfterFirstRowGroup)
            {
                throw new Exception();
            }
            await ActionBetweenRowGroups();
            await Task.Yield();
        }

        public IAsyncEnumerable<PricePaid> ReadCurrentMonth(CancellationToken cancellationToken = default) => ReadCompleteData(cancellationToken);
    }
}