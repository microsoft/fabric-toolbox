-- ============================================================================
-- 🎯 Scalar UDF Hands-On Lab: Data Setup
-- ⏱️ Estimated time: 2-5 minutes
-- ============================================================================
-- Run this FIRST before any other scripts.
-- ============================================================================

-- ============================================================================
-- ⚙️ CONFIGURATION - Edit ONE line below to change data scale
-- ============================================================================
-- 
-- DATA SCALE OPTIONS:
--   10,000     = Quick tests (under a minute to load)
--   100,000    = Default, recommended start (under a minute to load)
--   1,000,000  = Medium scale (under a minute to load)
--   10,000,000 = Large scale (couple of minutes to load)
--
-- To change: Edit the number in the CREATE TABLE statement below.
-- ============================================================================

-- ============================================================================
-- 🧹 CLEANUP - Drop existing tables (safe to re-run)
-- ============================================================================
DROP TABLE IF EXISTS dbo.Lab_Transactions;
DROP TABLE IF EXISTS dbo.Lab_Products;
DROP TABLE IF EXISTS dbo.Lab_Customers;
DROP TABLE IF EXISTS dbo.Lab_InterestRates;
DROP TABLE IF EXISTS dbo.Lab_Campaigns;
DROP TABLE IF EXISTS dbo.Lab_Geo;
DROP TABLE IF EXISTS dbo.Lab_Config;
DROP TABLE IF EXISTS dbo.Lab_PerfLog; -- Legacy cleanup from earlier lab versions
GO

-- ============================================================================
-- ⚙️ CONFIGURATION TABLE - Edit the row count value here!
-- ============================================================================
CREATE TABLE dbo.Lab_Config (TargetRows INT);
INSERT INTO dbo.Lab_Config VALUES (100000);  -- ← EDIT THIS NUMBER: 10000, 100000, 1000000, 10000000
GO

PRINT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
PRINT '🚀 Scalar UDF Hands-On Lab - Data Setup';
PRINT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
SELECT 'Target Rows: ' + CAST(TargetRows AS VARCHAR(20)) FROM dbo.Lab_Config;
PRINT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
GO

-- ============================================================================
-- 🌍 GEO LOOKUP (110 city-name variants)
-- ============================================================================
CREATE TABLE dbo.Lab_Geo (
    GeoKey INT NOT NULL,
    CityName VARCHAR(100) NOT NULL,
    Country VARCHAR(100) NOT NULL,
    CanonicalCity VARCHAR(100) NOT NULL
);

