import { AnimatePresence, motion } from "framer-motion";
import { ChartColumn, Clock, Pause, Play } from "lucide-react";
import { useNav, type Page } from "./nav";
import { useTimer } from "../features/focus/timerStore";

const ICONS: Record<Exclude<Page, "focus">, typeof Clock> = {
  history: Clock,
  reports: ChartColumn,
};

const SPRING = { type: "spring" as const, stiffness: 300, damping: 30 };

export function Dock() {
  const active = useNav((s) => s.active);
  const setActive = useNav((s) => s.setActive);
  const status = useTimer((s) => s.status);
  const timer = useTimer((s) => s.timer);
  const togglePause = useTimer((s) => s.togglePause);

  const sessionLive = (status === "running" || status === "paused") && timer !== null;
  const sideItems: Array<{ page: Exclude<Page, "focus">; slot: "left" | "right" }> = [
    { page: "history", slot: "left" },
    { page: "reports", slot: "right" },
  ];

  const renderItem = (page: Exclude<Page, "focus">) => {
    const Icon = ICONS[page];
    const isActive = active === page;
    return (
      <motion.button
        key={page}
        whileTap={{ scale: 0.94 }}
        transition={SPRING}
        onClick={() => setActive(page)}
        aria-label={page}
        aria-current={isActive ? "page" : undefined}
        className={`relative grid size-11 place-items-center rounded-xl transition-colors ${
          isActive
            ? "bg-white/15 text-[var(--dock-icon-active)] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
            : "text-[var(--dock-icon)] hover:bg-white/10"
        }`}
      >
        <Icon size={19} strokeWidth={2.1} />
      </motion.button>
    );
  };

  const centerClick = () => {
    if (active !== "focus") {
      setActive("focus");
      return;
    }
    if (sessionLive) togglePause();
  };

  const centerIcon =
    status === "running" ? (
      <Pause size={22} fill="currentColor" />
    ) : (
      <Play size={22} fill="currentColor" className="ml-0.5" />
    );

  return (
    <nav aria-label="Main navigation" className="fixed bottom-5 left-1/2 z-20 -translate-x-1/2">
      <div
        className="flex items-center gap-1.5 rounded-full px-3 py-2 shadow-[0_12px_40px_rgba(15,30,60,0.35)]"
        style={{ background: "var(--dock-bg)", backdropFilter: "blur(20px)" }}
      >
        <div className="flex gap-1.5">{sideItems.filter((i) => i.slot === "left").map((i) => renderItem(i.page))}</div>

        <motion.button
          whileTap={{ scale: 0.94 }}
          whileHover={{ scale: 1.05 }}
          transition={SPRING}
          onClick={centerClick}
          aria-label={
            active !== "focus"
              ? "Open Focus"
              : sessionLive
                ? status === "running"
                  ? "Pause session"
                  : "Resume session"
                : "Focus"
          }
          aria-current={active === "focus" ? "page" : undefined}
          className="circle mx-2 -mt-7 grid size-16 place-items-center text-white"
          style={{
            background: "var(--primary-grad)",
            boxShadow: "var(--glow), 0 0 0 5px rgba(38,40,46,0.55)",
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={status === "running" ? "pause" : "play"}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.12 }}
              className="grid place-items-center"
            >
              {centerIcon}
            </motion.span>
          </AnimatePresence>
        </motion.button>

        <div className="flex gap-1.5">{sideItems.filter((i) => i.slot === "right").map((i) => renderItem(i.page))}</div>
      </div>
    </nav>
  );
}
