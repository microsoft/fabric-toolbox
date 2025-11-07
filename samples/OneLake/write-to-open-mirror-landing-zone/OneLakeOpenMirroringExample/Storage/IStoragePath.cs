using Azure.Storage.Blobs.Models;

namespace OneLakeOpenMirroringExample.Storage;

public interface IStoragePath
{
    Task<BlobFile> CreateFileAsync(string path);
    IStoragePath GetChildPath(string path);
    IAsyncEnumerable<BlobItem?> GetBlobsAsync(string? prefix = null);
    Task DeleteIfExistsAsync();
    Task RenameAsync(string newName);
}