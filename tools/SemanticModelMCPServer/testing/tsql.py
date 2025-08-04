
import sys
import os
# Add the parent directory to Python path to import from core
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

import pyodbc
from core.auth import get_access_token


# Define the connection parameters
server = 'tcp:xpkymsttihxelp6vuo2w5ywt2u-rs36duahdqjerpvkpd5ywfjjyu.datawarehouse.fabric.microsoft.com,1433'  # Replace with your server name or IP
database = 'GeneratedData'  # Replace with your database name
username = 'your_username'  # Replace with your username
password = 'your_password'  # Replace with your password

access_token = bytes(get_access_token(),'utf-8')  # Get the access token


# Create the connection string
#connection_string = f"DRIVER={{ODBC Driver 18 for SQL Server}};SERVER={server};DATABASE={database};TrustedConnection=True;Authentication=ActiveDirectoryInteractive"
connection_string = f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={server};DATABASE={database};Encrypt=yes;Authentication=ActiveDirectoryManagedIdentity;AccessToken={access_token}"



try:
    # Establish the connection
    connection = pyodbc.connect(connection_string, attrs_before={1256: access_token})
    print("Connection successful!")

    # Create a cursor object to execute SQL queries
    cursor = connection.cursor()

    # Example query
    cursor.execute("SELECT TOP 5 * FROM date")  # Replace with your table name
    rows = cursor.fetchall()

    # Print the results
    for row in rows:
        print(row)

except pyodbc.Error as e:
    print("Error while connecting to SQL Server:", e)

finally:
    # Close the connection
    if 'connection' in locals() and connection:
        connection.close()
        print("Connection closed.")