import { useMemo, useState } from "react";
import {
  Bot,
  Check,
  Copy,
  Download,
  ExternalLink,
  KeyRound,
  Lock,
  Plug,
  ShieldCheck,
  Terminal,
  Wrench,
} from "lucide-react";
import { ATLAS_CONFIG } from "../config";
import { PageHeader } from "../components/PageHeader";
import { ATLAS_MCP_TOOLS } from "../mcp/tool-definitions";
import { REPOSITORY_URL } from "../release";
import { Card, SectionLabel } from "../ui";

type ClientId = "vscode" | "copilot" | "claude";

const CLIENTS: Array<{ id: ClientId; label: string; file: string }> = [
  { id: "vscode", label: "VS Code", file: ".vscode/mcp.json" },
  { id: "copilot", label: "Copilot CLI", file: "~/.copilot/mcp-config.json" },
  { id: "claude", label: "Claude Desktop", file: "claude_desktop_config.json" },
];

const CLIENT_PLACEHOLDER = "<public-client-id>";
const TENANT_PLACEHOLDER = "<tenant-id>";

export function buildMcpConfig(
  client: ClientId,
  tenantId: string,
  serverPath: string,
): string {
  const env = {
    ATLAS_MCP_ENABLED: "true",
    ATLAS_MCP_CLIENT_ID: CLIENT_PLACEHOLDER,
    ATLAS_MCP_TENANT_ID: tenantId || TENANT_PLACEHOLDER,
  };
  const server = { command: "node", args: [serverPath], env };
  const body =
    client === "vscode"
      ? { servers: { "fabric-atlas": { type: "stdio", ...server } } }
      : client === "copilot"
        ? { mcpServers: { "fabric-atlas": { type: "local", ...server, tools: ["*"] } } }
        : { mcpServers: { "fabric-atlas": server } };
  return `${JSON.stringify(body, null, 2)}\n`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="inline-flex items-center gap-xs rounded-md border border-border bg-background px-m py-xs text-200 font-semibold transition-colors hover:border-primary/50 hover:bg-accent"
    >
      {copied ? (
        <Check className="icon-size-100 text-status-healthy" aria-hidden="true" />
      ) : (
        <Copy className="icon-size-100" aria-hidden="true" />
      )}
      {copied ? "Copied" : label}
    </button>
  );
}

const STEPS: Array<{ icon: typeof Plug; title: string; body: string; code?: string }> = [
  {
    icon: Terminal,
    title: "Build the local server",
    body: "Clone the repository on the machine that runs your MCP client, generate the Rayfin environment of this app and bundle the stdio server.",
    code: `git clone ${REPOSITORY_URL}.git\ncd FabricAtlas\nnpm ci\nnpx rayfin env --framework vite\nnpm run build:mcp`,
  },
  {
    icon: KeyRound,
    title: "Register a public client",
    body: "Create a single-tenant Entra app registration without secret, enable public client flows (device code) and grant the delegated Fabric permission Item.Execute.All.",
  },
  {
    icon: Plug,
    title: "Add the server to your client",
    body: "Download or copy the configuration below, replace the client ID and the path to dist-mcp/atlas-mcp.mjs, then reload your MCP client.",
  },
  {
    icon: ShieldCheck,
    title: "Sign in once",
    body: "On first call the server prints a device code. Sign in with an account that belongs to the Atlas app audience; tools then read only the administrator-selected workspaces.",
  },
];

