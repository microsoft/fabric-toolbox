using OneLakeOpenMirroringExample.Storage;

namespace OneLakeOpenMirroringExample
{
    public class FabricOpenMirrorJanitor(StorageClient storageClient)
    {
        public async Task CleanUpTableAsync(OpenMirroredTableId tableId)
        {
            var tablePath = GetTableLocation(tableId);
            var foldersToDelete = new []
            {
                "_ProcessedFiles",
                "_FilesReadyToDelete"
            };
            await Parallel.ForEachAsync(foldersToDelete, async (path, _) =>
            {
                var pathToDelete = tablePath.GetChildPath(path);
                
                await pathToDelete.DeleteIfExistsAsync();
            });
        }

        private IStoragePath GetTableLocation(OpenMirroredTableId table)
        {
            var path = $"{table.MirroredDatabaseName}/Files/LandingZone/{table.TableName}/";
            
            return storageClient.GetPath(table.WorkspaceName, path);
        }
    }
}
