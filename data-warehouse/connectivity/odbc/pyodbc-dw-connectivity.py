import pyodbc

tenant_id = ""
client_id = ""
client_secret = ""
resource = "https://database.windows.net/"

# Define your SQL Server details
server = "<>.datawarehouse.fabric.microsoft.com"
database = ""
service_principal_id = f"{client_id}@{tenant_id}"

# Create a connection string
conn_str = (
    f"DRIVER={{ODBC Driver 18 for SQL Server}};"
    f"SERVER={server};"
    f"DATABASE={database};"
    f"UID={service_principal_id};"
    f"PWD={client_secret};"
    f"Authentication=ActiveDirectoryServicePrincipal"
 
)
# print connection string
print (conn_str)

# Connect to the SQL Server
conn = pyodbc.connect(conn_str)

# Now you can use `conn` to interact with your database
# Create a cursor
cursor = conn.cursor()

# Define your query
query = "select * from dbo.employee;"

# Execute the query
cursor.execute(query)

# Fetch all rows from the last executed statement
rows = cursor.fetchall()

# Print all rows
for row in rows:
    print(row)