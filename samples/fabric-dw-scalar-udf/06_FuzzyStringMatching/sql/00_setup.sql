/*
    Lab 06: Fuzzy string matching
    00_setup.sql

    Scenario:
      - a retailer receives product listings from several supplier feeds;
      - each listing must be matched with a canonical product;
      - known variants provide a correctness oracle;
      - unknown products test whether the policy avoids automatic false matches.

    Default load:
      - 48 known product-name variants x 20 copies = 960 listings;
      - 4 unknown product names x 20 copies = 80 listings;
      - 1,040 incoming listings in total.

    The thresholds are illustrative. Production thresholds should be calibrated
    with labeled examples from the target catalog.
*/

SET NOCOUNT ON;
GO

DROP TABLE IF EXISTS dbo.BlogFuzzy_IncomingListing;
DROP TABLE IF EXISTS dbo.BlogFuzzy_AlgorithmExample;
DROP TABLE IF EXISTS dbo.BlogFuzzy_ListingVariant;
DROP TABLE IF EXISTS dbo.BlogFuzzy_ProductCatalog;
DROP TABLE IF EXISTS dbo.BlogFuzzy_Config;
GO

CREATE TABLE dbo.BlogFuzzy_Config
(
    CopiesPerVariant          INT NOT NULL,
    AutoEditSimilarity       INT NOT NULL,
    AutoJaroSimilarity       INT NOT NULL,
    ReviewEditSimilarity     INT NOT NULL,
    ReviewJaroSimilarity     INT NOT NULL
);
GO

INSERT INTO dbo.BlogFuzzy_Config
(
    CopiesPerVariant,
    AutoEditSimilarity,
    AutoJaroSimilarity,
    ReviewEditSimilarity,
    ReviewJaroSimilarity
)
SELECT
    20,
    88,
    90,
    70,
    80;
GO

CREATE TABLE dbo.BlogFuzzy_ProductCatalog
(
    ProductID     BIGINT       NOT NULL,
    Category      VARCHAR(30)  NOT NULL,
    CanonicalName VARCHAR(200) NOT NULL
);
GO

INSERT INTO dbo.BlogFuzzy_ProductCatalog
(
    ProductID,
    Category,
    CanonicalName
)
SELECT ProductID, Category, CanonicalName
FROM
(
    VALUES
        (1,  'Audio',     'Wireless Noise Cancelling Headphones'),
        (2,  'Audio',     'Portable Bluetooth Speaker'),
        (3,  'Audio',     'Studio USB Microphone'),
        (4,  'Computing', 'Mechanical Gaming Keyboard'),
        (5,  'Computing', 'Ergonomic Wireless Mouse'),
        (6,  'Computing', 'Ultra Wide Monitor'),
        (7,  'Home',      'Air Purifier Replacement Filter'),
        (8,  'Home',      'Stainless Steel Travel Mug'),
        (9,  'Home',      'Cordless Stick Vacuum'),
        (10, 'Fitness',   'Smart Fitness Tracker'),
        (11, 'Fitness',   'Adjustable Kettlebell Set'),
        (12, 'Fitness',   'Folding Exercise Bike')
) AS seed(ProductID, Category, CanonicalName);
GO

CREATE TABLE dbo.BlogFuzzy_ListingVariant
(
    VariantID          BIGINT       NOT NULL,
    ExpectedProductID  BIGINT       NOT NULL,
    Category           VARCHAR(30)  NOT NULL,
    VariationType      VARCHAR(30)  NOT NULL,
    SubmittedName      VARCHAR(200) NOT NULL
);
GO

CREATE TABLE dbo.BlogFuzzy_AlgorithmExample
(
    ExampleID       BIGINT       NOT NULL,
    ExampleType     VARCHAR(30)  NOT NULL,
    SourceText      VARCHAR(60)  NOT NULL,
    TargetText      VARCHAR(60)  NOT NULL,
    ExpectedFinding VARCHAR(200) NOT NULL
);
GO

