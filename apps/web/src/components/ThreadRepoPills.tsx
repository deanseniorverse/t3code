import { Button } from "./ui/button";

export interface ThreadRepoRoot {
  readonly path: string;
  readonly label: string;
}

function folderLabel(path: string): string {
  return path.split("/").findLast((part) => part.length > 0) ?? path;
}

/** The thread's own checkout first, then the extra folders its work reaches. */
export function threadRepoRoots(
  ownRoot: string | null | undefined,
  folders: ReadonlyArray<string> | undefined,
): ReadonlyArray<ThreadRepoRoot> {
  const roots = ownRoot ? [{ path: ownRoot, label: folderLabel(ownRoot) }] : [];
  for (const folder of folders ?? []) {
    if (roots.some((root) => root.path === folder)) continue;
    roots.push({ path: folder, label: folderLabel(folder) });
  }
  return roots;
}

/** Repository pills for a thread that reaches more than one checkout. */
export function ThreadRepoPills(props: {
  readonly roots: ReadonlyArray<ThreadRepoRoot>;
  readonly selectedPath: string | null;
  readonly onSelect: (root: ThreadRepoRoot) => void;
}) {
  if (props.roots.length < 2) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Repositories">
      {props.roots.map((root) => (
        <Button
          key={root.path}
          size="xs"
          variant={root.path === props.selectedPath ? "secondary" : "glass"}
          aria-pressed={root.path === props.selectedPath}
          title={root.path}
          onClick={() => props.onSelect(root)}
        >
          <span className="min-w-0 truncate">{root.label}</span>
        </Button>
      ))}
    </div>
  );
}
