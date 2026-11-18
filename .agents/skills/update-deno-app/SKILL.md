---
name: update-deno-app
description: Build and install Dean's T3 Code (Deno) Mac app, roll it back, or fix it when it will not start. Use for "update the app", "new desktop build", "install the new build", "roll back", or "T3 Code is broken". Dean may be running this from the claude CLI in Terminal because T3 Code is down.
---

# Update T3 Code (Deno)

The script is `scripts/update-deno-app.sh`, run from the repo root. Dean's fork works on branch `deno`.

## Update

1. `scripts/update-deno-app.sh --status`, and `git status --short`. Tell Dean if uncommitted changes would go into the build.
2. Only if Dean asked for it, pull or rebase first. Never push, and never commit unasked.
3. Run `scripts/update-deno-app.sh` in the background. The build takes about 10 minutes.
4. The script quits and reopens the app. Inside T3 Code, that ends your session: before you start, tell Dean this will happen and that a Mac notification confirms the install. From Terminal it reports DONE or FAILED.

## T3 Code is broken

Fix Dean's app first, and find the cause second.

1. `scripts/update-deno-app.sh --status`, then read the end of `~/Library/Caches/t3code-deno/update.log` if the last update failed.
2. If it broke right after an update, run `scripts/update-deno-app.sh --rollback` and ask Dean to confirm it opens.
3. Otherwise read the end of `~/.t3/userdata/logs/desktop-main.log` and the other files in that folder.
4. Fix the code on `deno`, run `vp run check:changed` (the Windows native-probe test in `scripts/build-desktop-artifact.test.ts` already fails), then update as above. Ask before committing.

T3 Code (Beta) is the fallback app while this one is down. Both share one T3 home, so quit one before opening the other.

## Rules

- `~/.t3/userdata` is Dean's live data: read it and copy from it, but never edit, delete, or start a dev server on it. A broken database is Dean's decision.
- `vp` is not on PATH by default: `export PATH="$HOME/.cargo/bin:$HOME/.local/share/vite-plus/bin:$PATH"`.
- Never kill by pattern. The script quits the app by name through macOS.
