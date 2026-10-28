# Business Rules with Nested IF/ELSE

This lesson applies layered branching to analytical data:

- `udf_GetDiscount` calculates an order discount from customer tier and value.
- `udf_IfDeeplyNested` uses five decision levels: category, price, stock,
  customer tier, and peak season.
- `udf_IsCampaignEligible` evaluates whether a customer matches a campaign.

Run [`00_Source/sql/01_setup_tables.sql`](../00_Source/sql/01_setup_tables.sql)
before starting.

## Order discount

```sql
CREATE OR ALTER FUNCTION dbo.udf_GetDiscount
(
    @CustomerTier VARCHAR(20),
    @OrderAmount DECIMAL(18,2)
)
RETURNS DECIMAL(5,4)
AS
BEGIN
    DECLARE @Discount DECIMAL(5,4) = 0;

    IF @CustomerTier = 'Gold'
    BEGIN
        IF @OrderAmount >= 1000
            SET @Discount = 0.20;
        ELSE IF @OrderAmount >= 500
            SET @Discount = 0.15;
        ELSE
            SET @Discount = 0.10;
    END
    ELSE IF @CustomerTier = 'Silver'
    BEGIN
        IF @OrderAmount >= 1000
            SET @Discount = 0.10;
        ELSE
            SET @Discount = 0.05;
    END;

    RETURN @Discount;
END;
GO
```

Use the function over transaction and customer data:

```sql
SELECT TOP (20)
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
ORDER BY t.TransactionID;
```

## Five-level fulfillment decision

This example makes the nesting explicit. Each level refines the prior business
decision:

1. Product category
2. Unit price
3. Stock level
4. Customer tier
5. Peak-season handling

```sql
CREATE OR ALTER FUNCTION dbo.udf_IfDeeplyNested(
    @category VARCHAR(20),
    @price DECIMAL(10,2),
    @stockLevel INT,
    @customerTier VARCHAR(10),
    @isSeason BIT
)
RETURNS VARCHAR(100)
AS
BEGIN
    DECLARE @result VARCHAR(100);

    IF @category = 'Electronics'
    BEGIN
        IF @price > 500
        BEGIN
            IF @stockLevel < 10
            BEGIN
                IF @customerTier = 'Gold'
                BEGIN
                    IF @isSeason = 1
                        SET @result = 'ELEC-HIGH-LOW_STOCK-GOLD-SEASON:PRIORITY_SHIP';
                    ELSE
                        SET @result = 'ELEC-HIGH-LOW_STOCK-GOLD:EXPRESS_SHIP';
                END
                ELSE IF @customerTier = 'Silver'
                BEGIN
                    IF @isSeason = 1
                        SET @result = 'ELEC-HIGH-LOW_STOCK-SILVER-SEASON:STANDARD_SHIP';
                    ELSE
                        SET @result = 'ELEC-HIGH-LOW_STOCK-SILVER:STANDARD_SHIP';
                END
                ELSE
                    SET @result = 'ELEC-HIGH-LOW_STOCK-BASIC:BACKORDER';
            END
            ELSE
            BEGIN
                IF @customerTier = 'Gold'
                    SET @result = 'ELEC-HIGH-AVAIL-GOLD:NEXT_DAY';
                ELSE
                    SET @result = 'ELEC-HIGH-AVAIL:STANDARD';
            END
        END
        ELSE
        BEGIN
            IF @stockLevel < 10
                SET @result = 'ELEC-LOW-LOW_STOCK:REORDER';
            ELSE
                SET @result = 'ELEC-LOW-AVAIL:STANDARD';
        END
    END
    ELSE IF @category = 'Software'
    BEGIN
        IF @price > 200
        BEGIN
            IF @customerTier = 'Gold'
                SET @result = 'SOFT-PREMIUM-GOLD:INSTANT_DOWNLOAD';
            ELSE
                SET @result = 'SOFT-PREMIUM:DOWNLOAD_24H';
        END
        ELSE
            SET @result = 'SOFT-BASIC:INSTANT_DOWNLOAD';
    END
    ELSE
        SET @result = 'OTHER-' + @category + ':STANDARD';

    RETURN @result;
END;
GO
```

Exercise the complete five-level path with controlled inputs:

```sql
SELECT
    dbo.udf_IfDeeplyNested(
        'Electronics',
        999.00,
        5,
        'Gold',
        1
    ) AS PeakSeasonPriority,
    dbo.udf_IfDeeplyNested(
        'Electronics',
        999.00,
        5,
        'Silver',
        0
    ) AS StandardShipping;
```

Use the decision tree with product, customer, and transaction attributes:

```sql
SELECT TOP (30)
    t.TransactionID,
    p.ProductName,
    p.Category,
    p.UnitPrice,
    p.StockQuantity,
    c.CustomerTier,
    dbo.udf_IfDeeplyNested(
        p.Category,
        p.UnitPrice,
        p.StockQuantity,
        c.CustomerTier,
        CASE
            WHEN MONTH(t.TransactionDate) IN (11, 12) THEN 1
            ELSE 0
        END
    ) AS FulfillmentAction
FROM dbo.Lab_Transactions AS t
INNER JOIN dbo.Lab_Products AS p
    ON t.ProductID = p.ProductID
INNER JOIN dbo.Lab_Customers AS c
    ON t.CustomerID = c.CustomerID
ORDER BY t.TransactionID;
```

## Campaign eligibility

This function contains only customer and campaign rules. Activity dates and
campaign status remain relational predicates in the calling query.

```sql
CREATE OR ALTER FUNCTION dbo.udf_IsCampaignEligible
(
    @CustomerTier VARCHAR(20),
    @TotalSpend DECIMAL(18,2),
    @TargetSegment VARCHAR(20),
    @ConversionRate DECIMAL(5,4)
)
RETURNS BIT
AS
BEGIN
    IF @TargetSegment <> 'All'
        AND @TargetSegment <> @CustomerTier
        RETURN 0;

    IF @ConversionRate < 0.05
        RETURN 0;

    IF @CustomerTier = 'Gold' AND @TotalSpend >= 50000
        RETURN 1;

    IF @CustomerTier = 'Silver' AND @TotalSpend >= 10000
        RETURN 1;

    IF @CustomerTier = 'Bronze' AND @TotalSpend >= 0
        RETURN 1;

    RETURN 0;
END;
GO
```

Use it in a join predicate to match customers to active campaigns:

```sql
SELECT TOP (25)
    c.CustomerID,
    c.CustomerTier,
    c.TotalSpend,
    cp.CampaignID,
    cp.CampaignName,
    cp.TargetSegment,
    cp.ConversionRate
FROM dbo.Lab_Customers AS c
INNER JOIN dbo.Lab_Campaigns AS cp
    ON cp.IsActive = 1
    AND dbo.udf_IsCampaignEligible(
            c.CustomerTier,
            c.TotalSpend,
            cp.TargetSegment,
            cp.ConversionRate
        ) = 1
ORDER BY c.CustomerID, cp.CampaignID;
```

➡️ Continue to [Validation with Multiple Returns](02_validation_returns.md).
