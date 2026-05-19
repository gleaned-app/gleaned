"use client";

import { useState, useEffect } from "react";
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from "./db";

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus);
  useEffect(() => subscribeSyncStatus(setStatus), []);
  return status;
}
