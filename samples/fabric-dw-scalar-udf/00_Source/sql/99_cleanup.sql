-- ============================================================================
-- OPTIONAL COMMON SHARED-DATA RESET
-- Drops shared sample data and UDFs, including residual shared-data-lab objects.
-- Run shared setup again before continuing dependent labs.
-- Labs 06 and 10 own their setup and cleanup in their respective sql folders.
-- ============================================================================

-- Inlining Fundamentals
DROP FUNCTION IF EXISTS dbo.udf_WhileSumAccumulator;
DROP FUNCTION IF EXISTS dbo.udf_GetCustomerTier;
DROP FUNCTION IF EXISTS dbo.udf_CountCustomerOrderBatches;
GO

-- Inlining via Expression Block
DROP FUNCTION IF EXISTS dbo.udf_GetDiscount;
DROP FUNCTION IF EXISTS dbo.udf_IfDeeplyNested;
DROP FUNCTION IF EXISTS dbo.udf_IsCampaignEligible;
DROP FUNCTION IF EXISTS dbo.udf_ValidateTier;
DROP FUNCTION IF EXISTS dbo.udf_GetStockStatus;
GO

DROP FUNCTION IF EXISTS dbo.udf_WhileCompoundInterest;
DROP FUNCTION IF EXISTS dbo.udf_CalculateNetOrderValue;
DROP FUNCTION IF EXISTS dbo.udf_ReturnCreditRiskScore;
GO

-- Scalar UDF inlining
DROP FUNCTION IF EXISTS dbo.udf_LookupGeoKey;
GO

-- String functions and operators
DROP FUNCTION IF EXISTS dbo.udf_IsAlmostEqual;
DROP FUNCTION IF EXISTS dbo.udf_IsLikelyDuplicate;
DROP FUNCTION IF EXISTS dbo.udf_TypoSeverity;
DROP FUNCTION IF EXISTS dbo.udf_FormatStatusLabel;
GO

-- Inlineability diagnostics
DROP FUNCTION IF EXISTS dbo.udf_DiagnosticOrderBatches;
GO

-- Time-dependent built-ins, including the optional helper
DROP FUNCTION IF EXISTS dbo.udf_GetCurrentUtc;
DROP FUNCTION IF EXISTS dbo.udf_GetLoopDurationMicroseconds;
DROP FUNCTION IF EXISTS dbo.udf_ReturnTimeValue;
GO

-- NEWID, including the optional helper
DROP FUNCTION IF EXISTS dbo.udf_GenerateRunId;
DROP FUNCTION IF EXISTS dbo.udf_NewIdPairIsDistinct;
DROP FUNCTION IF EXISTS dbo.udf_ReturnValue;
GO

DROP TABLE IF EXISTS dbo.Lab_NewIdResults;
DROP TABLE IF EXISTS dbo.Lab_Transactions;
DROP TABLE IF EXISTS dbo.Lab_Products;
DROP TABLE IF EXISTS dbo.Lab_Customers;
DROP TABLE IF EXISTS dbo.Lab_InterestRates;
DROP TABLE IF EXISTS dbo.Lab_Campaigns;
DROP TABLE IF EXISTS dbo.Lab_Geo;
DROP TABLE IF EXISTS dbo.Lab_Config;
GO