export function McpView() {
  const [client, setClient] = useState<ClientId>("vscode");
  const tenantId = ATLAS_CONFIG.tenantId ?? "";
  const active = CLIENTS.find((entry) => entry.id === client) ?? CLIENTS[0];
  const serverPath =
    client === "vscode"
      ? "${workspaceFolder}/dist-mcp/atlas-mcp.mjs"
      : "<path-to-FabricAtlas>/dist-mcp/atlas-mcp.mjs";
  const config = useMemo(
    () => buildMcpConfig(client, tenantId, serverPath),
    [client, tenantId, serverPath],
  );

  const download = () => {
    const blob = new Blob([config], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = client === "vscode" ? "mcp.json" : `fabric-atlas-mcp-${client}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="atlas-content-frame flex min-h-full flex-col gap-l p-l sm:p-xxl">
      <PageHeader
        title="Atlas MCP"
        purpose="Give Copilot, Claude or any MCP client read-only access to Atlas evidence."
      />

      <Card className="atlas-fabric-hero relative isolate w-full overflow-hidden border-border shadow-fabric-4">
        <div className="atlas-overview-beam" aria-hidden="true" />
        <div className="grid gap-xl p-xl sm:p-xxl lg:grid-cols-[1.1fr_0.9fr]">
          <section className="flex flex-col justify-center">
            <div className="flex flex-wrap items-center gap-s">
              <span className="inline-flex items-center gap-s rounded-full border border-status-healthy/30 bg-status-healthy/10 px-m py-s text-200 font-semibold text-status-healthy">
                <Lock className="icon-size-100" aria-hidden="true" />
                Read-only
              </span>
              <span className="rounded-full border border-border bg-background/55 px-m py-s text-200 font-semibold">
                Local stdio
              </span>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-m py-s font-mono text-200 font-semibold text-primary">
                {ATLAS_MCP_TOOLS.length} tools
              </span>
            </div>
            <div className="mt-xl flex items-center gap-l">
              <span className="atlas-brand-mark flex icon-size-700 shrink-0 items-center justify-center rounded-xl text-primary-foreground">
                <Bot className="icon-size-400" aria-hidden="true" />
              </span>
              <div>
                <SectionLabel>Model Context Protocol</SectionLabel>
                <h2 className="mt-xs font-heading text-500 font-bold">
                  Ask your agent about this estate
                </h2>
              </div>
            </div>
            <p className="mt-l text-300 leading-500 text-muted-foreground">
              The Atlas MCP server runs on your machine and reads the same validated
              snapshots as this app: catalog, lineage, access, findings, incidents
              and provenance. It never changes Fabric, permissions or Atlas data,
              and it is disabled until you opt in.
            </p>
          </section>
          <ol className="grid gap-m">
            {STEPS.map(({ icon: Icon, title, body }, index) => (
              <li
                key={title}
                className="flex gap-m rounded-lg border border-border bg-background/70 p-m"
              >
                <span className="flex icon-size-500 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="icon-size-200" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-300 font-semibold">
                    {index + 1}. {title}
                  </p>
                  <p className="mt-xs text-200 leading-400 text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <div className="grid gap-l lg:grid-cols-2">
        <Card className="flex flex-col gap-m p-l">
          <div className="flex items-center justify-between gap-m">
            <div>
              <SectionLabel>Step 1</SectionLabel>
              <h3 className="mt-xs text-400 font-semibold">Build the server</h3>
            </div>
            <CopyButton text={STEPS[0].code ?? ""} label="Copy commands" />
          </div>
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-m font-mono text-200 leading-400">
            {STEPS[0].code}
          </pre>
          <p className="text-200 text-muted-foreground">
            Requires Node.js 20+. The bundle is written to{" "}
            <code className="font-mono">dist-mcp/atlas-mcp.mjs</code>.
          </p>
        </Card>

        <Card className="flex flex-col gap-m p-l">
          <div className="flex flex-wrap items-center justify-between gap-m">
            <div>
              <SectionLabel>Step 3</SectionLabel>
              <h3 className="mt-xs text-400 font-semibold">Client configuration</h3>
            </div>
            <div className="flex gap-s">
              <CopyButton text={config} label="Copy" />
              <button
                type="button"
                onClick={download}
                className="inline-flex items-center gap-xs rounded-md bg-primary px-m py-xs text-200 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                <Download className="icon-size-100" aria-hidden="true" />
                Download
              </button>
            </div>
          </div>
          <div role="tablist" aria-label="MCP client" className="flex flex-wrap gap-xs">
            {CLIENTS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={client === entry.id}
                onClick={() => setClient(entry.id)}
                className={`rounded-full border px-m py-xs text-200 font-semibold transition-colors ${
                  client === entry.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-accent"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <pre className="max-h-[18rem] overflow-auto rounded-lg border border-border bg-muted/40 p-m font-mono text-200 leading-400">
            {config}
          </pre>
          <p className="text-200 text-muted-foreground">
            Save as <code className="font-mono">{active.file}</code>.{" "}
            {tenantId
              ? "The tenant of this app is prefilled; "
              : "Set your tenant ID; "}
            replace <code className="font-mono">{CLIENT_PLACEHOLDER}</code> with the
            public client registration.
          </p>
        </Card>
      </div>

      <Card className="p-l">
        <div className="flex items-center gap-s">
          <Wrench className="icon-size-200 text-primary" aria-hidden="true" />
          <h3 className="text-400 font-semibold">Available tools</h3>
        </div>
        <ul className="mt-m grid gap-m md:grid-cols-2 xl:grid-cols-3">
          {ATLAS_MCP_TOOLS.map((tool) => (
            <li key={tool.name} className="rounded-lg border border-border bg-background p-m">
              <p className="text-300 font-semibold">{tool.title}</p>
              <p className="mt-xs font-mono text-100 text-primary">{tool.name}</p>
              <p className="mt-s line-clamp-3 text-200 leading-400 text-muted-foreground">
                {tool.description}
              </p>
            </li>
          ))}
        </ul>
        <a
          href={`${REPOSITORY_URL}/blob/main/docs/atlas-mcp.md`}
          target="_blank"
          rel="noreferrer"
          className="mt-l inline-flex items-center gap-xs text-200 font-semibold text-primary hover:underline"
        >
          Identity gates, tool contracts and limits
          <ExternalLink className="icon-size-100" aria-hidden="true" />
        </a>
      </Card>
    </div>
  );
}
