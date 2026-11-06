# Fork features (`deno` branch)

Dean's fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code). This file lists what the fork adds on top of upstream `main`, why, and what to protect when rebasing. Keep it current: add a line when a fork feature lands, and drop the entry when upstream ships an equivalent.

- Branch: `deno` on `origin` (deanseniorverse/t3code). Upstream: `upstream` (pingdotgg/t3code).
- List the fork's commits: `git log --reverse --oneline $(git merge-base deno upstream/main)..deno`.
- Fork-only modules start with a `// Fork-only:` comment, so `git grep "Fork-only"` finds them.

## Updating from upstream

Placeholder: we define this process the first time we take an upstream update. It should cover:

- Reading what changed upstream since the last update.
- Checking those changes against each feature below for conflicts.
- Suggesting a fix for each conflict, including dropping a fork feature upstream now covers.
- Rebasing, then running `vp run check:changed` and each feature's "Check after a rebase" line.

## Features

### 1. T3 Code (Deno) desktop app

- **Goal:** install the fork next to the official T3 Code (Beta) instead of replacing it.
- **What:** its own product name, bundle id `com.t3tools.t3code.deno` and Electron profile folder, so window state, keychain item and single-instance lock are separate. Both apps share the same T3 home, so only one runs at a time.
- **Update:** `scripts/update-deno-app.sh` builds this checkout, quits the app, installs and reopens it; `--no-build` skips the build, `--rollback` swaps back, `--restart` quits and reopens it, `--status` shows what is installed. It keeps working after the app quits, so an agent inside T3 Code can run it. If T3 Code is broken, run `claude` in Terminal from this folder and use `/update-deno-app`.
- **Where:** `apps/desktop/package.json`, `apps/desktop/src/app/DesktopEnvironment.ts`, `DesktopUserData.ts`, `packages/contracts/src/ipc.ts`, `scripts/build-desktop-artifact.ts` (+ tests), `scripts/update-deno-app.sh`, `.agents/skills/update-deno-app/`.
- **Rebase risk:** upstream changes to app identity or the artifact script. Re-apply the id and name.
- **Check after a rebase:** the DMG installs as "T3 Code (Deno)" beside "T3 Code (Beta)".

### 2. Sidebar filters by environment

- **Goal:** with several machines connected, see one machine's threads at a time, as the iPhone app already allows.
- **What:** an "All environments" pill (shown with more than one environment) beside the "All projects" pill, plus a reset button. It narrows threads, search, folders and the project picker, and persists like the project filter. Switching environments drops chosen projects that environment lacks. The pills wrap in a narrow sidebar.
- **Where:** `apps/web/src/components/sidebar/SidebarEnvironmentScopeMenu.tsx`, `SidebarThreadFilters.tsx`, `SidebarThreadHeader.tsx`, `apps/web/src/uiStateStore.ts`.
- **Check after a rebase:** with two environments, pick one and the list, search and project picker narrow to it.

### 3. Each sidebar row names its machine

- **Goal:** tell apart threads from two machines at a glance.
- **What:** each row names its environment (host included), on the meta line without a branch, beside the provider icons with one.
- **Where:** `apps/web/src/components/sidebar/SidebarThreadRow.tsx`, `Sidebar.tsx`.

### 4. Unnamed threads take their branch's name

- **Goal:** threads read as the work they hold (pb-t3 names branches after spec slugs) without a title generation.
- **What:** a thread nobody named takes its branch name, raw, and follows branch changes; on the default branch it reads `<project> · main`. Renaming or regenerating the title marks it named, and the name then sticks. Unnamed branch threads skip the first-message title generation.
- **Where:** `apps/server/src/orchestration-v2/Orchestrator.ts`, `packages/contracts/src/orchestrationV2.ts`.
- **Rebase risk:** high. The orchestrator and contracts move fast upstream; re-apply against the new event shapes.

### 5. Threads can attach extra folders

- **Goal:** one thread drives a framework spec across sibling repos (framework, clients, services).
- **What:** threads carry an optional `folders` list, set by `thread.metadata.update` and the `t3_thread_update` MCP tool's `set_folders` action. Attached folders count as known workspaces, like project roots.
- **Where:** `apps/server/src/mcp/ThreadMetadataMcpService.ts`, `apps/server/src/mcp/toolkits/orchestrator/tools.ts`, `apps/server/src/orchestration-v2/{Orchestrator,ProjectionStore}.ts`, `apps/server/src/workspace/KnownWorkspaces.ts`, `packages/contracts/src/{orchestrationV2,threadMetadataMcp}.ts`, `packages/client-runtime/src/state/models.ts`, `apps/server/src/provider/agentContextBudget.json`.
- **Rebase risk:** high (contracts, projections, MCP tool descriptions). Re-run the agent context budget check after touching tool text.

