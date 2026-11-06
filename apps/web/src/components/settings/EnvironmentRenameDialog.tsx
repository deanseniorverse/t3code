// Fork-only: renames an environment on this device from Settings.
import {
  connectionEntryLabel,
  type ConnectionCatalogEntry,
} from "@t3tools/client-runtime/connection";
import type { EnvironmentId } from "@t3tools/contracts";
import { PencilIcon } from "lucide-react";
import { useState } from "react";

import { environmentCatalog } from "../../connection/catalog";
import { useAtomCommand } from "../../state/use-atom-command";
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

const NICKNAME_MAX_LENGTH = 64;

/** Opens the rename dialog; the dialog lives outside the menu so it survives the menu closing. */
export function EnvironmentRenameMenuItem({ onRename }: { readonly onRename: () => void }) {
  return (
    <MenuItem onClick={onRename}>
      <PencilIcon />
      Rename…
    </MenuItem>
  );
}

export function EnvironmentRenameDialog({
  open,
  onOpenChange,
  environmentId,
  entry,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly entry: ConnectionCatalogEntry;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        {/* The popup unmounts when closed, so each opening starts from the current name. */}
        <EnvironmentRenameForm
          environmentId={environmentId}
          entry={entry}
          onClose={() => onOpenChange(false)}
        />
      </DialogPopup>
    </Dialog>
  );
}

function EnvironmentRenameForm({
  environmentId,
  entry,
  onClose,
}: {
  readonly environmentId: EnvironmentId;
  readonly entry: ConnectionCatalogEntry;
  readonly onClose: () => void;
}) {
  const setNickname = useAtomCommand(environmentCatalog.setNickname, "Rename environment");
  const current = entry.nickname ?? "";
  const fallback = entry.target.label;
  const [draft, setDraft] = useState(current);
  const trimmed = draft.trim();
  const unchanged = trimmed === current;

  const save = () => {
    if (unchanged) return;
    void setNickname({ environmentId, nickname: trimmed.length === 0 ? null : trimmed });
    onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Rename {connectionEntryLabel(entry)}</DialogTitle>
        <DialogDescription>
          The new name shows on this device only. Leave it blank to use {fallback}.
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
            placeholder={fallback}
            value={draft}
            maxLength={NICKNAME_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
          />
        </form>
      </DialogPanel>
      <DialogFooter variant="bare">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={unchanged}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
