using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace ExcelDemo
{
    public  class AppConfig
    {
        public string folderToWatch { get; set; }
        public string azcopyFolder { get; set; }
        public string azcopyPath { get; set; }
        public string outputFolder { get; set; }
        public string SPN_Application_ID { get; set; }
        public string SPN_Secret { get; set; }
        public string SPN_Tenant_ID { get; set; }
        public string MirrorLandingZone { get; set; }

    }
}
