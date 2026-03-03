namespace DaxPerformanceTuner.Library.Data;

/// <summary>
/// DAX Optimization Article Patterns and Detection Rules.
///
/// ATTRIBUTION:
/// This module contains DAX pattern detection rules and optimization guidance derived from
/// multiple sources in the DAX community:
/// 1. SQLBI Documentation (https://www.sqlbi.com/, https://docs.sqlbi.com/)
/// 2. Original Research (CUST000-CUST013 series)
/// </summary>
public static class ArticlePatterns
{
    // ======================================================================
    // DAX function category regex constants
    // ======================================================================

    private const string DAX_AGGREGATORS =
        @"(?:APPROXIMATEDISTINCTCOUNT|AVERAGE|AVERAGEA|COUNT|COUNTA|COUNTBLANK|COUNTROWS|DISTINCTCOUNT|DISTINCTCOUNTNOBLANK|MAX|MAXA|MIN|MINA|PRODUCT|SUM)";

    private const string DAX_ITERATORS =
        @"(?:FILTER|AVERAGEX|COUNTAX|COUNTX|MAXX|MINX|PRODUCTX|SUMX|CONCATENATEX|RANKX|PERCENTILEX\.INC|PERCENTILEX\.EXC|FIRSTNONBLANK|LASTNONBLANK|FIRSTNONBLANKVALUE|LASTNONBLANKVALUE|GENERATE|GENERATEALL|ADDCOLUMNS|SELECTCOLUMNS|SUBSTITUTEWITHINDEX|TOPN|TOPNSKIP|VARX\.P|VARX\.S)";

    private const string DAX_CONTEXT_TRANSITION =
        @"(?:CALCULATE|CALCULATETABLE|CLOSINGBALANCEMONTH|CLOSINGBALANCEQUARTER|CLOSINGBALANCEWEEK|CLOSINGBALANCEYEAR|DATEADD|DATESMTD|DATESQTD|DATESWTD|DATESYTD|ENDOFMONTH|ENDOFQUARTER|ENDOFWEEK|ENDOFYEAR|FIRSTDATE|FIRSTNONBLANK|FIRSTNONBLANKVALUE|LASTDATE|LASTNONBLANK|LASTNONBLANKVALUE|NEXTDAY|NEXTMONTH|NEXTQUARTER|NEXTWEEK|NEXTYEAR|OPENINGBALANCEMONTH|OPENINGBALANCEQUARTER|OPENINGBALANCEWEEK|OPENINGBALANCEYEAR|PARALLELPERIOD|PREVIOUSDAY|PREVIOUSMONTH|PREVIOUSQUARTER|PREVIOUSWEEK|PREVIOUSYEAR|RELATEDTABLE|SAMEPERIODLASTYEAR|SELECTEDMEASURE|STARTOFMONTH|STARTOFQUARTER|STARTOFWEEK|STARTOFYEAR|TOTALMTD|TOTALQTD|TOTALWTD|TOTALYTD)";

    private const string DAX_TABLE_FUNCTIONS =
        @"(?:ADDCOLUMNS|ADDMISSINGITEMS|CROSSJOIN|CURRENTGROUP|DATATABLE|DETAILROWS|DISTINCT|EXCEPT|FILTERS|GENERATE|GENERATEALL|GENERATESERIES|GROUPBY|IGNORE|INTERSECT|NATURALINNERJOIN|NATURALLEFTOUTERJOIN|NONVISUAL|ROLLUP|ROLLUPADDISSUBTOTAL|ROLLUPGROUP|ROLLUPISSUBTOTAL|ROW|SAMPLEAXISWITHLOCALMINMAX|SELECTCOLUMNS|SUBSTITUTEWITHINDEX|SUMMARIZE|SUMMARIZECOLUMNS|TOPN|TOPNSKIP|TREATAS|UNION|VALUES|CALCULATE|CALCULATETABLE)";

    // ======================================================================
    // Placeholder expansion
    // ======================================================================

    private static readonly Dictionary<string, string> PlaceholderMap = new()
    {
        ["{DAX_AGGREGATORS}"] = DAX_AGGREGATORS,
        ["{DAX_ITERATORS}"] = DAX_ITERATORS,
        ["{DAX_CONTEXT_TRANSITION}"] = DAX_CONTEXT_TRANSITION,
        ["{DAX_TABLE_FUNCTIONS}"] = DAX_TABLE_FUNCTIONS,
    };

    private static string ExpandPattern(string pattern)
    {
        foreach (var (key, value) in PlaceholderMap)
        {
            if (pattern.Contains(key))
                pattern = pattern.Replace(key, value);
        }
        return pattern;
    }

    private static string[] Expand(params string[] rawPatterns)
        => rawPatterns.Select(ExpandPattern).ToArray();

    // ======================================================================
    // Article config record
    // ======================================================================

    public record ArticleConfig(string Title, string? Url, string? Content, string[] Patterns);

    // ======================================================================
    // All articles
    // ======================================================================

