-- ============================================================================
-- OPTIONAL FULL LAB RESET
-- Run only after all lab exercises and observability checks are complete.
-- Drops current packaged UDFs, legacy UDFs, and all sample data.
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
DROP FUNCTION IF EXISTS dbo.udf_StandardizeCityName;
GO

-- String functions and operators
DROP FUNCTION IF EXISTS dbo.udf_IsAlmostEqual;
DROP FUNCTION IF EXISTS dbo.udf_IsLikelyDuplicate;
DROP FUNCTION IF EXISTS dbo.udf_TypoSeverity;
DROP FUNCTION IF EXISTS dbo.udf_FormatStatusLabel;
GO

-- Fuzzy string matching
DROP FUNCTION IF EXISTS dbo.BlogFuzzy_MatchDisposition;
DROP FUNCTION IF EXISTS dbo.BlogFuzzy_MatchGrade;
DROP FUNCTION IF EXISTS dbo.BlogFuzzy_MatchScore;
DROP FUNCTION IF EXISTS dbo.BlogFuzzy_WeightedLevenshtein;
GO

-- Legacy UDFs retained here so cleanup resets earlier versions of the lab.
DROP FUNCTION IF EXISTS dbo.udf_WhileRepeatChar;
DROP FUNCTION IF EXISTS dbo.udf_WhileRunningStats;
DROP FUNCTION IF EXISTS dbo.udf_WhileFibonacci;
DROP FUNCTION IF EXISTS dbo.udf_WhileGCD;
DROP FUNCTION IF EXISTS dbo.udf_WhileDigitSum;
DROP FUNCTION IF EXISTS dbo.udf_BasicGetGrade;
DROP FUNCTION IF EXISTS dbo.udf_BasicGetDiscount;
DROP FUNCTION IF EXISTS dbo.udf_BasicValidateTier;
DROP FUNCTION IF EXISTS dbo.udf_BasicGetStockStatus;
DROP FUNCTION IF EXISTS dbo.udf_WhileDistanceScore;
DROP FUNCTION IF EXISTS dbo.udf_WhileCustomerScore;
DROP FUNCTION IF EXISTS dbo.udf_WhileMatrixSum;
DROP FUNCTION IF EXISTS dbo.udf_If20LevelNested;
DROP FUNCTION IF EXISTS dbo.udf_If50Branches;
DROP FUNCTION IF EXISTS dbo.udf_IfWhileAccumulate;
DROP FUNCTION IF EXISTS dbo.udf_IfComplexPricing;
DROP FUNCTION IF EXISTS dbo.udf_ReturnTransactionStatus;
DROP FUNCTION IF EXISTS dbo.udf_ReturnLoanDecision;
DROP FUNCTION IF EXISTS dbo.udf_ReturnQualityGrade;
DROP FUNCTION IF EXISTS dbo.udf_ProjectedBalance;
DROP FUNCTION IF EXISTS dbo.udf_CustomerRiskAssessment;
DROP FUNCTION IF EXISTS dbo.udf_GetFulfillmentAction;
DROP FUNCTION IF EXISTS dbo.udf_Is_Almost_Equal;
DROP FUNCTION IF EXISTS dbo.udf_Is_Likely_Duplicate;
DROP FUNCTION IF EXISTS dbo.udf_Typo_Severity;
DROP FUNCTION IF EXISTS dbo.udf_FuzzyMatch_Summary;
DROP FUNCTION IF EXISTS dbo.udf_String_Transform_Diff_Json;
DROP FUNCTION IF EXISTS dbo.udf_String_Transform_Diff_Json_Lev;
DROP FUNCTION IF EXISTS dbo.udf_Format_Unicode_Label;
DROP FUNCTION IF EXISTS dbo.udf_Find_Best_Geo_Match;
DROP FUNCTION IF EXISTS dbo.udf_Standardize_City_Name;
GO

DROP TABLE IF EXISTS dbo.Lab_Transactions;
DROP TABLE IF EXISTS dbo.Lab_Products;
DROP TABLE IF EXISTS dbo.Lab_Customers;
DROP TABLE IF EXISTS dbo.Lab_InterestRates;
DROP TABLE IF EXISTS dbo.Lab_Campaigns;
DROP TABLE IF EXISTS dbo.Lab_Geo;
DROP TABLE IF EXISTS dbo.Lab_Config;
DROP TABLE IF EXISTS dbo.Lab_CustomerScores; -- Legacy
DROP TABLE IF EXISTS dbo.Lab_PerfLog;        -- Legacy
GO

DROP TABLE IF EXISTS dbo.BlogFuzzy_IncomingListing;
DROP TABLE IF EXISTS dbo.BlogFuzzy_AlgorithmExample;
DROP TABLE IF EXISTS dbo.BlogFuzzy_ListingVariant;
DROP TABLE IF EXISTS dbo.BlogFuzzy_ProductCatalog;
DROP TABLE IF EXISTS dbo.BlogFuzzy_Config;
GO
