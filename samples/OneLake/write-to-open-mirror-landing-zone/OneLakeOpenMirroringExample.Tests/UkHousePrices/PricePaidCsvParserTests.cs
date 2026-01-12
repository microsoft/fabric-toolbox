using OneLakeOpenMirroringExample.UkHousePrices;

namespace OneLakeOpenMirroringExample.Tests.UkHousePrices;

public class PricePaidCsvParserTests
{
    private PricePaidCsvParser parser;

    [SetUp]
    public void Setup()
    {
        parser = new PricePaidCsvParser();
    }

    async Task<PricePaid> ParseSingle(string line)
    {
        var stringReader = new StringReader(line);
        var parseResult =  parser.ParseAsync(stringReader);
        var result = await parseResult.SingleAsync();
        return result;
    }

    public static string ExampleLineFromMonthlyFile =>
        "\"{34222872-B554-4D2B-E063-4704A8C07853}\",\"375000\",\"2004-04-27 00:00\",\"SW13 0NP\",\"D\",\"N\",\"F\",\"10A\",\"\",\"THE TERRACE\",\"\",\"LONDON\",\"RICHMOND UPON THAMES\",\"GREATER LONDON\",\"A\",\"A\"";
    
    public static string ExampleLineFromYearlyFile => 
        "\"{7130F2C1-B3E4-41A5-9103-3DC40A6A5466}\",\"166500\",\"1995-11-22 00:00\",\"CM23 4PA\",\"D\",\"Y\",\"F\",\"19\",\"\",\"MAYFLOWER GARDENS\",\"BISHOP'S STORTFORD\",\"BISHOP'S STORTFORD\",\"EAST HERTFORDSHIRE\",\"HERTFORDSHIRE\",\"A\",\"A\"";
    
    [Test]
    public async Task when_parsing_single_line_from_monthly_file()
    {
        var pricePaid = await ParseSingle(ExampleLineFromMonthlyFile);
        Assert.Multiple(() =>
        {
            Assert.That(pricePaid.TransactionId, Is.EqualTo("{34222872-B554-4D2B-E063-4704A8C07853}"));
            Assert.That(pricePaid.Price, Is.EqualTo(375000));
            Assert.That(pricePaid.DateOfTransfer, Is.EqualTo(new DateTime(2004, 4, 27)));
            Assert.That(pricePaid.Postcode, Is.EqualTo("SW13 0NP"));
            Assert.That(pricePaid.PropertyType, Is.EqualTo(PropertyType.Detached));
            Assert.That(pricePaid.IsNew, Is.EqualTo(false));
            Assert.That(pricePaid.DurationType, Is.EqualTo(DurationType.Freehold));
            Assert.That(pricePaid.PrimaryAddressableObjectName, Is.EqualTo("10A"));
            Assert.That(pricePaid.SecondaryAddressableObjectName, Is.EqualTo(string.Empty));
            Assert.That(pricePaid.Street, Is.EqualTo("THE TERRACE"));
            Assert.That(pricePaid.Locality, Is.EqualTo(string.Empty));
            Assert.That(pricePaid.TownCity, Is.EqualTo("LONDON"));
            Assert.That(pricePaid.District, Is.EqualTo("RICHMOND UPON THAMES"));
            Assert.That(pricePaid.County, Is.EqualTo("GREATER LONDON"));
            Assert.That(pricePaid.CategoryType, Is.EqualTo(CategoryType.StandardPricePaid));
            Assert.That(pricePaid.RecordStatus, Is.EqualTo(RecordStatus.Added));
        });
    }

    [Test]
    public async Task when_parsing_single_line_from_historical_single_file()
    {
        var pricePaid = await ParseSingle(ExampleLineFromYearlyFile);
        Assert.Multiple(() =>
        {
            Assert.That(pricePaid.TransactionId, Is.EqualTo("{7130F2C1-B3E4-41A5-9103-3DC40A6A5466}"));
            Assert.That(pricePaid.Price, Is.EqualTo(166500));
            Assert.That(pricePaid.DateOfTransfer, Is.EqualTo(new DateTime(1995, 11, 22)));
            Assert.That(pricePaid.Postcode, Is.EqualTo("CM23 4PA"));
            Assert.That(pricePaid.PropertyType, Is.EqualTo(PropertyType.Detached));
            Assert.That(pricePaid.IsNew, Is.EqualTo(true));
            Assert.That(pricePaid.DurationType, Is.EqualTo(DurationType.Freehold));
            Assert.That(pricePaid.PrimaryAddressableObjectName, Is.EqualTo("19"));
            Assert.That(pricePaid.SecondaryAddressableObjectName, Is.EqualTo(string.Empty));
            Assert.That(pricePaid.Street, Is.EqualTo("MAYFLOWER GARDENS"));
            Assert.That(pricePaid.Locality, Is.EqualTo("BISHOP'S STORTFORD"));
            Assert.That(pricePaid.TownCity, Is.EqualTo("BISHOP'S STORTFORD"));
            Assert.That(pricePaid.District, Is.EqualTo("EAST HERTFORDSHIRE"));
            Assert.That(pricePaid.County, Is.EqualTo("HERTFORDSHIRE"));
            Assert.That(pricePaid.CategoryType, Is.EqualTo(CategoryType.StandardPricePaid));
            Assert.That(pricePaid.RecordStatus, Is.EqualTo(RecordStatus.Added));
        });
    }
}