using OneLakeOpenMirroringExample.Extensions;
using Parquet;
using Parquet.Serialization;

namespace OneLakeOpenMirroringExample.UkHousePrices;

public static class PricePaidMirrorDataParquetWriter
{
    public static async Task WriteAsync(this IAsyncEnumerable<PricePaid> data, Stream resultStream, int rowsPerRowGroup = 10000, CancellationToken cancellationToken = default)
    {
        await using var parquetWriter = await ParquetWriter.CreateAsync(
            PricePaidMirroredDataFormat.CreateSchema(), 
            resultStream, 
            cancellationToken: cancellationToken);

        await foreach (var chunk in data
            .Select(PricePaidMirroredDataFormat.Create)
            .ChunkAsync(rowsPerRowGroup, cancellationToken))
        {
            await ParquetSerializer.SerializeRowGroupAsync(parquetWriter, chunk, cancellationToken);
        }
    }
}