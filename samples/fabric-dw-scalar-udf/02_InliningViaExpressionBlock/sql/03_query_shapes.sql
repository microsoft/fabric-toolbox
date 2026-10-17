-- Generated from 02_InliningViaExpressionBlock/03_query_shapes.md.
-- Prerequisite: run 01_business_rules.sql.

SELECT TOP (1000)
    t.TransactionID,
    c.CustomerTier,
    t.Quantity * t.UnitPrice AS OrderAmount,
    dbo.udf_GetDiscount(c.CustomerTier, t.Quantity * t.UnitPrice) AS DiscountRate
FROM dbo.Lab_Transactions AS t
INNER JOIN dbo.Lab_Customers AS c
    ON t.CustomerID = c.CustomerID
WHERE dbo.udf_GetDiscount(
          c.CustomerTier,
          t.Quantity * t.UnitPrice
      ) >= 0.15
ORDER BY t.TransactionID;
GO

SELECT
    dbo.udf_GetDiscount(
        c.CustomerTier,
        t.Quantity * t.UnitPrice
    ) AS DiscountRate,
    COUNT(*) AS TransactionCount,
    AVG(t.Quantity * t.UnitPrice) AS AverageOrderAmount
FROM dbo.Lab_Transactions AS t
INNER JOIN dbo.Lab_Customers AS c
    ON t.CustomerID = c.CustomerID
GROUP BY dbo.udf_GetDiscount(
    c.CustomerTier,
    t.Quantity * t.UnitPrice
)
HAVING COUNT(*) > 10
ORDER BY DiscountRate DESC;
GO

WITH DiscountedOrders AS
(
    SELECT
        t.TransactionID,
        c.CustomerTier,
        t.Quantity * t.UnitPrice AS OrderAmount,
        dbo.udf_GetDiscount(
            c.CustomerTier,
            t.Quantity * t.UnitPrice
        ) AS DiscountRate
    FROM dbo.Lab_Transactions AS t
    INNER JOIN dbo.Lab_Customers AS c
        ON t.CustomerID = c.CustomerID
)
SELECT TOP (1000)
    TransactionID,
    CustomerTier,
    OrderAmount,
    DiscountRate
FROM DiscountedOrders
WHERE DiscountRate > 0
ORDER BY TransactionID;
GO

SELECT
    cp.CampaignID,
    cp.CampaignName,
    COUNT(*) AS EligibleCustomers,
    SUM(c.TotalSpend) AS EligibleCustomerSpend
FROM dbo.Lab_Campaigns AS cp
INNER JOIN dbo.Lab_Customers AS c
    ON dbo.udf_IsCampaignEligible(
           c.CustomerTier,
           c.TotalSpend,
           cp.TargetSegment,
           cp.ConversionRate
       ) = 1
WHERE cp.IsActive = 1
GROUP BY cp.CampaignID, cp.CampaignName
ORDER BY EligibleCustomerSpend DESC;
GO
