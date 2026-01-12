namespace OneLakeOpenMirroringExample.UkHousePrices;

public record PricePaid
{
    public required string TransactionId { get; init; }
    public required double Price { get; init; }
    public required DateTime DateOfTransfer { get; init; }
    public required string Postcode { get; init; }
    public required PropertyType PropertyType { get; init; }
    public required bool IsNew { get; init; }
    public required DurationType DurationType { get; init; }
    public required string PrimaryAddressableObjectName { get; init; }
    public required string SecondaryAddressableObjectName { get; init; }
    public required string Street { get; init; }
    public required string Locality { get; init; }
    public required string TownCity { get; init; }
    public required string District { get; init; }
    public required string County { get; init; }
    public required CategoryType CategoryType { get; init; }
    public required RecordStatus? RecordStatus { get; init; }
}

public enum RecordStatus
{
    Added,
    Changed,
    Deleted,
    Unknown
}

public enum CategoryType
{
    StandardPricePaid,
    AdditionalPricePaid
}

public enum DurationType
{
    Freehold,
    Leasehold,
    Commonhold,
    Unknown
}

public enum PropertyType
{
    Detached,
    SemiDetached,
    Terraced,
    FlatMaisonette,
    Other
}