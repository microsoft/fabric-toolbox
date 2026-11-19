# Lab 10: AI Functions in Scalar UDFs

⏱️ **Estimated time:** 8–12 minutes; AI execution time can vary.

**Inlining coverage:** Scalar UDF inlining

> **Preview:** AI functions are currently in preview. Review the
> [AI functions prerequisites](https://learn.microsoft.com/en-us/fabric/data-warehouse/ai-functions#prerequisites)
> before starting.

## Read This First

This lab demonstrates AI functions in scalar UDFs that are eligible for Scalar UDF Inlining.

Microsoft Fabric Data Warehouse automatically inlines eligible AI-backed UDFs by replacing
their calls with expressions in supported calling queries.

> **Note:** AI functions aren't supported by Expression Block inlining.

The lab uses `AI_EXTRACT`, `AI_CLASSIFY`, and `AI_GENERATE_RESPONSE` to enrich a prepared table of
ecommerce order inquiries. Each AI function is wrapped in a separate UDF and applied in a separate
query.

> **Synthetic data only:** Every message, product description, and order reference in this lab is
> fictional. The sample isn't connected to a retailer, customer account, order system, shipment,
> return, refund, inventory record, or payment system. Generated replies are demonstration drafts
> that require human review and aren't production customer-service guidance.

This lab demonstrates that:

1. A scalar UDF can contain an AI function.
2. AI-backed UDFs use Scalar UDF Inlining and report eligibility mask `1`.
3. AI-backed UDFs can form a chained extraction, classification, and response-generation flow.
4. AI-backed UDFs can be used in a DML workflow to update selected rows and materialize results
   for later use.

## Understand the Results

1. This lab demonstrates AI functions inside inlineable scalar UDFs as part of a DML workflow.
2. AI-generated text can differ between runs.
3. With `NULL ON ERROR`, an unsuccessful AI call returns `NULL` instead of failing the entire
   query. See the linked AI function documentation for details.
4. The lab focuses on executing and materializing AI results, not evaluating the quality of the
   generated replies.

## Before You Run

Use a dedicated **Warehouse**, not a SQL analytics endpoint, with permission to create the lab
objects. Rerunning setup replaces this lab's tables and their contents. Cleanup removes all
objects created by this lab.
Lab 10 has its own setup and does not require the shared source tables.

Free-text columns, UDF parameters, and extraction/reply return values use `VARCHAR(MAX)` so
other messages and prompts aren't narrowed to the lengths used by this sample. Policy keys
remain `VARCHAR(50)` because they come from the classification labels. The reply UDF's
`@ReplyPolicy` parameter receives the policy's prompt text, not its key. `MAX` does not remove
Warehouse storage limits or the AI functions' input limits; see the linked documentation.

AI functions call external AI APIs through Microsoft Fabric. Review the linked prerequisites
and your organization's data-handling requirements before running.

## Run the Lab

First, run
[`sql/00_setup_ai_requests.sql`](sql/00_setup_ai_requests.sql).

The default setup creates 12 inquiry types and processes six rows from each. Each selected row runs
through extraction, classification, and reply generation, for 72 rows and about 216 AI
evaluations. Change `DraftCasesPerScenario` to adjust the workload; higher values take longer and
might use more Microsoft Fabric capacity. Stored prompts ask for short, grounded replies without
invented retailer actions or policies, but prompts do not guarantee compliant output.

Then choose either approach:

- Open and run the complete [`sql/01_ai_functions.sql`](sql/01_ai_functions.sql) script.
- Follow the steps below and run each SQL block in order. The blocks contain the same SQL as the
  complete script.

### Step 1: Create an extraction UDF

`dbo.udf_ExtractOrderDetails` extracts the order reference (ID), issue summary, and requested
outcome as JSON.

```sql
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
```

After creation, the **Messages** pane should show:

```text
Function dbo.udf_ExtractOrderDetails can be inlined via Scalar UDF inlining, which supports a sub-set of query shapes. See https://go.microsoft.com/fwlink/?linkid=2378200.
```

### Step 2: Create a classification UDF

`dbo.udf_ClassifyOrderInquiry` selects a reply policy using labels that describe the order inquiry.

```sql
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
```

After creation, the **Messages** pane should show:

```text
Function dbo.udf_ClassifyOrderInquiry can be inlined via Scalar UDF inlining, which supports a sub-set of query shapes. See https://go.microsoft.com/fwlink/?linkid=2378200.
```

### Step 3: Create a response-generation UDF

`dbo.udf_DraftOrderReply` drafts a reply by combining the original customer message, a structured
summary of the key order details, and predefined response guidance selected for that type of
inquiry. The structured details keep the response focused and consistent, while the original
message remains the source of truth.

```sql
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
```

After creation, the **Messages** pane should show:

```text
Function dbo.udf_DraftOrderReply can be inlined via Scalar UDF inlining, which supports a sub-set of query shapes. See https://go.microsoft.com/fwlink/?linkid=2378200.
```

The UDF returns the complete `AI_GENERATE_RESPONSE` output. The materialization step stores that
output once so it can be reviewed and queried without generating another reply.

### Step 4: Check inlining metadata

All three functions should report:

| Metadata | Expected value |
|---|---:|
| `is_inlineable` | `1` |
| `inline_eligibility_mask` | `1` |

Mask `1` means the function is eligible for Scalar UDF Inlining.

```sql
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
```

### Step 5: Extract order-inquiry details

`dbo.udf_ExtractOrderDetails` identifies the order reference, issue summary, and requested outcome
in each customer message so later steps can use the key details consistently.

```sql
UPDATE dbo.Lab_AIRequests
SET ExtractedOrderDetails =
    dbo.udf_ExtractOrderDetails(CustomerMessage)
WHERE NeedsDraft = 1
  AND ExtractedOrderDetails IS NULL;
GO
```

### Step 6: Classify the inquiries

`dbo.udf_ClassifyOrderInquiry` identifies the type of inquiry so the matching response guidance can
be applied when drafting the reply.

```sql
UPDATE dbo.Lab_AIRequests
SET ReplyPolicy =
    dbo.udf_ClassifyOrderInquiry(CustomerMessage)
WHERE NeedsDraft = 1
  AND ReplyPolicy IS NULL;
GO
```

### Step 7: Create the draft-reply view

`dbo.udf_DraftOrderReply` drafts a reply by combining the original customer message, a structured
summary of the key order details, and predefined response guidance selected for that type of
inquiry. The structured details keep the response focused and consistent, while the original
message remains the source of truth.

```sql
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
```

### Step 8: Materialize the view with CTAS

`CREATE TABLE AS SELECT` evaluates the view and stores one set of results in
`dbo.Lab_AIResults`. Dropping the result table first makes this step rerunnable.

```sql
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
```

### Step 9: Analyze the materialized results

The AI-backed UDF calls are no longer present in these queries. The stored results can be sorted,
grouped, and reused without making additional AI requests.

```sql
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
```

`Materialized` means that extraction, classification, and reply generation returned non-NULL
values that were saved successfully. It confirms that the UDF and DML workflow completed; it
doesn't assess the quality of the generated text.

Querying `Lab_AIResults` makes no additional AI calls. Querying the view or rerunning CTAS
invokes AI again and can produce different results.

## Query-Shape Boundaries

AI-backed scalar UDFs use Scalar UDF Inlining. Use supported query shapes for the UDF call and
materialize the output before further analysis.

When a UDF is eligible only for Scalar UDF Inlining:

- it can't be combined with a CTE;
- it can't be used directly in `GROUP BY` or `ORDER BY`;
- a query can fail when it contains more than 10 UDF references.

If a query contains multiple scalar UDFs and any one uses Scalar UDF Inlining, the complete query
must meet the Scalar UDF Inlining requirements.

## Try More

Try wrapping other [AI functions (Preview)](https://learn.microsoft.com/en-us/fabric/data-warehouse/ai-functions)
in scalar UDFs and applying them to another workflow.

> **Tip:** Change the extraction properties, classification labels, or reply guidance to model
> another workflow. Keep the source set small, filter before calling AI, and materialize output
> that will be reused.

`NeedsDraft = 1` selects requests for processing. To process those requests again with your
updated UDFs, clear their stored results:

```sql
UPDATE dbo.Lab_AIRequests
SET ExtractedOrderDetails = NULL,
    ReplyPolicy = NULL
WHERE NeedsDraft = 1;
GO
```

Rerun your updated UDF definitions, then Steps 5-8 to regenerate the materialized replies.

**If you add a classification label**, also add a matching `reply_policy` prompt template
at version `1`; otherwise, the view excludes requests assigned that label.

## Cleanup

Run [`sql/99_cleanup.sql`](sql/99_cleanup.sql), or this equivalent block, when you finish:

```sql
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
```

## Continue

- [Previous: Lab 09 — `NEWID()`](../09_NEWID/00_ReadMe.md)
- [Back to main](../README.md)

## Related

- [AI Functions overview](https://learn.microsoft.com/en-us/fabric/data-warehouse/ai-functions)
- [`AI_EXTRACT` documentation](https://learn.microsoft.com/sql/t-sql/functions/ai-extract-transact-sql?view=fabric)
- [`AI_CLASSIFY` documentation](https://learn.microsoft.com/sql/t-sql/functions/ai-classify-transact-sql?view=fabric)
- [`AI_GENERATE_RESPONSE` documentation](https://learn.microsoft.com/sql/t-sql/functions/ai-generate-response-transact-sql?view=fabric)
- [CREATE FUNCTION documentation](https://learn.microsoft.com/sql/t-sql/statements/create-function-sql-data-warehouse?view=fabric)
- [Inlineability Diagnostics](../07_InlineabilityDiagnostics/00_ReadMe.md)

---

Last Updated: November 19, 2026
