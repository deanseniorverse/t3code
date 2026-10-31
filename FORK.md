# Fork features (`deno` branch)

Dean's fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code). This file lists what the fork adds on top of upstream `main`, why, and what to protect when rebasing. Keep it current: add a line when a fork feature lands, and drop the entry when upstream ships an equivalent.

- Branch: `deno` on `origin` (deanseniorverse/t3code). Upstream: `upstream` (pingdotgg/t3code).
- List the fork's commits: `git log --reverse --oneline $(git merge-base deno upstream/main)..deno`.
- Fork-only modules start with a `// Fork-only:` comment, so `git grep "Fork-only"` finds them.

## Rebasing on upstream

1. `git fetch upstream && git rebase upstream/main` on `deno`.
2. For each conflict, keep the intent below, not the old code. When upstream ships the same idea, prefer theirs and drop the fork commit.
3. `vp run check:changed`, then walk the "Check after a rebase" line of each feature in a dev server (`vp run dev`).
4. Rebuild the desktop app only when asked: `vp run dist:desktop:dmg:arm64` with `GITHUB_REPOSITORY` and `T3CODE_DESKTOP_UPDATE_REPOSITORY` unset.

## Features

### 1. T3 Code (Deno) desktop app

- **Goal:** install the fork next to the official T3 Code (Beta) instead of replacing it.
- **What:** its own product name, bundle id `com.t3tools.t3code.deno` and Electron profile folder, so window state, keychain item and single-instance lock are separate. Both apps share the same T3 home, so only one runs at a time.
- **Where:** `apps/desktop/package.json`, `apps/desktop/src/app/DesktopEnvironment.ts`, `DesktopUserData.ts`, `packages/contracts/src/ipc.ts`, `scripts/build-desktop-artifact.ts` (+ tests).
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
- **What:** in the main (active) section: needs input or approval, then failed or limited, then unread Done, then read threads. Each group runs oldest first; read threads by when they were last opened. Working, snoozed, settled and pinned sections keep upstream behavior. Dragging to reorder the main list is gone, since the sort decides the order.
- **Where:** shared `sortThreadsByStatusGroup` in `packages/client-runtime/src/state/threadSort.ts` (+ test). Web supplies its groups in `apps/web/src/components/sidebarStatusSort.ts`, used in `Sidebar.tsx` (`sortedActive` and drag prediction). Mobile supplies them in `sortThreadsByListV2Status` (`apps/mobile/src/features/threads/threadListV2.ts`).
- **Mobile:** active rows can no longer move up or down (Move up/down is pinned-only in `HomeScreen.tsx`, `ThreadNavigationSidebar.tsx`, `useThreadListV2.ts`; `ThreadArrangementSheet.tsx` refuses moves inside the active section).
- **Rebase risk:** medium. Upstream's list sort options (`sortActiveBySend`, order keys, the Working shelf) may change; keep this sort for the active section on both clients.

### 8. Spec questions in the thread

- **Goal:** answer a framework spec's open questions (pb-questions `questions.yml`) without leaving T3, and see the spec and its Company OS ticket from the thread.
- **What:**
  - A thread whose branch leaf or title is a spec slug (`YYYY-MM-name`) finds `specs/<slug>/spec.md` in its worktree, attached folders or any project root, in that order.
  - Details panel: a "Spec" section (toggle "Spec and ticket") with the spec title (opens `spec.md`), the `cos:` ticket key linking to `https://os.seniorverse.dev/dev/<n>`, and "N open questions" (opens the drawer).
  - Composer drawer: question, heading, source link (opens the file at that line), assignee, priority, lettered options with the Recommended badge and why, comments. Actions: Answer (letter, letter plus tweak, or free text), Comment, Assign to…, Skip for now, previous/next. With an agent question open too, "Agent question" and "Spec questions · N" tabs switch between them, each keeping its own expanded state.
  - Answers only write `questions.yml`; nothing goes to the agent per answer. When the last open question is answered, the thread gets one message: answers are complete, review them, apply per pb-questions and replan, with the file's full path.
  - Every write re-reads the file first and edits one field with the `yaml` Document API, so the rest of the file stays byte-identical. The file re-reads when a turn ends. pb-cos sync carries edits to the ticket; T3 never calls Company OS.
- **Mobile:** the thread screen shows a spec questions card where the agent question card goes, with the same fields and actions; a segmented control switches between "Agent question" and "Spec questions · N". Mobile has no details panel, so the spec title (opens `spec.md`) and the ticket link sit in the card header; files open in the `ThreadFile` viewer. The summary is hidden once every question is answered.
- **Where:**
  - Pure parsing and editing: `packages/shared/src/specQuestions.ts` (+ test, `./specQuestions` export).
  - Discovery atoms and actions: `packages/client-runtime/src/state/specQuestions.ts` (+ test, `./state/spec-questions` export).
  - Web: `apps/web/src/specQuestionsState.ts` (hooks and drawer UI store), `apps/web/src/components/chat/{ComposerSpecQuestionsPanel,ThreadSpecPanel}.tsx`, wired in `ChatComposer.tsx`, `ThreadDetailsPanel.tsx`, `threadDetailsItems.ts`.
  - Mobile: `apps/mobile/src/state/specQuestions.ts` (hooks), `apps/mobile/src/features/threads/SpecQuestionsCard.tsx`, wired in `ThreadDetailScreen.tsx`.
- **Known limits:** the comment author is the constant `SPEC_COMMENT_AUTHOR` ("Dean Mraz") in `packages/shared/src/specQuestions.ts`. The Company OS base URL is fixed there too.
- **Check after a rebase:** a thread titled with a spec slug shows the Spec section and the drawer; answering writes only the `answer:` line.

## Surfaces

| Feature                                           | Web/desktop | Mobile                          |
| ------------------------------------------------- | ----------- | ------------------------------- |
| 1. Deno desktop app                               | yes         | n/a                             |
| 2–3. Sidebar environment filter and machine names | yes         | upstream already has it         |
| 4–5. Branch names, attached folders               | server      | server                          |
| 6. Repo pills in Files/Diff                       | yes         | no                              |
| 7. Status sort                                    | yes         | yes                             |
| 8. Spec questions                                 | yes         | yes, summary in the card header |
