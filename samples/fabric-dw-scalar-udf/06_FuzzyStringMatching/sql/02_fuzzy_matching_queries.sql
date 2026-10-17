/*
    Lab 06: Fuzzy string matching
    02_fuzzy_matching_queries.sql

    Query 1: compare custom classic Levenshtein with the native algorithms.
    Query 2: inspect controlled catalog variants and the reusable policy.
    Query 3: prove direct-policy and UDF-policy parity.
    Query 4: rank catalog candidates for each supplier listing.
    Query 5: validate known matches and unknown-product protection.
    Query 6: produce a review queue.
    Query 7: summarize data quality by supplier feed and category.
*/

SET NOCOUNT ON;
GO

/*
    Query 1: algorithm and customization differences.

    CustomClassicDistance uses insertion/deletion/substitution costs of one.
    CustomWeightedDistance makes substitution cost three.
    NativeOsaDistance uses the Optimal String Alignment variant of
    Damerau-Levenshtein and credits adjacent transposition as one edit.
    Distance values are better when lower. Similarity values are better when
    higher. Rows 1 and 5 intentionally use the same strings to contrast unit
    costs with weighted business costs.
*/
SELECT
    ExampleID,
    ExampleType,
    SourceText,
    TargetText,
    dbo.BlogFuzzy_WeightedLevenshtein(
        SourceText,
        TargetText,
        1,
        1,
        1
    ) AS CustomClassicDistance,
    dbo.BlogFuzzy_WeightedLevenshtein(
        SourceText,
        TargetText,
        1,
        1,
        3
    ) AS CustomWeightedDistance,
    EDIT_DISTANCE(SourceText, TargetText) AS NativeOsaDistance,
    EDIT_DISTANCE_SIMILARITY(SourceText, TargetText) AS NativeOsaSimilarity,
    JARO_WINKLER_DISTANCE(SourceText, TargetText) AS JaroWinklerDistance,
    JARO_WINKLER_SIMILARITY(SourceText, TargetText) AS JaroWinklerSimilarity,
    ExpectedFinding AS WhatThisRowShows
FROM dbo.BlogFuzzy_AlgorithmExample
ORDER BY ExampleID;
GO

/* Query 2: controlled examples with transparent measurements and policy output. */
SELECT
    variants.VariantID,
    variants.VariationType,
    catalog.CanonicalName,
    variants.SubmittedName,
    EDIT_DISTANCE(
        UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
        UPPER(LTRIM(RTRIM(variants.SubmittedName)))
    ) AS EditDistance,
    EDIT_DISTANCE_SIMILARITY(
        UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
        UPPER(LTRIM(RTRIM(variants.SubmittedName)))
    ) AS EditSimilarity,
    JARO_WINKLER_SIMILARITY(
        UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
        UPPER(LTRIM(RTRIM(variants.SubmittedName)))
    ) AS JaroWinklerSimilarity,
    dbo.BlogFuzzy_MatchDisposition(
        catalog.CanonicalName,
        variants.SubmittedName,
        config.AutoEditSimilarity,
        config.AutoJaroSimilarity,
        config.ReviewEditSimilarity,
        config.ReviewJaroSimilarity
    ) AS MatchDisposition
FROM dbo.BlogFuzzy_ListingVariant AS variants
JOIN dbo.BlogFuzzy_ProductCatalog AS catalog
    ON catalog.ProductID = variants.ExpectedProductID
CROSS JOIN dbo.BlogFuzzy_Config AS config
ORDER BY variants.VariantID;
GO

