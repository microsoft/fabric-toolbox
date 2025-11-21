# FabricAutoScaling
Auto-scale, pause, or resume a Fabric Capacity on a time-based schedule. This ARM template lets you run a capacity when you need it, and fall back to a lower tier or pause the capacity outside peak hours. This way, you can trial higher performance on a pay-as-you-go basis instead of immediately committing to a more expensive, always-on tier.
### Prerequisites
This assumes you already have a Fabric capacity deployed. To deploy the ARM template, install [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) if you haven't already. Afterwards, run `az login` to create a connection with Azure.
### Deploy the ARM template
Deploy a time-based schedule with **one Azure CLI command**. There is no need to clone the repository!

```
az deployment group create --resource-group <resource-group> --parameters capacityName='<capacity-name>' schedules='<schedule>' --name fabricautoscale --template-uri "https://raw.githubusercontent.com/breght-van-baelen/FabricAutoScaling/refs/heads/main/DeployFabricAutoScale.json" 
```

You only have to fill-in 3 placeholders in this command, namely `<resource-group>`, `<capacity-name>` and `<schedule>`.
The placeholder `<schedule>` can be filled-in as an array of scheduling actions in the following **structure**.

```
[
  {
      "name": "<name>", //name of the schedule action
      "operation": "<operation>", //scale, suspend or resume
      "sku": "<sku>", //F2 - F2048, only required for the scale operation
      "interval": <interval>, // a number that schedules it every x Days, Weeks or Months
      "frequency": "<frequency>", //Day, Week or Month
      "advancedSchedule": {}, //optional
      "startTime": "yyyy-MM-ddTHH:mm:ss+00:00",
      "timeZone": "Continent/City"
  },
  ...
]
```

Below are a few **examples** of how the placeholder `<schedule>` can be filled-in. 

*Upscale the capacity from F64 to F128 every day between 9am and 5pm:*
```json
[
  {
      "name": "Daily9amSchedule",
      "operation": "scale",
      "sku": "F128",
      "interval": 1,
      "frequency": "Day",
      "startTime": "2025-11-10T09:00:00+00:00",
      "timeZone": "Europe/Dublin"
  },
  {
      "name": "Daily5pmSchedule",
      "operation": "scale",
      "sku": "F64",
      "interval": 1,
      "frequency": "Day",
      "startTime": "2025-11-10T17:00:00+00:00",
      "timeZone": "Europe/Dublin"
  }
]
```

*Pause the capacity in the weekends:*
```json
[
  {
      "name": "WeekendSuspendSchedule",
      "operation": "suspend",
      "interval": 1,
      "frequency": "Week",
      "advancedSchedule": {
          "weekDays": ["Friday"]
      },
      "startTime": "2025-11-10T17:00:00+00:00",
      "timeZone": "Europe/Dublin"
  }
  {
      "name": "WorkweekResumeSchedule",
      "operation": "resume",
      "interval": 1,
      "frequency": "Week",
      "advancedSchedule": {
          "weekDays": ["Monday"]
      },
      "startTime": "2025-11-10T09:00:00+00:00",
      "timeZone": "Europe/Dublin"
  },
]
```
### Outcome
This ARM template will create an **automation account** in the resource group of the Fabric Capacity, that schedules a **runbook**. By default the deployed resources will be located in `uksouth`. you can change the region by adding `location='<region>'` to the `--parameters` in the Azure CLI command.

<img width="1615" height="408" alt="image" src="https://github.com/user-attachments/assets/7998c7e9-418f-4fd4-9b6b-5fcb567b6e92" />

