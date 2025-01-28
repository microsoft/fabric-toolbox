

namespace FabricDWConnectionTest
{
    class Program
    {
        private static readonly string TenantId = "";
         private static readonly string ClientId = "";
        private static readonly string ClientSecret = "";
        private static readonly string ServerName = "";
        private static readonly string DatabaseName = "";

        static async Task Main(string[] args)
        {
            try
            {
                ADOConnect_NC _netcore_microsoft_data_sqlClient = new ADOConnect_NC();
                await _netcore_microsoft_data_sqlClient.Connect(ServerName, DatabaseName, TenantId, ClientId, ClientSecret);

                ADOConnect_NF _netframework_system_data_sqlClient = new ADOConnect_NF();
                await _netframework_system_data_sqlClient.Connect(ServerName, DatabaseName, TenantId, ClientId, ClientSecret);

                OLEDBConnect _netframework_windows_oledb_client = new OLEDBConnect();
                await _netframework_windows_oledb_client.Connect(ServerName, DatabaseName, TenantId, ClientId, ClientSecret);
                
            }
            
            catch (Exception ex)
            {
                Console.WriteLine($"An error occurred: {ex.Message}");
            }
        }

        
    }
}
