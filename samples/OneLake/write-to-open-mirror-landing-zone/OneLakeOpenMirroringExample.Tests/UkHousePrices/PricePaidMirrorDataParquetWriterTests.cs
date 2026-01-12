using OneLakeOpenMirroringExample.UkHousePrices;
using Parquet.Serialization;

namespace OneLakeOpenMirroringExample.Tests.UkHousePrices;

public class PricePaidMirrorDataParquetWriterTests
{
    [Test]
    public async Task when_writing_price_paid_data_to_parquet()
    {
        var row = new PricePaid
        {
            TransactionId = "{34222872-B554-4D2B-E063-4704A8C07853}",
            Price = 375000,
            DateOfTransfer = new DateTime(2004, 4, 27),
            Postcode = "SW13 0NP",
            PropertyType = PropertyType.Detached,
            IsNew = true,
            DurationType = DurationType.Freehold,
            PrimaryAddressableObjectName = "10A",
            SecondaryAddressableObjectName = string.Empty,
            Street = "THE TERRACE",
            Locality = string.Empty,
            TownCity = "LONDON",
            District = "RICHMOND UPON THAMES",
            County = "GREATER LONDON",
            CategoryType = CategoryType.AdditionalPricePaid,
            RecordStatus = RecordStatus.Added
        };
        
        using var memoryStream = new MemoryStream();
        await new[] { row }.ToAsyncEnumerable().WriteAsync(memoryStream);

        var readData = await PricePaidMirroredDataFormat.Read(memoryStream).SingleAsync();
        Assert.Multiple(() =>
        {
            Assert.That(readData.TransactionId, Is.EqualTo(row.TransactionId));
            Assert.That(readData.Price, Is.EqualTo(row.Price));
            Assert.That(readData.DateOfTransfer, Is.EqualTo(row.DateOfTransfer));
            Assert.That(readData.Postcode, Is.EqualTo(row.Postcode));
            Assert.That(readData.PropertyType, Is.EqualTo(row.PropertyType.ToString()));
            Assert.That(readData.OldNew, Is.EqualTo(row.IsNew));
            Assert.That(readData.Duration, Is.EqualTo(row.DurationType.ToString()));
            Assert.That(readData.PrimaryAddressableObjectName, Is.EqualTo(row.PrimaryAddressableObjectName));
            Assert.That(readData.SecondaryAddressableObjectName, Is.EqualTo(row.SecondaryAddressableObjectName));
            Assert.That(readData.Street, Is.EqualTo(row.Street));
            Assert.That(readData.Locality, Is.EqualTo(row.Locality));
            Assert.That(readData.TownCity, Is.EqualTo(row.TownCity));
            Assert.That(readData.District, Is.EqualTo(row.District));
            Assert.That(readData.County, Is.EqualTo(row.County));
            Assert.That(readData.CategoryType, Is.EqualTo(row.CategoryType.ToString()));
            Assert.That(readData.__rowMarker__, Is.EqualTo(0)); // RecordStatus.Added
        });
    }
}