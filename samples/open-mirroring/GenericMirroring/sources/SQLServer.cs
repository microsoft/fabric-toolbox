using Microsoft.Data.SqlClient;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using SQLMirroring;
using System;
using Microsoft.Data.SqlClient;
using static System.Net.Mime.MediaTypeNames;
using System.IO;
using System.Runtime.Intrinsics.Arm;
using System.Data;


namespace GenericMirroring.sources
{
    public static class SQLServer
    {
        public static SqlDataReader ExecuteRS(string connectionString, string query)
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

                        // Execute the command and process the results
                        /*  using (reader = command.ExecuteReader())
                          {
                              // Loop through the rows
                              while (reader.Read())
                              {
                                  // Example: Access data by column index
                                  Log($"Column1: {reader[0]}, Column2: {reader[1]}");
                              }
                         using var tempFile = new FileStream(parquetFilePath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None, 1024 * 256, FileOptions.DeleteOnClose);

                    var sqr = ExecuteRSWritePQ(connectionString, extractQuery, tempFile);

                    if (sqr != null) {

                         ParquetWrite.WriteDatareaderToParquet(sqr, tempFile);
                      }


                        } */
                        reader = command.ExecuteReader();
                    }
                }
                return reader;
            }
            catch (Exception ex)
            {
                // Handle any errors that may have occurred
                Logging.Log($"An error occurred: {ex.Message}");
                return null;
            }
        }
        public static bool ExecuteRSWritePQ(string connectionString, string query, string filePath)
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
                        reader = command.ExecuteReader();

                        if (reader.HasRows)
                        {
                            ParquetDump.WriteDataTableToParquet(reader, filePath);
                            return true;
                        }
                        else
                        {
                            return false;
                        }

                    }
                }
            }
            catch (Exception ex)
            {
                // Handle any errors that may have occurred
                Logging.Log($"An error occurred: {ex.Message}");
                return false;
            }
        }
        public static void ExecuteNonQuery(string connectionString, string query)
        {
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
                        command.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception ex)
            {
                // Handle any errors that may have occurred
                Logging.Log($"ExecuteNonQuery:An error occurred: {ex.Message}");
            }
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
                        reader = command.ExecuteScalar().ToString();
                    }
                }
                return reader;
            }
            catch (Exception ex)
            {
                // Handle any errors that may have occurred
                Logging.Log($"An error occurred: {ex.Message}");
                return string.Empty;
            }
        }
    }
}
