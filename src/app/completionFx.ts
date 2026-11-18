import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { usePrefs } from "./prefsStore";

/** Soft two-tone completion chime, WebAudio, volume from settings. */
export function playChime(volume: number): void {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const notes = [523.25, 783.99]; // C5 → G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = now + i * 0.18;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 1);
    });
    setTimeout(() => void ctx.close(), 1400);
  } catch {
    // Audio unavailable (e.g. autoplay policy) — silent skip.
  }
}

/** Native Windows notification when the window is not focused (SPEC 5.1). */
export async function notifyCompletion(body: string): Promise<void> {
  const { prefs } = usePrefs.getState();
  if (prefs.notify) {
    try {
      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === "granted";
      const focused = await getCurrentWindow().isFocused();
      if (granted && !focused) {
        sendNotification({ title: "Atom", body });
      }
    } catch {
      // Notification backend unavailable — silent skip.
    }
  }
}
