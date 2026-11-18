import { useEffect, useState } from "react";
import Database from "@tauri-apps/plugin-sql";

export type DbStatus = "loading" | "ready" | "error";

let dbPromise: Promise<Database> | null = null;

export function loadDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:atom.db");
  }
  return dbPromise;
}

export function useDatabaseReady(): DbStatus {
  const [status, setStatus] = useState<DbStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    loadDb()
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