INSERT INTO dbo.Lab_Geo (GeoKey, CityName, Country, CanonicalCity) VALUES
(1, 'New York', 'United States', 'New York'),
(2, 'NewYork', 'United States', 'New York'),
(3, 'NYC', 'United States', 'New York'),
(4, 'San Francisco', 'United States', 'San Francisco'),
(5, 'San Fransisco', 'United States', 'San Francisco'),
(6, 'SanFrancisco', 'United States', 'San Francisco'),
(7, 'Los Angeles', 'United States', 'Los Angeles'),
(8, 'LA', 'United States', 'Los Angeles'),
(9, 'LosAngeles', 'United States', 'Los Angeles'),
(10, 'Chicago', 'United States', 'Chicago'),
(11, 'Chicagoo', 'United States', 'Chicago'),
(12, 'Houston', 'United States', 'Houston'),
(13, 'Huston', 'United States', 'Houston'),
(14, 'Phoenix', 'United States', 'Phoenix'),
(15, 'Phonix', 'United States', 'Phoenix'),
(16, 'Philadelphia', 'United States', 'Philadelphia'),
(17, 'Philidelphia', 'United States', 'Philadelphia'),
(18, 'San Antonio', 'United States', 'San Antonio'),
(19, 'SanAntonio', 'United States', 'San Antonio'),
(20, 'San Diego', 'United States', 'San Diego'),
(21, 'SanDiego', 'United States', 'San Diego'),
(22, 'Dallas', 'United States', 'Dallas'),
(23, 'Seattle', 'United States', 'Seattle'),
(24, 'Seatle', 'United States', 'Seattle'),
(25, 'Boston', 'United States', 'Boston'),
(26, 'Munich', 'Germany', 'Munich'),
(27, 'Muenchen', 'Germany', 'Munich'),
(28, 'Munchen', 'Germany', 'Munich'),
(29, 'Berlin', 'Germany', 'Berlin'),
(30, 'Berlinn', 'Germany', 'Berlin'),
(31, 'Hamburg', 'Germany', 'Hamburg'),
(32, 'Cologne', 'Germany', 'Cologne'),
(33, 'Koeln', 'Germany', 'Cologne'),
(34, 'Frankfurt', 'Germany', 'Frankfurt'),
(35, 'Frankfurtt', 'Germany', 'Frankfurt'),
(36, 'London', 'United Kingdom', 'London'),
(37, 'Londin', 'United Kingdom', 'London'),
(38, 'Manchester', 'United Kingdom', 'Manchester'),
(39, 'Manchster', 'United Kingdom', 'Manchester'),
(40, 'Birmingham', 'United Kingdom', 'Birmingham'),
(41, 'Birmigham', 'United Kingdom', 'Birmingham'),
(42, 'Edinburgh', 'United Kingdom', 'Edinburgh'),
(43, 'Edinburg', 'United Kingdom', 'Edinburgh'),
(44, 'Glasgow', 'United Kingdom', 'Glasgow'),
(45, 'Paris', 'France', 'Paris'),
(46, 'Parris', 'France', 'Paris'),
(47, 'Lyon', 'France', 'Lyon'),
(48, 'Marseille', 'France', 'Marseille'),
(49, 'Marsaille', 'France', 'Marseille'),
(50, 'Nice', 'France', 'Nice'),
(51, 'Madrid', 'Spain', 'Madrid'),
(52, 'Madird', 'Spain', 'Madrid'),
(53, 'Barcelona', 'Spain', 'Barcelona'),
(54, 'Barcalona', 'Spain', 'Barcelona'),
(55, 'Valencia', 'Spain', 'Valencia'),
(56, 'Seville', 'Spain', 'Seville'),
(57, 'Sevilla', 'Spain', 'Seville'),
(58, 'Rome', 'Italy', 'Rome'),
(59, 'Roma', 'Italy', 'Rome'),
(60, 'Milan', 'Italy', 'Milan'),
(61, 'Milano', 'Italy', 'Milan'),
(62, 'Naples', 'Italy', 'Naples'),
(63, 'Napoli', 'Italy', 'Naples'),
(64, 'Florence', 'Italy', 'Florence'),
(65, 'Firenze', 'Italy', 'Florence'),
(66, 'Venice', 'Italy', 'Venice'),
(67, 'Venezia', 'Italy', 'Venice'),
(68, 'Tokyo', 'Japan', 'Tokyo'),
(69, 'Tokio', 'Japan', 'Tokyo'),
(70, 'Osaka', 'Japan', 'Osaka'),
(71, 'Beijing', 'China', 'Beijing'),
(72, 'Peking', 'China', 'Beijing'),
(73, 'Shanghai', 'China', 'Shanghai'),
(74, 'Shangai', 'China', 'Shanghai'),
(75, 'Hong Kong', 'China', 'Hong Kong'),
(76, 'HongKong', 'China', 'Hong Kong'),
(77, 'Mumbai', 'India', 'Mumbai'),
(78, 'Bombay', 'India', 'Mumbai'),
(79, 'Delhi', 'India', 'Delhi'),
(80, 'Dehli', 'India', 'Delhi'),
(81, 'Singapore', 'Singapore', 'Singapore'),
(82, 'Singapoor', 'Singapore', 'Singapore'),
(83, 'Seoul', 'South Korea', 'Seoul'),
(84, 'Seol', 'South Korea', 'Seoul'),
(85, 'Bangkok', 'Thailand', 'Bangkok'),
(86, 'Mexico City', 'Mexico', 'Mexico City'),
(87, 'MexicoCity', 'Mexico', 'Mexico City'),
(88, 'Sao Paulo', 'Brazil', 'Sao Paulo'),
(89, 'SaoPaulo', 'Brazil', 'Sao Paulo'),
(90, 'Rio de Janeiro', 'Brazil', 'Rio de Janeiro'),
(91, 'RiodeJaneiro', 'Brazil', 'Rio de Janeiro'),
(92, 'Buenos Aires', 'Argentina', 'Buenos Aires'),
(93, 'BuenosAires', 'Argentina', 'Buenos Aires'),
(94, 'Lima', 'Peru', 'Lima'),
(95, 'Bogota', 'Colombia', 'Bogota'),
(96, 'Sydney', 'Australia', 'Sydney'),
(97, 'Syndey', 'Australia', 'Sydney'),
(98, 'Melbourne', 'Australia', 'Melbourne'),
(99, 'Toronto', 'Canada', 'Toronto'),
(100, 'Tornoto', 'Canada', 'Toronto'),
(101, 'Vancouver', 'Canada', 'Vancouver'),
(102, 'Montreal', 'Canada', 'Montreal'),
(103, 'Dubai', 'UAE', 'Dubai'),
(104, 'Dubay', 'UAE', 'Dubai'),
(105, 'Cairo', 'Egypt', 'Cairo'),
(106, 'Kairo', 'Egypt', 'Cairo'),
(107, 'Moscow', 'Russia', 'Moscow'),
(108, 'Moskow', 'Russia', 'Moscow'),
(109, 'Amsterdam', 'Netherlands', 'Amsterdam'),
(110, 'Amsterdamm', 'Netherlands', 'Amsterdam');
GO

