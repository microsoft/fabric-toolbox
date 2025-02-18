using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Azure.Identity;
using Microsoft.Data.SqlClient;

namespace Gen2toFabricDW
{
    public static class SQLServer
    {
        static void Log(string Message)
        {
            Logging.Log(Message);       
        }

        public static SqlDataReader ExecuteRS(string connectionString, string query, ref string createTableSQL, ref string  DropableSQL, Table t)
        {
            try
            {

                SqlDataReader reader;
                // Create and open a connection to SQL Server
                using (SqlConnection connection = new SqlConnection(connectionString))
                {
                    connection.Open();
                    //Log("Connection to SQL Server successful.");

                    // Create a command object
                    using (SqlCommand command = new SqlCommand(query, connection))
                    {
                        command.CommandTimeout = 0;
                       using (reader = command.ExecuteReader())
                          {
    
                              while (reader.Read())
                              {
                                  // Example: Access data by column index
                                 

                                if (reader[0].ToString().ToLower() == t.Schema.ToLower() 
                                    && reader[1].ToString().ToLower() == t.Name.ToLower())
                                {
                                    Log($"Schema: {reader[0]}, Table: {reader[1]}");
                                    createTableSQL = reader["Script"].ToString();
                                    DropableSQL = reader["DropStatement"].ToString();
                                }
                                }
                            }
  
                    }
                }
                return reader;
            }
            catch (Exception ex)
            {
                // Handle any errors that may have occurred
                Log($"An error occurred: {ex.Message}");
                return null;
            }
        }
        public static string ExecuteNonQuery(string connectionString, string query,  Boolean ignoreerrors= false)
        {
            string elapsedTime = "";
            try
            {
                // Create and open a connection to SQL Server
                using (SqlConnection connection = new SqlConnection(connectionString))
                {
                    
                    connection.Open();
                    //Log("ExecuteNonQuery:Connection to SQL Server successful.");

                    // Create a command object
                    using (SqlCommand command = new SqlCommand(query, connection))
                    {
                        command.CommandTimeout = 0;

                       // Log("Starting Extract...");

                       Stopwatch stopWatch = new Stopwatch();
                        stopWatch.Start();
                        command.ExecuteNonQuery();
                        stopWatch.Stop();
                        TimeSpan ts = stopWatch.Elapsed;
                        elapsedTime = String.Format("{0:00}:{1:00}:{2:00}.{3:00}",
               ts.Hours, ts.Minutes, ts.Seconds,
               ts.Milliseconds / 10);
                       // Log("Extract data:  RunTime " + elapsedTime);

                    }
                }
            }
            catch (Exception ex)
            {
                // Handle any errors that may have occurred
               if (!ignoreerrors) Log($"ExecuteNonQuery:An error occurred: {ex.Message}");
            }
            return elapsedTime;
        }
        public static string ExecuteScalar(string connectionString, string query)
        {
            try
            {

                string reader;
                // Create and open a connection to SQL Server
                using (SqlConnection connection = new SqlConnection(connectionString))
                {
                    connection.Open();
                    //Log("Connection to SQL Server successful.");

                    // Create a command object
                    using (SqlCommand command = new SqlCommand(query, connection))
                    {

                        command.CommandTimeout = 0;
                            reader = command.ExecuteScalar().ToString();
                    }
                }
                return reader;
            }
            catch (Exception ex)
            {
                // Handle any errors that may have occurred
                Log($"An error occurred: {ex.Message}");
                return string.Empty;
            }
        }

