using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;

namespace SQLMirroring
{
    public class DatabaseConfig
    {
        public string ConnectionString { get; set; }
        public string Type { get; set; }

        public string ChangeTrackingEnabled { get; set; }

        public int syncVersion { get; set; }
        public List<TableConfig> Tables { get; set; }

        public string LocalLocationforTables { get; set; }
        public string DatabaseName { get; set; }
        public string ChangeTrackingSQL { get; set; }
        public string ChangeTrackingTable { get; set; }

        public string Highwatermark { get; set; }
        public string HighwatermarkSQL { get; set; }

        public string ChangeIncrementalSQL { get; set; }

        public string FullDataExtractQuery { get; set; }
    }

    public class TableConfig
    {
        public string TableName { get; set; }
        public string SchemaName { get; set; }
        public string Status { get; set; }

        public DateTime LastUpdate { get; set; }
        public int SecondsBetweenChecks { get; set; }

        public string KeyColumn { get; set; }
        public string OtherColumns { get; set; }
        public string AdditionalColumns { get; set; }

        public string DeltaVersion { get; set; }

        public string SoftDelete { get; set; }
        
    }

    public class Root
    {
        public List<DatabaseConfig> SQLChangeTrackingConfig { get; set; }

        public ExcelConfig ExcelMirroringConfig { get; set; }

        public List<UploadDetails> uploadDetails { get; set; }

        public string LocationLogging { get; set; }

        public AccessConfig AccessMirroringConfig { get; set; }

        public CSVConfig CSVMirroringConfig { get; set; }
        
        public Gen2Config Gen2MirroringConfig { get; set; }

        public SharepointConfig SharepointMirroringConfig { get; set; }     

        public Root()
        {
            uploadDetails = new List<UploadDetails>();
        }
    }

    public  class UploadDetails
    {
        public string SPN_Application_ID { get; set; }
        public string SPN_Secret { get; set; }
        public string SPN_Tenant { get; set; }
        public string LandingZone { get; set; }

        public string PathtoAZCopy { get; set; }
    }

    public class ExcelConfig
    {
        public string folderToWatch { get; set; }
        public string outputFolder { get; set; }

    }

    public class CSVConfig
    {
        public string folderToWatch { get; set; }
        public string outputFolder { get; set; }

    }

    public class AccessConfig
    {
        public string folderToWatch { get; set; }
        public string outputFolder { get; set; }

        public Boolean IncludeFolders { get; set; }

    }

    public class Gen2Config
    {
        public string ConnectionString { get; set; }
    }

    public class SharepointConfig
    {

    }

}
