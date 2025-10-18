using System.ComponentModel;
using System.Globalization;
using System.Runtime.CompilerServices;
using CsvHelper;
using CsvHelper.Configuration;

namespace OneLakeOpenMirroringExample.UkHousePrices;

/// <summary>
/// CSV parser for price paid data: https://www.gov.uk/guidance/about-the-price-paid-data#explanations-of-column-headers-in-the-ppd
/// </summary>
public class PricePaidCsvParser
{
    public async IAsyncEnumerable<PricePaid> ParseAsync(TextReader textReader, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var config = new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            HasHeaderRecord = false,
        };
        using var csv = new CsvReader(textReader, config);
        csv.Context.RegisterClassMap<PricePaidMap>();
        await foreach (var pricePaid in csv.GetRecordsAsync<PricePaid>(cancellationToken))
        {
            yield return pricePaid;
        } 
    }


    // ReSharper disable once ClassNeverInstantiated.Local
    private sealed class PricePaidMap : ClassMap<PricePaid>
    {
        public PricePaidMap()
        {
            Map(m => m.TransactionId).Index(0);
            Map(m => m.Price).Index(1);
            Map(m => m.DateOfTransfer).Index(2).TypeConverterOption.Format("yyyy-MM-dd HH:mm");
            Map(m => m.Postcode).Index(3);
            Map(m => m.PropertyType).Index(4).TypeConverter(new EnumTypeConverter<PropertyType>(
                ("D", PropertyType.Detached),
                    ("S", PropertyType.SemiDetached),
                    ("T", PropertyType.Terraced),
                    ("F", PropertyType.FlatMaisonette),
                    ("O", PropertyType.Other)));
            Map(m => m.IsNew).Index(5)
                .TypeConverterOption.BooleanValues(true, true, "Y")
                .TypeConverterOption.BooleanValues(false, false, "N");
            Map(m => m.DurationType).Index(6).TypeConverter(new EnumTypeConverter<DurationType>(
                ("F", DurationType.Freehold),
                    ("L", DurationType.Leasehold),
                    ("C", DurationType.Commonhold),
                    ("U", DurationType.Unknown)));
            Map(m => m.PrimaryAddressableObjectName).Index(7);
            Map(m => m.SecondaryAddressableObjectName).Index(8);
            Map(m => m.Street).Index(9);
            Map(m => m.Locality).Index(10);
            Map(m => m.TownCity).Index(11);
            Map(m => m.District).Index(12);
            Map(m => m.County).Index(13);
            Map(m => m.CategoryType).Index(14).TypeConverter(new EnumTypeConverter<CategoryType>(
                ("A", CategoryType.StandardPricePaid),
                    ("B", CategoryType.AdditionalPricePaid)));
            Map(m => m.RecordStatus).Index(15).Optional().TypeConverter(new EnumTypeConverter<RecordStatus>(
                ("A", RecordStatus.Added),
                    ("C", RecordStatus.Changed),
                    ("D", RecordStatus.Deleted),
                    ("U", RecordStatus.Unknown)));
        }
    }
    
    private class EnumTypeConverter<T> : CsvHelper.TypeConversion.EnumConverter
        where T : struct, Enum
    {
        private readonly Dictionary<string, (string From, T To)> conversions;

        public EnumTypeConverter(params (string From, T To)[] conversions) : base(typeof(T))
        {
            this.conversions = conversions.ToDictionary(x => x.From);
        }
        
        public override object ConvertFromString(string? text, IReaderRow row, MemberMapData memberMapData)
        {
            if (text == null) throw new ArgumentNullException(nameof(text));
            if (!conversions.TryGetValue(text, out var enumValueMap))
            {
                throw new InvalidEnumArgumentException($"Cannot find '{text}' for enum type {typeof(T).Name}.");
            }
            return enumValueMap.To;
        }
    }
}
