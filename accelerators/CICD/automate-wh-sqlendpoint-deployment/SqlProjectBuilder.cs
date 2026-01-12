using System.Text;
using System.Xml;

namespace AutomateWarehouseProject;

// -------------------------------------------------------------
// SQL Project Builder Module
// -------------------------------------------------------------
internal static class SqlProjectBuilder
{
    public static void CreateProject(string sqlprojPath, string projectName, HashSet<string> warehouseRefs, string workingDir)
    {
        Console.WriteLine("=== Creating SQL Project (.sqlproj) ===");

        string projectGuid = Guid.NewGuid().ToString("B").ToUpper();
        string baseXml = CreateBaseProjectXml(projectName, projectGuid);
        
        var doc = new XmlDocument();
        doc.LoadXml(baseXml);
        
        XmlNode projectNode = doc.DocumentElement ?? throw new Exception("Invalid .sqlproj template.");
        
        AddWarehouseReferences(doc, projectNode, warehouseRefs, workingDir);
        WriteProjectFiles(sqlprojPath, doc);
        
        Console.WriteLine($"  + SQL project created: {sqlprojPath}");
        Console.WriteLine("=== SQL Project creation complete ===");
    }
    
    private static string CreateBaseProjectXml(string projectName, string projectGuid)
    {
        return $@"<?xml version=""1.0"" encoding=""utf-8""?>
<Project DefaultTargets=""Build"">
  <Sdk Name=""Microsoft.Build.Sql"" Version=""2.0.0"" />

  <PropertyGroup>
    <Name>{projectName}</Name>
    <ProjectGuid>{projectGuid}</ProjectGuid>
    <DSP>Microsoft.Data.Tools.Schema.Sql.SqlDwUnifiedDatabaseSchemaProvider</DSP>
    <ModelCollation>1033, CI</ModelCollation>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include=""Microsoft.SqlServer.Dacpacs.FabricDw"">
      <SuppressMissingDependenciesErrors>True</SuppressMissingDependenciesErrors>
      <GeneratePathProperty>True</GeneratePathProperty>
      <DatabaseVariableLiteralValue>master</DatabaseVariableLiteralValue>
      <Version>170.0.2</Version>
    </PackageReference>
  </ItemGroup>
</Project>";
    }
    
    private static void AddWarehouseReferences(XmlDocument doc, XmlNode projectNode, HashSet<string> warehouseRefs, string workingDir)
    {
        foreach (string w in warehouseRefs.OrderBy(x => x))
        {
            string variableName = $"{w}_ref";
            string variableValue = w;
            
            // Add SQLCMD Variable
            XmlElement sqlCmdGroup = doc.CreateElement("ItemGroup");
            projectNode.AppendChild(sqlCmdGroup);
            
            XmlElement varElem = doc.CreateElement("SqlCmdVariable");
            varElem.SetAttribute("Include", variableName);
            
            XmlElement valElem = doc.CreateElement("Value");
            valElem.InnerText = variableValue;
            varElem.AppendChild(valElem);
            
            XmlElement defaultElem = doc.CreateElement("DefaultValue");
            defaultElem.InnerText = variableValue;
            varElem.AppendChild(defaultElem);
            
            sqlCmdGroup.AppendChild(varElem);
            
            // Add Artifact Reference
            XmlElement artifactGroup = doc.CreateElement("ItemGroup");
            projectNode.AppendChild(artifactGroup);
            
            XmlElement artifactElem = doc.CreateElement("ArtifactReference");
            string dacpacPath = Path.Combine(workingDir, $"{w}.dacpac");
            artifactElem.SetAttribute("Include", dacpacPath);
            
            XmlElement suppressElem = doc.CreateElement("SuppressMissingDependenciesErrors");
            suppressElem.InnerText = "True";
            artifactElem.AppendChild(suppressElem);
            
            XmlElement dbVarElem = doc.CreateElement("DatabaseSqlCmdVariable");
            dbVarElem.InnerText = variableName;
            artifactElem.AppendChild(dbVarElem);
            
            artifactGroup.AppendChild(artifactElem);
        }
    }
    
    private static void WriteProjectFiles(string sqlprojPath, XmlDocument doc)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(sqlprojPath)!);
        
        using (var writer = new XmlTextWriter(sqlprojPath, Encoding.UTF8))
        {
            writer.Formatting = Formatting.Indented;
            doc.Save(writer);
        }
        
        // Create global.json for SDK consistency
        string projectDir = Path.GetDirectoryName(sqlprojPath)!;
        string globalJsonPath = Path.Combine(projectDir, "global.json");
        
        string globalJsonContent = @"{
  ""sdk"": {
    ""version"": ""8.0.100"",
    ""rollForward"": ""latestFeature"",
    ""allowPrerelease"": false
  }
}";
        
        File.WriteAllText(globalJsonPath, globalJsonContent, Encoding.UTF8);
        Console.WriteLine($"  + Created global.json for SDK version consistency");
    }
}