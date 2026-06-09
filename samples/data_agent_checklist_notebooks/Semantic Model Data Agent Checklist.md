
# Semantic Model Preparation Checklist for Fabric Data Agent

This checklist helps you prepare your Power BI semantic model for use with Fabric Data Agent. It covers semantic model optimization, Prep for AI configuration (AI data schema, verified answers, AI instructions), Data Agent setup, and testing. Use it as a reference to ensure your model is ready to deliver accurate, fast responses to natural language questions. Refer to the [documentation](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-semantic-model) for the latest guidelines and limitations.

## Semantic Model Optimization
- [ ] ⚠️Use star schema with clear fact and dimension tables (avoid flat, denormalized, or pivoted data structures)
- [ ] Run [Best Practice Analyzer](https://learn.microsoft.com/en-us/power-bi/transform-model/service-notebooks) in a Fabric notebook
- [ ] Run [Semantic Model Memory Analyzer](https://learn.microsoft.com/en-us/power-bi/transform-model/service-notebooks#model-memory-analyzer) in a Fabric notebook
- [ ] If using Direct Lake semantic model, perform Direct Lake specific optimizations such as V-Order. See [optimization guidance](https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-understand-storage).
- [ ] Fix incorrect data types
- [ ] Remove unnecessary columns and tables
- [ ] Use [Performance Analyzer](https://learn.microsoft.com/en-us/power-bi/create-reports/performance-analyzer) to test query performance on measures included in the AI data schema
- [ ] Use clear, business-friendly names for tables, columns, and measures (not TR_AMT, CustName)
- [ ] Add descriptions to tables, columns, and measures. The purpose of the description is to help AI understand the context, add description accordingly. Keep it concise.
- [ ] Add synonyms in Power BI Desktop for commonly used alternative terms the users may use
- [ ] Define [row label](https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-tooling-intro#set-a-row-label) especially for dimension tables
- [ ] Create explicit DAX measures (avoid relying on implicit measures)
- [ ] Set correct default summarization on numeric columns
- [ ] If you have report-scoped measures that the Data Agent should use, move them to the semantic model (report-scoped measures are not accessible to the Data Agent)
- [ ] Consolidate or differentiate duplicate/overlapping measures


## AI Data Schema (Prep for AI > Simplify data schema)
**For semantic models, Data Agent uses `Prep for AI` configuration of the semantic model. To learn more, refer to the [Prep for AI documentation](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-prepare-data-ai)**

- [ ] Define the scope of your Data Agent (list of questions it should/should not answer, user personas, what's out of scope, security requirements etc)
- [ ] ⚠️Select only relevant tables, columns, and measures (very important)
- [ ] Include all dependent objects for selected measures (OPTIONAL: use [get_measure_dependencies](https://semantic-link-labs.readthedocs.io/en/stable/sempy_labs.html#sempy_labs.get_measure_dependencies) from Semantic Link Labs if you have many dependencies)
- [ ] Exclude helper measures and intermediate calculation objects that are not part of the Data Agent scope
- [ ] Exclude duplicate or overlapping measures
- [ ] Verify no fields needed for verified answers are hidden
- [ ] ⚠️Ensure selected tables match what you will select in Data Agent schema (very important)

## Verified Answers (Prep for AI > Verified answers)
- [ ] Identify most common questions from your team
- [ ] Create verified answers using appropriate visuals
- [ ] ⚠️Use 5-7 complete, robust trigger questions per verified answer (not partial phrases)
- [ ] Include both formal and conversational phrasings
- [ ] Configure up to 3 filters for flexible slicing
- [ ] Ensure all fields used in verified answers are visible in the model
- [ ] Test trigger questions for exact and semantic matching

## AI Instructions (Prep for AI > Add AI instructions)
- [ ] Define business terminology specific to your organization (e.g. `TMS is total media spend and should be calculated using the measure total_media_spend`, `YTD is year to date`)
- [ ] Specify time period definitions (fiscal year, peak season, etc.)
- [ ] Document metric preferences (which measure to use for common questions)
- [ ] Clarify ambiguous date fields (Order Date vs Ship Date vs Due Date)
- [ ] Add default groupings and analysis preferences
- [ ] Add example DAX queries for complex scenarios to guide AI for patterns
- [ ] If the semantic model uses Calculation Groups, [DAX UDFs](https://learn.microsoft.com/en-us/dax/best-practices/dax-user-defined-functions), Field Parameters, describe in instructions how those should be used. 
- [ ] Keep instructions clear and specific (avoid conflicts, don't be too verbose)
- [ ] Ensure instructions don't contradict verified answer configurations

## Data Agent Configuration
**After you have set up the Prep for AI, add the prep'd semantic model to Data Agent**
- [ ] ⚠️Select the same tables in Data Agent that are defined in Prep for AI > AI Data Schema (very important)
- [ ] Test and validate responses before adding AI instructions
- [ ] Add Data Agent instructions only for guidance that applies across ALL data sources
- [ ] Add routing instructions for multiple semantic models or semantic model + other data source types (e.g. `For revenue related questions use the semantic model, for real-time delivery performance questions use the XYZ table from the KQL DB`)
- [ ] Limit Data Agent instructions to: response formatting, cross-source routing, common abbreviations, tone
- [ ] 🚫DO NOT add semantic model specific instructions at Data Agent level (very important)

## Testing and Validation
- [ ] Test responses before adding AI instructions to identify gaps
- [ ] Review DAX query in each response to verify accuracy and DAX pattern
- [ ] If results are incorrect, identify which configuration needs adjustment (AI data schema, verified answers, or AI instructions)
- [ ] If the responses take longer than expected, analyze DAX performance, keep AI instructions concise.
- [ ] Test with fields inside AI data schema (should return answers)
- [ ] Verify trigger questions return correct verified answers
- [ ] Use Fabric Data Agent [Python SDK](https://learn.microsoft.com/en-us/fabric/data-science/fabric-data-agent-sdk) for automated evaluation against ground truth
- [ ] To debug, download and review the [diagnostics logs](https://learn.microsoft.com/en-us/fabric/data-science/evaluate-data-agent#diagnostics-button)
- [ ] Iterate on configuration based on validation findings
- [ ] Use Git and Deployment Pipelines for Data Agent lifecycle management
- [ ] Add Data Agent description before publishing
- [ ] Add [publishing instructions](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-microsoft-365-copilot#control-how-microsoft-365-copilot-handles-the-output-from-fabric-data-agent) if the Data Agent is used in M365 Copilot
