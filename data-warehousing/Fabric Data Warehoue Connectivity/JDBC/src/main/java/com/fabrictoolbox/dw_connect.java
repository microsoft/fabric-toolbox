package com.fabrictoolbox;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import com.microsoft.sqlserver.jdbc.SQLServerDataSource;


public class dw_connect 
{
    
    public static void main( String[] args ) throws Exception
    {
        // principal id is constructed using client_id@tenant_id
        String principalId = ""; // Replace with your Microsoft Entra service principal ID.
        String principalSecret = ""; // Replace with your Microsoft Entra principal secret.

        SQLServerDataSource ds = new SQLServerDataSource();
        ds.setServerName(""); // Replace with your server name
        ds.setDatabaseName(""); // Replace with your database
        ds.setAuthentication("ActiveDirectoryServicePrincipal");
        ds.setUser(principalId); // setAADSecurePrincipalId for JDBC Driver 9.4 and below
        ds.setPassword(principalSecret); // setAADSecurePrincipalSecret for JDBC Driver 9.4 and below

        try (Connection connection = ds.getConnection();
             Statement stmt = connection.createStatement();
             ResultSet rs = stmt.executeQuery("select * from <>;")) {
            System.out.printf("%-10s %-20s %-30s%n", "Name", "Age", "JobTitle");   
            while (rs.next()) {
                System.out.printf("%-10s %-20s %-30s%n", rs.getString(1), rs.getString(2), rs.getString(3));
            }
        }        
     }
}