/*
    Query 3: interoperability parity proof.
    The direct CASE policy and the UDF-wrapped policy must agree for every
    controlled known-match variant.
*/
WITH measurements AS
(
    SELECT
        variants.VariantID,
        variants.VariationType,
        catalog.CanonicalName,
        variants.SubmittedName,
        config.AutoEditSimilarity,
        config.AutoJaroSimilarity,
        config.ReviewEditSimilarity,
        config.ReviewJaroSimilarity,
        EDIT_DISTANCE(
            UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
            UPPER(LTRIM(RTRIM(variants.SubmittedName)))
        ) AS EditDistance,
        EDIT_DISTANCE_SIMILARITY(
            UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
            UPPER(LTRIM(RTRIM(variants.SubmittedName)))
        ) AS EditSimilarity,
        JARO_WINKLER_SIMILARITY(
            UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
            UPPER(LTRIM(RTRIM(variants.SubmittedName)))
        ) AS JaroWinklerSimilarity
    FROM dbo.BlogFuzzy_ListingVariant AS variants
    JOIN dbo.BlogFuzzy_ProductCatalog AS catalog
        ON catalog.ProductID = variants.ExpectedProductID
    CROSS JOIN dbo.BlogFuzzy_Config AS config
    WHERE variants.ExpectedProductID > 0
),
parity AS
(
    SELECT
        VariantID,
        VariationType,
        CanonicalName,
        SubmittedName,
        CASE
            WHEN EditDistance = 0
                THEN 'EXACT'
            WHEN EditSimilarity >= AutoEditSimilarity
                 AND JaroWinklerSimilarity >= AutoJaroSimilarity
                THEN 'AUTO_MATCH'
            WHEN EditSimilarity >= ReviewEditSimilarity
                 OR JaroWinklerSimilarity >= ReviewJaroSimilarity
                THEN 'REVIEW'
            ELSE 'NO_MATCH'
        END AS DirectDisposition,
        dbo.BlogFuzzy_MatchDisposition(
            CanonicalName,
            SubmittedName,
            AutoEditSimilarity,
            AutoJaroSimilarity,
            ReviewEditSimilarity,
            ReviewJaroSimilarity
        ) AS UdfDisposition
    FROM measurements
)
SELECT
    COUNT(*) AS ComparedVariantCount,
    SUM(
        CASE
            WHEN DirectDisposition = UdfDisposition THEN 0
            ELSE 1
        END
    ) AS DispositionMismatchCount
FROM parity;
GO

/*
    Query 4: candidate ranking.
    Category narrows the candidate set. The scalar UDF supplies the reusable
    operational decision inside a CTE and windowed analytical query.
*/
WITH candidate_scores AS
(
    SELECT
        incoming.ListingID,
        incoming.SourceFeed,
        incoming.Category,
        incoming.SubmittedName,
        incoming.VariationType,
        incoming.ExpectedProductID,
        catalog.ProductID AS CandidateProductID,
        catalog.CanonicalName,
        EDIT_DISTANCE(
            UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
            UPPER(LTRIM(RTRIM(incoming.SubmittedName)))
        ) AS EditDistance,
        EDIT_DISTANCE_SIMILARITY(
            UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
            UPPER(LTRIM(RTRIM(incoming.SubmittedName)))
        ) AS EditSimilarity,
        JARO_WINKLER_SIMILARITY(
            UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
            UPPER(LTRIM(RTRIM(incoming.SubmittedName)))
        ) AS JaroWinklerSimilarity,
        dbo.BlogFuzzy_MatchDisposition(
            catalog.CanonicalName,
            incoming.SubmittedName,
            config.AutoEditSimilarity,
            config.AutoJaroSimilarity,
            config.ReviewEditSimilarity,
            config.ReviewJaroSimilarity
        ) AS MatchDisposition
    FROM dbo.BlogFuzzy_IncomingListing AS incoming
    JOIN dbo.BlogFuzzy_ProductCatalog AS catalog
        ON catalog.Category = incoming.Category
    CROSS JOIN dbo.BlogFuzzy_Config AS config
),
ranked_candidates AS
(
    SELECT
        ListingID,
        SourceFeed,
        Category,
        SubmittedName,
        VariationType,
        ExpectedProductID,
        CandidateProductID,
        CanonicalName,
        EditDistance,
        EditSimilarity,
        JaroWinklerSimilarity,
        MatchDisposition,
        ROW_NUMBER() OVER
        (
            PARTITION BY ListingID
            ORDER BY
                CASE MatchDisposition
                    WHEN 'EXACT'      THEN 1
                    WHEN 'AUTO_MATCH' THEN 2
                    WHEN 'REVIEW'     THEN 3
                    ELSE                  4
                END,
                EditSimilarity DESC,
                JaroWinklerSimilarity DESC,
                EditDistance ASC,
                CandidateProductID ASC
        ) AS CandidateRank
    FROM candidate_scores
)
SELECT TOP 50
    ListingID,
    SourceFeed,
    Category,
    SubmittedName,
    CanonicalName AS CandidateCanonicalName,
    EditDistance,
    EditSimilarity,
    JaroWinklerSimilarity,
    MatchDisposition,
    CASE
        WHEN ExpectedProductID = 0 THEN 'UNKNOWN_PRODUCT'
        WHEN CandidateProductID = ExpectedProductID THEN 'CORRECT_CANDIDATE'
        ELSE 'INCORRECT_CANDIDATE'
    END AS ValidationResult