-- ============================================================================
-- 👥 CUSTOMERS (1000 customers)
-- ============================================================================
CREATE TABLE dbo.Lab_Customers (
    CustomerID INT NOT NULL,
    CustomerName VARCHAR(100),
    CustomerTier VARCHAR(20),      -- Gold, Silver, Bronze
    JoinDate DATE,
    TotalSpend DECIMAL(18,2),
    IsActive BIT,
    GeoKey INT
);
GO

;WITH E1(N) AS (SELECT 1 UNION ALL SELECT 1 UNION ALL SELECT 1 UNION ALL SELECT 1 
               UNION ALL SELECT 1 UNION ALL SELECT 1 UNION ALL SELECT 1 UNION ALL SELECT 1
               UNION ALL SELECT 1 UNION ALL SELECT 1),
     E2(N) AS (SELECT 1 FROM E1 a CROSS JOIN E1 b),
     E3(N) AS (SELECT 1 FROM E2 a CROSS JOIN E1 b),
     Numbers AS (SELECT TOP (1000) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM E3)
INSERT INTO dbo.Lab_Customers
SELECT 
    n AS CustomerID,
    CONCAT('Customer_', RIGHT('0000' + CAST(n AS VARCHAR(4)), 4)) AS CustomerName,
    CASE (n % 3) WHEN 0 THEN 'Gold' WHEN 1 THEN 'Silver' ELSE 'Bronze' END AS CustomerTier,
    DATEADD(DAY, -(n % 1500), GETDATE()) AS JoinDate,
    CAST((n * 123.45) % 300000 + 5000 AS DECIMAL(18,2)) AS TotalSpend,
    CASE WHEN n % 10 = 0 THEN 0 ELSE 1 END AS IsActive,
    ((n - 1) % 110) + 1 AS GeoKey
FROM Numbers;
GO

-- ============================================================================
-- 📦 PRODUCTS (11 reference products)
-- ============================================================================
CREATE TABLE dbo.Lab_Products (
    ProductID INT NOT NULL,
    ProductName VARCHAR(100),
    Category VARCHAR(50),
    UnitPrice DECIMAL(10,2),
    StockQuantity INT,
    DiscountPct DECIMAL(5,2)
);