### 6. Files and Diff switch between a thread's repositories

- **Goal:** review every repo a spec thread touched from one thread.
- **What:** with attached folders, a row of repository pills sits under the Files and Diff headers; the selected one is filled. Files opens that repo as a folder. Diff shows its branch and working-tree changes (turn checkpoints cover only the thread's own checkout). Clicking a file in another repo's diff opens it by absolute path.
- **Where:** `apps/web/src/components/ThreadRepoPills.tsx`, `DiffPanel.tsx`, `DiffPanelShell.tsx`, `chat/RightPanelSurfaceContent.tsx`, `apps/web/src/diffFileActions.ts` (+ test).
- **Check after a rebase:** a thread with framework-main attached → Changes → framework-main tab → click a file; it opens.

### 7. Thread list sorted by status

- **Goal:** the main list reads as a to-do list: what needs Dean first, what he has already seen last.
- **What:** in the main (active) section: needs input or approval, then failed or limited, then unread Done, then read threads. Each group runs oldest first; read threads by when they were last opened. Working, snoozed, settled and pinned sections keep upstream behavior, except that the pin filter (#10) sorts pinned threads this way too and moves working pins to Working. Dragging to reorder the main list is gone, since the sort decides the order.
- **Where:** shared `sortThreadsByStatusGroup` in `packages/client-runtime/src/state/threadSort.ts` (+ test). Web supplies its groups in `apps/web/src/components/sidebarStatusSort.ts`, used in `Sidebar.tsx` (`sortedActive` and drag prediction). Mobile supplies them in `sortThreadsByListV2Status` (`apps/mobile/src/features/threads/threadListV2.ts`).
- **Mobile:** active rows can no longer move up or down (Move up/down is pinned-only in `HomeScreen.tsx`, `ThreadNavigationSidebar.tsx`, `useThreadListV2.ts`; `ThreadArrangementSheet.tsx` refuses moves inside the active section).
- **Rebase risk:** medium. Upstream's list sort options (`sortActiveBySend`, order keys, the Working shelf) may change; keep this sort for the active section on both clients.

### 8. Spec questions in any thread

- **Goal:** answer a spec's open questions without leaving T3, see the spec and its ticket from the thread, and have threads waiting on an answer rise to the top. Works with any spec system that uses this format.
- **What:**
  - One format: `questions.yml` as the framework's `pb-questions` defines it. A folder spec keeps it as a file; a single-file spec keeps the same YAML in a fenced block under `## Open Questions`.
  - A thread's slug is its title, then its branch's last part, in any lowercase kebab form. T3 looks in its worktree, attached folders and projects, in that order.
  - Each repo can commit a `t3-specs.json` listing spec paths, ticket link and answers-complete message. With none, T3 uses `specs/<slug>/spec.md` and `questions.yml`, with no ticket link.
  - `t3-specs.json` is shared with everyone working in that repo's factory setup, so it holds team-wide configuration only. Never put personal information in it, such as a person's name or a token.
  - Details panel: a "Spec" section with the title, ticket link and open-question count. Composer card (web) and thread-screen card (mobile): every question field, plus Answer, Comment, Assign to…, Skip for now, previous/next, and tabs when an agent question is open too.
  - Answers only write the file. When the last open question is answered, the thread gets one message from the config's template.
  - Every write re-reads the file first and changes one field, so the rest of the file stays as written. An open file in the Files panel re-reads after each save.
  - Needs input: a thread with any open question, whoever it is assigned to, shows Input and sorts into the top group. Running turns, failures and other requests keep their status; settled threads are not read. Files re-read when a turn ends and when the app regains focus, so outside edits can lag until then.
- **Where:**
  - Format and config: `packages/shared/src/specQuestions.ts` (+ test, `./specQuestions` export).
  - Discovery, actions, status: `packages/client-runtime/src/state/specQuestions.ts` (+ test, `./state/spec-questions` export).
  - Web: `apps/web/src/specQuestionsState.ts`, `apps/web/src/components/chat/{ComposerSpecQuestionsPanel,ThreadSpecPanel}.tsx`, `ChatComposer.tsx`, `ThreadDetailsPanel.tsx`, `threadDetailsItems.ts`, `Sidebar.tsx`, `sidebar/SidebarThreadRow.tsx`, `sidebarStatusSort.ts`, `chat/RightPanelSurfaceContent.tsx`.
  - Mobile: `apps/mobile/src/state/specQuestions.ts`, `apps/mobile/src/features/threads/{SpecQuestionsCard.tsx,ThreadDetailScreen.tsx,threadListV2.ts,useThreadListV2.ts,thread-list-v2-items.tsx}`.
- **Known limits:** T3 writes comments with a blank `by`, shown as "You", because it has no identity of its own; whatever syncs the file fills it in (pb-cos does, from the Company OS token's `/me`). Repos with nothing to sign them keep them unsigned. A spec created after its thread loads appears after a reload.
- **Check after an update:** a thread named after a folder spec and one named after a single-file spec each show the card and the Input status; answering changes only that `answer` line.

### 9. Threads stay unread until you leave them

- **Goal:** opening a Done thread for a quick look doesn't lose its Done status or make it jump in the list.
- **What:** T3 sends a thread's visit when you move away from it, not while it is open, so its status and list position hold until then. Mark unread on the open thread stays. Closing or reloading the app with a thread open leaves it unread.
- **Where:** `packages/client-runtime/src/state/threadVisits.ts` (+ test), used by web and mobile.
- **Rebase risk:** medium. This replaces upstream's dispatch-while-viewing logic, so re-apply against any changes there.
- **Check after an update:** open a Done thread; it stays Done. Open another thread; the first moves to the read group.

### 10. Pin filter

- **Goal:** narrow a long thread list to what is in focus, with one mark that follows Dean to every device and to mobile.
- **What:** the pin is the mark, stored by each thread's server, so it syncs. An unpinned row shows a pin on hover; the pinned row's pin unpins. The thread menu's Pin/Unpin and a pin toggle in the chat header do the same; the header toggle can pin a thread the filter hides. The pin button beside the project filter shows only pinned threads, sorted by the status sort (#7) instead of pin order; dragging can't reorder pins while it is on. A pinned thread that starts working moves to the Working section, as an unpinned one does, with the same exit grace, and returns to its status-sorted place when it stops; Working then holds only pinned threads. With the Working section off (setting or folder mode), working pins stay in the pinned list. Off, the list is upstream's: the pinned section on top in dragged order. The filter's on/off is saved per browser or app install. Pin rules are upstream's: pinned threads never auto-settle, and settling clears the pin.
- **Old favorites:** the earlier browser-only stars (`favoriteThreadKeys` in local storage) become pins once, when each thread's server config loads, and the keys are then deleted. Threads on a machine without the `threadPinning` capability keep nothing. Keys for a machine that never connects stay stored until it does. The old filter's on/off carries over.
- **Where:** `apps/web/src/favoritePinMigration.ts` (+ test, run from `Sidebar.tsx`), `uiStateStore.ts` (+ test: `sidebarPinnedOnly`, `legacyFavoriteThreadKeys`), `components/Sidebar.tsx` (`partitionSidebarThreads` + `Sidebar.test.ts`, `shelvesAsWorking`, `NO_REORDERABLE_KEYS`), `packages/client-runtime/src/state/threadInbox.ts` (`observe`'s `pinsCanWork`, + test), `sidebarStatusSort.ts` (`sortPinnedSection`, + test), `sidebar/SidebarThreadHeader.tsx`, `sidebar/SidebarThreadRow.tsx` (`pinButton`), `chat/ThreadPinToggle.tsx`, `chat/threadPinToggle.logic.ts` (+ test), `chat/ChatHeader.tsx`.
- **Rebase risk:** low to medium. Upstream changes to the sidebar partition, pinned sort or Working shelf tracker need the filter's sort and working-pin placement re-applied. The migration can be deleted once no install still has favorites.
- **Check after an update:** pin a thread from its chat header, turn on the filter, reload; only pinned threads show, ordered by status, and the filter is still on. Send a message in a pinned thread; it moves to Working, and back to the pinned list when the turn ends. Turn the filter off; pins sit on top in dragged order, working or not.

### 11. Pull requests only check out in their own repository

- **Goal:** opening another repository's PR from a thread can't put its code, remote and worktree in the wrong repo.
- **What:** `preparePullRequestThread` fails before any write unless the PR's base repository matches a raw `remote.<name>.url` of the workspace. An SSH alias host with no dot, such as `github-ford`, compares by path. The PR detail reports `checkoutAvailable`, and web disables Check out and the PR row's Resolve and Fix with the reason. The machine picker then lists only machines holding the PR's repository. Web and mobile show a `GitManagerError`'s detail without its prefix. Linking and reading a foreign PR stay available.
- **Where:** `apps/server/src/git/pullRequestCheckoutGuard.ts`, `apps/server/src/git/GitManager.ts`, `apps/server/src/pullRequest/PullRequestService.ts`, `packages/contracts/src/{git,pullRequest}.ts`, `apps/web/src/components/pullRequest/{PullRequestDetailPanel,PullRequestDetailActions}.tsx, usePullRequestActions.ts`, `pullRequestDetail.logic.ts`, `pullRequestProjectAssignment.logic.ts`, `apps/web/src/components/chat/ThreadDetailsPrRow.tsx`, `apps/web/src/components/PullRequestThreadDialog.tsx`, `apps/mobile/src/state/threadOutboxDelivery.ts`.
- **Rebase risk:** medium. Upstream may change `preparePullRequestThread` or the panel's handoff; the guard must stay ahead of the `input.mode` split. Upstream's local-remote test fixtures will fail the guard until they use a visible URL.
- **Check after a rebase:** run the `refuses another repository's PR` cases in `apps/server/src/git/GitManager.test.ts`.

### 12. Machine nicknames

- **Goal:** call a machine "Dean's M3P" in T3 Code without renaming the Mac, and see that name on every device.
- **What:**
  - The nickname is the `environmentLabel` server setting on the machine itself; blank or `null` goes back to the machine's own name.
  - The descriptor reports it as `label` and the machine's name as `machineLabel`, with an `environmentLabel` capability.
  - Rename… sits in the ⋯ menu of this machine's row and each saved environment in Settings → Connections. It is locked, with the reason shown, when the machine is not connected, the session lacks settings access, or the machine runs an older build.
  - Every device follows the server's name live and saves it, so it survives offline and fixes names saved at pairing.
  - `t3_environment_read` reports it and `t3_environment_preferences_update` sets it.
  - Renaming from mobile is not supported; mobile shows the new name.
- **Where:** `packages/contracts/src/{settings,environment,server}.ts` (`EnvironmentLabel`, `machineLabel`, `resolveEnvironmentLabel`; + test), `apps/server/src/environment/ServerEnvironment.ts` (+ test), `apps/server/src/server.ts` (environment layer takes settings), `apps/server/src/mcp/toolkits/environment/{tools,handlers}.ts`, `apps/server/src/provider/agentContextBudget.json`, `packages/client-runtime/src/rpc/session.ts` (`configChanges`), `connection/routes.ts` (`entryWithLabel`), `connection/registry.ts` (`setLabel` and its watcher; + test), `apps/web/src/components/settings/{EnvironmentRenameDialog,ConnectionsSettings,SavedEnvironmentRows}.tsx`, `HostFreezeToastCoordinator.ts`, `chat/useSystemComposerBanners.tsx`.
- **Rebase risk:** medium. Upstream may change the descriptor, the registry's lease and storage code, or the session's config stream; keep `setLabel` updating in place without restarting the connection.
- **Check after an update:** rename a remote machine from another device; its sidebar name changes on both without reconnecting, and clearing it shows the machine's name.

## Surfaces

| Feature                                           | Web/desktop | Mobile                          |
| ------------------------------------------------- | ----------- | ------------------------------- |
| 1. Deno desktop app                               | yes         | n/a                             |
| 2–3. Sidebar environment filter and machine names | yes         | upstream already has it         |
| 4–5. Branch names, attached folders               | server      | server                          |
| 6. Repo pills in Files/Diff                       | yes         | no                              |
| 7. Status sort                                    | yes         | yes                             |
| 8. Spec questions                                 | yes         | yes, summary in the card header |
| 9. Unread until you leave                         | yes         | yes                             |
| 10. Pin filter                                    | yes         | pins sync; no filter            |
| 11. PR checkout guard                             | yes         | server, refusal text            |
| 12. Machine nicknames                             | yes         | shows the name, no rename       |
