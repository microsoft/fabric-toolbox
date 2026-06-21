---
external help file: MicrosoftFabricMgmt-help.xml
Module Name: MicrosoftFabricMgmt
online version:
schema: 2.0.0
---

# Connect-FabricAccount

## SYNOPSIS
Connects to Microsoft Fabric and sets authentication headers for the current session.

## SYNTAX

### UserPrincipal (Default)
```
Connect-FabricAccount -TenantId <String> [-ProgressAction <ActionPreference>] [-WhatIf] [-Confirm]
 [<CommonParameters>]
```

### ServicePrincipal
```
Connect-FabricAccount -TenantId <String> -AppId <String> -AppSecret <SecureString>
 [-ProgressAction <ActionPreference>] [-WhatIf] [-Confirm] [<CommonParameters>]
```

### ManagedIdentity
```
Connect-FabricAccount [-UseManagedIdentity] [-ClientId <String>] [-ProgressAction <ActionPreference>] [-WhatIf]
 [-Confirm] [<CommonParameters>]
```

## DESCRIPTION
The \`Connect-FabricAccount\` function authenticates to Azure and retrieves an access token for the Fabric API.
Supports three authentication methods:
- User Principal (interactive)
- Service Principal (automated)
- Managed Identity (Azure resources)

## EXAMPLES

### EXAMPLE 1
```
Connect-FabricAccount -TenantId "12345678-1234-1234-1234-123456789012"
```

Authenticates using current user credentials (interactive).

### EXAMPLE 2
```
$appSecret = "your-secret" | ConvertTo-SecureString -AsPlainText -Force
Connect-FabricAccount -TenantId $tid -AppId $appId -AppSecret $appSecret
```

Authenticates using service principal (non-interactive).

### EXAMPLE 3
```
Connect-FabricAccount -UseManagedIdentity
```

Authenticates using system-assigned managed identity (Azure resources only).

### EXAMPLE 4
```
Connect-FabricAccount -UseManagedIdentity -ClientId "87654321-4321-4321-4321-210987654321"
```

Authenticates using user-assigned managed identity.

## PARAMETERS

### -TenantId
The Azure Active Directory tenant (directory) GUID.
Required for User Principal and Service Principal authentication.

```yaml
Type: String
Parameter Sets: UserPrincipal, ServicePrincipal
Aliases:

Required: True
Position: Named
Default value: None
Accept pipeline input: False
Accept wildcard characters: False
```

### -AppId
Client/Application ID (GUID) of the Azure AD application for service principal authentication.
Must be used together with AppSecret parameter.

```yaml
Type: String
Parameter Sets: ServicePrincipal
Aliases:

Required: True
Position: Named
Default value: None
Accept pipeline input: False
Accept wildcard characters: False
```

### -AppSecret
Secure string containing the client secret for service principal authentication.
Convert plain text using: \`ConvertTo-SecureString -AsPlainText -Force\`

```yaml
Type: SecureString
Parameter Sets: ServicePrincipal
Aliases:

Required: True
Position: Named
Default value: None
Accept pipeline input: False
Accept wildcard characters: False
```

### -UseManagedIdentity
Switch to use Azure Managed Identity authentication.
Suitable for Azure VMs, App Services, Functions, etc.

```yaml
Type: SwitchParameter
Parameter Sets: ManagedIdentity
Aliases:

Required: True
Position: Named
Default value: False
Accept pipeline input: False
Accept wildcard characters: False
```

### -ClientId
Optional.
Client ID for user-assigned managed identity.
Omit for system-assigned managed identity.

```yaml
Type: String
Parameter Sets: ManagedIdentity
Aliases:

Required: False
Position: Named
Default value: None
Accept pipeline input: False
Accept wildcard characters: False
```

### -WhatIf
Shows what would happen if the cmdlet runs.
The cmdlet is not run.

```yaml
Type: SwitchParameter
Parameter Sets: (All)
Aliases: wi

Required: False
Position: Named
Default value: None
Accept pipeline input: False
Accept wildcard characters: False
```

### -Confirm
Prompts you for confirmation before running the cmdlet.

```yaml
Type: SwitchParameter
Parameter Sets: (All)
Aliases: cf

Required: False
Position: Named
Default value: None
Accept pipeline input: False
Accept wildcard characters: False
```

### -ProgressAction
{{ Fill ProgressAction Description }}

```yaml
Type: ActionPreference
Parameter Sets: (All)
Aliases: proga

Required: False
Position: Named
Default value: None
Accept pipeline input: False
Accept wildcard characters: False
```

### CommonParameters
This cmdlet supports the common parameters: -Debug, -ErrorAction, -ErrorVariable, -InformationAction, -InformationVariable, -OutVariable, -OutBuffer, -PipelineVariable, -Verbose, -WarningAction, and -WarningVariable. For more information, see [about_CommonParameters](http://go.microsoft.com/fwlink/?LinkID=113216).

## INPUTS

## OUTPUTS

### None. Updates module-scoped authentication context.
## NOTES
API Endpoint: N/A (Authentication only)
Permissions Required: Appropriate Azure AD permissions for chosen auth method
Authentication: This IS the authentication function
Backward Compatibility: Set-FabricApiHeaders is a deprecated wrapper that calls this function and warns once per session.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
Version: 1.0.0
Last Updated: 2026-01-07

BREAKING CHANGE: No longer populates global $FabricConfig variable.
Module now uses internal $script:FabricAuthContext.

## RELATED LINKS