    public static readonly Dictionary<string, ArticleConfig> Articles = new()
    {
        // ==================================================================
        // CUST000 — Complete Performance Analysis Framework (inline content)
        // ==================================================================
        ["CUST000"] = new(
            "DAX Optimization Guidance - Complete Performance Analysis Framework",
            null,
            Cust000Content,
            []
        ),

        // ==================================================================
        // SQLBI Documentation References
        // ==================================================================
        ["STATIC_SQLBI_XMSQL"] = new(
            "SQLBI Documentation - VertiPaq xmSQL",
            "https://docs.sqlbi.com/dax-internals/vertipaq/xmSQL",
            null, []
        ),
        ["STATIC_SQLBI_VERTICAL_FUSION"] = new(
            "SQLBI Documentation - Vertical Fusion",
            "https://docs.sqlbi.com/dax-internals/optimization-notes/vertical-fusion",
            null, []
        ),
        ["STATIC_SQLBI_HORIZONTAL_FUSION"] = new(
            "SQLBI Documentation - Horizontal Fusion",
            "https://docs.sqlbi.com/dax-internals/optimization-notes/horizontal-fusion",
            null, []
        ),
        ["STATIC_SQLBI_SWITCH_OPTIMIZATION"] = new(
            "SQLBI Documentation - SWITCH Optimization",
            "https://docs.sqlbi.com/dax-internals/optimization-notes/switch-optimization",
            null,
            Expand(
                @"SWITCH\s*\([\s\S]*?({DAX_AGGREGATORS}|{DAX_ITERATORS})\s*\([^)]*(?:\([^)]*\))?[^)]*\)\s*[+\-*/]\s*({DAX_AGGREGATORS}|{DAX_ITERATORS})\s*\(",
                @"SWITCH\s*\([\s\S]*?,\s*({DAX_CONTEXT_TRANSITION})\s*\(",
                @"SWITCH\s*\([\s\S]*?,\s*\[[A-Za-z_][A-Za-z0-9 _]*\]"
            )
        ),

        // ==================================================================
        // CUST001 — Use SUMMARIZECOLUMNS to create virtual columns
        // ==================================================================
        ["CUST001"] = new(
            "Use SUMMARIZECOLUMNS to create virtual columns",
            null,
            """
            SUMMARIZECOLUMNS directly defines grouping + calculation allowing better optimization compared to SUMMARIZE or ADDCOLUMNS over a base table. In many cases, ADDCOLUMNS can be replaced with
            SUMMARIZECOLUMNS for significant performance improvements.

            Anti-pattern examples:

            SUMMARIZE ( Sales, Sales[ProductKey], "Total Profit", [Profit] )
            ADDCOLUMNS ( Sales, "Total Profit", CALCULATE ( [Profit] ) )
            ADDCOLUMNS ( VALUES(Sales[ProductKey]), "Total Profit", [Profit] )

            Preferred pattern:

            SUMMARIZECOLUMNS ( Sales[ProductKey], "Total Profit", [Profit] )
            """,
            Expand(
                @"\bADDCOLUMNS\s*\(",
                @"SUMMARIZE\s*\([\s\S]*?""[^""]+""[\s\S]*?,"
            )
        ),

        // ==================================================================
        // CUST002 — Reuse expression evaluation with base table (variable caching)
        // ==================================================================
        ["CUST002"] = new(
            "Reuse expression evaluation with base table (variable caching)",
            null,
            """
            Repeating the same expensive measure/expression inside multiple iterators over the same table
            causes duplicate scans that can be eliminated through variable caching or base
            table materialization.

            Anti-pattern examples:

            VAR A = SUMX ( Sales, [Total Sales] )
            VAR B = AVERAGEX ( Sales, [Total Sales] )

            VAR A = SUMX ( Sales, CALCULATE ( [Total Sales] ) )
            VAR B = MAXX ( Sales, CALCULATE ( [Total Sales] ) )

            Optimization approach:

            VAR Base = SUMMARIZECOLUMNS ( Sales[ProductKey], "@TotalSales", [Total Sales] )
            VAR A = SUMX ( Base, [@TotalSales] )
            VAR B = AVERAGEX ( Base, [@TotalSales] )
            """,
            Expand(
                @"({DAX_ITERATORS})\s*\(\s*'?(?<arg1>[^,'()]+)'?\s*,[\s\S]{20,800}?({DAX_ITERATORS})\s*\(\s*'?\k<arg1>'?\s*,"
            )
        ),

        // ==================================================================
        // CUST003 — Duplicate filter condition detected
        // ==================================================================
        ["CUST003"] = new(
            "Duplicate filter condition detected",
            null,
            """
            Consolidating filters into a single context modifier improves performance and query plan efficiency.
            Applying the same filter condition multiple times in different contexts causes redundant evaluation
            that can be eliminated.

            Anti-pattern examples:

            CALCULATE(
                SUM(Sales[Amount]),
                Sales[Year] = 2023,
                FILTER(Sales, Sales[Year] = 2023)
            )

            CALCULATE(
                SUMX(
                    FILTER(Sales, Sales[Product] = "A"),
                    Sales[Amount]
                ),
                Sales[Product] = "A"
            )

            Preferred patterns:

            CALCULATE(
                SUM(Sales[Amount]),
                Sales[Year] = 2023
            )

            CALCULATE(
                SUMX(Sales, Sales[Amount]),
                Sales[Product] = "A"
            )
            """,
            [
                @"('?[A-Za-z_][A-Za-z0-9 ]*'?\[[A-Za-z_][A-Za-z0-9 ]*\]\s*(?:[<>=!]+|IN|CONTAINSROW)\s*[^,)]{1,50})[\s\S]{5,3000}\1"
            ]
        ),

        // ==================================================================
        // CUST004 — SUMMARIZE with complex table expression
        // ==================================================================
        ["CUST004"] = new(
            "SUMMARIZE with complex table expression - use CALCULATETABLE around SUMMARIZE instead",
            null,
            """
            Using SUMMARIZE with complex table expressions as the first argument can lead to
            inefficient query plans and prevent optimization opportunities. Wrapping SUMMARIZE/SUMMARIZECOLUMNS with CALCULATETABLE allows the filter context to be applied more
            efficiently and enables better query plan optimization.

            Anti-pattern examples:

            SUMMARIZE(
                CALCULATETABLE(Sales, Sales[Year] = 2023, Sales[CustomerKey] IN SellingPOCs),
                Sales[CustomerKey],
                "DistinctSKUs", DISTINCTCOUNT(Sales[StoreKey])
            )

            SUMMARIZE(
                FILTER(Sales, Sales[Product] = "A"),
                Sales[Region]
            )

            Preferred patterns:

            CALCULATETABLE(
                SUMMARIZECOLUMNS(
                    Sales[CustomerKey],
                    "DistinctSKUs", DISTINCTCOUNT(Sales[StoreKey])
                ),
                Sales[Year] = 2023,
                Sales[CustomerKey] IN SellingPOCs
            )

            CALCULATETABLE(
                SUMMARIZE(Sales, Sales[Region]),
                Sales[Product] = "A"
            )
            """,
            [
                @"SUMMARIZE\s*\(\s*[^,]*\([^,]*,"
            ]
        ),

        // ==================================================================
        // CUST005 — Replace iterator with context transition using SUMMARIZECOLUMNS base table
        // ==================================================================
        ["CUST005"] = new(
            "Replace iterator with context transition using SUMMARIZECOLUMNS base table",
            null,
            """
            Materializing context transition results once in SUMMARIZECOLUMNS and then iterating over the pre-calculated
            values can improve query plan efficiency. Using iterators (SUMX, AVERAGEX, etc.) with context transition functions (CALCULATE, time
            intelligence, etc.) causes repeated context transitions and can trigger expensive materializations.

            Anti-pattern examples:

            SUMX(
                VALUES(Sales[CustomerKey]),
                CALCULATE(SUM(Sales[Amount]))
            )

            AVERAGEX(
                Products,
                CALCULATE([Total Sales], Sales[Year] = 2023)
            )

            SUMX(
                'Date'[Year],
                TOTALYTD([Sales], 'Date'[Date])
            )

            Preferred patterns:

            SUMX(
                SUMMARIZECOLUMNS(
                    Sales[CustomerKey],
                    "@Amount", SUM(Sales[Amount])
                ),
                [@Amount]
            )

            AVERAGEX(
                SUMMARIZECOLUMNS(
                    Products[ProductKey],
                    "@TotalSales", CALCULATE([Total Sales], Sales[Year] = 2023)
                ),
                [@TotalSales]
            )

            SUMX(
                SUMMARIZECOLUMNS(
                    'Date'[Year],
                    "@YTDSales", TOTALYTD([Sales], 'Date'[Date])
                ),
                [@YTDSales]
            )
            """,
            Expand(
                @"({DAX_ITERATORS})\s*\([^,]*,\s*[\s\S]*?({DAX_CONTEXT_TRANSITION})\s*\(",
                @"({DAX_ITERATORS})\s*\([^,]*,\s*[\s\S]*?\[[A-Za-z_][A-Za-z0-9 _]*\]"
            )
        ),

        // ==================================================================
        // CUST006 — Replace IF conditional statements with INT boolean conversion
        // ==================================================================
        ["CUST006"] = new(
            "Replace IF conditional statements with INT boolean conversion",
            null,
            """
            The INT function with boolean expressions avoids conditional logic callbacks that IF statements can trigger,
            leading to better storage engine optimization, reduced formula engine overhead, and improved query plans.
            The INT function natively converts TRUE to 1 and FALSE to 0, providing identical semantic results with better
            performance than using IF statements for simple boolean-to-integer conversion.

            Anti-pattern examples:

            SUMX(
                Sales,
                IF(Sales[Amount] > 1000, 1, 0)
            )

            AVERAGEX(
                Products,
                IF([Sales Amount] > 10000000, 1, 0)
            )

            IF(Sales[Quantity] > 5, 1, 0)

            Preferred patterns:

            SUMX(
                Sales,
                INT(Sales[Amount] > 1000)
            )

            AVERAGEX(
                Products,
                INT([Sales Amount] > 10000000)
            )

            INT(Sales[Quantity] > 5)
            """,
            [
                @"IF\s*\([^,]+,\s*1\s*,\s*0\s*\)"
            ]
        ),

        // ==================================================================
        // CUST007 — Context Transition in Iterator
        // ==================================================================
        ["CUST007"] = new(
            "Context Transition in Iterator",
            null,
            """
            Context transition is an extremely powerful but potentially expensive operation that can result in excessive materializations.

            Possible optimizations:

            1. Remove it completely

            Original Code:
            SUMX(
                Sales,
                [Sales Amount]
            )

            Optimization:
            SUMX(
                Sales,
                Sales[Unit Price] * Sales[Quantity]
            )

            2. Reduce number of columns
            Original Code:
            SUMX(
                Account,
                [Total Sales]
            )

            Optimization:
            SUMX(
                VALUES ( Account[Account Key] ),
                [Total Sales]
            )

            3. Reduce cardinality before iteration

            Original Code:
            SUMX(
                Account,
                [Total Sales] * Account[Corporate Discount]
            )

            Optimization:
            SUMX(
                VALUES ( Account[Corporate Discount] ),
                [Total Sales] * Account[Corporate Discount]
            )
            """,
            Expand(
                @"({DAX_ITERATORS})\s*\([^,]*,\s*[\s\S]*?({DAX_CONTEXT_TRANSITION})\s*\(",
                @"({DAX_ITERATORS})\s*\([^,]*,\s*[\s\S]*?\[[A-Za-z_][A-Za-z0-9 _]*\]"
            )
        ),

        // ==================================================================
        // CUST008 — Duplicate Measure or Expression
        // ==================================================================
        ["CUST008"] = new(
            "Duplicate Measure or Expression",
            null,
            """
            Duplicate expression evaluations may trigger duplicate storage engine queries. Caching the result
            in a variable ensures it's evaluated only once, reducing query execution time and resource consumption.

            This pattern will only work if the expression is evaluated multiple times within the same filter context.

            Anti-pattern examples:

            VAR TotalA = [Sales Amount] * 1.1
            VAR TotalB = [Sales Amount] * 0.9
            VAR TotalC = [Sales Amount] + 1000

            IF([Sales Amount] > 1000, [Sales Amount] * 2, [Sales Amount] / 2)

            CALCULATE([Total Sales]) + CALCULATE([Total Sales]) * 0.1

            Preferred patterns:

            // Cache measure in variable
            VAR _SalesAmount = [Sales Amount]
            VAR TotalA = _SalesAmount * 1.1
            VAR TotalB = _SalesAmount * 0.9
            VAR TotalC = _SalesAmount + 1000

            // Cache measure reference
            VAR _SalesAmount = [Sales Amount]
            RETURN
            IF(_SalesAmount > 1000, _SalesAmount * 2, _SalesAmount / 2)

            // Cache CALCULATE result
            VAR _TotalSales = CALCULATE([Total Sales])
            RETURN
            _TotalSales + _TotalSales * 0.1
            """,
            [
                @"(\[[A-Za-z_][A-Za-z0-9 _]*\])[\s\S]{10,500}\1[\s\S]{10,500}\1"
            ]
        ),

        // ==================================================================
        // CUST009 — Apply Filters Using CALCULATETABLE Instead of FILTER
        // ==================================================================
        ["CUST009"] = new(
            "Apply Filters Using CALCULATETABLE Instead of FILTER",
            null,
            """
            Apply filters with CALCULATETABLE to modify filter context directly instead of using FILTER for potentially better query plans.
            Anti-pattern examples:

            FILTER(
                'Sales',
                'Sales'[Year] = 2023
            )

            FILTER(
                Product,
                Product[Category] = "Electronics" && Product[Price] > 100
            )

            Preferred patterns:

            CALCULATETABLE(
                'Sales',
                'Sales'[Year] = 2023
            )

            CALCULATETABLE(
                Product,
                Product[Category] = "Electronics",
                Product[Price] > 100
            )
            """,
            [
                @"FILTER\s*\([^,]+,[\s\S]*?\["
            ]
        ),

        // ==================================================================
        // CUST010 — Move Expressions Not Affected By Context Transition Outside of Iterators
        // ==================================================================
        ["CUST010"] = new(
            "Move Expressions Not Affected By Context Transition Outside of Iterators",
            null,
            """
            Expressions that don't depend on the iteration context (constant values, measures with ALL(), context-independent
            calculations) should be computed once and cached in variables.

            Anti-pattern examples:

            SUMX(
                Sales,
                Sales[Quantity] * [Average Price] * 1.1
            )
            // [Average Price] doesn't change per Sales row

            AVERAGEX(
                Products,
                [Product Cost] * (1 + [Tax Rate])
            )
            // [Tax Rate] is constant, doesn't vary by Product

            SUMX(
                Sales,
                Sales[Amount] * CALCULATE(SUM(Budget[Amount]), ALL(Budget))
            )
            // ALL(Budget) returns same value for every Sales row

            Preferred patterns:

            VAR _AvgPrice = [Average Price]
            VAR _Markup = 1.1
            RETURN
            SUMX(
                Sales,
                Sales[Quantity] * _AvgPrice * _Markup
            )

            VAR _TaxRate = [Tax Rate]
            RETURN
            AVERAGEX(
                Products,
                [Product Cost] * (1 + _TaxRate)
            )

            VAR _TotalBudget = CALCULATE(SUM(Budget[Amount]), ALL(Budget))
            RETURN
            SUMX(
                Sales,
                Sales[Amount] * _TotalBudget
            )
            """,
            Expand(
                @"({DAX_ITERATORS})\s*\([\s\S]*?\b(ALL|ALLSELECTED)\s*\(",
                @"({DAX_ITERATORS})\s*\([^,]+,\s*[\s\S]*?\[[A-Za-z_][^\]]+\]"
            )
        ),

        // ==================================================================
        // CUST011 — Use Simple Column Filter Predicates as CALCULATE Arguments
        // ==================================================================
        ["CUST011"] = new(
            "Use Simple Column Filter Predicates as CALCULATE Arguments",
            null,
            """
            CALCULATE can accept simple boolean predicates (Table[Column] = Value) directly as filter arguments, which is
            more efficient than wrapping them in FILTER or CALCULATETABLE, as it allows the engine to optimize filter
            application. Multiple conditions combined with && should be split into separate filter arguments. Reserve FILTER
            for complex row-by-row conditions that cannot be expressed as simple predicates.

            Anti-pattern examples:

            CALCULATE(
                SUM(Sales[Amount]),
                FILTER(ALL(Product[Category]), Product[Category] = "Electronics")
            )

            CALCULATE(
                [Total Sales],
                CALCULATETABLE(VALUES(Date[Year]), Date[Year] = 2023)
            )

            CALCULATE(
                COUNTROWS(Sales),
                FILTER(Sales, Sales[Amount] > 1000)
            )

            CALCULATETABLE(
                Sales,
                Sales[Region] = "West" && Sales[Amount] > 1000
            )

            Preferred patterns:

            CALCULATE(
                SUM(Sales[Amount]),
                Product[Category] = "Electronics"
            )

            CALCULATE(
                [Total Sales],
                Date[Year] = 2023
            )

            CALCULATE(
                COUNTROWS(Sales),
                Sales[Amount] > 1000
            )

            CALCULATETABLE(
                Sales,
                Sales[Region] = "West",
                Sales[Amount] > 1000
            )
            """,
            Expand(
                @"(CALCULATE|CALCULATETABLE)\s*\([^,]+,[\s\S]*?({DAX_TABLE_FUNCTIONS})\s*\(",
                @"(CALCULATE|CALCULATETABLE)\s*\([^,]+,[\s\S]*?&&"
            )
        ),

        // ==================================================================
        // CUST012 — Distinct Count Alternatives
        // ==================================================================
        ["CUST012"] = new(
            "Distinct Count Alternatives",
            null,
            """
            Depending on the cardinality and data layout, moving DISTINCTCOUNT or DISTINCTCOUNTNOBLANK to SUMX(VALUES(),1) can potentially improve performance.
            This pattern forces the evaluation of the distinct count to occur in the formula engine as opposed to the storage engine.

            Storage Engine Bound:
            DISTINCTCOUNT(Sales[CustomerKey]) or DISTINCTCOUNTNOBLANK(Sales[CustomerKey])

            Formula Engine Bound:
            SUMX(VALUES(Sales[CustomerKey]), 1)
            """,
            [
                @"\b(DISTINCTCOUNT|DISTINCTCOUNTNOBLANK)\s*\("
            ]
        ),

        // ==================================================================
        // CUST013 — Force Formula Engine Evaluation with CROSSJOIN
        // ==================================================================
        ["CUST013"] = new(
            "Force Formula Engine Evaluation with CROSSJOIN to Avoid Storage Engine Callbacks",
            null,
            """
            Context transitions in FILTER over VALUES can cause additional storage engine scans and callbacks. In some cases,
            forcing evaluation in the formula engine using CROSSJOIN with a single-row table can be faster by eliminating
            redundant storage engine queries.

            Anti-pattern examples:

            CALCULATE(
                [Total Sales],
                FILTER(VALUES(Product[ProductKey]), [Total Sales])
            )
            // Context transition in FILTER causes callbacks

            Preferred patterns:

            CALCULATE(
                [Total Sales],
                FILTER(CROSSJOIN(VALUES(Product[ProductKey]), {1}), [Total Sales])
            )
            // Forces formula engine evaluation, avoids storage engine callbacks
            """,
            Expand(
                @"({DAX_ITERATORS})\s*\([^,]*,\s*[\s\S]*?({DAX_CONTEXT_TRANSITION})\s*\(",
                @"({DAX_ITERATORS})\s*\([^,]*,\s*[\s\S]*?\[[A-Za-z_][A-Za-z0-9 _]*\]"
            )
        ),

        // ==================================================================
        // CUST014 — Replace SELECTEDVALUE with MAX/MIN for single-value contexts
        // ==================================================================
        ["CUST014"] = new(
            "Replace SELECTEDVALUE with MAX/MIN for single-value contexts",
            null,
            """
            When a filter context guarantees exactly one value for a column, SELECTEDVALUE adds unnecessary
            overhead compared to MAX or MIN. SELECTEDVALUE internally checks for a single distinct value and
            returns BLANK if multiple exist, which adds formula engine cost. When the context already guarantees
            a single value (e.g., inside an iterator over VALUES/DISTINCT or in a context transition), MAX or
            MIN is semantically equivalent and avoids the extra cardinality check.

            Anti-pattern examples:

            SUMX(
                VALUES(Product[Category]),
                SELECTEDVALUE(Product[Category]) & ": " & FORMAT([Total Sales], "#,0")
            )

            ADDCOLUMNS(
                VALUES(Date[Year]),
                "@Label", SELECTEDVALUE(Date[Year])
            )

            Preferred patterns:

            SUMX(
                VALUES(Product[Category]),
                MAX(Product[Category]) & ": " & FORMAT([Total Sales], "#,0")
            )

            ADDCOLUMNS(
                VALUES(Date[Year]),
                "@Label", MAX(Date[Year])
            )
            """,
            [
                @"SELECTEDVALUE\s*\("
            ]
        ),

        // ==================================================================
        // CUST015 — Use ALLEXCEPT instead of ALL + VALUES restoration
        // ==================================================================
        ["CUST015"] = new(
            "Use ALLEXCEPT instead of ALL + VALUES restoration",
            null,
            """
            When clearing filter context with ALL() and then restoring specific columns via VALUES() or
            explicit filters, ALLEXCEPT achieves the same result in a single operation. This reduces the
            number of filter arguments and can produce a simpler query plan.

            Anti-pattern examples:

            CALCULATE(
                [Total Sales],
                ALL(Sales),
                VALUES(Sales[Region])
            )

            CALCULATE(
                SUM(Sales[Amount]),
                ALL(Sales),
                VALUES(Sales[Region]),
                VALUES(Sales[Year])
            )

            Preferred patterns:

            CALCULATE(
                [Total Sales],
                ALLEXCEPT(Sales, Sales[Region])
            )

            CALCULATE(
                SUM(Sales[Amount]),
                ALLEXCEPT(Sales, Sales[Region], Sales[Year])
            )
            """,
            [
                @"CALCULATE(?:TABLE)?\s*\([^)]*,[\s\S]*?ALL\s*\(\s*('?[A-Za-z_][A-Za-z0-9 ]*'?)\s*\)[\s\S]*?VALUES\s*\(\s*\1\["
            ]
        ),

        // ==================================================================
        // CUST016 — Flatten nested CALCULATE calls
        // ==================================================================
        ["CUST016"] = new(
            "Flatten nested CALCULATE calls",
            null,
            """
            Nested CALCULATE calls create multiple context transitions when a single CALCULATE with combined
            filter arguments would suffice. Each CALCULATE creates a separate context transition boundary,
            and nesting them adds unnecessary formula engine overhead. Flatten them by merging the filter
            arguments into one CALCULATE call.

            Anti-pattern examples:

            CALCULATE(
                CALCULATE(
                    [Total Sales],
                    Sales[Region] = "West"
                ),
                Date[Year] = 2023
            )

            CALCULATE(
                CALCULATE(
                    SUM(Sales[Amount]),
                    Product[Category] = "Electronics"
                ),
                Sales[Year] = 2023,
                Sales[Region] = "West"
            )

            Preferred patterns:

            CALCULATE(
                [Total Sales],
                Sales[Region] = "West",
                Date[Year] = 2023
            )

            CALCULATE(
                SUM(Sales[Amount]),
                Product[Category] = "Electronics",
                Sales[Year] = 2023,
                Sales[Region] = "West"
            )
            """,
            [
                @"CALCULATE\s*\(\s*CALCULATE\s*\(",
                @"CALCULATETABLE\s*\(\s*CALCULATE(?:TABLE)?\s*\("
            ]
        ),

    };

