import { useEffect, useRef, useState } from "react";
import { MAINTENANCE_SCHEMA, supabase } from "@/lib/supabaseClient";

export function useRealtimeTick(channelName, tables = []) {
  const [tick, setTick] = useState(0);
  const timerRef = useRef(null);
  const tablesKey = tables.join("|");

  useEffect(() => {
    const channel = supabase.channel(
      `${channelName}-${Math.random().toString(36).slice(2)}`,
    );

    function queueRefresh() {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setTick((current) => current + 1);
      }, 250);
    }

    tables.forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: MAINTENANCE_SCHEMA, table },
        queueRefresh,
      );
    });

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.error(`${channelName} realtime channel error`);
      }
    });

    return () => {
      window.clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [channelName, tablesKey]);

  return tick;
}
