import { useQuery } from "@tanstack/react-query";
import api from "../services/api";
import { getDeviceId, isAgent } from "../services/device";

/** Jumlah pesan belum dibaca per tiket (badge titik merah). */
export function useUnread() {
  const isAgentUser = isAgent();
  const deviceId = getDeviceId();

    const { data } = useQuery({
      queryKey: ["unread"],
      queryFn: async () => {
        const url = isAgentUser
          ? "/messages/unread"
          : `/messages/unread?device_id=${encodeURIComponent(deviceId)}`;
        const res = await api.get(url);
        return res.data as Record<string, number>;
      },
      // ponytail: polling 60s cuma jaring pengaman; badge utama dipush WS (__list__).
      refetchInterval: 60000,
    });

  return { unread: data || {} };
}
