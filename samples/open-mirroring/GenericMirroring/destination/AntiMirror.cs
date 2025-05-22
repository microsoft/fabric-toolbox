using Azure.Identity;
using Microsoft.Data.SqlClient;
using SQLMirroring;
using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace GenericMirroring.destination
{
    // This class is for adding an additional output to Mirroring.    
    // This allows for an additional destination for a SQL database
    internal class AntiMirror
    {
    
        static public SqlConnection GetSqlConnection(Root config)
        {
            string sqldbConnectionstring = config.FalseMirroredDB.ConnectionString;
            sqldbConnectionstring = sqldbConnectionstring.Replace("{DatabaseName}", config.FalseMirroredDB.DatabaseName);
            sqldbConnectionstring = sqldbConnectionstring.Replace("{ServerName}", config.FalseMirroredDB.ServerName);

            var credential = new ClientSecretCredential(config.FalseMirroredDB.SPN_Tenant, config.FalseMirroredDB.SPN_Application_ID, config.FalseMirroredDB.SPN_Secret);
            var accessToken = credential.GetToken(new Azure.Core.TokenRequestContext(new[] { "https://database.windows.net/.default" }));

            var sqlConnection = new SqlConnection(sqldbConnectionstring);
            sqlConnection.AccessToken = accessToken.Token;

            return sqlConnection;
        }

        static public void CreateSqlTableFromDataTableAsync(SqlConnection conn, DataTable dt, string primaryKey, string schema)
        {
            string sqlSchema = $"CREATE SCHEMA [{schema}]";

            StringBuilder sql = new StringBuilder();
            sql.Append($"if not exists(select * from sys.schemas where name = '{schema}')  BEGIN   exec('CREATE SCHEMA [{schema}]'); END; ");

            sql.Append($"IF OBJECT_ID('{dt.TableName}', 'U') IS NOT NULL DROP TABLE {dt.TableName}; ");
            sql.Append($"CREATE TABLE {dt.TableName} (");

            foreach (DataColumn column in dt.Columns)
            {
                string columnType = GetSqlType(column.DataType);
                sql.Append($"[{column.ColumnName}] {columnType}, ");
            }

            sql.Length -= 2; // Remove last comma
                             //sql.Append(");");
            sql.Append($", PRIMARY KEY ([{primaryKey}]));"); // Assuming "ID" is the primary key

            try
            {
                using (SqlCommand cmd = new SqlCommand(sqlSchema, conn))
                {
                    cmd.ExecuteNonQuery();
                }
            }
            catch (Exception ex)
            {
                string schemaError = ex.Message;
            }


            using (SqlCommand cmd = new SqlCommand(sql.ToString(), conn))
            {
                cmd.ExecuteNonQuery();
            }
        }

        static public void BulkInsertDataTableAsync(SqlConnection conn, DataTable dt)
        {
            using (SqlBulkCopy bulkCopy = new SqlBulkCopy(conn))
            {
                bulkCopy.DestinationTableName = dt.TableName;
                bulkCopy.WriteToServer(dt);
            }
        }

        static public void BulkInsertDataTableAsync(SqlConnection conn, DataTable dt, string primaryKey)
        {
            /* // using (SqlBulkCopy bulkCopy = new SqlBulkCopy(conn))
              {
                  bulkCopy.DestinationTableName = dt.TableName;
                  bulkCopy.WriteToServer(dt);
              }*/

            foreach (DataRow row in dt.Rows)
            {
                StringBuilder sql = new StringBuilder();
                sql.Append($"MERGE INTO {dt.TableName} AS Target ");
                sql.Append($"USING (SELECT @{primaryKey} AS {primaryKey}) AS Source ");
                sql.Append($"ON Target.{primaryKey} = Source.{primaryKey} ");
                sql.Append("WHEN MATCHED THEN UPDATE SET ");

                foreach (DataColumn column in dt.Columns)
                {
                    if (column.ColumnName != primaryKey)
                    {
                        sql.Append($"Target.[{column.ColumnName}] = @{column.ColumnName}, ");
                    }
                }

                sql.Length -= 2; // Remove last comma
                sql.Append(" WHEN NOT MATCHED THEN INSERT (");
                sql.Append(string.Join(", ", dt.Columns.Cast<DataColumn>().Select(c => $"[{c.ColumnName}]")));
                sql.Append(") VALUES (");
                sql.Append(string.Join(", ", dt.Columns.Cast<DataColumn>().Select(c => $"@{c.ColumnName}")));
                sql.Append(");");

                using (SqlCommand cmd = new SqlCommand(sql.ToString(), conn))
                {
                    foreach (DataColumn column in dt.Columns)
                    {
                        cmd.Parameters.AddWithValue($"@{column.ColumnName}", row[column] ?? DBNull.Value);
                    }
                    cmd.ExecuteNonQuery();
                }
            }

        }

        static string GetSqlType(Type type)
        {
            if (type == typeof(int)) return "INT";
            if (type == typeof(string)) return "NVARCHAR(MAX)";
            if (type == typeof(DateTime)) return "DATETIME2";
            if (type == typeof(bool)) return "BIT";
            if (type == typeof(decimal)) return "DECIMAL(18,2)";
            return "NVARCHAR(MAX)"; // Default fallback
        }
    }
}