INSERT INTO dbo.BlogFuzzy_AlgorithmExample
(
    ExampleID,
    ExampleType,
    SourceText,
    TargetText,
    ExpectedFinding
)
SELECT ExampleID, ExampleType, SourceText, TargetText, ExpectedFinding
FROM
(
    VALUES
        (1, 'Substitution',          'CAT',       'CUT',        'CustomClassicDistance and NativeOsaDistance both return 1 for CAT -> CUT; CustomWeightedDistance returns 2.'),
        (2, 'Insertion',             'HEADPHONE', 'HEADPHONES', 'CustomClassicDistance, CustomWeightedDistance, and NativeOsaDistance all return 1 for HEADPHONE -> HEADPHONES.'),
        (3, 'AdjacentTransposition', 'CA',        'AC',         'CustomClassicDistance returns 2 for CA -> AC, while NativeOsaDistance returns 1 because OSA counts the adjacent swap.'),
        (4, 'CommonPrefix',          'MARTHA',    'MARHTA',     'JaroWinklerSimilarity returns 96 for MARTHA -> MARHTA, compared with NativeOsaSimilarity at 83.'),
        (5, 'WeightedBusinessCost',  'CAT',       'CUT',        'CustomWeightedDistance returns 2 for CAT -> CUT because delete plus insert costs 2, less than substitution cost 3.')
) AS seed(ExampleID, ExampleType, SourceText, TargetText, ExpectedFinding);
GO

INSERT INTO dbo.BlogFuzzy_ListingVariant
(
    VariantID,
    ExpectedProductID,
    Category,
    VariationType,
    SubmittedName
)
SELECT VariantID, ExpectedProductID, Category, VariationType, SubmittedName
FROM
(
    VALUES
        (101, 1,  'Audio',     'Exact',         'Wireless Noise Cancelling Headphones'),
        (102, 1,  'Audio',     'MissingChar',   'Wireles Noise Cancelling Headphones'),
        (103, 1,  'Audio',     'Transposition', 'Wireless Noise Canceling Headphnoes'),
        (104, 1,  'Audio',     'Abbreviation',  'Wireless Noise Cancelling Headphones NC'),
        (201, 2,  'Audio',     'Exact',         'Portable Bluetooth Speaker'),
        (202, 2,  'Audio',     'MissingChar',   'Portable Bluetoth Speaker'),
        (203, 2,  'Audio',     'Transposition', 'Portable Bluetooth Spekaer'),
        (204, 2,  'Audio',     'Abbreviation',  'Portable BT Speaker'),
        (301, 3,  'Audio',     'Exact',         'Studio USB Microphone'),
        (302, 3,  'Audio',     'MissingChar',   'Studio USB Microphne'),
        (303, 3,  'Audio',     'Transposition', 'Studio USB Microhpone'),
        (304, 3,  'Audio',     'Punctuation',   'Studio USB-Microphone'),
        (401, 4,  'Computing', 'Exact',         'Mechanical Gaming Keyboard'),
        (402, 4,  'Computing', 'MissingChar',   'Mechanical Gaming Keybord'),
        (403, 4,  'Computing', 'Transposition', 'Mechanical Gmaing Keyboard'),
        (404, 4,  'Computing', 'Abbreviation',  'Mechanical Game Keyboard'),
        (501, 5,  'Computing', 'Exact',         'Ergonomic Wireless Mouse'),
        (502, 5,  'Computing', 'MissingChar',   'Ergonomic Wireles Mouse'),
        (503, 5,  'Computing', 'Transposition', 'Ergonomic Wireless Muose'),
        (504, 5,  'Computing', 'Abbreviation',  'Ergonomic WiFi Mouse'),
        (601, 6,  'Computing', 'Exact',         'Ultra Wide Monitor'),
        (602, 6,  'Computing', 'MissingChar',   'Ultra Wide Monitr'),
        (603, 6,  'Computing', 'Transposition', 'Ultra Wdie Monitor'),
        (604, 6,  'Computing', 'Punctuation',   'Ultra-Wide Monitor'),
        (701, 7,  'Home',      'Exact',         'Air Purifier Replacement Filter'),
        (702, 7,  'Home',      'MissingChar',   'Air Purifier Replacment Filter'),
        (703, 7,  'Home',      'Transposition', 'Air Purifier Replacement Fitler'),
        (704, 7,  'Home',      'Abbreviation',  'Air Purifier Repl Filter'),
        (801, 8,  'Home',      'Exact',         'Stainless Steel Travel Mug'),
        (802, 8,  'Home',      'MissingChar',   'Stainless Steel Trvel Mug'),
        (803, 8,  'Home',      'Transposition', 'Stainless Steel Travel Mgu'),
        (804, 8,  'Home',      'Punctuation',   'Stainless-Steel Travel Mug'),
        (901, 9,  'Home',      'Exact',         'Cordless Stick Vacuum'),
        (902, 9,  'Home',      'MissingChar',   'Cordless Stick Vacum'),
        (903, 9,  'Home',      'Transposition', 'Cordless Sitck Vacuum'),
        (904, 9,  'Home',      'Abbreviation',  'Cordless Stick Vac'),
        (1001, 10, 'Fitness',  'Exact',         'Smart Fitness Tracker'),
        (1002, 10, 'Fitness',  'MissingChar',   'Smart Fitnes Tracker'),
        (1003, 10, 'Fitness',  'Transposition', 'Smart Fitness Trakcer'),
        (1004, 10, 'Fitness',  'Abbreviation',  'Smart Fit Tracker'),
        (1101, 11, 'Fitness',  'Exact',         'Adjustable Kettlebell Set'),
        (1102, 11, 'Fitness',  'MissingChar',   'Adjustable Kettlbell Set'),
        (1103, 11, 'Fitness',  'Transposition', 'Adjustable Kettlebell Ste'),
        (1104, 11, 'Fitness',  'Punctuation',   'Adjustable Kettlebell-Set'),
        (1201, 12, 'Fitness',  'Exact',         'Folding Exercise Bike'),
        (1202, 12, 'Fitness',  'MissingChar',   'Folding Exerise Bike'),
        (1203, 12, 'Fitness',  'Transposition', 'Folding Exercise Bkie'),
        (1204, 12, 'Fitness',  'Abbreviation',  'Folding Ex Bike'),
        (1301, 0,  'Audio',     'UnknownProduct', 'Acoustic Turntable Replacement Needle'),
        (1302, 0,  'Computing', 'UnknownProduct', 'External Solid State Drive Enclosure'),
        (1303, 0,  'Home',      'UnknownProduct', 'Ceramic Induction Cookware Set'),
        (1304, 0,  'Fitness',   'UnknownProduct', 'Foam Balance Training Pad')
) AS seed(VariantID, ExpectedProductID, Category, VariationType, SubmittedName);
GO

