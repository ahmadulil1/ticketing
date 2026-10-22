import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { ShieldCheck } from "lucide-react";

export default function Agents() {
  const queryClient = useQueryClient();

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await api.get("/users");
      return res.data as Array<any>;
    },
  });

  const { data: tickets } = useQuery({
    queryKey: ["all-tickets"],
    queryFn: async () => {
      const res = await api.get("/tickets?limit=200");
      return res.data as Array<any>;
    },
  });

  const updateUser = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; role?: string; isActive?: boolean }) => {
      await api.patch(`/users/${id}`, patch);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const loadByAgent = (agentId: string) =>
    tickets?.filter((t: any) => t.assignee_id === agentId).length || 0;

  const agents = users?.filter((u: any) => u.role === "agent" || u.role === "admin") || [];

  return (
    <div className="page">
      <div className="page-head">
        <h1>Manajemen Agent</h1>
      </div>

      <div className="panel agent-form" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <ShieldCheck size={16} />
        <span>
          Akun admin & agent berasal dari SIGAP. Tambah atau hapus akun lewat
          pengaturan SIGAP, lalu hubungkan ke Ticketing dari server.
        </span>
      </div>

      <div className="agent-list">
        {agents.map((u: any) => (
          <div key={u.id} className="agent-card">
            <div className="agent-head">
              <span className="avatar">{(u.full_name || u.username).slice(0, 2).toUpperCase()}</span>
              <div>
                <div className="agent-name">{u.full_name || u.username}</div>
                <div className="muted">@{u.username} • {u.role}</div>
              </div>
              <span className={`badge ${u.is_active ? "badge-active" : "badge-off"}`}>
                {u.is_active ? "Aktif" : "Nonaktif"}
              </span>
            </div>
            <div className="agent-meta">
              <span>{loadByAgent(u.id)} tiket ditugaskan</span>
            </div>
            {u.sigap_user_id ? (
              <div className="agent-actions">
                <span className="muted">Akun SIGAP — role & status dikelola di SIGAP</span>
              </div>
            ) : (
              <div className="agent-actions">
                <select
                  value={u.role}
                  onChange={(e) => updateUser.mutate({ id: u.id, role: e.target.value })}
                >
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                </select>
                <button
                  className={u.is_active ? "btn btn-danger" : "btn btn-primary"}
                  onClick={() => updateUser.mutate({ id: u.id, isActive: !u.is_active })}
                >
                  {u.is_active ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </div>
            )}
          </div>
        ))}
        {agents.length === 0 && <span className="muted">Belum ada agent</span>}
      </div>
    </div>
  );
}
