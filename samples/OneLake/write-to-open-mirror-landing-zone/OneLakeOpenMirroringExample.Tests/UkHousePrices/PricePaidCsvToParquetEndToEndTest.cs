using System.IO.Compression;
using OneLakeOpenMirroringExample.UkHousePrices;

namespace OneLakeOpenMirroringExample.Tests.UkHousePrices;

[TestFixture]
public class PricePaidCsvToParquetEndToEndTest
{
    private PricePaidCsvParser parser;

    [SetUp]
    public void Setup()
    {
        parser = new PricePaidCsvParser();
    }
    
    [Test]
    public async Task when_parsing_an_entire_file()
    {
        using var zip = new ZipArchive(File.OpenRead("UkHousePrices/SampleData/pp-monthly-update-new-version.csv.zip"));
        var entry = zip.GetEntry("pp-monthly-update-new-version.csv");
        var stream = entry!.Open();
        var streamReader = new StreamReader(stream);
        var pricePaid = parser.ParseAsync(streamReader);
        await using var resultFile = File.Create("price-paid.parquet");
        await pricePaid.WriteAsync(resultFile);
    }
    
    //[Test]
    public async Task when_parsing_the_complete_dataset_from_land_registry()
    {
        var landRegistry = new LandRegistryPricePaidDataProvider();
        await using var resultFile = File.Create("price-paid-complete.parquet");
        await landRegistry.ReadCompleteData().WriteAsync(resultFile);
    }
}