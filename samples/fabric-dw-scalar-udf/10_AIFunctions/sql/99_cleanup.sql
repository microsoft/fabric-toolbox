-- Remove only the objects created by Lab 10.
DROP VIEW IF EXISTS dbo.vw_Lab_AIDraftOrderReplies;
GO

DROP FUNCTION IF EXISTS dbo.udf_ExtractOrderDetails;
DROP FUNCTION IF EXISTS dbo.udf_ClassifyOrderInquiry;
DROP FUNCTION IF EXISTS dbo.udf_DraftOrderReply;
GO

DROP TABLE IF EXISTS dbo.Lab_AIResults;
DROP TABLE IF EXISTS dbo.Lab_AIRequests;
DROP TABLE IF EXISTS dbo.Lab_AIPromptTemplates;
GO
