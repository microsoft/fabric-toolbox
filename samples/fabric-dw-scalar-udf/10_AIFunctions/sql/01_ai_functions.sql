-- ============================================================================
-- Lab 10: AI functions through Scalar UDF Inlining
-- ============================================================================

-- Step 1: Extract structured order-inquiry details.
CREATE OR ALTER FUNCTION dbo.udf_ExtractOrderDetails
(
    @CustomerMessage VARCHAR(MAX)
)
RETURNS VARCHAR(MAX)
AS
BEGIN
    RETURN CAST(
        AI_EXTRACT(
            @CustomerMessage,
            'order_reference',
            'issue_summary',
            'requested_outcome'
            NULL ON ERROR
        )
        AS VARCHAR(MAX)
    );
END;
GO

-- Step 2: Classify each inquiry into a reply policy.
CREATE OR ALTER FUNCTION dbo.udf_ClassifyOrderInquiry
(
    @CustomerMessage VARCHAR(MAX)
)
RETURNS VARCHAR(50)
AS
BEGIN
    RETURN CAST(
        AI_CLASSIFY(
            @CustomerMessage,
            'delivery_status',
            'delayed_delivery',
            'damaged_item',
            'wrong_item',
            'missing_item',
            'return_request',
            'refund_status',
            'cancellation_request',
            'order_change',
            'product_question',
            'positive_feedback',
            'other'
            NULL ON ERROR
        )
        AS VARCHAR(50)
    );
END;
GO

-- Step 3: Generate a demonstration draft using extracted context and the assigned policy.
CREATE OR ALTER FUNCTION dbo.udf_DraftOrderReply
(
    @CustomerMessage VARCHAR(MAX),
    @ExtractedOrderDetails VARCHAR(MAX),
    @BasePrompt VARCHAR(MAX),
    @ReplyPolicy VARCHAR(MAX)
)
RETURNS VARCHAR(MAX)
AS
BEGIN
    RETURN CAST(
        AI_GENERATE_RESPONSE(
            CONCAT(
                @BasePrompt,
                ' ',
                @ReplyPolicy
            ),
            CONCAT(
                'Customer message: ',
                @CustomerMessage,
                ' Extracted order details JSON: ',
                COALESCE(NULLIF(@ExtractedOrderDetails, ''), '{}')
            )
            NULL ON ERROR
        )
        AS VARCHAR(MAX)
    );
END;
GO

-- Step 4: Confirm Scalar UDF Inlining eligibility.
SELECT
    o.name AS FunctionName,
    m.is_inlineable,
    m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON m.object_id = o.object_id
WHERE o.object_id IN
(
    OBJECT_ID('dbo.udf_ExtractOrderDetails'),
    OBJECT_ID('dbo.udf_ClassifyOrderInquiry'),
    OBJECT_ID('dbo.udf_DraftOrderReply')
)
ORDER BY
    o.name;
GO

-- Step 5: Extract structured details for inquiries requiring a draft.
UPDATE dbo.Lab_AIRequests
SET ExtractedOrderDetails =
    dbo.udf_ExtractOrderDetails(CustomerMessage)
WHERE NeedsDraft = 1
  AND ExtractedOrderDetails IS NULL;
GO

-- Step 6: Classify inquiries requiring a draft.
UPDATE dbo.Lab_AIRequests
SET ReplyPolicy =
    dbo.udf_ClassifyOrderInquiry(CustomerMessage)
WHERE NeedsDraft = 1
  AND ReplyPolicy IS NULL;
GO

-- Step 7: Create the draft-reply view.
CREATE OR ALTER VIEW dbo.vw_Lab_AIDraftOrderReplies
AS
SELECT
    r.RequestID,
    r.ScenarioName,
    r.CustomerMessage,
    r.ExtractedOrderDetails,
    r.ReplyPolicy,
    b.PromptVersion,
    dbo.udf_DraftOrderReply(
        r.CustomerMessage,
        r.ExtractedOrderDetails,
        b.PromptText,
        p.PromptText
    ) AS DraftReply
FROM dbo.Lab_AIRequests AS r
CROSS JOIN
(
    SELECT
        PromptVersion,
        PromptText
    FROM dbo.Lab_AIPromptTemplates
    WHERE PromptName = 'reply_base'
      AND ReplyPolicy = 'all'
      AND PromptVersion = 1
) AS b
INNER JOIN dbo.Lab_AIPromptTemplates AS p
    ON p.PromptName = 'reply_policy'
   AND p.PromptVersion = b.PromptVersion
   AND p.ReplyPolicy = COALESCE(r.ReplyPolicy, 'other')
WHERE r.NeedsDraft = 1;
GO

-- Step 8: Materialize the view once with CTAS.
DROP TABLE IF EXISTS dbo.Lab_AIResults;
GO

CREATE TABLE dbo.Lab_AIResults AS
SELECT
    RequestID,
    ScenarioName,
    CustomerMessage,
    ExtractedOrderDetails,
    ReplyPolicy,
    PromptVersion,
    DraftReply
FROM dbo.vw_Lab_AIDraftOrderReplies;
GO

-- Step 9: Analyze the materialized results without additional AI calls.
SELECT
    RequestID,
    ScenarioName,
    CustomerMessage,
    ExtractedOrderDetails,
    ReplyPolicy,
    PromptVersion,
    DraftReply,
    CASE
        WHEN ExtractedOrderDetails IS NOT NULL
         AND ReplyPolicy IS NOT NULL
         AND DraftReply IS NOT NULL
        THEN 'Materialized'
        ELSE 'Review NULL output'
    END AS ProcessingStatus
FROM dbo.Lab_AIResults
ORDER BY
    RequestID;
GO

SELECT
    ReplyPolicy,
    COUNT(*) AS RequestCount
FROM dbo.Lab_AIResults
GROUP BY
    ReplyPolicy
ORDER BY
    RequestCount DESC;
GO