CREATE TABLE dbo.BlogFuzzy_IncomingListing AS
WITH digits AS
(
    SELECT n
    FROM
    (
        VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)
    ) AS d(n)
),
copy_numbers AS
(
    SELECT
        ones.n + (10 * tens.n) + (100 * hundreds.n) AS CopyNumber
    FROM digits AS ones
    CROSS JOIN digits AS tens
    CROSS JOIN digits AS hundreds
),
selected_copies AS
(
    SELECT n.CopyNumber
    FROM copy_numbers AS n
    CROSS JOIN dbo.BlogFuzzy_Config AS cfg
    WHERE n.CopyNumber < cfg.CopiesPerVariant
)
SELECT
    CAST((copies.CopyNumber * 10000) + variants.VariantID AS BIGINT) AS ListingID,
    CAST((copies.CopyNumber / 10) + 1 AS INT) AS LoadBatchID,
    CAST(
        CASE copies.CopyNumber % 3
            WHEN 0 THEN 'Supplier Feed 1'
            WHEN 1 THEN 'Supplier Feed 2'
            ELSE        'Supplier Feed 3'
        END AS VARCHAR(20)
    ) AS SourceFeed,
    variants.Category,
    variants.SubmittedName,
    variants.VariationType,
    variants.ExpectedProductID
FROM dbo.BlogFuzzy_ListingVariant AS variants
CROSS JOIN selected_copies AS copies;
GO

SELECT
    COUNT(*) AS IncomingListingCount,
    SUM(CASE WHEN ExpectedProductID > 0 THEN 1 ELSE 0 END) AS KnownMatchListingCount,
    SUM(CASE WHEN ExpectedProductID = 0 THEN 1 ELSE 0 END) AS UnknownProductListingCount,
    COUNT(DISTINCT CASE WHEN ExpectedProductID > 0 THEN ExpectedProductID END) AS ExpectedProductCount
FROM dbo.BlogFuzzy_IncomingListing;
GO
