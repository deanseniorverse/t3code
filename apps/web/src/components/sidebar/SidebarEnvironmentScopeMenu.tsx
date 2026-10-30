import type { EnvironmentId, EnvironmentMachineKind } from "@t3tools/contracts";
import { MonitorSmartphoneIcon } from "lucide-react";

import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";
import { SidebarHeaderIconButton } from "./SidebarThreadHeader";

export interface SidebarEnvironmentScopeOption {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly machine: EnvironmentMachineKind;
}

const ALL_ENVIRONMENTS = "all";

export function SidebarEnvironmentScopeMenu(props: {
  readonly environments: ReadonlyArray<SidebarEnvironmentScopeOption>;
  readonly selectedEnvironmentId: EnvironmentId | null;
  readonly onSelect: (environmentId: EnvironmentId | null) => void;
}) {
  const selected =
    props.environments.find((option) => option.environmentId === props.selectedEnvironmentId) ??
    null;
  return (
    <Menu>
      <MenuTrigger
        render={
          <SidebarHeaderIconButton
            label={
              selected
                ? `Filter threads by environment: ${selected.label}`
                : "Filter threads by environment"
            }
          />
        }
      >
        {selected ? (
          <EnvironmentMachineIcon kind={selected.machine} className="size-4 text-primary" />
        ) : (
          <MonitorSmartphoneIcon className="size-4" />
        )}
      </MenuTrigger>
      <MenuPopup align="start" className="max-w-[min(18rem,var(--available-width))]">
        <MenuRadioGroup
          value={props.selectedEnvironmentId ?? ALL_ENVIRONMENTS}
          onValueChange={(value) =>
            props.onSelect(value === ALL_ENVIRONMENTS ? null : (value as EnvironmentId))
          }
        >
          <MenuRadioItem value={ALL_ENVIRONMENTS} closeOnClick>
            All environments
          </MenuRadioItem>
          {props.environments.map((option) => (
            <MenuRadioItem key={option.environmentId} value={option.environmentId} closeOnClick>
              <span className="flex min-w-0 items-center gap-1.5">
                <EnvironmentMachineIcon kind={option.machine} className="size-3 shrink-0" />
                <span className="min-w-0 truncate">{option.label}</span>
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}