        public static void ExecuteCopyInto(string tenantId, string clientId, string clientSecret, string sqlWarehouseServer, string databaseName, string sql)
        {
          

            //    string connectionString = $"Server={sqlWarehouseServer};Database={databaseName};Authentication=Active Directory Service Principal;Encrypt=True;TrustServerCertificate=False;";
            string connectionString = $"Server={sqlWarehouseServer};Database={databaseName};Authentication=ActiveDirectoryInteractive;Encrypt=True;TrustServerCertificate=False;";
            //var clientSecretCredential = new ClientSecretCredential(tenantId, clientId, clientSecret);
            var defaultCredential = new DefaultAzureCredential();

            try
            {
                // Get an Access Token
                //string accessToken = clientSecretCredential.GetToken(
                //    new Azure.Core.TokenRequestContext(new[] { "https://database.windows.net/.default" })
                //).Token;

//                string accessToken = defaultCredential.GetToken(
//    new Azure.Core.TokenRequestContext(new[] { "https://database.windows.net/.default" })
//).Token;

                // Add the Access Token to the SQL connection
                using (var connection = new SqlConnection(connectionString))
                {
                    //connection.AccessToken = accessToken;

                    // Open the connection
                    connection.Open();
                    //Console.WriteLine("Connection successful!");

                    // Execute a test query
                    using (var command = new SqlCommand(sql, connection))
                    {
                        command.CommandTimeout = 0;
                        Stopwatch stopWatch = new Stopwatch();
                        stopWatch.Start();
                        command.ExecuteNonQuery();                    
                        stopWatch.Stop();
                    TimeSpan ts = stopWatch.Elapsed;
                    string elapsedTime = String.Format("{0:00}:{1:00}:{2:00}.{3:00}",
           ts.Hours, ts.Minutes, ts.Seconds,
           ts.Milliseconds / 10);
                        Log("ExecuteCopyInto:  RunTime " + elapsedTime);
                    }
                }
            }
            catch (Exception ex)
            {
                Log($"Error: {ex.Message}");
            }
        }

        public static string ExecuteFabric( string sqlWarehouseServer, string databaseName, string sql, Boolean ignoreerrors= false)
        {
            string elapsedTime = ""; ;

            //    string connectionString = $"Server={sqlWarehouseServer};Database={databaseName};Authentication=Active Directory Service Principal;Encrypt=True;TrustServerCertificate=False;";
            string connectionString = $"Server={sqlWarehouseServer};Database={databaseName};Authentication=ActiveDirectoryInteractive;Encrypt=True;TrustServerCertificate=False;";
            //var clientSecretCredential = new ClientSecretCredential(tenantId, clientId, clientSecret);
            //var defaultCredential = new DefaultAzureCredential();

            try
            {
              
                // Add the Access Token to the SQL connection
                using (var connection = new SqlConnection(connectionString))
                {
                    //connection.AccessToken = accessToken;

                    // Open the connection
                    connection.Open();
                    //Console.WriteLine("Connection successful!");

                    // Execute a test query
                    using (var command = new SqlCommand(sql, connection))
                    {
                        command.CommandTimeout = 0;
                        Stopwatch stopWatch = new Stopwatch();
                        stopWatch.Start();
                        command.ExecuteNonQuery();
                        stopWatch.Stop();
                        TimeSpan ts = stopWatch.Elapsed;
                         elapsedTime = String.Format("{0:00}:{1:00}:{2:00}.{3:00}",
               ts.Hours, ts.Minutes, ts.Seconds,
               ts.Milliseconds / 10);
                       // Log("ExecuteCopyInto:  RunTime " + elapsedTime);
                    }
                }
            }
            catch (Exception ex)
            {
                if (!ignoreerrors) Log($"ExecuteFabric:An error occurred: {ex.Message}");
            }

            return elapsedTime;
        }
        public static string ExecuteScalarFabric(string sqlWarehouseServer, string databaseName, string sql, Boolean ignoreerrors = false)
        {
            string elapsedTime = ""; ;

            //    string connectionString = $"Server={sqlWarehouseServer};Database={databaseName};Authentication=Active Directory Service Principal;Encrypt=True;TrustServerCertificate=False;";
            string connectionString = $"Server={sqlWarehouseServer};Database={databaseName};Authentication=ActiveDirectoryInteractive;Encrypt=True;TrustServerCertificate=False;";
            //var clientSecretCredential = new ClientSecretCredential(tenantId, clientId, clientSecret);
            //var defaultCredential = new DefaultAzureCredential();

            try
            {

                // Add the Access Token to the SQL connection
                using (var connection = new SqlConnection(connectionString))
                {
                    //connection.AccessToken = accessToken;

                    // Open the connection
                    connection.Open();
                    //Console.WriteLine("Connection successful!");

                    // Execute a test query
                    using (var command = new SqlCommand(sql, connection))
                    {
                        command.CommandTimeout = 0;
                        elapsedTime = command.ExecuteScalar().ToString();
                        // Log("ExecuteCopyInto:  RunTime " + elapsedTime);
                    }
                }
            }
            catch (Exception ex)
            {
                if (!ignoreerrors) Log($"ExecuteFabric:An error occurred: {ex.Message}");
            }

            return elapsedTime;
        }

    }
}
