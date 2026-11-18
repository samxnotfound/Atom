import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useWindowControls() {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void win.isMaximized().then(setMaximized);
    void win
      .listen("tauri://resize", () => {
        void win.isMaximized().then(setMaximized);
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, [win]);

  return {
    maximized,
    minimize: () => void win.minimize(),
    toggleMaximize: () => void win.toggleMaximize(),
    close: () => void win.close(),
    destroy: () => void win.destroy(),
  };
}
