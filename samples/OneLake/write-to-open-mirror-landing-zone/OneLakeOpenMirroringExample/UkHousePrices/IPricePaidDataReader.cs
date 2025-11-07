namespace OneLakeOpenMirroringExample.UkHousePrices;

public interface IPricePaidDataReader
{
    IAsyncEnumerable<PricePaid> ReadCurrentMonth(CancellationToken cancellationToken = default);
    IAsyncEnumerable<PricePaid> ReadCompleteData(CancellationToken cancellationToken = default);
}