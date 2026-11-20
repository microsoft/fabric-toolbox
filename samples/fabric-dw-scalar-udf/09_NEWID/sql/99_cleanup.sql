-- Remove Lab 09 UDFs and results, including the optional helper.
-- Retain shared sample data.
DROP FUNCTION IF EXISTS dbo.udf_GenerateRunId;
DROP FUNCTION IF EXISTS dbo.udf_NewIdPairIsDistinct;
DROP FUNCTION IF EXISTS dbo.udf_ReturnValue;
GO

DROP TABLE IF EXISTS dbo.Lab_NewIdResults;
GO
