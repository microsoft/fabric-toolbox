using System.Runtime.CompilerServices;

namespace OneLakeOpenMirroringExample.Extensions;

public static class AsyncEnumerableExtensions
{
    public static async IAsyncEnumerable<T[]> ChunkAsync<T>(this IAsyncEnumerable<T> enumerable, int size, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        await using var enumerator = enumerable.GetAsyncEnumerator(cancellationToken);
        var chunkIterator = new ChunkIterator<T>(enumerator, size);
        while (await chunkIterator.MoveNextAsync(cancellationToken))
        {
            yield return chunkIterator.Current;
        }
    }
    
    private class ChunkIterator<T>(IAsyncEnumerator<T> enumerator, int chunkSize)
    {
        private readonly T[] buffer = new T[chunkSize];
        private bool complete;
        private int length;

        public T[] Current => buffer[..length];
    
        public async Task<bool> MoveNextAsync(CancellationToken cancellationToken = default)
        {
            if (complete) return false;
    
            length = 0;
            while (length < buffer.Length)
            {
                if (cancellationToken.IsCancellationRequested)
                {
                    complete = true;
                    return false;
                }
                if (!await enumerator.MoveNextAsync())
                {
                    complete = true;
                    break;
                }
                buffer[length++] = enumerator.Current;
            }
    
            return length > 0;
        }
    }
}