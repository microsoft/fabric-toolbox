namespace OneLakeOpenMirroringExample;

public record OpenMirroredTableId(string WorkspaceName, string MirroredDatabaseName, string TableName)
{
    public string? Schema { get; init; } = null;

    public string GetTablePath() => Schema == null
            ? $"{MirroredDatabaseName}/Files/LandingZone/{TableName}/"
            : $"{MirroredDatabaseName}/Files/LandingZone/{Schema}.schema/{TableName}/";
}