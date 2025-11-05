using System.Runtime.CompilerServices;

namespace OneLakeOpenMirroringExample.UkHousePrices;

public class LandRegistryPricePaidDataProvider(HttpClient? httpClient = null) : IPricePaidDataReader
{
    private readonly HttpClient httpClient = httpClient ?? new HttpClient();

    /// <summary>
    /// Reads the current month's price paid data from the Land Registry.
    /// URI: http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-monthly-update-new-version.csv
    /// </summary>
    public IAsyncEnumerable<PricePaid> ReadCurrentMonth(CancellationToken cancellationToken = default) => ReadFrom(
        new Uri("http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-monthly-update-new-version.csv"), 
        cancellationToken);

    /// <summary>
    /// Reads the complete price paid data from the Land Registry.
    /// URI: http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-complete.csv
    /// </summary>
    public IAsyncEnumerable<PricePaid> ReadCompleteData(CancellationToken cancellationToken = default) => ReadFrom(
        new Uri("http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-complete.csv"), 
        cancellationToken);

    private async IAsyncEnumerable<PricePaid> ReadFrom(Uri uri, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        using var response = await httpClient.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var streamReader = new StreamReader(stream);
        var parser = new PricePaidCsvParser();
        await foreach (var pricePaid in parser.ParseAsync(streamReader, cancellationToken))
        {
            yield return pricePaid;
        }
    }
}