namespace OneLakeOpenMirroringExample.Storage;

public class BlobFile(Stream stream, IStoragePath temporaryFilePath, string finalFilePath) : IAsyncDisposable
{
    private readonly BlobStream stream = new(stream, temporaryFilePath, finalFilePath);
    
    public async Task WriteData(Func<Stream, Task> writeOperation)
    {
        try
        {
            await writeOperation(stream);
        }
        catch (Exception)
        {
            stream.Failed();
            throw;
        }
    }
    
    public async ValueTask DisposeAsync()
    {
        await stream.DisposeAsync();
    }
    
    private class BlobStream(Stream innerStream, IStoragePath temporaryFilePath, string finalFilePath) : Stream
    {
        private bool disposed = false;
        private bool success = true;

        public override bool CanRead => innerStream.CanRead;
        public override bool CanSeek => innerStream.CanSeek;
        public override bool CanWrite => innerStream.CanWrite;

        public override long Length => innerStream.Length;

        public override long Position
        {
            get => innerStream.Position;
            set => innerStream.Position = value;
        }

        public override void Flush()
        {
            // no-op
        }

        public override int Read(byte[] buffer, int offset, int count) => innerStream.Read(buffer, offset, count);

        public override long Seek(long offset, SeekOrigin origin) => innerStream.Seek(offset, origin);

        public override void SetLength(long value) => innerStream.SetLength(value);

        public override void Write(byte[] buffer, int offset, int count) => innerStream.Write(buffer, offset, count);
        
        public void Failed()
        {
            success = false;
        }

        public override async ValueTask DisposeAsync()
        {
            if (disposed)
            {
                return;
            }
            if (success)
            {
                await innerStream.DisposeAsync();
                await temporaryFilePath.RenameAsync(finalFilePath);
            }
            disposed = true;
        }
    }
}