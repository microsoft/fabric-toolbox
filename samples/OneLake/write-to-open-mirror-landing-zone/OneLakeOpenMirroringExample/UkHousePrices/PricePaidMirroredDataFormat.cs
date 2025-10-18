using System.ComponentModel;
using Parquet.Schema;
using Parquet.Serialization;

namespace OneLakeOpenMirroringExample.UkHousePrices;

public class PricePaidMirroredDataFormat
{
    public static IAsyncEnumerable<PricePaidMirroredDataFormat> Read(Stream stream) =>
        ParquetSerializer.DeserializeAllAsync<PricePaidMirroredDataFormat>(stream);

    public static PricePaidMirroredDataFormat Create(PricePaid pricePaid)
    {
        if (pricePaid.RecordStatus == null)
            throw new InvalidEnumArgumentException(
                "Monthly Price Paid Mirrored Data Format requires a RecordStatus");
        var recordMarker = pricePaid.RecordStatus.Value switch
        {
            RecordStatus.Added => 0,
            RecordStatus.Changed => 1,
            RecordStatus.Deleted => 2,
            _ => throw new InvalidEnumArgumentException("Unexpected RecordStatus value")
        };

        return new PricePaidMirroredDataFormat
        {
            TransactionId = pricePaid.TransactionId,
            Price = pricePaid.Price,
            DateOfTransfer = pricePaid.DateOfTransfer,
            Postcode = pricePaid.Postcode,
            PropertyType = pricePaid.PropertyType.ToString(),
            OldNew = pricePaid.IsNew,
            Duration = pricePaid.DurationType.ToString(),
            PrimaryAddressableObjectName = pricePaid.PrimaryAddressableObjectName,
            SecondaryAddressableObjectName = pricePaid.SecondaryAddressableObjectName,
            Street = pricePaid.Street,
            Locality = pricePaid.Locality,
            TownCity = pricePaid.TownCity,
            District = pricePaid.District,
            County = pricePaid.County,
            CategoryType = pricePaid.CategoryType.ToString(),
            __rowMarker__ = recordMarker
        };
    }

    public string TransactionId { get; private init; } = null!;
    public double Price { get; private init; }
    public DateTime DateOfTransfer { get; private init; }
    public string Postcode { get; private init; } = null!;
    public string PropertyType { get; private init; } = null!;
    public bool OldNew { get; private init; }
    public string Duration { get; private init; } = null!;
    public string PrimaryAddressableObjectName { get; private init; } = null!;
    public string SecondaryAddressableObjectName { get; private init; } = null!;
    public string Street { get; private init; } = null!;
    public string Locality { get; private init; } = null!;
    public string TownCity { get; private init; } = null!;
    public string District { get; private init; } = null!;
    public string County { get; private init; } = null!;
    public string CategoryType { get; private init; } = null!;

    // ReSharper disable once InconsistentNaming
    public int __rowMarker__ { get; private init; }

    public static string[] KeyColumns =>
    [
        "TransactionId"
    ];

    public static ParquetSchema CreateSchema() =>
        new(
            new DataField<string>("TransactionId"),
            new DataField<double>("Price"),
            new DateTimeDataField("DateOfTransfer", DateTimeFormat.Date),
            new DataField<string>("Postcode"),
            new DataField<string>("PropertyType"),
            new DataField<bool>("OldNew"),
            new DataField<string>("Duration"),
            new DataField<string>("PrimaryAddressableObjectName"),
            new DataField<string>("SecondaryAddressableObjectName"),
            new DataField<string>("Street"),
            new DataField<string>("Locality"),
            new DataField<string>("TownCity"),
            new DataField<string>("District"),
            new DataField<string>("County"),
            new DataField<string>("CategoryType"),
            new DataField<int>("__rowMarker__") // Note: must be the last column in the list
        );
}