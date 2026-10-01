import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../services/api";
import { Ticket, Message } from "../types";
import { getDeviceId, isAgent } from "../services/device";

export function useTickets(params?: { search?: string; status?: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["tickets", params?.search, params?.status];

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params?.search) q.append("search", params.search);
      if (params?.status) q.append("status", params.status);
      // Guest (karyawan) lihat tiket per device; agent lihat semua
      if (!isAgent()) q.append("device_id", getDeviceId());
      const res = await api.get(`/tickets?${q.toString()}`);
      return res.data as Ticket[];
    },
    refetchInterval: 5000,
  });

  const createTicket = useMutation({
    mutationFn: async (ticket: {
      description: string;
      priority?: string;
      deviceId?: string;
      deviceName?: string;
      lokasi?: string;
    }) => {
      if (isAgent()) {
        const res = await api.post("/tickets", {
          title: ticket.description.slice(0, 60),
          description: ticket.description,
          priority: ticket.priority,
        }, { headers: { "Idempotency-Key": crypto.randomUUID() } });
        return res.data as Ticket;
      }
      // Guest: device identity
      const res = await api.post("/tickets/guest", {
        description: ticket.description,
        priority: ticket.priority || "normal",
        device_id: ticket.deviceId,
        device_name: ticket.deviceName,
        lokasi: ticket.lokasi,
      }, { headers: { "Idempotency-Key": crypto.randomUUID() } });
      return res.data as Ticket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await api.patch(`/tickets/${id}/status`, { status });
      return res.data as Ticket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket"] });
    },
  });

  return { tickets: data || [], isLoading, refetch, createTicket, updateStatus };
}

export function useTicket(id: string) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const res = await api.get(`/tickets/${id}`);
      return res.data as Ticket;
    },
    enabled: !!id,
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const res = await api.patch(`/tickets/${id}/status`, { status });
      return res.data as Ticket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  return { ticket: data, isLoading, updateStatus };
}

export function useMessages(ticketId: string) {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["messages", ticketId],
    queryFn: async () => {
      const res = await api.get(`/messages/ticket/${ticketId}`);
      return res.data as Message[];
    },
    refetchInterval: 3000,
    enabled: !!ticketId,
  });

  const sendMessage = useMutation({
    mutationFn: async ({ body, clientRequestId, messageType }: { body: string; clientRequestId?: string; messageType?: string }) => {
      const res = await api.post(`/messages/ticket/${ticketId}`, {
        body,
        clientRequestId,
        message_type: messageType || "public",
      });
      return res.data as Message;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  return { messages: data || [], isLoading, refetch, sendMessage };
}

// Read receipts: tandai pesan lawan sudah dibaca saat chat dibuka
export function useMarkRead(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.post(`/messages/ticket/${ticketId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["unread"] });
    },
  });
}

// Typing indicator
export function useTyping(ticketId: string) {
  const { data } = useQuery({
    queryKey: ["typing", ticketId],
    queryFn: async () => {
      const res = await api.get(`/messages/ticket/${ticketId}/typing`);
      return res.data as Array<{ userId: string; username: string; role: string }>;
    },
    refetchInterval: 2000,
    enabled: !!ticketId,
  });

  const setTyping = useMutation({
    mutationFn: async (isTyping: boolean) => {
      await api.post(`/messages/ticket/${ticketId}/typing`, { isTyping });
    },
  });

  return { typing: data || [], setTyping };
}
