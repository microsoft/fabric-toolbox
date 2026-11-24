-- Remove Lab 05 UDFs; retain shared sample data.
DROP FUNCTION IF EXISTS dbo.udf_IsAlmostEqual;
DROP FUNCTION IF EXISTS dbo.udf_IsLikelyDuplicate;
DROP FUNCTION IF EXISTS dbo.udf_TypoSeverity;
DROP FUNCTION IF EXISTS dbo.udf_FormatStatusLabel;
GO
