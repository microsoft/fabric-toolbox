# Spike: Fabric policies (Policies center) — G20 / #83

**Outcome:** read-only awareness in Atlas; rule and activation collection deferred.

## What Fabric policies are

Fabric policies (preview) are attribute-based rules that tenant and capacity admins define in the
**Policies center** (OneLake catalog → Govern). Source:
[Fabric policies overview](https://learn.microsoft.com/fabric/governance/fabric-policies-overview).

- A **policy set** is stored as a native **policy item** in a workspace. It supports the Fabric item
  REST APIs, Git integration and CI/CD. Git does not carry activation.
- Admin scope is **Tenant** or **Capacity**. Only one policy set is active per scope, and only the
  scope admin can activate it. Changes take effect within 15 minutes.
- A rule has conditions (combined with AND; operators `AnyOf` / `NoneOf`) and an effect. The only
  effect today is **Allow**, so a policy with rules behaves as an allow list.
- Condition types: workspaces, security groups, sensitivity labels, recipient email domain,
  item type, workspace settings.
- Supported policies: **Allow external data sharing** (tenant, default block all), **Allow item
  creation** (capacity, default allow all), **Allow workspace settings editing** (tenant, default
  allow all).
- Not supported in West Europe, North Europe and West US capacity regions.

## What Atlas does in v2.6

- The Policies & AI view shows a **Fabric policies (preview)** card.
- Enforcement is shown as **Unknown**: Atlas does not read rules or activation state, and a
  missing signal must never read as "not restricted".
- Policy items that already appear in the synced workspace inventory (item type `Policy` /
  `PolicySet`) are listed as real evidence. Atlas makes no extra API call to find them.
- A link points to the Microsoft Learn documentation.

## Why rules and activation are deferred

- The REST APIs (Create / List policy sets, List policy rules, Read active policy sets, Policy
  evaluation) are in preview. Reading active sets needs tenant or capacity admin rights, which
  Atlas's delegated, workspace-scoped model does not assume.
- Atlas stays read-only and never calls the activation or evaluation APIs.

## Possible follow-up

When the APIs are GA, an opt-in admin collector could store the active policy set per scope
(rule name, policy, conditions) and show which rules match the current workspace, with
provenance and the 15-minute propagation caveat.

## Note: Purview DLP

Microsoft Purview DLP and protection policies for Fabric are a different product surface, managed
in the Purview portal. They remain out of scope and are not represented as Fabric policies.