    // ======================================================================
    // CUST000 full inline content
    // ======================================================================

    private const string Cust000Content = """
# DAX Optimization Guidance

This comprehensive guide provides essential insights for understanding and optimizing DAX performance based on trace analysis and performance patterns.

## KEY DAX SUMMARIZECOLUMNS GUIDANCE
SUMMARIZECOLUMNS is now fully supported in measures and can leverage significant performance improvements in many scenarios by providing better fusion optimization opportunities.

### Basic SUMMARIZECOLUMNS Usage
OLD Pattern (inefficient):
```dax
ADDCOLUMNS (
    SUMMARIZE (
        Table,
        Table[Column]
    ),
    "@Calculation",
    [Measure] // Or CALCULATE ( SUM () )
)
```

NEW Pattern (optimized):
```dax
SUMMARIZECOLUMNS (
    Table[Column],
    "@Calculation", [Measure] // Or CALCULATE ( SUM () ) Or SUM ()
)
```

### CRITICAL: Filter Context Application with SUMMARIZECOLUMNS

**WRONG - Filters as direct arguments to SUMMARIZECOLUMNS:**
```dax
// Invalid syntax
SUMMARIZECOLUMNS (
    Table[Column],
    Table[FilterColumn] = "Value",  -- Invalid syntax
    "@Calculation", [Measure]
)
```

```dax
// Valid, but complex syntax
SUMMARIZECOLUMNS (
    Table[Column],
    TREATAS ( {"Value"}, Table[FilterColumn] ),  -- Filter as direct argument
    "@Calculation", [Measure]
)
```

**CORRECT - Wrap SUMMARIZECOLUMNS with CALCULATETABLE:**
```dax
// Proper filter context application
CALCULATETABLE (
    SUMMARIZECOLUMNS (
        Table[Column],
        "@Calculation", [Measure]
    ),
    Table[FilterColumn] = "Value"  -- Filter applied outside
)
```

### Performance Best Practice
Always wrap SUMMARIZECOLUMNS with CALCULATETABLE when filters are needed, rather than trying to pass filters as direct arguments to SUMMARIZECOLUMNS itself.

## REMOVE REDUNDANT FILTER PREDICATES
Often, complex DAX contains unnecessary intermediate filtering steps that can be eliminated while maintaining semantic equivalence for significant performance gains.

Anti-pattern (Redundant Filtering):
```dax
VAR FilteredValues = 
    CALCULATETABLE(DISTINCT(Table[Key1]), Table[Amount] > 1000)
VAR Result = 
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            Table[Key2],
            "TotalQuantity", SUM(Table[Quantity])
        ),
        Table[Amount] > 1000,
        Table[Key1] IN FilteredValues
    )
```

Optimized Pattern (Direct Filtering):
```dax
VAR Result = 
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            Table[Key2],
            "TotalQuantity", SUM(Table[Quantity])
        ),
        Table[Amount] > 1000
    )
```

Why: The intermediate FilteredCustomers variable is redundant since we're already filtering by Sales[Amount] > 1000 
in the main calculation. The CustomerKey IN FilteredCustomers condition adds no additional filtering value but 
creates unnecessary complexity and performance overhead. Applying the filter once in the outer CALCULATE is more efficient.

## Analyzing execute_dax_query Tool Results

The execute_dax_query tool returns performance data in two key sections:

### Performance Object Analysis
Look at the high-level metrics in the `Performance` object:
* **Total**: Total execution time in milliseconds
* **FE vs SE Split**: Compare FE and SE durations - ideally SE should be >70% of total time
* **SE_Queries**: Number of storage engine calls - fewer is better (ideally 1-3)
* **SE_Par**: Parallelism factor - higher values (>1.5) indicate good parallel utilization
* **SE_CPU vs SE Duration**: High ratio indicates effective parallelism

### EventDetails Analysis
The `EventDetails` array shows the execution waterfall (FE events are injected between SE events to mirror DAX Studio's timeline view):

**What to look for:**
1. **CallbackDataID in SE queries**: Indicates FE callbacks forcing row-by-row evaluation
2. **Large Rows/KB values**: Shows materializations - watch for rows >>100K or KB >>1MB
3. **Many FE/SE alternations**: Excessive back-and-forth indicates inefficient query plan
4. **Long FE Duration blocks**: Extended FE processing suggests optimization opportunities

## Understanding Formula Engine (FE) vs. Storage Engine (SE) Metrics

Key performance metrics from execute_dax_query:

* **FE Duration**: Single-threaded formula engine time. High FE% indicates optimization opportunities.
* **SE Duration**: Multi-threaded storage engine time. Should dominate total execution time.
* **SE CPU vs Duration**: Higher ratios indicate good parallelism (SE_Par >1.5 is good).
* **SE Queries**: Number of storage engine calls. Fewer is better - multiple queries suggest poor fusion.
* **Rows and KB**: Materialization size per SE query. Large values (>100K rows, >1MB) are red flags.

## Formula Engine Callbacks

**Look for callbacks in EventDetails SE queries** - these force row-by-row FE evaluation:

* **CallbackDataID**: Most common callback. VertiPaq can't execute expression natively (e.g., IF conditions, DIVIDE(), etc.). Expensive single-threaded processing.
* **EncodeCallback**: Grouping by calculated expressions instead of physical columns.
* **Other Callbacks**: LogAbsValueCallback (PRODUCT), RoundValueCallback (data conversions), etc.

**In EventDetails, search Query text for "CallbackDataID" - this indicates performance bottlenecks.**

## Large Materializations

**Check EventDetails for high Rows/KB values in SE queries:**

* **Excessive Rows**: SE queries returning >>100K rows when final result is much smaller
* **High Memory Usage**: KB values >1MB indicate wide materializations (too many columns)
* **Whole Table Scans**: FILTER(Table, ...) patterns often materialize entire tables

**Symptoms**: SE query returns millions of rows, but final query result has only hundreds.

## Real-World Optimization Examples

### Example 1: Context Transition in FILTER

**Original Query:**
```dax
DEFINE MEASURE 'Fabric Capacity Units NRT'[MyMeasure] = 
    VAR _ActiveSeconds = [NRT Thirty Second Windows]
    VAR _TotalSeconds =
        CALCULATE (
            COUNTROWS (
                SUMMARIZE (
                    'Fabric Capacity Units NRT',
                    'Fabric Capacity Units NRT'[DIM_CalendarKey],
                    'Fabric Capacity Units NRT'[Capacity Id]
                )
            ),
            FILTER (
                'Fabric Capacity Units NRT',
                [NRT Thirty Second Windows] > 0  -- Measure reference causes context transition
            )
        ) * 2880
    VAR _Result = DIVIDE ( _ActiveSeconds, _TotalSeconds )
    RETURN _Result
```

**Analysis:**
- Query failed with memory overflow
- The `[NRT Thirty Second Windows]` measure reference in FILTER triggers context transition
- Context transition caused excessive materialization 7.7M+ rows
- Use direct column filter instead of measure reference

**Optimized Solution:**
```dax
DEFINE MEASURE 'Fabric Capacity Units NRT'[MyMeasure] = 
    VAR _ActiveSeconds = [NRT Thirty Second Windows]
    VAR _TotalSeconds =
        CALCULATE (
            COUNTROWS (
                SUMMARIZE (
                    'Fabric Capacity Units NRT',
                    'Fabric Capacity Units NRT'[DIM_CalendarKey],
                    'Fabric Capacity Units NRT'[Capacity Id]
                )
            ),
            'Fabric Capacity Units NRT'[ThirtySecondWindow] > 0  -- Direct column filter
        ) * 2880
    VAR _Result = DIVIDE ( _ActiveSeconds, _TotalSeconds )
    RETURN _Result
```

**Result:** Memory overflow -> 1.8 seconds (85% FE / 15% SE)

### Example 2: Eliminate Cross-Join Materializations

**Problem:** 91.7 seconds execution (98% FE / 2% SE) with 5+ million row materialization

**Solution Strategy:**
- Replace ALL() + manual filter restoration with ALLEXCEPT()
- Combine logic to reduce table scans from 2 to 1
- Use MAX() instead of SELECTEDVALUE() for performance
- Eliminate unnecessary DISTINCT() operations

**Result:** 91.7 seconds -> 4.7 seconds (95% improvement)

### Example 3: Replace Nested SUMMARIZE->ADDCOLUMNS->FILTER

**Problem:** 39.9 seconds with CALCULATE(DIVIDE()) in iterators causing CallbackDataID

**Solution:**
- Replace SUMMARIZE with SUMMARIZECOLUMNS
- Use direct column arithmetic instead of DIVIDE() function
- Eliminate nested iterator patterns
- Use INT() for boolean conversion

**Result:** 39.9 seconds -> 0.76 seconds (98% improvement)

### Example 4: Variable Caching for Repeated Measures

**Problem:** Repeated measure evaluation causing duplicate SE scans

**Solution:**
```dax
SUMX (
    Capacity,
    VAR _CUHours = [CU Hours] 
    RETURN IF ( _CUHours > 1000000, _CUHours )
)
```

**Advanced Optimization with SUMMARIZECOLUMNS:**
```dax
SUMX (
    SUMMARIZECOLUMNS (
        Capacity[DIM_CapacityId],
        "@Calculation", VAR _CUHours = [CU Hours] RETURN IF ( _CUHours > 1000000, _CUHours )
    ),
    [@Calculation]
)
```

**Result:** 3.8s -> 2.5s -> 1.5s (60% improvement)

## DAX Optimization Strategy Framework

When approaching DAX optimization, consider these systematic approaches:

### 1. Anti-Pattern Detection Approach
- **Scan for Known Issues**: Look for filtered table arguments, context transitions in iterators, duplicated measures
- **Identify Callbacks**: Search EventDetails for CallbackDataID, EncodeCallback patterns
- **Detect Materializations**: Find large Rows/KB values indicating excessive data movement
- **Apply Targeted Fixes**: Use research articles to replace anti-patterns with optimized alternatives

### 2. Set-Based Optimization Approach
**Think in terms of mathematical set operations rather than iterative processing:**

**Set Theory Principles:**
- **Cardinality Operations**: Use |S| (COUNTROWS) instead of Sigma(s in S)[condition ? 1 : 0] (SUMX iterators)
- **Set Filtering**: Apply predicates to entire sets rather than element-by-element evaluation
- **Set Intersection**: Create qualifying sets first, then operate on the intersection
- **Boolean Arithmetic**: Convert set membership tests to efficient numeric operations

**Set-Based Transformation Patterns:**
```dax
-- Pattern 1: Replace iterative counting with set cardinality
-- Instead of: SUMX(table, IF(condition, 1, 0))
-- Use: COUNTROWS(FILTER(table, condition))

-- Pattern 2: Pre-materialize qualifying sets
-- Instead of: Multiple SUMX over same base with different conditions
-- Use: Single SUMMARIZECOLUMNS with multiple calculated columns

-- Pattern 3: Boolean to numeric conversion
-- Instead of: IF(condition, 1, 0) 
-- Use: INT(condition) or condition * 1

-- Pattern 4: Set intersection approach
-- Instead of: FILTER(CROSSJOIN(...), complex_condition)
-- Use: CALCULATETABLE(SUMMARIZECOLUMNS(...), filter_conditions)
```

### 3. Fusion-Oriented Approach
- **Vertical Fusion**: Combine measures with same filter context using SUMMARIZECOLUMNS
- **Horizontal Fusion**: Consolidate similar queries differing only by column filters
- **Expression Consolidation**: Move repeated calculations into variables or base materializations

### 4. Storage Engine Optimization Approach
- **Minimize SE Queries**
- **Eliminate Callbacks**
- **Optimize Materializations**
- **Maximize Parallelism**

**Choose the approach that best matches the identified performance bottlenecks in your specific query.**
""";
}
