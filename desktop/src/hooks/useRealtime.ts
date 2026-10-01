import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Subscribe ke WS server untuk update real-time.
 * Saat pesan baru / typing masuk, invalidate query react-query terkait.
 *
 * ponytail: WS tidak di-auth; data notif hanya trigger refresh.
 * Keamanan tetap di API endpoint (JWT / device_id). Upgrade: auth WS + payload check.
 */
const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ||
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/^http/, "ws").replace(/\/api$/, "") ||
  "ws://localhost";

type Channel = "messages" | "tickets" | "typing";

export function useRealtime(ticketId?: string, channels: Channel[] = ["messages", "typing"]) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!ticketId) return;
    let ws: WebSocket | null = null;
    let closed = false;

    const connect = () => {
      ws = new WebSocket(WS_URL + "/ws");
      ws.onopen = () => {
        if (closed) return;
        ws?.send(JSON.stringify({ type: "subscribe", ticketId }));
      };
      ws.onmessage = (ev) => {
        let data: any;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }
        // __list__ mode: refresh daftar tiket + badge unread
        if (ticketId === "__list__") {
          if (data.type === "new_message" || data.type === "message_read") {
            queryClient.invalidateQueries({ queryKey: ["tickets"] });
            queryClient.invalidateQueries({ queryKey: ["unread"] });
          }
          return;
        }
        if (data.ticketId !== ticketId) return;
        if (data.type === "new_message" && channels.includes("messages")) {
          queryClient.invalidateQueries({ queryKey: ["messages", ticketId] });
          queryClient.invalidateQueries({ queryKey: ["tickets"] });
        }
        if (data.type === "message_read") {
          // Lawan baca pesan: refresh ✓✓ + badge unread
          queryClient.invalidateQueries({ queryKey: ["messages", ticketId] });
          queryClient.invalidateQueries({ queryKey: ["unread"] });
        }
        if (data.type === "typing" && channels.includes("typing")) {
          queryClient.invalidateQueries({ queryKey: ["typing", ticketId] });
        }
      };
      ws.onclose = () => {
        if (!closed) setTimeout(connect, 3000);
      };
    };
    connect();

    return () => {
      closed = true;
      ws?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);
}
