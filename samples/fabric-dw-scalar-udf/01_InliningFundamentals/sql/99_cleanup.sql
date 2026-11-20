-- Remove Lab 01-only UDFs; retain shared data and udf_GetCustomerTier.
DROP FUNCTION IF EXISTS dbo.udf_WhileSumAccumulator;
DROP FUNCTION IF EXISTS dbo.udf_CountCustomerOrderBatches;
GO
