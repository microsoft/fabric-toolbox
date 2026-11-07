# Atlas Scout — Fabric Data Agent

Atlas Scout is a read-only Fabric Data Agent that answers governance questions in
plain language over the Fabric Atlas SQL database. The **Atlas Scout** tab of the
app (Govern group), the floating Scout bubble and the **Ask Scout** button of the
Catalog item drawer are chat clients for this agent.
They render the answer (findings, priority pills, gauges, tables and lineage
graphs), and show the SQL the agent ran and the raw result tables.

This folder versions everything that defines the agent:

| File | Purpose |
|---|---|
| `ai_instructions.md` | Agent instructions: role, Health / Protect / Trust skills, answer format |
| `datasource_instructions.md` | Schema guidance for the Atlas SQL database |
| `fewshots.json` | Example questions and their reference SQL (`{question: query}`), including lineage walks and object-level queries |
| `provision.py` | Creates or updates the agent, attaches every table and publishes it |

## What Scout can query

Every table of the Atlas SQL database is attached to the agent:

- **Items and health:** workspaces, items, job runs, item-level lineage,
  findings, endorsements, sensitivity labels and access assignments.
- **Governance context:** domains, OneLake data access roles and tenant
  settings.
- **Object inventory:** the JSON documents synchronized in `ConfigEntries`
  (tables, columns, semantic model measures and their DAX dependencies,
  relationships, ontology bindings and object-level lineage edges).
  `datasource_instructions.md` explains how to read them with `OPENJSON` and
  `JSON_VALUE`.

Answers that return `Source` and `Target` columns are drawn as a lineage graph
in the app, for items and for objects. Example questions:

- *Show the downstream lineage of LH_Healthcare_Clinical.*
- *List the measures of a semantic model with their DAX dependencies.*
- *Draw the relationships between the tables of a semantic model.*
- *Which tables feed the AcuteCareOperationsOntology?*
- *Show the object-level lineage of fact_sales*
- *Which tables do notebooks read and write?*
- *Which OneLake roles exist and who is in them?*

The Data Agent runtime did not retrieve the few-shot examples in our tests, so
the business rules and the SQL recipes the agent relies on live in
`ai_instructions.md` and `datasource_instructions.md`. `fewshots.json` stays
as the reference SQL for each pattern.

## Provision or update the agent

```powershell
pip install requests azure-identity
az login --tenant <tenant-id>
python fabric/data-agent/atlas-scout/provision.py `
  --workspace-id <workspace-id> `
  --database-id <atlas-sql-database-item-id> `
  [--agent-id <existing-agent-id>] [--dry-run]
```

The script only writes the Data Agent item. The Atlas SQL database is read,
never modified. Every table is exposed to the agent; the schema is explicit and
the instructions carry the remaining business rules.

## Connect the app

Add the agent id to the git-ignored `rayfin/.env`, then rebuild and deploy:

```dotenv
RAYFIN_PUBLIC_ATLAS_SCOUT_AGENT_ID=<agent-id>
# Optional, defaults to the Atlas workspace
RAYFIN_PUBLIC_ATLAS_SCOUT_WORKSPACE_ID=<agent-workspace-id>
```

The browser calls the agent's published OpenAI-compatible endpoint
(`/v1/workspaces/{ws}/dataagents/{id}/aiassistant/openai`) with a delegated
token for `DataAgent.Execute.All`. On first use the user sees a consent pop-up
unless an Entra administrator granted tenant-wide consent to the Atlas SPA.

## Security scope (v1)

Scout v1 answers over the whole Atlas store: every user who can run the agent
sees every synchronized workspace, regardless of their own workspace roles.
Row-level filtering and per-workspace scope are tracked as a follow-up issue.
Share the agent and the Atlas SQL database only with the governance audience.
