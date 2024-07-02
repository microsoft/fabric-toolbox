namespace FabricDWConnectionTest
{
    using Microsoft.Data.SqlClient;

     /*
        Pre-requisites to connect to Microsoft Fabric Data Warehouse with ADO.NET with .net core.
        To establish database connection, install Microsoft.Data.SqlClient nuget package.
        Microsoft.Data.SqlClient package is .Net core SDK used to connect to SQL database.
        This package takes Entra crendentials to connect to DW.
    */

    class ADOConnect_NC
    {
        public async Task Connect(string serverName, string databaseName, string tenantId, string clientId, string clientSecret)
        {
            var connectionString = $"Data Source={serverName};Initial Catalog={databaseName};Authentication=Active Directory Service Principal;User ID={clientId}@{tenantId};Password={clientSecret};";
            // Establishing the connection
            using (SqlConnection connection = new SqlConnection(connectionString))
            {
                try
                {
                    await connection.OpenAsync();
                    Console.WriteLine("Connection to Microsoft Fabric Data Warehouse using Microsoft.Data.SqlClient is successful!");
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
                catch (Exception ex)
                {
                    Console.WriteLine($"An error occurred: {ex.Message}");
                }
            }

        }
    }
}