INSERT INTO dbo.Lab_Products VALUES
(101, 'Tablet Device', 'Electronics', 1299.99, 500, 0.05),
(102, 'Laptop Device', 'Electronics', 999.99, 350, 0.10),
(103, 'Gaming Console', 'Gaming', 499.99, 1000, 0.00),
(104, 'Productivity Suite License', 'Software', 99.99, 9999, 0.15),
(105, 'Cloud Credits Pack', 'Cloud', 500.00, 9999, 0.20),
(106, 'VoIP Phone System', 'Communication', 299.99, 200, 0.05),
(107, 'Analytics Pro License', 'Analytics', 9.99, 9999, 0.00),
(108, 'CRM Platform License', 'Business Apps', 65.00, 9999, 0.10),
(109, 'IDE Enterprise License', 'Development', 250.00, 9999, 0.05),
(110, 'Source Control Enterprise', 'Development', 21.00, 9999, 0.00),
(111, 'Data Warehouse Service', 'Analytics', 149.99, 9999, 0.05);
GO

-- ============================================================================
-- 💳 TRANSACTIONS (configurable row count)
-- ============================================================================
CREATE TABLE dbo.Lab_Transactions (
    TransactionID INT NOT NULL,
    CustomerID INT,
    ProductID INT,
    TransactionDate DATE,
    Quantity INT,
    UnitPrice DECIMAL(10,2),
    TaxRate DECIMAL(5,2),
    DiscountApplied DECIMAL(5,2)
);
GO

DECLARE @TargetRows INT;
SELECT @TargetRows = TargetRows FROM dbo.Lab_Config;

;WITH E1(N) AS (SELECT 1 UNION ALL SELECT 1 UNION ALL SELECT 1 UNION ALL SELECT 1 
               UNION ALL SELECT 1 UNION ALL SELECT 1 UNION ALL SELECT 1 UNION ALL SELECT 1
               UNION ALL SELECT 1 UNION ALL SELECT 1),  -- 10 rows
     E2(N) AS (SELECT 1 FROM E1 a CROSS JOIN E1 b),      -- 100 rows
     E4(N) AS (SELECT 1 FROM E2 a CROSS JOIN E2 b),      -- 10,000 rows
     E8(N) AS (SELECT 1 FROM E4 a CROSS JOIN E4 b),      -- 100,000,000 rows
     Numbers AS (SELECT TOP (@TargetRows) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM E8)
INSERT INTO dbo.Lab_Transactions
SELECT 
    n AS TransactionID,
    ((n - 1) % 1000) + 1 AS CustomerID,
    100 + ((n - 1) % 11) + 1 AS ProductID,
    DATEADD(DAY, -(n % 365), GETDATE()) AS TransactionDate,
    (n % 100) + 1 AS Quantity,
    CASE ((n - 1) % 11)
        WHEN 0 THEN 1299.99 WHEN 1 THEN 999.99 WHEN 2 THEN 499.99
        WHEN 3 THEN 99.99   WHEN 4 THEN 500.00 WHEN 5 THEN 299.99
        WHEN 6 THEN 9.99    WHEN 7 THEN 65.00  WHEN 8 THEN 250.00
        WHEN 9 THEN 21.00   ELSE 149.99
    END AS UnitPrice,
    CASE WHEN n % 3 = 0 THEN 0.08 ELSE 0.10 END AS TaxRate,
    CASE WHEN n % 4 = 0 THEN 0.05 ELSE 0.00 END AS DiscountApplied
FROM Numbers;
GO

-- ============================================================================
-- 📈 INTEREST RATES (100 reference rates - fixed size)
-- ============================================================================
CREATE TABLE dbo.Lab_InterestRates (
    RateID INT NOT NULL,
    TierName VARCHAR(20),
    BaseRate DECIMAL(6,4),
    CompoundingPeriods INT,
    MinBalance DECIMAL(18,2),
    MaxBalance DECIMAL(18,2),
    EffectiveDate DATE,
    IsActive BIT
);

