using Azure.Identity;
using Azure.Storage.Blobs;
using OneLakeOpenMirroringExample;
using OneLakeOpenMirroringExample.Storage;
using OneLakeOpenMirroringExample.UkHousePrices;

Console.WriteLine("Workspace Name: ");
var workspaceName = Console.ReadLine();
Console.WriteLine("Open mirror item name: ");
var openMirrorName = Console.ReadLine();

var defaultAzureCredential = new DefaultAzureCredential();
var blobServiceClient = new BlobServiceClient(new Uri("https://onelake.blob.fabric.microsoft.com/"), defaultAzureCredential);
var pricePaidReader = new LandRegistryPricePaidDataProvider();
var tableId = new OpenMirroredTableId(workspaceName, openMirrorName, "PricePaid");
var workspaceContainer = blobServiceClient.GetBlobContainerClient(tableId.WorkspaceName);
var oneLakeClient = StorageClient.CreateOneLakeClient(defaultAzureCredential);

var fabricPricePaidMirror = new FabricPricePaidMirror(new FabricOpenMirror(oneLakeClient), pricePaidReader);
await fabricPricePaidMirror.SeedMirrorAsync(tableId);