FROM ranked_candidates
WHERE CandidateRank = 1
ORDER BY ListingID;
GO

/* Query 5: validate known matches and protection against unknown auto-matches. */
WITH candidate_scores AS
(
    SELECT
        incoming.ListingID,
        incoming.ExpectedProductID,
        catalog.ProductID AS CandidateProductID,
        EDIT_DISTANCE(
            UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
            UPPER(LTRIM(RTRIM(incoming.SubmittedName)))
        ) AS EditDistance,
        EDIT_DISTANCE_SIMILARITY(
            UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
            UPPER(LTRIM(RTRIM(incoming.SubmittedName)))
        ) AS EditSimilarity,
        JARO_WINKLER_SIMILARITY(
            UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
            UPPER(LTRIM(RTRIM(incoming.SubmittedName)))
        ) AS JaroWinklerSimilarity,
        dbo.BlogFuzzy_MatchDisposition(
            catalog.CanonicalName,
            incoming.SubmittedName,
            config.AutoEditSimilarity,
            config.AutoJaroSimilarity,
            config.ReviewEditSimilarity,
            config.ReviewJaroSimilarity
        ) AS MatchDisposition
    FROM dbo.BlogFuzzy_IncomingListing AS incoming
    JOIN dbo.BlogFuzzy_ProductCatalog AS catalog
        ON catalog.Category = incoming.Category
    CROSS JOIN dbo.BlogFuzzy_Config AS config
),
ranked_candidates AS
(
    SELECT
        ListingID,
        ExpectedProductID,
        CandidateProductID,
        MatchDisposition,
        ROW_NUMBER() OVER
        (
            PARTITION BY ListingID
            ORDER BY
                CASE MatchDisposition
                    WHEN 'EXACT'      THEN 1
                    WHEN 'AUTO_MATCH' THEN 2
                    WHEN 'REVIEW'     THEN 3
                    ELSE                  4
                END,
                EditSimilarity DESC,
                JaroWinklerSimilarity DESC,
                EditDistance ASC,
                CandidateProductID ASC
        ) AS CandidateRank
    FROM candidate_scores
)
SELECT
    COUNT(*) AS IncomingListingCount,
    SUM(CASE WHEN ExpectedProductID > 0 THEN 1 ELSE 0 END) AS KnownMatchListingCount,
    SUM(
        CASE
            WHEN ExpectedProductID > 0
                 AND CandidateProductID = ExpectedProductID
                THEN 1
            ELSE 0
        END
    ) AS CorrectKnownCandidateCount,
    SUM(CASE WHEN ExpectedProductID = 0 THEN 1 ELSE 0 END) AS UnknownProductListingCount,
    SUM(
        CASE
            WHEN ExpectedProductID = 0
                 AND MatchDisposition IN ('EXACT', 'AUTO_MATCH')
                THEN 1
            ELSE 0
        END
    ) AS UnknownProductAutoMatchCount
FROM ranked_candidates
WHERE CandidateRank = 1;
GO

