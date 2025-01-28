/*
=============================================
Script Fabric DW SQL Security
=============================================

This script scripts out the statements necessary for recreating the security on a Fabric Data Warehouse.

It is recommended, to schedule this script to run from a scheduling tool.  

Be sure to output the results of this script to a file so that security can be (re)applied to a warehouse as needed.

**** This script is provided as-is with no guarantees that it will meet your particular scenario. **** 
**** Use at your own risk. **** 
**** Copy and modify it for your particular use case. ****

*/
-- Custom DB roles
SELECT 'CREATE ROLE ' + QUOTENAME(name) FROM sys.database_principals WHERE type = 'R' AND is_fixed_role = 0 AND name NOT IN ('public')
UNION ALL

-- Database Level Permissions
SELECT state_desc + ' ' + [permission_name] COLLATE Latin1_General_100_BIN2_UTF8 + ' TO ' + '[' + princ.[name] + '];'
FROM sys.database_permissions perm
LEFT JOIN sys.database_principals princ ON perm.grantee_principal_id = princ.principal_id
LEFT JOIN sys.objects o ON o.object_id = perm.major_id
LEFT JOIN sys.schemas s ON s.schema_id = o.schema_id
LEFT JOIN sys.all_columns c ON c.object_id = perm.major_id AND c.column_id = perm.minor_id
WHERE princ.principal_id <> 0 AND class = 0 AND perm.minor_id = 0 AND princ.type = 'E'
UNION ALL

-- Object Level Permissions (schema and tables)
SELECT state_desc+ ' ' + [permission_name] + ' ON [' 
+ s.[name] COLLATE Latin1_General_100_BIN2_UTF8 + '].[' + o.[name] + ']'
+  ' TO ' + '[' + princ.[name] + '];'
FROM sys.database_permissions perm
LEFT JOIN sys.database_principals princ on perm.grantee_principal_id = princ.principal_id
LEFT JOIN sys.objects o ON o.object_id = perm.major_id
LEFT JOIN sys.schemas s ON s.schema_id = o.schema_id
LEFT JOIN sys.all_columns c ON c.object_id = perm.major_id AND c.column_id = perm.minor_id
WHERE princ.principal_id <> 0 AND class > 0 AND perm.minor_id = 0
UNION ALL

-- Column Level Permissions
SELECT state_desc+ ' ' + [permission_name] + ' ON [' 
+ s.[name] COLLATE Latin1_General_100_BIN2_UTF8 + '].[' + o.[name] + ']'
+ CASE WHEN perm.minor_id > 0 THEN '('+ c.[name] +')'  ELSE '' END
+  ' TO ' + '[' + princ.[name] + '];'
FROM sys.database_permissions perm
LEFT JOIN sys.database_principals princ ON perm.grantee_principal_id = princ.principal_id
LEFT JOIN sys.objects o ON o.object_id = perm.major_id
LEFT JOIN sys.schemas s ON s.schema_id = o.schema_id
LEFT JOIN sys.all_columns c ON c.object_id = perm.major_id AND c.column_id = perm.minor_id
WHERE princ.principal_id <> 0 AND class > 0 AND perm.minor_id > 0
UNION ALL

-- Roles memberships
SELECT 'ALTER ROLE ' + QUOTENAME(DP1.name) + ' ADD MEMBER ' + QUOTENAME(DP2.name) 
FROM sys.database_role_members AS DRM
RIGHT OUTER JOIN sys.database_principals AS DP1
    ON DRM.role_principal_id = DP1.principal_id
LEFT OUTER JOIN sys.database_principals AS DP2
    ON DRM.member_principal_id = DP2.principal_id
WHERE DP1.type = 'R' AND (DP2.name IS NOT NULL and DP2.name != 'dbo');
