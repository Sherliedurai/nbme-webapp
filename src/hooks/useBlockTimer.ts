import { useEffect, useRef, useState } from "react";

/**
 * Wall-clock countdown to an ABSOLUTE deadline (epoch ms). Using a fixed deadline
 * (not tick accumulation) keeps it accurate through tab throttling AND lets a
 * suspended/refreshed block resume with the correct time left. Fires `onExpire`
 * exactly once at zero; `onExpire` is read via ref so the timer never restarts.
 */
export function useBlockTimer(deadlineMs: number, onExpire: () => void) {
  const [now, setNow] = useState(() => Date.now());
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    let fired = false;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= deadlineMs && !fired) {
        fired = true;
        clearInterval(id);
        onExpireRef.current();
      }
    };
    const id = setInterval(tick, 250);
    tick();
    return () => clearInterval(id);
  }, [deadlineMs]);

  return Math.max(0, Math.ceil((deadlineMs - now) / 1000)); // whole seconds left
}
