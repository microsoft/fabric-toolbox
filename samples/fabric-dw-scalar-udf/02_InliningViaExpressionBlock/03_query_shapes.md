# Query Shapes

Use one business UDF across common analytical query shapes. Reusing
`udf_GetDiscount` keeps the focus on where an inlineable UDF can appear rather
than introducing another function for each example.

> **Prerequisite:** Run [01_business_rules.md](01_business_rules.md).

## SELECT and WHERE

```sql
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
```

## GROUP BY and HAVING

```sql
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
```

## CTE

```sql
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
```

## JOIN predicate

`udf_IsCampaignEligible` supports a business-meaningful join between customers
and campaigns:

```sql
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
```

➡️ Continue to [Projected Balance](04_projected_balance.md).
