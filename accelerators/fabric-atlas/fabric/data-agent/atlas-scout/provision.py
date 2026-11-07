"""Provision or update the "Atlas Scout" Fabric Data Agent.

Creates the agent if needed, attaches the Fabric Atlas SQL database with every
table selected, applies the agent and data source instructions, replaces the
example queries and publishes the result. The script only touches the Data
Agent item: the Atlas SQL database is read, never modified.

Usage:
    python provision.py --workspace-id <ws> --database-id <sqlDbItemId> [--agent-id <id>] [--dry-run]

Authentication uses the Azure CLI login (``az login``) or any credential
supported by ``DefaultAzureCredential``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests
from azure.identity import AzureCliCredential, ChainedTokenCredential, DefaultAzureCredential

API = "https://api.fabric.microsoft.com/v1"
SCOPE = "https://api.fabric.microsoft.com/.default"
HERE = Path(__file__).resolve().parent
AGENT_NAME = "Atlas Scout"
AGENT_DESCRIPTION = (
    "Read-only governance analyst for the Fabric estate inventoried by Fabric Atlas "
    "(Health, Protect, Trust)."
)


class Fabric:
    def __init__(self, dry_run: bool) -> None:
        self.credential = ChainedTokenCredential(AzureCliCredential(), DefaultAzureCredential())
        self.dry_run = dry_run
        self.session = requests.Session()

    def _headers(self) -> dict[str, str]:
        token = self.credential.get_token(SCOPE).token
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def call(self, method: str, url: str, body: object | None = None, params: dict | None = None):
        if self.dry_run and method != "GET":
            print(f"[dry-run] {method} {url} {params or ''}")
            return None
        response = self.session.request(method, url, headers=self._headers(), json=body, params=params)
        if response.status_code == 202:
            return self._wait(response)
        if response.status_code >= 400:
            raise RuntimeError(f"{method} {url} failed: {response.status_code} {response.text[:500]}")
        return response.json() if response.content else None

    def _wait(self, response: requests.Response):
        location = response.headers.get("Location")
        if not location:
            return None
        while True:
            time.sleep(int(response.headers.get("Retry-After", "3")))
            response = self.session.get(location, headers=self._headers())
            if response.status_code >= 400:
                raise RuntimeError(f"Long running operation failed: {response.text[:500]}")
            status = (response.json() or {}).get("status") if response.content else None
            if status in (None, "Succeeded"):
                return None
            if status in ("Failed", "Cancelled"):
                raise RuntimeError(f"Long running operation {status}: {response.text[:500]}")


def find_or_create_agent(fabric: Fabric, workspace_id: str, agent_id: str | None) -> str:
    if agent_id:
        return agent_id
    agents = fabric.call("GET", f"{API}/workspaces/{workspace_id}/dataAgents") or {}
    for agent in agents.get("value", []):
        if agent.get("displayName") == AGENT_NAME:
            return agent["id"]
    created = fabric.call(
        "POST",
        f"{API}/workspaces/{workspace_id}/dataAgents",
        {"displayName": AGENT_NAME, "description": AGENT_DESCRIPTION},
    )
    if created is None:
        if fabric.dry_run:
            return "<new-agent-id>"
        agents = fabric.call("GET", f"{API}/workspaces/{workspace_id}/dataAgents") or {}
        return next(a["id"] for a in agents.get("value", []) if a.get("displayName") == AGENT_NAME)
    return created["id"]


def ensure_datasource(fabric: Fabric, base: str, workspace_id: str, database_id: str) -> None:
    existing = fabric.call("GET", f"{base}/staging/datasources") or {}
    if any(ds.get("id") == database_id for ds in existing.get("value", [])):
        return
    fabric.call(
        "POST",
        f"{base}/staging/datasources",
        {
            "type": "FabricItem",
            "itemReference": {"referenceType": "ById", "itemId": database_id, "workspaceId": workspace_id},
        },
    )


def select_all_tables(fabric: Fabric, elements_url: str, root_id: str = "") -> int:
    """Walk the element tree and select every table; returns the number of tables."""
    count = 0
    page = fabric.call("GET", elements_url, params={"rootId": root_id}) or {}
    for element in page.get("value", []):
        if element.get("type") == "Table":
            count += 1
            if not element.get("isSelected"):
                fabric.call("PATCH", elements_url, {"isSelected": True}, params={"id": element["id"]})
        elif element.get("hasSubElements"):
            count += select_all_tables(fabric, elements_url, element["id"])
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--workspace-id", required=True, help="Workspace that hosts the agent and the Atlas SQL database")
    parser.add_argument("--database-id", required=True, help="Item id of the Fabric Atlas SQL database")
    parser.add_argument("--agent-id", help="Existing Data Agent id (otherwise found or created by name)")
    parser.add_argument("--dry-run", action="store_true", help="Print write calls without executing them")
    args = parser.parse_args()

    ai_instructions = (HERE / "ai_instructions.md").read_text(encoding="utf-8")
    ds_instructions = (HERE / "datasource_instructions.md").read_text(encoding="utf-8")
    fewshots: dict[str, str] = json.loads((HERE / "fewshots.json").read_text(encoding="utf-8"))

    fabric = Fabric(args.dry_run)
    agent_id = find_or_create_agent(fabric, args.workspace_id, args.agent_id)
    base = f"{API}/workspaces/{args.workspace_id}/dataAgents/{agent_id}"
    print(f"Data Agent: {agent_id}")

    fabric.call("PATCH", f"{base}/staging/settings", {"aiInstructions": ai_instructions})
    ensure_datasource(fabric, base, args.workspace_id, args.database_id)
    ds = f"{base}/staging/datasources/{args.database_id}"
    fabric.call(
        "PATCH",
        ds,
        {
            "instructions": ds_instructions,
            "description": "Fabric Atlas governance store: immutable snapshots of Fabric workspaces "
            "(items, item lineage, access, jobs, incidents, governance scores), the full object inventory in "
            "ConfigEntries (tables, columns, measures with DAX, DAX dependencies, model relationships, "
            "object-level lineage table -> notebook -> table and table -> ontology, domains, tenant settings, "
            "OneLake roles), OpenLineage external lineage and governance decisions.",
        },
    )
    tables = select_all_tables(fabric, f"{ds}/elements")
    print(f"Tables selected: {tables}")

    # deleteAll is rejected once examples exist, so reconcile one by one instead.
    existing = (fabric.call("GET", f"{ds}/fewshots") or {}).get("value", [])
    current = {shot["question"]: shot for shot in existing}
    for question, shot in current.items():
        if fewshots.get(question) != shot.get("query"):
            fabric.call("DELETE", f"{ds}/fewshots/{shot['id']}")
    for question, query in fewshots.items():
        if current.get(question, {}).get("query") != query:
            fabric.call("POST", f"{ds}/fewshots", {"question": question, "query": query})
    print(f"Example queries: {len(fewshots)}")

    fabric.call("POST", f"{base}/staging/publish", {"publishedDescription": AGENT_DESCRIPTION})
    print("Published." if not args.dry_run else "Dry run complete.")
    print(f"Set RAYFIN_PUBLIC_ATLAS_SCOUT_AGENT_ID={agent_id} in rayfin/.env")
    return 0


if __name__ == "__main__":
    sys.exit(main())
