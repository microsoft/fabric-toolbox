namespace OneLakeOpenMirroringExample.UkHousePrices;

public record FabricPricePaidMirrorSettings(int RowsPerRowGroup = 10000);

public class FabricPricePaidMirror(FabricOpenMirror openMirror, IPricePaidDataReader pricePaidDataReader)
{
    public FabricPricePaidMirrorSettings Settings { get; init; } = new();
    
    public async Task SeedMirrorAsync(OpenMirroredTableId tableId, CancellationToken cancellationToken = default)
    {
        await openMirror.CreateTableAsync(tableId, PricePaidMirroredDataFormat.KeyColumns);
        var data = pricePaidDataReader.ReadCompleteData(cancellationToken);
        await CopyToMirror(tableId, data, cancellationToken);
    }
    
    public async Task AddCurrentMonthToMirrorAsync(OpenMirroredTableId tableId, CancellationToken cancellationToken = default)
    {
        var data = pricePaidDataReader.ReadCurrentMonth(cancellationToken);
        await CopyToMirror(tableId, data, cancellationToken);
    }

    private async Task CopyToMirror(OpenMirroredTableId tableId, IAsyncEnumerable<PricePaid> data, CancellationToken cancellationToken)
    {
        await using var mirrorDataFile = await openMirror.CreateNextTableDataFileAsync(tableId);
        await mirrorDataFile.WriteData(async stream => await data.WriteAsync(stream, Settings.RowsPerRowGroup, cancellationToken));
    }
}