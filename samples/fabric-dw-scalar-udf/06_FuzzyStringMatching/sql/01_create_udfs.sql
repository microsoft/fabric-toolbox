/*
    Lab 06: Fuzzy string matching
    01_create_udfs.sql

    Both functions are computation-based and read no tables.

    BlogFuzzy_WeightedLevenshtein is a hand-built dynamic-programming
    implementation of classic Levenshtein distance. It supports configurable
    insertion, deletion, and substitution costs. It does not treat adjacent
    transposition as one edit.

    BlogFuzzy_MatchDisposition composes the native fuzzy string functions into
    a reusable product-matching policy. Its thresholds are parameters so
    the policy can be calibrated without hiding weights inside the function.
*/

SET NOCOUNT ON;
GO

DROP FUNCTION IF EXISTS dbo.BlogFuzzy_MatchGrade;
DROP FUNCTION IF EXISTS dbo.BlogFuzzy_MatchScore;
GO

CREATE OR ALTER FUNCTION dbo.BlogFuzzy_WeightedLevenshtein
(
    @source_text       VARCHAR(60),
    @target_text       VARCHAR(60),
    @insertion_cost    INT,
    @deletion_cost     INT,
    @substitution_cost INT
)
RETURNS INT
AS
BEGIN
    IF @source_text IS NULL OR @target_text IS NULL
        RETURN NULL;

    IF @insertion_cost < 1 OR @insertion_cost > 100
        OR @deletion_cost < 1 OR @deletion_cost > 100
        OR @substitution_cost < 1 OR @substitution_cost > 100
        RETURN NULL;

    DECLARE @source VARCHAR(60) = UPPER(LTRIM(RTRIM(@source_text)));
    DECLARE @target VARCHAR(60) = UPPER(LTRIM(RTRIM(@target_text)));
    DECLARE @source_length INT = LEN(@source);
    DECLARE @target_length INT = LEN(@target);
    DECLARE @matrix NVARCHAR(4000) =
        REPLICATE(NCHAR(0), (@source_length + 1) * (@target_length + 1));
    DECLARE @source_position INT = 0;
    DECLARE @target_position INT = 0;
    DECLARE @delete_value INT;
    DECLARE @insert_value INT;
    DECLARE @substitute_value INT;
    DECLARE @cell_value INT;

    IF @source_length = 0 RETURN @target_length * @insertion_cost;
    IF @target_length = 0 RETURN @source_length * @deletion_cost;

    WHILE @source_position <= @source_length
    BEGIN
        SET @matrix = STUFF(
            @matrix,
            @source_position + 1,
            1,
            NCHAR(@source_position * @deletion_cost)
        );
        SET @source_position = @source_position + 1;
    END

    SET @target_position = 0;
    WHILE @target_position <= @target_length
    BEGIN
        SET @matrix = STUFF(
            @matrix,
            (@target_position * (@source_length + 1)) + 1,
            1,
            NCHAR(@target_position * @insertion_cost)
        );
        SET @target_position = @target_position + 1;
    END

    SET @source_position = 1;
    WHILE @source_position <= @source_length
    BEGIN
        SET @target_position = 1;

        WHILE @target_position <= @target_length
        BEGIN
            SET @delete_value =
                UNICODE(
                    SUBSTRING(
                        @matrix,
                        (@target_position * (@source_length + 1)) + @source_position,
                        1
                    )
                ) + @deletion_cost;

            SET @insert_value =
                UNICODE(
                    SUBSTRING(
                        @matrix,
                        ((@target_position - 1) * (@source_length + 1)) + @source_position + 1,
                        1
                    )
                ) + @insertion_cost;

            SET @substitute_value =
                UNICODE(
                    SUBSTRING(
                        @matrix,
                        ((@target_position - 1) * (@source_length + 1)) + @source_position,
                        1
                    )
                ) +
                CASE
                    WHEN SUBSTRING(@source, @source_position, 1) =
                         SUBSTRING(@target, @target_position, 1)
                        THEN 0
                    ELSE @substitution_cost
                END;

            SET @cell_value =
                CASE
                    WHEN @delete_value <= @insert_value
                         AND @delete_value <= @substitute_value
                        THEN @delete_value
                    WHEN @insert_value <= @substitute_value
                        THEN @insert_value
                    ELSE @substitute_value
                END;

            SET @matrix = STUFF(
                @matrix,
                (@target_position * (@source_length + 1)) + @source_position + 1,
                1,
                NCHAR(@cell_value)
            );

            SET @target_position = @target_position + 1;
        END

        SET @source_position = @source_position + 1;
    END

    RETURN UNICODE(
        SUBSTRING(
            @matrix,
            (@target_length * (@source_length + 1)) + @source_length + 1,
            1
        )
    );
END;
GO

CREATE OR ALTER FUNCTION dbo.BlogFuzzy_MatchDisposition
(
    @canonical_name          VARCHAR(200),
    @submitted_name          VARCHAR(200),
    @auto_edit_threshold     INT,
    @auto_jaro_threshold     INT,
    @review_edit_threshold   INT,
    @review_jaro_threshold   INT
)
RETURNS VARCHAR(20)
AS
BEGIN
    IF @canonical_name IS NULL OR @submitted_name IS NULL
        RETURN 'MISSING';

    IF @auto_edit_threshold IS NULL
        OR @auto_jaro_threshold IS NULL
        OR @review_edit_threshold IS NULL
        OR @review_jaro_threshold IS NULL
        OR @auto_edit_threshold < 0 OR @auto_edit_threshold > 100
        OR @auto_jaro_threshold < 0 OR @auto_jaro_threshold > 100
        OR @review_edit_threshold < 0 OR @review_edit_threshold > 100
        OR @review_jaro_threshold < 0 OR @review_jaro_threshold > 100
        OR @review_edit_threshold > @auto_edit_threshold
        OR @review_jaro_threshold > @auto_jaro_threshold
        RETURN 'INVALID_POLICY';

    DECLARE @canonical VARCHAR(200) =
        UPPER(LTRIM(RTRIM(@canonical_name)));
    DECLARE @submitted VARCHAR(200) =
        UPPER(LTRIM(RTRIM(@submitted_name)));
    DECLARE @distance INT =
        EDIT_DISTANCE(@canonical, @submitted);
    DECLARE @edit_similarity INT =
        EDIT_DISTANCE_SIMILARITY(@canonical, @submitted);
    DECLARE @jaro_similarity INT =
        JARO_WINKLER_SIMILARITY(@canonical, @submitted);

    IF @distance = 0
        RETURN 'EXACT';

    IF @edit_similarity >= @auto_edit_threshold
        AND @jaro_similarity >= @auto_jaro_threshold
        RETURN 'AUTO_MATCH';

    IF @edit_similarity >= @review_edit_threshold
        OR @jaro_similarity >= @review_jaro_threshold
        RETURN 'REVIEW';

    RETURN 'NO_MATCH';
END;
GO

SELECT
    SCHEMA_NAME(o.schema_id) AS FunctionSchema,
    o.name AS FunctionName,
    m.is_inlineable AS IsInlineable,
    m.inline_eligibility_mask AS InlineEligibilityMask
FROM sys.objects AS o
JOIN sys.sql_modules AS m
    ON m.object_id = o.object_id
WHERE o.name IN
(
    'BlogFuzzy_WeightedLevenshtein',
    'BlogFuzzy_MatchDisposition'
)
ORDER BY o.name;
GO
