// Fork-only: a pull request checks out only in a workspace with a remote on its base repository.
import { parseGitRemoteRepository } from "@t3tools/shared/git";
import { isSshRemoteUrl } from "@t3tools/shared/sourceControl";
import * as Effect from "effect/Effect";

import { sourceControlDefinitions } from "../sourceControl/sourceControlDefinitions.ts";
import type * as GitVcsDriver from "../vcs/GitVcsDriver.ts";

export function pullRequestRepositoryKey(value: string): string | null {
  const repositoryUrl = sourceControlDefinitions.parseChangeRequestUrl(value)?.link.repositoryUrl;
  return repositoryUrl === undefined
    ? null
    : sourceControlDefinitions.repositoryKeyFromRemote(repositoryUrl);
}

const repositoryPath = (key: string) => key.slice(key.indexOf("/") + 1);

/** Reads `remote.<name>.url` as written, because `git remote -v` applies `url.insteadOf`. */
export const readRawRemoteUrls = Effect.fn("pullRequestCheckoutGuard.readRawRemoteUrls")(function* (
  git: GitVcsDriver.GitVcsDriver["Service"],
  cwd: string,
) {
  const result = yield* git.execute({
    operation: "pullRequestCheckoutGuard.readRawRemoteUrls",
    cwd,
    args: ["config", "--get-regexp", "^remote\\..*\\.url$"],
    allowNonZeroExit: true,
  });
  return result.stdout
    .split("\n")
    .map((line) => line.slice(line.indexOf(" ") + 1).trim())
    .filter((url) => url.length > 0);
});

function remoteMatchesRepository(remoteUrl: string, pullRequestKey: string): boolean {
  const { canonicalRepositoryKey, repositoryKeyFromRemote } = sourceControlDefinitions;
  if (
    canonicalRepositoryKey(repositoryKeyFromRemote(remoteUrl)) ===
    canonicalRepositoryKey(pullRequestKey)
  ) {
    return true;
  }
  // An SSH alias such as `github-ford` names no real host, so only its path can be compared.
  const remote = parseGitRemoteRepository(remoteUrl);
  return (
    remote !== null &&
    isSshRemoteUrl(remoteUrl) &&
    !remote.host.includes(".") &&
    remote.path === repositoryPath(pullRequestKey)
  );
}

/** Null when the pull request's URL names no repository to compare. */
export function pullRequestMatchesRemotes(
  pullRequestUrl: string,
  remoteUrls: ReadonlyArray<string>,
): boolean | null {
  const key = pullRequestRepositoryKey(pullRequestUrl);
  return key === null ? null : remoteUrls.some((url) => remoteMatchesRepository(url, key));
}

export function foreignPullRequestDetail(input: {
  readonly number: number;
  readonly url: string;
  readonly remoteUrls: ReadonlyArray<string>;
}): string {
  const key = pullRequestRepositoryKey(input.url);
  if (key === null) {
    return `This project can't confirm that ${input.url} belongs to it, so it can't be checked out here.`;
  }
  const repository = repositoryPath(key);
  const remotes = [
    ...new Set(
      input.remoteUrls.map((url) =>
        repositoryPath(sourceControlDefinitions.repositoryKeyFromRemote(url)),
      ),
    ),
  ].map((path) => `\`${path}\``);
  const here =
    remotes.length === 0
      ? "this project has no remotes"
      : `this project's remotes point at ${remotes.join(" and ")}`;
  return `\`${repository}#${input.number}\` belongs to \`${repository}\`, but ${here}. Open it from a \`${repository}\` project.`;
}
