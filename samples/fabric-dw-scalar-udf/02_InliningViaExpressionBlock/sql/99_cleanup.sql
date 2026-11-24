-- Remove Lab 02-only UDFs; retain functions reused by later labs.
DROP FUNCTION IF EXISTS dbo.udf_GetDiscount;
DROP FUNCTION IF EXISTS dbo.udf_IfDeeplyNested;
DROP FUNCTION IF EXISTS dbo.udf_IsCampaignEligible;
DROP FUNCTION IF EXISTS dbo.udf_ValidateTier;
DROP FUNCTION IF EXISTS dbo.udf_GetStockStatus;
DROP FUNCTION IF EXISTS dbo.udf_CalculateNetOrderValue;
DROP FUNCTION IF EXISTS dbo.udf_ReturnCreditRiskScore;
GO
