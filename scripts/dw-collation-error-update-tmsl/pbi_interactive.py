"""
Connect to Power BI Service using interactive AAD login.
Steps:
  1. Extend lease (DelayBackgroundProcessingCommand)
  2. Get current dataset (GetDatasetCommand)
  3. Replace collation in the dataset
  4. PUT updated dataset back (PutDatasetCommand)
"""

import argparse
import json
import time
from azure.identity import InteractiveBrowserCredential
import requests

BASE_URL = "https://df-msit-scus-redirect.analysis.windows.net/v1.0/myorg"
SUPPORTED_COLLATIONS = [
    "Latin1_General_100_BIN2_UTF8",
    "Latin1_General_100_CI_AS_KS_WS_SC_UTF8",
]


def get_token_interactive(tenant_id):
    """Acquire AAD token via interactive browser login."""
    credential = InteractiveBrowserCredential(tenant_id=tenant_id)
    token = credential.get_token("https://analysis.windows.net/powerbi/api/.default")
    print("Token acquired via interactive browser login.")
    return token.token


def post_command(token, dw_url, body):
    """POST a command to the datawarehouse endpoint."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    resp = requests.post(dw_url, headers=headers, json=body)
    result = resp.json()

    # Check for HTTP errors
    if resp.status_code >= 400:
        print(f"Status: {resp.status_code}")
        print(json.dumps(result, indent=2))
        error = result.get("error", {})
        msg = error.get("message", "Unknown error")
        details = error.get("details", [])
        detail_msgs = [d.get("message", "") for d in details if d.get("message")]
        raise RuntimeError(
            f"API returned {resp.status_code}: {msg}"
            + (f" | Details: {'; '.join(detail_msgs)}" if detail_msgs else "")
        )

    # Check for failed progressState
    state = result.get("progressState", "")
    if state == "failed":
        op_info = result.get("operationInformation", [{}])
        raise RuntimeError(
            f"Operation failed. Response:\n{json.dumps(op_info, indent=2)}"
        )

    return result


def step1_extend_lease(token, dw_url):
    """Extend the lease via DelayBackgroundProcessingCommand."""
    print("[Step 1] Extending lease...")
    body = {
        "commands": [{"$type": "DelayBackgroundProcessingCommand"}]
    }
    try:
        post_command(token, dw_url, body)
    except RuntimeError as e:
        print(f"  FAILED: {e}")
        raise SystemExit(1)
    print("  Done.")


def step2_get_dataset(token, dw_url):
    """Get the current dataset via GetDatasetCommand."""
    print("[Step 2] Getting current dataset...")
    body = {
        "commands": [{"$type": "GetDatasetCommand"}]
    }
    try:
        result = post_command(token, dw_url, body)
    except RuntimeError as e:
        print(f"  FAILED: {e}")
        raise SystemExit(1)

    try:
        op_info = result["operationInformation"][0]
        dataset = op_info["progressDetail"]["dataset"]
        datamart_version = result["datamartVersion"]
    except (KeyError, IndexError, TypeError) as e:
        print(f"  FAILED: Response missing expected dataset info: {e}")
        raise SystemExit(1)

    print(f"  Current collation: {dataset['model']['collation']}")
    print(f"  Datamart version:  {datamart_version}")
    return dataset, datamart_version


def step3_update_collation_and_put(token, dw_url, dataset, datamart_version, new_collation):
    """Replace collation in the dataset and PUT it back."""
    print(f"[Step 3] Updating collation to '{new_collation}'...")

    # Replace collation
    dataset["model"]["collation"] = new_collation

    # Serialize dataset to JSON string for tmsl
    tmsl_string = json.dumps(dataset)

    body = {
        "executionMode": "full",
        "executionPriority": "normal",
        "prepareTimeout": "00:02:00",
        "timeout": "1.00:00:00",
        "datamartVersion": datamart_version,
        "commands": [
            {
                "$type": "PutDatasetCommand",
                "tmsl": tmsl_string,
                "recalculate": False,
                "upgradeDatabaseCompatibilityLevel": False,
                "shouldValidateTmsl": False,
                "shouldMergeTmsl": False,
            }
        ],
    }

    try:
        result = post_command(token, dw_url, body)
    except RuntimeError as e:
        print(f"  FAILED: {e}")
        raise SystemExit(1)

    progress_state = result.get("progressState", "")
    if progress_state == "inProgress":
        print("  Update in progress...")
        time.sleep(15)
        print("  Done. Please refresh the warehouse in your browser.")
    elif progress_state == "success":
        print("  Collation updated successfully!")
    else:
        print(f"  Unexpected state: {progress_state}")

    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update warehouse collation via Power BI API.")
    parser.add_argument("--tenant-id", required=True, help="Azure AD tenant ID")
    parser.add_argument("--warehouse-id", required=True, help="Datawarehouse ID (GUID)")
    parser.add_argument("--collation", required=True, choices=SUPPORTED_COLLATIONS,
                        help="New collation value")
    args = parser.parse_args()

    dw_url = f"{BASE_URL}/datawarehouses/{args.warehouse_id}/"

    try:
        token = get_token_interactive(args.tenant_id)
    except Exception as e:
        print(f"Login failed: {e}")
        raise SystemExit(1)
    print(f"Signed in. Warehouse: {args.warehouse_id}\n")

    step1_extend_lease(token, dw_url)

    dataset, datamart_version = step2_get_dataset(token, dw_url)

    current_collation = dataset["model"]["collation"]
    if current_collation == args.collation:
        print(f"  Error: The warehouse collation you provided ('{args.collation}') is the same")
        print(f"  as the dataset (TMSL) collation ('{current_collation}').")
        print("  They must be different so the warehouse collation can be applied to the dataset")
        print("  to resolve metadata errors in the warehouse.")
        print("  No update performed.")
        raise SystemExit(1)

    step3_update_collation_and_put(token, dw_url, dataset, datamart_version, args.collation)

