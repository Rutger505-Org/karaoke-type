"use client";

import { useSession } from "@/client/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { type Song } from "@/lib/catalog";
import {
  createGame,
  currentLine,
  gameReducer,
  isLineActive,
  skipTargetMs,
  type GameState,
} from "@/lib/game";
import { activeWordIndex, compareChars, type KaraokeWord } from "@/lib/lyrics";
import { computeStats, type GameStats } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";
import { Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type AudioStatus = "loading" | "ready" | "error";

/**
 * Tracks whether the <audio> element can play. Reads the element itself, so
 * events fired before hydration aren't missed.
 */
function useAudioStatus(audioRef: React.RefObject<HTMLAudioElement | null>) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const audio = audioRef.current;
      if (!audio) return () => undefined;
      const events = ["canplay", "loadeddata", "error", "emptied"] as const;
      events.forEach((e) => audio.addEventListener(e, onChange));
      return () =>
        events.forEach((e) => audio.removeEventListener(e, onChange));
    },
    [audioRef],
  );
  return useSyncExternalStore<AudioStatus>(
    subscribe,
    () => {
      const audio = audioRef.current;
      if (!audio) return "loading";
      if (audio.error) return "error";
      return audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
        ? "ready"
        : "loading";
    },
    () => "loading",
  );
}

export function Game({
  song,
  sidebar,
}: Readonly<{ song: Song; sidebar?: ReactNode }>) {
  const lines = song.lines;
  const [state, dispatch] = useReducer(gameReducer, lines, createGame);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioStatus = useAudioStatus(audioRef);
  const [starting, setStarting] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.8);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Game clock: the audio's current time, polled every animation frame.
  useEffect(() => {
    if (state.status !== "playing") return;
    let frame = 0;
    const loop = () => {
      const audio = audioRef.current;
      if (audio) dispatch({ type: "tick", nowMs: audio.currentTime * 1000 });
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [state.status]);

  // Keep the input focused while playing.
  useEffect(() => {
    if (state.status === "playing") inputRef.current?.focus();
  }, [state.status, state.lineIndex]);

  const start = async () => {
    const audio = audioRef.current;
    if (!audio || starting) return;
    setStarting(true);
    setPlayError(null);
    try {
      audio.currentTime = 0;
      await audio.play();
      dispatch({ type: "start" });
      inputRef.current?.focus();
    } catch (error) {
      console.error("Audio playback failed", error);
      setPlayError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "The browser blocked playback. Press start again."
          : "Could not play the audio.",
      );
    } finally {
      setStarting(false);
    }
  };

  const onEnter = () => {
    const target = skipTargetMs(state);
    const audio = audioRef.current;
    if (target === null || !audio) {
      dispatch({ type: "enter" });
      return;
    }
    // The audio time is the game clock: tick locks any passed lines.
    console.info("[game] skipping gap", {
      fromMs: Math.round(state.nowMs),
      toMs: Math.round(target),
    });
    audio.currentTime = target / 1000;
  };

  const stats = useMemo(() => computeStats(state.results), [state.results]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <audio
        ref={audioRef}
        src={song.audioUrl}
        preload="auto"
        onEnded={() => dispatch({ type: "end" })}
      />
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
            onEnter={onEnter}
            onStart={start}
            startLabel={
              audioStatus === "error"
                ? "Audio unavailable"
                : audioStatus === "loading" || starting
                  ? "Loading audio…"
                  : "Start"
            }
            canStart={audioStatus === "ready" && !starting}
            playerError={
              audioStatus === "error"
                ? "Could not load the audio. Try again later."
                : playError
            }
          />
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <PlayerCard
          nowMs={state.status === "playing" ? state.nowMs : 0}
          durationMs={song.durationMs}
          volume={volume}
          onVolume={setVolume}
          onVolumeDone={() => {
            if (state.status === "playing") inputRef.current?.focus();
          }}
        />
        {sidebar}
      </aside>
    </div>
  );
}

function PlayerCard({
  nowMs,
  durationMs,
  volume,
  onVolume,
  onVolumeDone,
}: Readonly<{
  nowMs: number;
  durationMs: number;
  volume: number;
  onVolume: (volume: number) => void;
  onVolumeDone: () => void;
}>) {
  const muted = volume === 0;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
          <span>{formatTime(nowMs)}</span>
          <div className="bg-muted h-1 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-foreground/60 h-full"
              style={{ width: `${clamp01(nowMs / durationMs) * 100}%` }}
            />
          </div>
          <span className="text-muted-foreground">
            {formatTime(durationMs)}
          </span>
        </div>
        <label className="text-muted-foreground flex items-center gap-3">
          <button
            type="button"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={() => {
              onVolume(muted ? 0.8 : 0);
              onVolumeDone();
            }}
            className="hover:text-foreground"
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            onPointerUp={onVolumeDone}
            aria-label="Volume"
            className="flex-1 accent-emerald-400"
          />
        </label>
      </CardContent>
    </Card>
  );
}

function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
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
  startLabel,
  canStart,
  playerError,
}: Readonly<{
  state: GameState;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onInput: (value: string) => void;
  onEnter: () => void;
  onStart: () => void;
  startLabel: string;
  canStart: boolean;
  playerError: string | null;
}>) {
  const line = currentLine(state);
  const next = state.lines[state.lineIndex + 1];
  const active = isLineActive(state);
  const playing = state.status === "playing";
  const waiting = playing && !!line && state.nowMs < line.startMs;
  const skippable = skipTargetMs(state) !== null;
  const skipHint = skippable ? " · Enter to skip" : "";

  const word = line?.words[line ? activeWordIndex(line, state.nowMs) : -1];
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
              ? `♪ next line in ${((line.startMs - state.nowMs) / 1000).toFixed(1)}s${skipHint}`
              : state.lockedEarly
                ? `✓ locked, waiting for the next line${skipHint}`
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
              word={word}
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
              {startLabel}
            </Button>
            {playerError && (
              <p className="text-sm text-red-400">{playerError}</p>
            )}
            <p className="text-muted-foreground text-sm">
              Type each line while it&apos;s sung, capitals and punctuation
              count. A typo blocks you until you fix it. Enter locks a fully
              typed line early and skips long instrumental breaks.
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
  word,
}: Readonly<{
  text: string;
  typed: string;
  dimmed: boolean;
  showCaret: boolean;
  /** Word currently being sung, underlined. */
  word?: KaraokeWord;
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
            "relative whitespace-pre",
            states[i] === "correct" && "text-emerald-400",
            states[i] === "wrong" &&
              "rounded-sm bg-red-500/30 text-red-300 ring-2 ring-red-500",
            states[i] === "pending" && "text-muted-foreground",
            showCaret && i === typed.length && "border-l-2 border-amber-400",
            word &&
              i >= word.start &&
              i < word.end &&
              "underline decoration-sky-400 decoration-2 underline-offset-8",
          )}
        >
          {char}
          {states[i] === "wrong" && (
            // What was typed instead, so it's clear why the cursor is stuck.
            <span
              aria-hidden
              className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-sm bg-red-500 px-1 text-xs leading-4 text-white"
            >
              {typed[i] === " " ? "␣" : typed[i]}
            </span>
          )}
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
