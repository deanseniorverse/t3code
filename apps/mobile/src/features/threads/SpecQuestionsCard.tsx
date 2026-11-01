// Fork-only: answers a spec's questions from the thread screen.
import { useNavigation } from "@react-navigation/native";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  parseSpecQuestionSource,
  specDocPath,
  specFilePath,
  type ThreadSpec,
} from "@t3tools/client-runtime/state/spec-questions";
import { settlePromise, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { useAnimatedStyle, type DerivedValue } from "react-native-reanimated";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text, AppTextInput as TextInput } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { ControlPill } from "../../components/ui/ControlPill";
import * as Dialog from "../../components/ui/Dialog";
import { cn } from "../../lib/cn";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { useSpecQuestionActions } from "../../state/specQuestions";
import { fileRoutePathSegments } from "../files/filePath";

const INPUT_CLASS_NAME =
  "rounded-2xl border border-input-border bg-input px-3.5 py-3 font-sans text-base text-foreground";

export function SpecQuestionsCard(props: {
  readonly thread: EnvironmentThreadShell;
  readonly spec: ThreadSpec;
  readonly canOperateThread: boolean;
  readonly maxHeight: DerivedValue<number>;
}) {
  const { spec, thread } = props;
  const ticket = spec.ticket;
  const navigation = useNavigation();
  const actions = useSpecQuestionActions(thread, spec);
  const [collapsed, setCollapsed] = useState(false);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const maxHeight = props.maxHeight;
  const maxHeightStyle = useAnimatedStyle(() => ({ maxHeight: maxHeight.value }));

  const questions = spec.openQuestions;
  const position = Math.min(index, questions.length - 1);
  const question = questions[position];
  if (question === undefined) return null;
  const label = `${spec.ticket?.key ?? spec.slug} · Q${question.number}`;
  const openFile = (path: string, line?: number) =>
    navigation.navigate("ThreadFile", {
      environmentId: String(thread.environmentId),
      threadId: String(thread.id),
      path: fileRoutePathSegments(path),
      ...(line === undefined ? {} : { line: String(line) }),
    });
  const reset = () => {
    setSelected(null);
    setNote("");
    setAssignee(null);
  };
  const move = (step: number) => {
    setIndex((position + step + questions.length) % questions.length);
    setNotice(null);
    reset();
  };
  const run = async <T,>(task: () => Promise<T>, done: string | ((result: T) => string)) => {
    setBusy(true);
    const result = await settlePromise(task);
    setBusy(false);
    if (result._tag === "Failure") {
      const error = squashAtomCommandFailure(result);
      Dialog.alert(
        `Could not update ${spec.questionsPath}`,
        error instanceof Error ? error.message : String(error),
      );
      return;
    }
    setNotice(typeof done === "string" ? done : done(result.value));
    reset();
  };
  const trimmedNote = note.trim();
  // pb-questions answers: a letter, a letter plus a tweak, or free text.
  const answer =
    selected === null ? trimmedNote : trimmedNote ? `${selected}. ${trimmedNote}` : selected;
  const locked = !props.canOperateThread || busy;
  const source = parseSpecQuestionSource(question.source);
  const details = [
    question.heading,
    question.assignee ? `For ${question.assignee}` : null,
    question.priority ? `Priority ${question.priority}` : null,
  ].filter((value) => value !== null);

  if (collapsed) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Expand spec questions, ${questions.length} open`}
        onPress={() => setCollapsed(false)}
        className="min-h-10 flex-row items-center gap-2 rounded-full border border-border bg-card-alt py-1.5 pl-4 pr-3 active:opacity-70"
      >
        <Text className="font-t3-bold text-2xs uppercase tracking-[1.1px] text-foreground-secondary">
          {label}
        </Text>
        <Text numberOfLines={1} className="flex-1 font-sans text-xs text-foreground-muted">
          {question.question}
        </Text>
        {questions.length > 1 ? (
          <Text className="font-sans text-xs text-foreground-muted">
            {position + 1}/{questions.length}
          </Text>
        ) : null}
        <SymbolView
          name="chevron.up"
          size={12}
          tintColorClassName="accent-icon-subtle"
          type="monochrome"
        />
      </Pressable>
    );
  }

  return (
    <Animated.View
      className="gap-2.5 overflow-hidden rounded-[20px] border border-border bg-card-alt p-4"
      style={maxHeightStyle}
    >
      <View className="flex-row items-start gap-2">
        <View className="flex-1 gap-1">
          <Text className="font-t3-bold text-2xs uppercase tracking-[1.1px] text-foreground-secondary">
            {label}
            {questions.length > 1 ? ` · ${position + 1}/${questions.length}` : ""}
          </Text>
          <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open spec ${spec.title ?? spec.slug}`}
              onPress={() => openFile(specDocPath(spec))}
              className="flex-row items-center gap-1 active:opacity-70"
            >
              <SymbolView name="doc.text" size={12} tintColorClassName="accent-icon-subtle" />
              <Text numberOfLines={1} className="font-sans text-xs text-foreground-secondary">
                {spec.title ?? spec.slug}
              </Text>
            </Pressable>
            {ticket ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Open ticket ${ticket.key}`}
                onPress={() => void tryOpenExternalUrl(ticket.url, "markdown-link")}
                className="flex-row items-center gap-1 active:opacity-70"
              >
                <Text className="font-sans text-xs text-primary-text">{ticket.key}</Text>
                <SymbolView
                  name="arrow.up.right"
                  size={10}
                  tintColorClassName="accent-primary-text"
                />
              </Pressable>
            ) : null}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Collapse spec questions"
          onPress={() => setCollapsed(true)}
          className="h-8 w-8 items-center justify-center rounded-full bg-subtle-strong"
        >
          <SymbolView
            name="chevron.down"
            size={13}
            tintColorClassName="accent-icon-subtle"
            type="monochrome"
          />
        </Pressable>
      </View>
      <ScrollView
        bounces={false}
        className="min-h-0"
        contentContainerClassName="gap-2.5 pb-1"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        style={{ flexShrink: 1 }}
      >
        <Text className="font-sans text-base leading-6 text-foreground">{question.question}</Text>
        {details.length > 0 || source ? (
          <View className="flex-row flex-wrap gap-x-2 gap-y-0.5">
            {source ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => openFile(specFilePath(spec, source.file), source.line)}
              >
                <Text className="font-sans text-xs text-foreground-muted underline">
                  {question.source}
                </Text>
              </Pressable>
            ) : null}
            {details.map((detail) => (
              <Text key={detail} className="font-sans text-xs text-foreground-muted">
                {detail}
              </Text>
            ))}
          </View>
        ) : null}
        <View className="gap-2">
          {question.options.map((option) => {
            const isSelected = selected === option.key;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected, disabled: locked }}
                disabled={locked}
                onPress={() => setSelected(isSelected ? null : option.key)}
                className={cn(
                  "min-h-12 w-full flex-row items-start gap-3 rounded-2xl border px-3.5 py-3",
                  isSelected ? "border-primary bg-primary/10" : "border-border bg-input",
                )}
              >
                <View
                  className={cn(
                    "h-6 w-6 items-center justify-center rounded-full border",
                    isSelected ? "border-primary bg-primary" : "border-input-border",
                  )}
                >
                  <Text
                    className={cn(
                      "font-t3-bold text-xs uppercase",
                      isSelected ? "text-primary-foreground" : "text-foreground-secondary",
                    )}
                  >
                    {option.key}
                  </Text>
                </View>
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text
                    className={cn(
                      "font-t3-bold text-sm",
                      isSelected ? "text-foreground" : "text-foreground-secondary",
                    )}
                  >
                    {option.text}
                  </Text>
                  {option.recommended ? (
                    <View className="self-start rounded-full bg-primary/15 px-2 py-0.5">
                      <Text className="font-t3-bold text-2xs uppercase text-primary-text">
                        Recommended
                      </Text>
                    </View>
                  ) : null}
                  {option.why ? (
                    <Text className="font-sans text-sm leading-5 text-foreground-muted">
                      {option.why}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        {question.comments.map((comment) => (
          <Text
            key={`${comment.by}:${comment.at}:${comment.text}`}
            className="font-sans text-xs leading-5 text-foreground-muted"
          >
            <Text className="font-t3-bold text-xs text-foreground-secondary">{comment.by}</Text>
            {comment.at ? ` · ${comment.at}` : ""}: {comment.text}
          </Text>
        ))}
        <TextInput
          value={note}
          multiline
          editable={!locked}
          onChangeText={setNote}
          placeholder={
            selected === null
              ? "Type your own answer, or a comment"
              : `Optional tweak to ${selected}, e.g. "but per center"`
          }
          className={cn("min-h-[54px]", INPUT_CLASS_NAME)}
        />
        {assignee !== null ? (
          <View className="gap-2">
            <TextInput
              value={assignee}
              autoFocus
              editable={!locked}
              onChangeText={setAssignee}
              placeholder="Full Company OS name, e.g. Paul Staff"
              className={INPUT_CLASS_NAME}
            />
            <View className="flex-row gap-2">
              <Button
                label="Assign"
                tone="primary"
                disabled={locked || assignee.trim() === ""}
                onPress={() =>
                  void run(
                    () => actions.assign(question, assignee.trim()),
                    `Q${question.number} assigned to ${assignee.trim()}`,
                  )
                }
              />
              <Button label="Cancel" tone="text" onPress={() => setAssignee(null)} />
            </View>
          </View>
        ) : null}
        {notice ? (
          <Text className="font-sans text-xs text-foreground-tertiary">{notice}</Text>
        ) : null}
      </ScrollView>
      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          label="Answer"
          tone="primary"
          loading={busy}
          disabled={locked || answer === ""}
          onPress={() =>
            void run(
              () => actions.answer(question, answer),
              (handedOff) =>
                handedOff
                  ? "All questions answered. Asked the agent to review and replan."
                  : `Saved the answer to Q${question.number}`,
            )
          }
        />
        {spec.commentAuthor !== null ? (
          <Button
            label="Comment"
            disabled={locked || trimmedNote === ""}
            onPress={() =>
              void run(
                () => actions.comment(question, spec.commentAuthor!, trimmedNote),
                `Commented on Q${question.number}`,
              )
            }
          />
        ) : null}
        <Button
          label="Assign to…"
          tone="text"
          disabled={locked}
          onPress={() => setAssignee(question.assignee ?? "")}
        />
        <Button
          label="Skip for now"
          tone="text"
          disabled={locked || questions.length < 2}
          onPress={() => move(1)}
        />
        {questions.length > 1 ? (
          <View className="ml-auto flex-row gap-1">
            <ControlPill
              icon="chevron.left"
              accessibilityLabel="Previous question"
              onPress={() => move(-1)}
            />
            <ControlPill
              icon="chevron.right"
              accessibilityLabel="Next question"
              onPress={() => move(1)}
            />
          </View>
        ) : null}
      </View>
      {!props.canOperateThread ? (
        <Text className="font-sans text-xs text-foreground-tertiary">
          This connection cannot answer spec questions.
        </Text>
      ) : null}
    </Animated.View>
  );
}
