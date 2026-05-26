"use client";

import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = [
  "mousemove", "mousedown", "keydown", "touchstart", "scroll", "click",
] as const;

/**
 * Calls onTimeout after `minutes` of no user interaction.
 * Pass minutes=0 to disable.
 * The timer resets on any mouse, keyboard, touch, or scroll event.
 */
export function useIdleTimeout(minutes: number, onTimeout: () => void) {
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => { onTimeoutRef.current = onTimeout; });

  useEffect(() => {
    if (minutes <= 0) return;

    const ms = minutes * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;

    function reset() {
      clearTimeout(timer);
      timer = setTimeout(() => onTimeoutRef.current(), ms);
    }

    reset();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));

    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes]);
}
