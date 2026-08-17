## Automated Item Deletion Scripts

These scripts enable you to delete all Fabric items across all workspaces in your tenant. This is needed for tenant remap, which moves your Fabric and Power BI home region. To pass readiness for executing remap, you must delete all Fabric items in your tenant.

To clean up the Fabric items in your tenant, download `Step0.ps1` through `Step6.ps1` and follow these steps:

The final two steps permanently delete your items, and you can't restore them. Confirm that you backed up all item definitions and data before you continue.

1. Sign in to the Global Admin account in Azure and open an Azure Cloud Shell session. Upload `Step0.ps1` through `Step6.ps1` to this session, and name them exactly as given.
1. Dot source each script by running the following command:

   ```powershell
   . ./Step0.ps1; . ./Step1.ps1; . ./Step2.ps1; . ./Step3.ps1; . ./Step4.ps1; . ./Step5.ps1; . ./Step6.ps1
   ```

1. Run `Get-WorkspaceIds`. Note where `workspaceIds.txt`, `personalWorkspaceIds.txt`, and `sharedWorkspaceIds.txt` are stored.
1. Run `Restore-Workspaces -WorkspaceIdsFilePath workspaceIds.txt`. This command assumes that you're in the same folder as when you ran `Get-WorkspaceIds`. If not, make sure that `workspaceIds.txt`, `personalWorkspaceIds.txt`, and `sharedWorkspaceIds.txt` are in the same folder, and run the command again from that folder.
1. Open the Power BI Admin Portal and go to **Capacity settings**. Find a **Healthy** capacity and copy its ID. In the following command, replace `ID` with the copied ID, and then run the following command:

   ```powershell
   Set-WorkspacesToCapacity -WorkspaceIdsFilePath workspaceIds.txt -CapacityId ID
   ```

   If the capacity becomes full, find another healthy capacity and repeat the process until all workspaces are assigned to a capacity.
1. Run the following command:

   ```powershell
   Add-AdminOnSharedWorkspaces -SharedWorkspaceIdsFilePath sharedWorkspaceIds.txt
   ```

1. Run the following command:

   ```powershell
   Add-AdminOnPersonalWorkspaces -PersonalWorkspaceIdsFilePath personalWorkspaceIds.txt
   ```

1. Run `Remove-AllActiveArtifacts -WorkspaceIdsFilePath workspaceIds.txt`. This step permanently deletes your items, and you can't restore them after executing the command. When prompted, type the confirmation word `YES`.
1. Run `Remove-AllSoftDeletedArtifacts -WorkspaceIdsFilePath workspaceIds.txt`. When prompted, type the confirmation word `YES`.

These scripts perform a best-effort item deletion across the tenant and have built-in error handling, including throttling handling.