/* Query 6: listings that need human review or a new-product workflow. */
WITH candidate_scores AS
(
    SELECT
        incoming.ListingID,
        incoming.SourceFeed,
        incoming.Category,
        incoming.SubmittedName,
        catalog.ProductID AS CandidateProductID,
        catalog.CanonicalName,
        EDIT_DISTANCE(
            UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
            UPPER(LTRIM(RTRIM(incoming.SubmittedName)))
        ) AS EditDistance,
        EDIT_DISTANCE_SIMILARITY(
            UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
            UPPER(LTRIM(RTRIM(incoming.SubmittedName)))
        ) AS EditSimilarity,
        JARO_WINKLER_SIMILARITY(
            UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
            UPPER(LTRIM(RTRIM(incoming.SubmittedName)))
        ) AS JaroWinklerSimilarity,
        dbo.BlogFuzzy_MatchDisposition(
            catalog.CanonicalName,
            incoming.SubmittedName,
            config.AutoEditSimilarity,
            config.AutoJaroSimilarity,
            config.ReviewEditSimilarity,
            config.ReviewJaroSimilarity
        ) AS MatchDisposition
    FROM dbo.BlogFuzzy_IncomingListing AS incoming
    JOIN dbo.BlogFuzzy_ProductCatalog AS catalog
        ON catalog.Category = incoming.Category
    CROSS JOIN dbo.BlogFuzzy_Config AS config
),
ranked_candidates AS
(
    SELECT
        ListingID,
        SourceFeed,
        Category,
        SubmittedName,
        CandidateProductID,
        CanonicalName,
        EditDistance,
        EditSimilarity,
        JaroWinklerSimilarity,
        MatchDisposition,
        ROW_NUMBER() OVER
        (
            PARTITION BY ListingID
            ORDER BY
                CASE MatchDisposition
                    WHEN 'EXACT'      THEN 1
                    WHEN 'AUTO_MATCH' THEN 2
                    WHEN 'REVIEW'     THEN 3
                    ELSE                  4
                END,
                EditSimilarity DESC,
                JaroWinklerSimilarity DESC,
                EditDistance ASC,
                CandidateProductID ASC
        ) AS CandidateRank
    FROM candidate_scores
)
SELECT TOP 50
    ListingID,
    SourceFeed,
    Category,
    SubmittedName,
    CanonicalName AS CandidateCanonicalName,
    EditSimilarity,
    JaroWinklerSimilarity,
    MatchDisposition
FROM ranked_candidates
WHERE CandidateRank = 1
  AND MatchDisposition IN ('REVIEW', 'NO_MATCH')
ORDER BY
    CASE MatchDisposition WHEN 'REVIEW' THEN 1 ELSE 2 END,
    EditSimilarity DESC,
    ListingID;
GO

/* Query 7: data-quality summary by supplier feed and category. */
WITH candidate_scores AS
(
    SELECT
        incoming.ListingID,
        incoming.SourceFeed,
        incoming.Category,
        catalog.ProductID AS CandidateProductID,
        EDIT_DISTANCE(
            UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
            UPPER(LTRIM(RTRIM(incoming.SubmittedName)))
        ) AS EditDistance,
        EDIT_DISTANCE_SIMILARITY(
            UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
            UPPER(LTRIM(RTRIM(incoming.SubmittedName)))
        ) AS EditSimilarity,
        JARO_WINKLER_SIMILARITY(
            UPPER(LTRIM(RTRIM(catalog.CanonicalName))),
            UPPER(LTRIM(RTRIM(incoming.SubmittedName)))
        ) AS JaroWinklerSimilarity,
        dbo.BlogFuzzy_MatchDisposition(
            catalog.CanonicalName,
            incoming.SubmittedName,
            config.AutoEditSimilarity,
            config.AutoJaroSimilarity,
            config.ReviewEditSimilarity,
            config.ReviewJaroSimilarity
        ) AS MatchDisposition
    FROM dbo.BlogFuzzy_IncomingListing AS incoming
    JOIN dbo.BlogFuzzy_ProductCatalog AS catalog
        ON catalog.Category = incoming.Category
    CROSS JOIN dbo.BlogFuzzy_Config AS config
),
ranked_candidates AS
(
    SELECT
        ListingID,
        SourceFeed,
        Category,
        MatchDisposition,
        ROW_NUMBER() OVER
        (
            PARTITION BY ListingID
            ORDER BY
                CASE MatchDisposition
                    WHEN 'EXACT'      THEN 1
                    WHEN 'AUTO_MATCH' THEN 2
                    WHEN 'REVIEW'     THEN 3
                    ELSE                  4
                END,
                EditSimilarity DESC,
                JaroWinklerSimilarity DESC,
                EditDistance ASC,
                CandidateProductID ASC
        ) AS CandidateRank
    FROM candidate_scores
)
SELECT
    SourceFeed,
    Category,
    MatchDisposition,
    COUNT(*) AS ListingCount
FROM ranked_candidates
WHERE CandidateRank = 1
GROUP BY
    SourceFeed,
    Category,
    MatchDisposition
ORDER BY
    SourceFeed,
    Category,
    MatchDisposition;
GO
