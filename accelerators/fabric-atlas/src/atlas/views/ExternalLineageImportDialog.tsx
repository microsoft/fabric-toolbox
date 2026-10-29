import * as Dialog from "@radix-ui/react-dialog";
import { Upload, X } from "lucide-react";
import { useState } from "react";
import { defaultImportLabel, type ExternalImport } from "../external-lineage";

/**
 * Asks for the name shown in Atlas before a file is imported. The file name
 * stays the identity of the import: the same file name replaces it.
 */
export function ImportNameDialog({
  file,
  existing,
  onCancel,
  onConfirm,
}: {
  file?: File;
  /** Import already stored under the same file name, if any. */
  existing?: ExternalImport;
  onCancel: () => void;
  onConfirm: (label: string) => void;
}) {
  return (
    <Dialog.Root open={!!file} onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[110] bg-black/55" />
        <div className="pointer-events-none fixed inset-0 z-[111] flex items-center justify-center p-m">
          <Dialog.Content className="pointer-events-auto w-full max-w-[460px] rounded-xl border border-border bg-card shadow-fabric-16">
            {file && (
              <ImportNameForm
                key={`${file.name}:${file.lastModified}`}
                file={file}
                existing={existing}
                onConfirm={onConfirm}
              />
            )}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ImportNameForm({
  file,
  existing,
  onConfirm,
}: {
  file: File;
  existing?: ExternalImport;
  onConfirm: (label: string) => void;
}) {
  const [label, setLabel] = useState(() => existing?.label ?? defaultImportLabel(file.name));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(label);
      }}
    >
      <header className="atlas-page-header flex items-start gap-m border-b border-border">
        <span className="flex icon-size-600 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-brand-foreground">
          <Upload className="icon-size-200" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <Dialog.Title className="text-400 font-semibold">
            {existing ? "Replace OpenLineage file" : "Import OpenLineage file"}
          </Dialog.Title>
          <Dialog.Description className="mt-xs text-200 text-muted-foreground">
            {existing
              ? "A file with this name was already imported: its edges will be replaced."
              : "Give this import a name. It is shown in the imports list and on the map."}
          </Dialog.Description>
        </div>
        <Dialog.Close asChild>
          <button
            type="button"
            aria-label="Close import dialog"
            className="atlas-control rounded-lg p-s text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="icon-size-200" />
          </button>
        </Dialog.Close>
      </header>
      <div className="grid gap-m p-l">
        <label className="grid gap-xs text-200 font-semibold">
          Name
          <input
            autoFocus
            value={label}
            maxLength={120}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={defaultImportLabel(file.name)}
            className="atlas-control rounded-lg border border-border bg-background px-m text-300 font-normal"
          />
        </label>
        <p className="text-200 text-muted-foreground">
          File <span className="font-mono text-foreground">{file.name}</span>
          {` · ${(file.size / 1024).toFixed(file.size < 10240 ? 1 : 0)} KB`}
        </p>
        <div className="atlas-toolbar flex flex-wrap justify-end gap-s border-t border-border pt-m">
          <Dialog.Close asChild>
            <button type="button" className="atlas-control rounded-lg border border-border px-m font-semibold hover:bg-accent">
              Cancel
            </button>
          </Dialog.Close>
          <button
            type="submit"
            className="atlas-control inline-flex items-center gap-s rounded-lg bg-primary px-m font-semibold text-primary-foreground hover:brightness-110"
          >
            <Upload className="icon-size-100" aria-hidden="true" />
            {existing ? "Replace" : "Import"}
          </button>
        </div>
      </div>
    </form>
  );
}
