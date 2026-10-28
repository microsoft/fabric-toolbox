/*
    Lab 06: Fuzzy string matching
    99_cleanup.sql
*/

SET NOCOUNT ON;
GO

DROP FUNCTION IF EXISTS dbo.BlogFuzzy_MatchDisposition;
DROP FUNCTION IF EXISTS dbo.BlogFuzzy_MatchGrade;
DROP FUNCTION IF EXISTS dbo.BlogFuzzy_MatchScore;
DROP FUNCTION IF EXISTS dbo.BlogFuzzy_WeightedLevenshtein;
GO

DROP TABLE IF EXISTS dbo.BlogFuzzy_IncomingListing;
DROP TABLE IF EXISTS dbo.BlogFuzzy_AlgorithmExample;
DROP TABLE IF EXISTS dbo.BlogFuzzy_ListingVariant;
DROP TABLE IF EXISTS dbo.BlogFuzzy_ProductCatalog;
DROP TABLE IF EXISTS dbo.BlogFuzzy_Config;
GO
