import type { EnvironmentId } from "@t3tools/contracts";
import { ChevronDownIcon, XIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";

const ALL = "all";

interface FilterOption {
  readonly value: string;
  readonly label: string;
}

function FilterMenu(props: {
  readonly allLabel: string;
  readonly ariaLabel: string;
  readonly options: ReadonlyArray<FilterOption>;
  readonly value: string | null;
  readonly selectedLabel: string | null;
  readonly onChange: (value: string | null) => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={<Button size="xs" variant={props.value === null ? "glass" : "secondary"} />}
        aria-label={props.ariaLabel}
        className="min-w-0 max-w-full"
      >
        <span className="min-w-0 truncate">{props.selectedLabel ?? props.allLabel}</span>
        <ChevronDownIcon />
      </MenuTrigger>
      <MenuPopup align="start" className="max-h-80 max-w-[min(18rem,var(--available-width))]">
        <MenuRadioGroup
          value={props.value ?? ALL}
          onValueChange={(value) => props.onChange(value === ALL ? null : (value as string))}
        >
          <MenuRadioItem value={ALL} closeOnClick>
            {props.allLabel}
          </MenuRadioItem>
          {props.options.map((option) => (
            <MenuRadioItem key={option.value} value={option.value} closeOnClick>
              <span className="min-w-0 truncate">{option.label}</span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

/** The iPhone list's environment and project pills, for the desktop and web sidebar. */
export function SidebarThreadFilters(props: {
  readonly environments: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly label: string;
  }>;
  readonly selectedEnvironmentId: EnvironmentId | null;
  readonly onEnvironmentChange: (environmentId: EnvironmentId | null) => void;
  readonly projects: ReadonlyArray<FilterOption>;
  /** Null for every project; a label such as "2 projects" when several are chosen elsewhere. */
  readonly selectedProjectKey: string | null;
  readonly selectedProjectLabel: string | null;
  readonly onProjectChange: (projectKey: string | null) => void;
}) {
  const selectedEnvironment = props.environments.find(
    (environment) => environment.environmentId === props.selectedEnvironmentId,
  );
  const filtered = props.selectedEnvironmentId !== null || props.selectedProjectLabel !== null;
  return (
    <div className="flex min-w-0 items-center gap-1.5 px-2 pb-1">
      {props.environments.length > 1 ? (
        <FilterMenu
          allLabel="All environments"
          ariaLabel="Filter threads by environment"
          options={props.environments.map((environment) => ({
            value: environment.environmentId,
            label: environment.label,
          }))}
          value={props.selectedEnvironmentId}
          selectedLabel={selectedEnvironment?.label ?? null}
          onChange={(value) => props.onEnvironmentChange(value as EnvironmentId | null)}
        />
      ) : null}
      <FilterMenu
        allLabel="All projects"
        ariaLabel="Filter threads by project"
        options={props.projects}
        value={props.selectedProjectKey}
        selectedLabel={props.selectedProjectLabel}
        onChange={props.onProjectChange}
      />
      {filtered ? (
        <Button
          size="icon-xs"
          variant="ghost-muted"
          aria-label="Reset thread filters"
          onClick={() => {
            props.onEnvironmentChange(null);
            props.onProjectChange(null);
          }}
        >
          <XIcon />
        </Button>
      ) : null}
    </div>
  );
}
