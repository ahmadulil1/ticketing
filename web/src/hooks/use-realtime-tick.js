import { useEffect, useState } from "react";

export function useRealtimeTick(channelName, tables = []) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Ticketing API has no Supabase realtime channel; refresh data periodically.
    const timer = window.setInterval(() => setTick((current) => current + 1), 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [channelName, tables.join("|")]);

  return tick;
}
