"use client";

import { useYouTubePlayer } from "@/app/play/[slug]/_components/use-youtube-player";
import { useSession } from "@/client/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  createGame,
  currentLine,
  gameReducer,
  isLineActive,
  type GameState,
} from "@/lib/game";
import { compareChars, type KaraokeLine } from "@/lib/lyrics";
import { computeStats, type GameStats } from "@/lib/scoring";
import { type Song } from "@/lib/songs";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

/** YT.PlayerState.ENDED; the YT global only exists once the API script loaded. */
const PLAYER_STATE_ENDED = 0;

export function Game({
  song,
  lines,
  sidebar,
}: Readonly<{ song: Song; lines: KaraokeLine[]; sidebar?: ReactNode }>) {
  const [state, dispatch] = useReducer(gameReducer, lines, createGame);
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePlayerState = useCallback((playerState: YT.PlayerState) => {
    if (Number(playerState) === PLAYER_STATE_ENDED) dispatch({ type: "end" });
  }, []);
  const {
    containerRef,
    playerRef,
    ready: playerReady,
    error: playerError,
  } = useYouTubePlayer(song.youtubeId, handlePlayerState);

  // Game clock: the video's current time, polled every animation frame.
  useEffect(() => {
    if (state.status !== "playing") return;
    let frame = 0;
    const loop = () => {
      const p = playerRef.current;
      if (p) dispatch({ type: "tick", nowMs: p.getCurrentTime() * 1000 });
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [state.status, playerRef]);

  // Keep the input focused while playing, also after clicking the video.
  useEffect(() => {
    if (state.status !== "playing") return;
    inputRef.current?.focus();
    const refocus = () => setTimeout(() => inputRef.current?.focus(), 0);
    window.addEventListener("blur", refocus);
    return () => window.removeEventListener("blur", refocus);
  }, [state.status, state.lineIndex]);

  const start = () => {
    const p = playerRef.current;
    if (!p) return;
    p.seekTo(0, true);
    p.playVideo();
    dispatch({ type: "start" });
    inputRef.current?.focus();
  };

  const stats = useMemo(() => computeStats(state.results), [state.results]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        <StatsBar stats={stats} />
        {state.status === "finished" ? (
          <EndScreen
            song={song}
            stats={stats}
            totalLines={lines.length}
            onRetry={start}
          />
        ) : (
          <TypingArea
            state={state}
            inputRef={inputRef}
            onInput={(value) => dispatch({ type: "input", value })}
            onEnter={() => dispatch({ type: "enter" })}
            onStart={start}
            canStart={playerReady}
            playerError={playerError}
          />
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-lg border bg-black">
          <div ref={containerRef} className="aspect-video w-full" />
        </div>
        {sidebar}
      </aside>
    </div>
  );
}

function StatsBar({ stats }: Readonly<{ stats: GameStats }>) {
  const items = [
    { label: "Score", value: stats.score.toLocaleString("en-US") },
    { label: "Accuracy", value: `${stats.accuracy.toFixed(1)}%` },
    { label: "WPM", value: stats.wpm.toFixed(0) },
    { label: "Combo", value: `×${stats.combo}` },
  ];
  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map((item) => (
        <div key={item.label} className="bg-card rounded-lg border px-4 py-3">
          <div className="text-muted-foreground text-xs tracking-wider uppercase">
            {item.label}
          </div>
          <div className="font-mono text-2xl font-semibold tabular-nums">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function TypingArea({
  state,
  inputRef,
  onInput,
  onEnter,
  onStart,
  canStart,
  playerError,
}: Readonly<{
  state: GameState;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onInput: (value: string) => void;
  onEnter: () => void;
  onStart: () => void;
  canStart: boolean;
  playerError: string | null;
}>) {
  const line = currentLine(state);
  const next = state.lines[state.lineIndex + 1];
  const active = isLineActive(state);
  const playing = state.status === "playing";
  const waiting = playing && !!line && state.nowMs < line.startMs;

  const progress = line
    ? clamp01((state.nowMs - line.startMs) / (line.endMs - line.startMs))
    : 0;

  return (
    <Card className="relative">
      <CardContent className="flex flex-col gap-6 p-6">
        <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div
            className={cn(
              "h-full rounded-full",
              progress > 0.8 ? "bg-amber-400" : "bg-emerald-400",
            )}
            style={{ width: `${(waiting ? 0 : progress) * 100}%` }}
          />
        </div>

        <div className="min-h-28 font-mono">
          <div className="text-muted-foreground mb-2 h-5 text-xs tracking-wider uppercase">
            {waiting && line
              ? `♪ next line in ${((line.startMs - state.nowMs) / 1000).toFixed(1)}s`
              : state.lockedEarly
                ? "✓ locked, waiting for the next line"
                : playing
                  ? `line ${state.lineIndex + 1} / ${state.lines.length}`
                  : ""}
          </div>
          {line && playing ? (
            <LineText
              text={line.text}
              typed={state.typed}
              dimmed={waiting}
              showCaret={active}
            />
          ) : (
            <p className="text-muted-foreground text-2xl">
              {playing
                ? ""
                : "Press start, then type the lyrics as they're sung."}
            </p>
          )}
          <p className="text-muted-foreground/50 mt-3 truncate text-lg">
            {playing && next ? next.text : "\u00A0"}
          </p>
        </div>

        <input
          ref={inputRef}
          value={state.typed}
          readOnly={!active}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter();
            }
          }}
          onPaste={(e) => e.preventDefault()}
          maxLength={line?.text.length}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Type the current lyric line"
          placeholder={active ? "type here…" : ""}
          className={cn(
            "border-input w-full rounded-md border bg-transparent px-4 py-3 font-mono text-lg outline-none",
            "focus-visible:ring-ring focus-visible:ring-1",
            !active && "opacity-50",
          )}
        />

        {!playing && (
          <div className="bg-background/80 absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl backdrop-blur-sm">
            <Button size="lg" onClick={onStart} disabled={!canStart}>
              {canStart ? "Start" : "Loading player…"}
            </Button>
            {playerError && (
              <p className="text-sm text-red-400">{playerError}</p>
            )}
            <p className="text-muted-foreground text-sm">
              Type each line while it&apos;s sung. Enter locks a fully typed
              line early.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LineText({
  text,
  typed,
  dimmed,
  showCaret,
}: Readonly<{
  text: string;
  typed: string;
  dimmed: boolean;
  showCaret: boolean;
}>) {
  const states = compareChars(text, typed);
  return (
    <p
      className={cn(
        "text-2xl leading-relaxed break-words md:text-3xl",
        dimmed && "opacity-40",
      )}
    >
      {text.split("").map((char, i) => (
        <span
          key={i}
          className={cn(
            "whitespace-pre",
            states[i] === "correct" && "text-emerald-400",
            states[i] === "wrong" && "rounded-sm bg-red-500/20 text-red-400",
            states[i] === "pending" && "text-muted-foreground",
            showCaret && i === typed.length && "border-l-2 border-amber-400",
          )}
        >
          {char}
        </span>
      ))}
    </p>
  );
}

function EndScreen({
  song,
  stats,
  totalLines,
  onRetry,
}: Readonly<{
  song: Song;
  stats: GameStats;
  totalLines: number;
  onRetry: () => void;
}>) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-6 p-8 text-center">
        <div>
          <p className="text-muted-foreground text-sm tracking-wider uppercase">
            Final score
          </p>
          <p className="font-mono text-6xl font-bold tabular-nums">
            {stats.score.toLocaleString("en-US")}
          </p>
        </div>
        <div className="grid w-full max-w-md grid-cols-2 gap-3 font-mono sm:grid-cols-4">
          <Stat label="Accuracy" value={`${stats.accuracy.toFixed(1)}%`} />
          <Stat label="WPM" value={stats.wpm.toFixed(0)} />
          <Stat label="Perfect" value={`${stats.perfectLines}/${totalLines}`} />
          <Stat label="Max combo" value={`×${stats.maxCombo}`} />
        </div>
        <ScoreSubmission song={song} stats={stats} />
        <div className="flex gap-3">
          <Button onClick={onRetry}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/">Back to songs</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

/** Submits once per finished game (the end screen remounts for every run). */
function ScoreSubmission({
  song,
  stats,
}: Readonly<{ song: Song; stats: GameStats }>) {
  const { data: session, isPending: sessionPending } = useSession();
  const utils = api.useUtils();
  const submit = api.score.submit.useMutation({
    onSuccess: () => utils.score.top.invalidate({ songSlug: song.slug }),
  });
  const submittedRef = useRef(false);
  const { mutate } = submit;

  const signedIn = !!session?.user;
  const shouldSubmit = signedIn && stats.score > 0;

  useEffect(() => {
    if (!shouldSubmit || submittedRef.current) return;
    submittedRef.current = true;
    mutate({
      songSlug: song.slug,
      score: stats.score,
      accuracy: stats.accuracy,
      wpm: stats.wpm,
    });
  }, [shouldSubmit, mutate, song.slug, stats]);

  if (sessionPending) return null;
  if (!signedIn) {
    return (
      <Link
        href={`/sign-in?callbackUrl=${encodeURIComponent(`/play/${song.slug}`)}`}
        className="text-sm text-emerald-400 underline"
      >
        Sign in to save your score
      </Link>
    );
  }
  if (stats.score === 0) return null;
  return (
    <p className="text-muted-foreground text-sm">
      {submit.isError
        ? `Couldn't save your score: ${submit.error.message}`
        : submit.isSuccess
          ? "Score saved to the leaderboard."
          : "Saving score…"}
    </p>
  );
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
