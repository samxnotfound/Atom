import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pause, Play, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { pickNextImage } from "../../domain/imageBag";
import {
  computeElapsed,
  computeRemaining,
  formatElapsed,
  formatRemaining,
} from "../../domain/timer";
import { useTimer } from "../focus/timerStore";
import {
  listStandbyImages,
  removeStandbyImage,
  setLuminance,
  type ResolvedStandbyImage,
} from "../../data/standbyRepo";
import { useStandby } from "./standbyStore";
import { computeLuminance, pickClockColor } from "./luminance";

const CONTROLS_HIDE_MS = 3000;

/**
 * Standby Mode (SPEC 5.2): fullscreen, photo backdrop, only the timer,
 * idle-hidden controls, Esc to exit. The timer keeps running underneath.
 */
export function StandbyOverlay() {
  const open = useStandby((s) => s.open);
  if (!open) return null;
  return <Overlay />;
}

function Overlay() {
  const exit = useStandby((s) => s.exitStandby);
  const settings = useStandby((s) => s.settings);
  const setBag = useStandby((s) => s.setBag);

  const [images, setImages] = useState<ResolvedStandbyImage[] | null>(null);
  const [current, setCurrent] = useState<ResolvedStandbyImage | null>(null);
  const [preloadUrl, setPreloadUrl] = useState<string | null>(null);
  const [clockColor, setClockColor] = useState<"white" | "navy">("white");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [loadFailure, setLoadFailure] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failedIds = useRef<Set<string>>(new Set());

  /* --------------------------- enter / exit shell --------------------------- */
  useEffect(() => {
    let released = false;
    void getCurrentWindow()
      .setFullscreen(true)
      .catch(() => undefined);
    void invoke("prevent_sleep", { acquire: true }).catch(() => undefined);
    return () => {
      if (released) return;
      released = true;
      void getCurrentWindow()
        .setFullscreen(false)
        .catch(() => undefined);
      void invoke("prevent_sleep", { acquire: false }).catch(() => undefined);
    };
  }, []);

  /* ------------------------ image pick on every entry ----------------------- */
  const pickImage = useCallback(
    (list: ResolvedStandbyImage[]) => {
      const usable = list.filter((i) => !failedIds.current.has(i.id));
      const names = usable.map((i) => i.file_name);
      // Bag state stores file names; pinnedId is a DB row id. Resolve before
      // passing it through, or pinned mode silently falls back to shuffle.
      const pinnedName =
        settings.pinnedId === null
          ? null
          : (usable.find((i) => i.id === settings.pinnedId)?.file_name ?? null);
      const { image, state } = pickNextImage(
        settings.bag,
        names,
        settings.rotation,
        pinnedName,
      );
      setBag(state);
      if (image === null) {
        setCurrent(null);
        setLoadFailure(true);
        return;
      }
      const resolved = usable.find((i) => i.file_name === image) ?? null;
      setCurrent(resolved);
      setLoadFailure(resolved === null);

      if (resolved) {
        // Preload the next pick in the background so entry stays instant.
        const peek = pickNextImage(state, names, settings.rotation, pinnedName).image;
        const peeked = peek ? usable.find((i) => i.file_name === peek) : null;
        if (peeked) {
          const img = new Image();
          img.src = peeked.url;
          setPreloadUrl(peeked.url);
        }
        // Cache luminance once.
        // The scrim's centre is 30% black plus the dim setting; contrast must
        // be judged against that, not the photo alone.
        const centreScrim = Math.min(1, 0.3 + settings.dim / 100);
        if (resolved.luminance === null) {
          void computeLuminance(resolved.url).then((l) => {
            if (l !== null) {
              void setLuminance(resolved.id, l);
              setClockColor(pickClockColor(l, centreScrim));
            }
          });
        } else {
          setClockColor(pickClockColor(resolved.luminance, centreScrim));
        }
      }
    },
    [settings.bag, settings.rotation, settings.pinnedId, settings.dim, setBag],
  );

  const loadImages = useCallback(async () => {
    const list = await listStandbyImages().catch(() => [] as ResolvedStandbyImage[]);
    setImages(list);
    pickImage(list);
  }, [pickImage]);

  useEffect(() => {
    void loadImages();
    // Picked fresh on every entry (component mounts on open).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------ idle controls ----------------------------- */
  const reveal = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
  }, []);

  useEffect(() => {
    reveal();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [reveal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      reveal();
      if (e.key === "Escape") {
        e.preventDefault();
        exit();
      }
    };
    const onMove = () => reveal();
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onMove);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onMove);
    };
  }, [reveal, exit]);

  /* ----------------------------- timer display ------------------------------ */
  const status = useTimer((s) => s.status);
  const timer = useTimer((s) => s.timer);
  const nowMs = useTimer((s) => s.nowMs);
  const phase = useTimer((s) => s.phase);
  const { togglePause, requestStop } = useTimer.getState();

  const timeText = useMemo(() => {
    if (!timer) return "00:00";
    const remaining = computeRemaining(timer, nowMs);
    return remaining !== null
      ? formatRemaining(remaining)
      : formatElapsed(computeElapsed(timer, nowMs));
  }, [timer, nowMs]);

  const exitThenStop = useCallback(() => {
    exit();
    requestStop();
  }, [exit]);

  const clockFont = settings.clockWeight === "thin" ? 200 : 500;
  const clockSize = Math.round(140 * settings.clockScale);
  const isBreak = phase === "break";
  const color = clockColor === "navy" ? "#0E1726" : "#FFFFFF";
  const running = status === "running";

  const handleImageError = useCallback(
    (img: ResolvedStandbyImage, list: ResolvedStandbyImage[]) => {
      // Corrupt/missing file: skip silently and drop it from the bag (SPEC 10).
      failedIds.current.add(img.id);
      const remaining = list.filter((i) => i.id !== img.id);
      setImages(remaining);
      if (img.source === "user") void removeStandbyImage(img.id, img.file_name);
      pickImage(remaining.length > 0 ? remaining : []);
    },
    [pickImage],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="fixed inset-0 z-[100] overflow-hidden"
      style={{ cursor: controlsVisible ? "default" : "none" }}
      role="dialog"
      aria-label="Standby mode"
    >
      {/* Backdrop: photo or Sky-gradient fallback */}
      {current ? (
        <AnimatePresence mode="sync">
          <motion.img
            key={current.url}
            src={current.url}
            alt=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            onError={() => images && handleImageError(current, images)}
            draggable={false}
            className="absolute inset-0 size-full object-cover"
          />
        </AnimatePresence>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, var(--sky-top) 0%, var(--sky-mid) 45%, var(--sky-bottom) 100%)",
          }}
        />
      )}
      {preloadUrl !== null && (
        <img src={preloadUrl} alt="" aria-hidden className="hidden" />
      )}

      {/* Scrim: strongest behind the clock, adjustable dim */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 62% 50% at 50% 46%, rgba(0,0,0,${0.3 + settings.dim / 100}) 0%, rgba(0,0,0,${settings.dim / 100}) 62%, rgba(0,0,0,${Math.min(0.5, settings.dim / 100)}))`,
        }}
      />

      {/* Only the timer */}
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-4">
          {isBreak && (
            <span
              className="text-[14px] font-semibold uppercase tracking-[0.2em] opacity-80"
              style={{ color, textShadow: "0 2px 12px rgba(0,0,0,0.35)" }}
            >
              Break
            </span>
          )}
          <p
            className="tnum tracking-tight"
            style={{
              fontWeight: clockFont,
              fontSize: `${clockSize}px`,
              lineHeight: 1,
              color,
              textShadow: clockColor === "white" ? "0 2px 24px rgba(0,0,0,0.35)" : "none",
            }}
          >
            {timeText}
          </p>
          {!running && status !== "saved" && (
            <span
              className="text-[13px] font-semibold uppercase tracking-[0.2em] opacity-70"
              style={{ color }}
            >
              Paused
            </span>
          )}
        </div>
      </div>

      {/* Glass controls pill, fades after 3 s idle */}
      <AnimatePresence>
        {controlsVisible && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-10 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/25 bg-black/40 px-3 py-2 backdrop-blur-md"
          >
            <PillButton
              label={running ? "Pause" : "Resume"}
              disabled={status === "saved"}
              onClick={() => {
                togglePause();
                reveal();
              }}
            >
              {running ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            </PillButton>
            <PillButton label="Stop" onClick={exitThenStop}>
              <Square size={15} fill="currentColor" />
            </PillButton>
            <PillButton label="Exit standby (Esc)" onClick={exit}>
              <X size={17} />
            </PillButton>
          </motion.div>
        )}
      </AnimatePresence>

      {loadFailure && (
        <p className="absolute bottom-10 right-10 text-[12px] font-medium text-white/50">
          No standby images found — add some in Settings → Standby
        </p>
      )}
    </motion.div>
  );
}

function PillButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="circle grid size-10 place-items-center text-white/85 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}
