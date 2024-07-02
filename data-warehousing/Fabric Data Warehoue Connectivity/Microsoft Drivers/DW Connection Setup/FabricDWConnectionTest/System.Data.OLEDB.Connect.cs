namespace FabricDWConnectionTest
{
    using System;
    using System.Data.OleDb;
    using System.Threading.Tasks;
    using Microsoft.Identity.Client;

    /*
        Pre-requisites to connect to Microsoft Fabric Data Warehouse with OLEDB Driver
        OLEDB connection can be configured on Windows only.
        To establish OLEDB connection, download OLEDB driver - https://learn.microsoft.com/en-us/sql/connect/oledb/download-oledb-driver-for-sql-server?view=sql-server-ver16
        Note that provider must be MSOLEDBSQL19. MSOLEDBSQL is deprecated and should not be used.
        Once installed, install system.data.oledb nuget package
    */
    class OLEDBConnect
    {
        public async Task Connect(string serverName, string databaseName, string tenantId, string clientId, string clientSecret)
        {
            string accessToken = await GetAccessTokenAsync(tenantId, clientId, clientSecret);
            //string connectionString = $"Provider=MSOLEDBSQL;Data Source={serverName};Initial Catalog={databaseName};Persist Security Info=False;Encrypt=True;TrustServerCertificate=False;UID=;PWD={accessToken}";
            string connectionString = $"Provider=MSOLEDBSQL19;Data Source={serverName};Initial Catalog={databaseName};Access Token={accessToken}";
            using (OleDbConnection connection = new OleDbConnection())
            {
                connection.ConnectionString = connectionString;
                try
                {
                    // Open the connection
                    await connection.OpenAsync();
                    Console.WriteLine("Connection to Microsoft Fabric Data Warehouse using System.Data.OLEDB is successful!");
                    // Execute queries or perform database operations here
                    // Create the command
                    using (OleDbCommand command = new OleDbCommand("select * from dbo.employee", connection))
                    {
                        // Execute the command and read the results
                        using (OleDbDataReader reader = command.ExecuteReader())
                        {
                            Console.WriteLine("Reading Name of employees available in employee table...");
                            while (await reader.ReadAsync())
                            {
                                // Replace column names with actual names from your table
                                Console.WriteLine(reader[0]);
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"An error occurred: {ex.Message}");
                }
            } 
        }

        private static async Task<string> GetAccessTokenAsync(string tenantId, string clientId, string clientSecret)
        {
            IConfidentialClientApplication app = ConfidentialClientApplicationBuilder.Create(clientId)
                .WithClientSecret(clientSecret)
                .WithAuthority(new Uri($"https://login.microsoftonline.com/{tenantId}"))
                .Build();

            string[] scopes = new string[] { "https://database.windows.net/.default" };

            AuthenticationResult result = await app.AcquireTokenForClient(scopes).ExecuteAsync();
            return result.AccessToken;
        }
    }
}
