using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gen2toFabricDW
{
    public class Config
    {
        public string Gen2Connectionstring { get; set; }
        public string fabricEndpoint { get; set; }
        public string fabricWarehouse{ get; set; }
        public List<Table> Tables { get; set; } 
        public string SQLCreateExternalTable { get; set; }
        public string COPYINTO_Statement { get; set; }
        public int batchsize { get; set; }
        public string SPN_Application_ID { get; set; }
        public string SPN_Secret { get; set; }
        public string SPN_Tenant { get; set; }
        public string abfslocation { get; set; }
        public string httpslocation { get; set; }
        public string SASKey { get; set; }

    }

    public class Table
    {
        public string Name { get; set; }
        public string Schema { get; set; }
        public string DropDestinationTable { get; set; }
        public string CreateDestination { get; set; }
        public string TruncateDestination { get; set; }
        public string batchcolumn { get; set; }
        public string externalTableSchema { get; set; }
    }
}
