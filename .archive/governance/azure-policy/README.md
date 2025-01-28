# Azure Policies for Microsoft Fabric Capacities

This repository provides Azure Policies designed to help Microsoft Azure Administrators manage and secure Microsoft Fabric capacities within their tenants. These policies are crucial for organizations that need to whitelist Microsoft Fabric capacities, ensuring compliance and proactive monitoring of critical events such as capacity suspension and deletion.

## Overview

Microsoft Fabric capacities are essential resources in the Microsoft Fabric ecosystem, and proper monitoring of their lifecycle events is critical for maintaining availability and compliance. The provided Azure Policies automate the deployment of Azure Monitor Activity Log Alerts, ensuring that administrators are notified when important events occur.

### Prerequisites

1. **Azure Subscription**: Ensure you have an active Azure subscription with the appropriate permissions to create and manage Azure Policies and Activity Log Alerts.
2. **Action Group**: Create an action group in Azure Monitor, which will be used to send notifications when an alert is triggered.

### Parameters

| Parameter       | Type   | Description                                      | Default Value                                       |
| --------------- | ------ | ------------------------------------------------ | --------------------------------------------------- |
| `actionGroupId` | String | ID of the action group to be used for the alerts | N/A                                                 |
| `alertName`     | String | Name of the alert to be created                  | Fabric Capacity Suspended / Fabric Capacity Deleted |

### Key Policies

#### 1. Suspended Capacity Alert Policy

This policy ensures that an Azure Monitor Activity Log Alert is created for scenarios where a Microsoft Fabric capacity is paused. If the alert does not already exist, the policy will deploy a new alert with the specified parameters.

**Policy Features:**

- Monitors the `suspend` action on Microsoft Fabric capacities.
- Automatically deploys an alert if none exists.
- Requires the `Action Group ID` parameter, which specifies the action group to be used for alert notifications.
- Uses the `alertName` parameter to define the name of the alert.

**Sample Parameters:**

- `actionGroupId`: The ID of the action group that handles alert notifications.
- `alertName`: The name of the alert, with a default value of "Fabric Capacity Suspended".

**Policy Logic:**

1. The policy checks for resources of type `Microsoft.Fabric/capacities`.
2. If a capacity resource is found, it validates whether an activity log alert exists for the `suspend` action.
3. If no such alert is present, the policy deploys a new alert using the provided parameters.
4. The policy concatenates the capacity name at the end of the alert name. This concatenated name functions as the unique identifier to validate whether the alert exists or not.

#### 2. Delete Capacity Alert Policy

This policy ensures that an Azure Monitor Activity Log Alert is created for scenarios where a Microsoft Fabric capacity is deleted. Similar to the suspended capacity policy, it automatically deploys a new alert if one does not already exist.

**Policy Features:**

- Monitors the `delete` action on Microsoft Fabric capacities.
- Automatically deploys an alert if none exists.
- Requires the `Action Group ID` parameter for alert notifications.
- Uses the `alertName` parameter to define the name of the alert.

**Sample Parameters:**

- `actionGroupId`: The ID of the action group that handles alert notifications.
- `alertName`: The name of the alert, with a default value of "Fabric Capacity Deleted".

**Policy Logic:**

1. The policy checks for resources of type `Microsoft.Fabric/capacities`.
2. If a capacity resource is found, it validates whether an activity log alert exists for the `delete` action.
3. If no such alert is present, the policy deploys a new alert using the provided parameters.
4. The policy concatenates the capacity name at the end of the alert name. This concatenated name functions as the unique identifier to validate whether the alert exists or not.