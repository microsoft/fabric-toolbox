using System.Text;

namespace AutomateWarehouseProject;

// -------------------------------------------------------------
// DACPAC Extraction Module
// -------------------------------------------------------------
internal static class DacpacExtractor
{
    public static void Extract(string server, string database, string accessToken, string dacpacPath, string? sqlPackagePath = null)
    {
        var sqlPackageExe = string.IsNullOrWhiteSpace(sqlPackagePath) ? "sqlpackage" : sqlPackagePath;
        
        var args = new StringBuilder();
        args.Append($"/Action:Extract ");
        args.Append($"/SourceServerName:\"{server}\" ");
        args.Append($"/SourceDatabaseName:\"{database}\" ");
        args.Append($"/TargetFile:\"{dacpacPath}\" ");
        args.Append($"/AccessToken:\"{accessToken}\" ");
        args.Append($"/p:ExtractApplicationScopedObjectsOnly=false ");
        args.Append($"/p:IgnoreUserLoginMappings=true ");
        args.Append($"/p:IgnorePermissions=true ");
        args.Append($"/p:IgnoreExtendedProperties=true ");

        ProcessRunner.Run(sqlPackageExe, args.ToString());
        Console.WriteLine($"Extracted DACPAC: {dacpacPath}");
    }
}