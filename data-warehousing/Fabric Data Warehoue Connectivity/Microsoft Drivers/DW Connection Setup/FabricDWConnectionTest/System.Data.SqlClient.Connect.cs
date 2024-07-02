namespace FabricDWConnectionTest
{
    using System.Data.SqlClient;
    using Microsoft.Identity.Client;

    /*
        Pre-requisites to connect to Microsoft Fabric Data Warehouse with ADO.NET with .net framework
        To establish ADO.NET connection, install Microsoft.Identity.Client and System.Data.SqlClient nuget packages.
        Microsoft.Identity.Client package is used to create access token
        System.Data.SqlClient package is .Net Framework SDK used to connect to SQL database
    */
    class ADOConnect_NF
    {
        public async Task Connect(string serverName, string databaseName, string tenantId, string clientId, string clientSecret)
        {
            string accessToken = await GetAccessTokenAsync(tenantId, clientId, clientSecret);
            string ConnectionString = $"Data Source={serverName}; Initial Catalog={databaseName};";
            SqlConnection connection = new SqlConnection(ConnectionString);
            connection.AccessToken = accessToken;
                            
            await connection.OpenAsync();
            Console.WriteLine("Connection to Microsoft Fabric Data Warehouse using System.Data.SqlClient is successful!");

            // Execute a simple query to test the connection
            using (SqlCommand command = new SqlCommand("select * from dbo.employee", connection))
            {
                using (SqlDataReader reader = await command.ExecuteReaderAsync())
                {
                    Console.WriteLine("Reading Name of employees available in employee table...");
                    while (await reader.ReadAsync())
                    {
                        Console.WriteLine(reader[0]);
                    }
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
