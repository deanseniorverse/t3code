// Fork-only: renames an environment from Settings → Connections.
import {
  AuthSettingsWriteScope,
  ENVIRONMENT_LABEL_MAX_LENGTH,
  resolveEnvironmentLabel,
  type EnvironmentId,
  type ServerConfig,
} from "@t3tools/contracts";
import { PencilIcon } from "lucide-react";
import { useState } from "react";

import { useUpdateEnvironmentSettings } from "../../hooks/useSettings";
import { useEnvironmentScope } from "../../state/session";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { MenuItem } from "../ui/menu";

type RenameServerConfig = Pick<ServerConfig, "environment" | "settings">;

function resolveEnvironmentRenameLock(input: {
  readonly serverConfig: RenameServerConfig | null;
  readonly settingsAccess: boolean;
}): string | null {
  if (input.serverConfig === null) return "Connect to this environment to rename it.";
  if (input.serverConfig.environment.capabilities.environmentLabel !== true) {
    return "Update T3 Code on this environment to rename it.";
  }
  if (!input.settingsAccess) return "Your session on this environment cannot change its settings.";
  return null;
}

/** Opens the rename dialog; the dialog lives outside the menu so it survives the menu closing. */
export function EnvironmentRenameMenuItem({
  environmentId,
  serverConfig,
  onRename,
}: {
  readonly environmentId: EnvironmentId;
  readonly serverConfig: RenameServerConfig | null;
  readonly onRename: () => void;
}) {
  const settingsAccess = useEnvironmentScope(environmentId, AuthSettingsWriteScope);
  const lock = resolveEnvironmentRenameLock({ serverConfig, settingsAccess });
  return (
    <MenuItem disabled={lock !== null} onClick={onRename}>
      <PencilIcon />
      <span className="flex min-w-0 flex-col whitespace-normal">
        Rename…
        {lock !== null ? <span className="text-muted-foreground text-xs">{lock}</span> : null}
      </span>
    </MenuItem>
  );
}

/**
 * Sets the nickname in the environment's own settings, so every client that connects to it shows
 * the same name. Clearing the field goes back to the machine's own name.
 */
export function EnvironmentRenameDialog({
  open,
  onOpenChange,
  environmentId,
  serverConfig,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly serverConfig: RenameServerConfig | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        {/* The popup unmounts when closed, so each opening starts from the current name. */}
        <EnvironmentRenameForm
          environmentId={environmentId}
          serverConfig={serverConfig}
          onClose={() => onOpenChange(false)}
        />
      </DialogPopup>
    </Dialog>
  );
}

function EnvironmentRenameForm({
  environmentId,
  serverConfig,
  onClose,
}: {
  readonly environmentId: EnvironmentId;
  readonly serverConfig: RenameServerConfig | null;
  readonly onClose: () => void;
}) {
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const current = serverConfig?.settings.environmentLabel ?? "";
  const machineLabel =
    serverConfig?.environment.machineLabel ?? serverConfig?.environment.label ?? "";
  const [draft, setDraft] = useState(current);
  const trimmed = draft.trim();
  const unchanged = trimmed === current;

  const save = () => {
    if (serverConfig === null || unchanged) return;
    updateSettings({ environmentLabel: trimmed.length === 0 ? null : trimmed });
    onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Rename {serverConfig ? resolveEnvironmentLabel(serverConfig) : "environment"}
        </DialogTitle>
        <DialogDescription>
          Every device connected to this machine shows the new name. Leave it blank to use the
          machine's own name{machineLabel ? `, ${machineLabel}` : ""}.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <form
          className="grid gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <Label htmlFor="environment-nickname">Name</Label>
          <Input
            id="environment-nickname"
            placeholder={machineLabel}
            value={draft}
            maxLength={ENVIRONMENT_LABEL_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
          />
        </form>
      </DialogPanel>
      <DialogFooter variant="bare">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={serverConfig === null || unchanged}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
