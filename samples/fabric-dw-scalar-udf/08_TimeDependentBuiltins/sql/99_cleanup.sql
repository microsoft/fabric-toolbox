-- Remove Lab 08 UDFs, including the optional helper; retain shared data.
DROP FUNCTION IF EXISTS dbo.udf_GetCurrentUtc;
DROP FUNCTION IF EXISTS dbo.udf_GetLoopDurationMicroseconds;
DROP FUNCTION IF EXISTS dbo.udf_ReturnTimeValue;
GO
