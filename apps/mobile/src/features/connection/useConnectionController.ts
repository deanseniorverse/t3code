import { useAtomValue } from "@effect/atom-react";
import {
  RelayConnectionRegistration,
  RelayConnectionTarget,
  connectionCatalogDisplayUrl,
  connectionEntryLabel,
} from "@t3tools/client-runtime/connection";
import type { EnvironmentId } from "@t3tools/contracts";
import type {
  RelayClientEnvironmentRecord,
  RelayEnvironmentStatusResponse,
} from "@t3tools/contracts/relay";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { useMemo } from "react";

import { environmentCatalog } from "../../connection/catalog";
import {
  connectPairingUrl as connectPairingUrlAtom,
  updateBearerConnection,
} from "../../connection/onboarding";
import { useWorkspaceEnvironments } from "../../state/workspace";
import { relayEnvironmentDiscovery } from "../../state/relay";
import { useAtomCommand } from "../../state/use-atom-command";
import { relayManagedEnvironmentIds } from "./environmentSections";

export interface RelayEnvironmentView {
  readonly environment: RelayClientEnvironmentRecord;
  readonly availability: "checking" | "online" | "offline" | "error";
  readonly status: RelayEnvironmentStatusResponse | null;
  readonly error: string | null;
  readonly traceId: string | null;
}

export function useConnectionController() {
  const connectedEnvironments = useWorkspaceEnvironments();
  const discovery = useAtomValue(relayEnvironmentDiscovery.stateValueAtom);
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const connectPairingUrlMutation = useAtomCommand(connectPairingUrlAtom, {
    reportFailure: false,
  });
  const updateBearer = useAtomCommand(updateBearerConnection, { reportFailure: false });
  const registerEnvironment = useAtomCommand(environmentCatalog.register, "environment register");
  const removeEnvironmentMutation = useAtomCommand(environmentCatalog.remove, "environment remove");
  const retryEnvironmentMutation = useAtomCommand(environmentCatalog.retryNow, "environment retry");
  const setNicknameMutation = useAtomCommand(environmentCatalog.setNickname, {
    reportFailure: false,
  });
  const setEnvironmentEnabledMutation = useAtomCommand(
    environmentCatalog.setEnabled,
    "environment toggle",
  );
  const refreshRelayEnvironments = useAtomCommand(
    relayEnvironmentDiscovery.refresh,
    "relay environment refresh",
  );

  const registeredIds = useMemo(
    () => relayManagedEnvironmentIds(connectedEnvironments),
    [connectedEnvironments],
  );
  const relayEnvironments = useMemo<ReadonlyArray<RelayEnvironmentView>>(
    () =>
      [...discovery.environments.values()].map((entry) => ({
        environment: entry.environment,
        availability: entry.availability,
        status: Option.getOrNull(entry.status),
        error: Option.getOrNull(entry.error)?.message ?? null,
        traceId: Option.getOrNull(entry.error)?.traceId ?? null,
      })),
    [discovery.environments],
  );
  const availableRelayEnvironments = useMemo(
    () => relayEnvironments.filter((entry) => !registeredIds.has(entry.environment.environmentId)),
    [registeredIds, relayEnvironments],
  );

  const connectPairingUrl = (pairingUrl: string, expectedEnvironmentId?: EnvironmentId) =>
    connectPairingUrlMutation({
      pairingUrl,
      ...(expectedEnvironmentId === undefined ? {} : { expectedEnvironmentId }),
    });
  const connectRelayEnvironment = (environment: RelayClientEnvironmentRecord) =>
    registerEnvironment(
      new RelayConnectionRegistration({
        target: new RelayConnectionTarget({
          environmentId: environment.environmentId,
          label: environment.label,
        }),
      }),
    );
  const removeEnvironment = (environmentId: EnvironmentId) =>
    removeEnvironmentMutation(environmentId);
  const retryEnvironment = (environmentId: EnvironmentId) =>
    retryEnvironmentMutation(environmentId);
  const setEnvironmentEnabled = (environmentId: EnvironmentId, enabled: boolean) =>
    setEnvironmentEnabledMutation({ environmentId, enabled });
  // The label is this device's nickname for the environment; only a changed URL re-pairs it.
  const updateEnvironment = async (
    environmentId: EnvironmentId,
    updates: { readonly label: string; readonly displayUrl: string },
  ) => {
    const entry = catalog.entries.get(environmentId);
    if (entry !== undefined && updates.label.trim() !== connectionEntryLabel(entry)) {
      const renamed = await setNicknameMutation({ environmentId, nickname: updates.label });
      if (!AsyncResult.isSuccess(renamed)) return renamed;
      if (updates.displayUrl === (connectionCatalogDisplayUrl(entry) ?? "")) return renamed;
    }
    return updateBearer({
      environmentId,
      label: entry?.target.label ?? updates.label,
      httpBaseUrl: updates.displayUrl,
    });
  };

  return {
    connectedEnvironments,
    relayEnvironments,
    availableRelayEnvironments,
    relayDiscovery: {
      isRefreshing: discovery.refreshing,
      isOffline: discovery.offline,
      error: Option.getOrNull(discovery.error)?.message ?? null,
      errorTraceId: Option.getOrNull(discovery.error)?.traceId ?? null,
    },
    connectPairingUrl,
    connectRelayEnvironment,
    removeEnvironment,
    retryEnvironment,
    setEnvironmentEnabled,
    updateEnvironment,
    refreshRelayEnvironments,
  };
}
