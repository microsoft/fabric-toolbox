-- Remove Lab 07 diagnostic objects, including after a partial run.
-- Retain shared sample data and udf_GetCustomerTier.
DROP TABLE IF EXISTS #RecentTransactionTiers;
GO

DROP FUNCTION IF EXISTS dbo.udf_DiagnosticOrderBatches;
GO