;WITH digits AS (SELECT n FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) AS t(n)),
     Numbers AS (SELECT d1.n * 10 + d2.n + 1 AS n FROM digits d1 CROSS JOIN digits d2)
INSERT INTO dbo.Lab_InterestRates
SELECT 
    n AS RateID,
    CASE (n % 4) WHEN 0 THEN 'Platinum' WHEN 1 THEN 'Gold' WHEN 2 THEN 'Silver' ELSE 'Bronze' END,
    CAST(0.02 + ((n % 10) * 0.005) AS DECIMAL(6,4)),
    CASE (n % 3) WHEN 0 THEN 1 WHEN 1 THEN 4 ELSE 12 END,
    CAST((n % 5) * 10000 AS DECIMAL(18,2)),
    CAST(((n % 5) + 1) * 50000 AS DECIMAL(18,2)),
    DATEADD(DAY, -(n % 365), GETDATE()),
    CASE WHEN n % 5 = 0 THEN 0 ELSE 1 END
FROM Numbers;
GO

-- ============================================================================
-- 📣 CAMPAIGNS (200 reference campaigns - fixed size)
-- ============================================================================
CREATE TABLE dbo.Lab_Campaigns (
    CampaignID INT NOT NULL,
    CampaignName VARCHAR(100),
    TargetSegment VARCHAR(20),
    BudgetAmount DECIMAL(18,2),
    ConversionRate DECIMAL(5,4),
    ResponseRate DECIMAL(5,4),
    StartDate DATE,
    EndDate DATE,
    IsActive BIT
);

;WITH digits AS (SELECT n FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) AS t(n)),
     Numbers AS (SELECT d1.n * 100 + d2.n * 10 + d3.n + 1 AS n 
                 FROM digits d1 CROSS JOIN digits d2 CROSS JOIN digits d3
                 WHERE d1.n * 100 + d2.n * 10 + d3.n + 1 <= 200)
INSERT INTO dbo.Lab_Campaigns
SELECT 
    n AS CampaignID,
    CONCAT('Campaign_', CAST(n AS VARCHAR(10))),
    CASE (n % 4) WHEN 0 THEN 'Gold' WHEN 1 THEN 'Silver' WHEN 2 THEN 'Bronze' ELSE 'All' END,
    CAST((n * 500) + 1000 AS DECIMAL(18,2)),
    CAST((n % 20) / 100.0 AS DECIMAL(5,4)),
    CAST((n % 40) / 100.0 AS DECIMAL(5,4)),
    DATEADD(DAY, -(n % 180), GETDATE()),
    DATEADD(DAY, -(n % 180) + 30, GETDATE()),
    CASE WHEN n % 3 = 0 THEN 0 ELSE 1 END
FROM Numbers;
GO

-- ============================================================================
-- ✅ VERIFICATION
-- ============================================================================
PRINT '';
PRINT '✅ Setup complete:';

SELECT 'Lab_Customers' AS [Table], COUNT(*) AS [Rows] FROM dbo.Lab_Customers
UNION ALL SELECT 'Lab_Products', COUNT(*) FROM dbo.Lab_Products
UNION ALL SELECT 'Lab_Transactions', COUNT(*) FROM dbo.Lab_Transactions
UNION ALL SELECT 'Lab_InterestRates', COUNT(*) FROM dbo.Lab_InterestRates
UNION ALL SELECT 'Lab_Campaigns', COUNT(*) FROM dbo.Lab_Campaigns
UNION ALL SELECT 'Lab_Geo', COUNT(*) FROM dbo.Lab_Geo
ORDER BY [Table];

DROP TABLE IF EXISTS dbo.Lab_Config;

PRINT '';
PRINT '🎯 Ready to test! Start with 01_InliningFundamentals, then 02_InliningViaExpressionBlock.';
