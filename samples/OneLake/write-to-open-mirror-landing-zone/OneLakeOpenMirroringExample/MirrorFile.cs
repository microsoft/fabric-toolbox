using OneLakeOpenMirroringExample.Storage;

namespace OneLakeOpenMirroringExample;

public class MirrorFile(BlobFile blobFile) : IAsyncDisposable
{
    public required long FileSequenceNumber { get; init; }
    
    public Task WriteData(Func<Stream, Task> writeOperation) => blobFile.WriteData(writeOperation);

    public async ValueTask DisposeAsync() => await blobFile.DisposeAsync();
}