export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: "user" | "agent" | "admin";
  created_at: string;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  requester_id: string;
  requester_name?: string;
  requester_full_name?: string;
  requester_email?: string;
  title: string;
  description: string;
  status: "baru" | "sedang_ditangani" | "menunggu_pengguna" | "selesai" | "ditutup" | "dibuka_kembali";
  priority: "rendah" | "normal" | "tinggi" | "urgent";
  assignee_id?: string;
  assignee_name?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  closed_at?: string;
  attachments?: Attachment[];
  unread_count?: number;
  device_id?: string;
  device_name?: string;
  lokasi?: string;
  reopened_at?: string;
}

export interface Message {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_name?: string;
  sender_full_name?: string;
  sender_role: "user" | "agent" | "system";
  message_type: "public" | "internal" | "system";
  body: string;
  created_at: string;
  read_at?: string;
}

export interface Attachment {
  id: string;
  ticket_id: string;
  original_name: string;
  stored_name: string;
  mime_type: string;
  size: number;
  uploaded_at: string;
}
