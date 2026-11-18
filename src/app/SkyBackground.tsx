import { useEffect, useState } from "react";
import { useAppearance } from "./appearanceStore";

const PAUSED = "clouds-paused";

export function SkyBackground() {
  const [blurred, setBlurred] = useState(false);
  const reduceMotion = useAppearance((s) => s.settings.reduceMotion);
  const paused = blurred || reduceMotion;

  useEffect(() => {
    const onBlur = () => setBlurred(true);
    const onFocus = () => setBlurred(false);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    if (!document.hasFocus()) setBlurred(true);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return (
    <div
      aria-hidden
      className={`fixed inset-0 -z-10 overflow-hidden ${paused ? PAUSED : ""}`}
      style={{ background: "var(--bg)" }}
    >
      <div
        className="cloud"
        style={{
          width: "42vw",
          height: "16vw",
          top: "8%",
          left: "18%",
          background: "rgba(255,255,255,0.55)",
          filter: "blur(48px)",
          opacity: 0.7,
          animationName: "cloud-drift-a",
          animationDuration: "160s",
        }}
      />
      <div
        className="cloud"
        style={{
          width: "30vw",
          height: "12vw",
          top: "34%",
          right: "6%",
          background: "rgba(255,255,255,0.4)",
          filter: "blur(56px)",
          opacity: 0.55,
          animationName: "cloud-drift-b",
          animationDuration: "220s",
        }}
      />
      <div
        className="cloud"
        style={{
          width: "26vw",
          height: "10vw",
          bottom: "6%",
          left: "4%",
          background: "rgba(255,255,255,0.35)",
          filter: "blur(64px)",
          opacity: 0.45,
          animationName: "cloud-drift-a",
          animationDuration: "260s",
        }}
      />
    </div>
  );
}
