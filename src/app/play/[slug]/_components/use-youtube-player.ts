"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_SRC = "https://www.youtube.com/iframe_api";
let apiPromise: Promise<typeof YT> | null = null;

/** Loads the official YouTube IFrame Player API script once. */
function loadYouTubeApi(): Promise<typeof YT> {
  if (typeof window.YT?.Player === "function") {
    return Promise.resolve(window.YT);
  }

  apiPromise ??= new Promise<typeof YT>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };

    const script = document.createElement("script");
    script.src = API_SRC;
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      script.remove();
      reject(new Error("Failed to load the YouTube IFrame API"));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}

const ERROR_MESSAGES: Record<number, string> = {
  2: "Invalid YouTube video id.",
  5: "This video can't be played in an HTML5 player.",
  100: "The video was removed or is private.",
  101: "The video owner doesn't allow embedding.",
  150: "The video owner doesn't allow embedding.",
};

/**
 * Mounts a YouTube player inside the returned container ref. The iframe is
 * created by the YouTube API in a child element React doesn't own.
 */
export function useYouTubePlayer(
  videoId: string,
  onStateChange?: (state: YT.PlayerState) => void,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let player: YT.Player | null = null;
    const mount = document.createElement("div");
    container.appendChild(mount);

    loadYouTubeApi()
      .then((api) => {
        if (cancelled) return;
        player = new api.Player(mount, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            playsinline: 1,
            rel: 0,
            disablekb: 1,
            iv_load_policy: 3,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              playerRef.current = player;
              setReady(true);
            },
            onStateChange: (event) => onStateChangeRef.current?.(event.data),
            onError: (event) => {
              if (cancelled) return;
              setError(
                ERROR_MESSAGES[event.data] ?? "The YouTube player failed.",
              );
            },
          },
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error(err);
        setError("Could not load the YouTube player.");
      });

    return () => {
      cancelled = true;
      player?.destroy();
      playerRef.current = null;
      container.replaceChildren();
    };
  }, [videoId]);

  return { containerRef, playerRef, ready, error };
}
