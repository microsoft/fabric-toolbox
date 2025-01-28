SELECT 'CREATE STATISTICS [' +c.name + '_' + a.name + '_' + b.name
+ '_stat] ON [' +c.name + '].[' + a.name + '] ([' + b.name + ']);' AS '--CREATE STATS'
FROM sys.tables a,
sys.columns b,
sys.schemas c
WHERE a.object_id = b.object_id
and a.schema_id = c.schema_id
and c.name = 'dbo'
AND NOT EXISTS (SELECT NULL
FROM sys.stats_columns
WHERE object_id IN (SELECT object_id
FROM sys.stats_columns
GROUP BY object_id
HAVING Count(*) = 1)
AND object_id = b.object_id
AND column_id = b.column_id)
AND a.name in 
('nation','region', 'supplier')
ORDER BY a.name,
b.column_id;
