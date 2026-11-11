import { THREAD_STATUS_TABS } from "@t3tools/client-runtime/state/thread-sort";
import type {
  ThreadStatusTab,
  ThreadStatusTabCounts,
} from "@t3tools/client-runtime/state/thread-sort";
import { ScrollView } from "react-native";

import { Chip } from "../../components/ui/Chip";

const LABELS: Record<ThreadStatusTab, string> = {
  all: "All",
  input: "Input",
  failed: "Failed",
  done: "Done",
  read: "Read",
  working: "Working",
  snoozed: "Snoozed",
  settled: "Settled",
};

/** One chip per status with threads, All first. Nothing while a search runs or the list is empty. */
export function ThreadListStatusTabs(props: {
  readonly tab: ThreadStatusTab;
  readonly counts: ThreadStatusTabCounts | null;
  readonly onChange: (tab: ThreadStatusTab) => void;
  /** List padding the scroller bleeds through so chips start where row content does. */
  readonly gutter: number;
  readonly inset: number;
}) {
  const { counts } = props;
  if (counts === null || counts.all === 0) return null;
  const tabs: ThreadStatusTab[] = ["all", ...THREAD_STATUS_TABS.filter((tab) => counts[tab] > 0)];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ marginHorizontal: -props.gutter }}
      contentContainerStyle={{ paddingHorizontal: props.inset, paddingBottom: 10, gap: 6 }}
    >
      {tabs.map((tab) => (
        <Chip
          key={tab}
          size="small"
          label={`${LABELS[tab]} ${counts[tab]}`}
          accessibilityLabel={`${LABELS[tab]}, ${counts[tab]} threads`}
          selected={tab === props.tab}
          onPress={() => props.onChange(tab)}
        />
      ))}
    </ScrollView>
  );
}
