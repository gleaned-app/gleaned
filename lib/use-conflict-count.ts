"use client";

import { useState, useEffect } from "react";
import { getConflicts } from "./db";
import { useSyncStatus } from "./use-sync-status";

export function useConflictCount(): number {
  const [count, setCount] = useState(0);
  const syncStatus = useSyncStatus();

  useEffect(() => {
    getConflicts().then((c) => setCount(c.length));
  }, []);

  useEffect(() => {
    if (syncStatus === "synced") {
      getConflicts().then((c) => setCount(c.length));
    }
  }, [syncStatus]);

  return count;
}
