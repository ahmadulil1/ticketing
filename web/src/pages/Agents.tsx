import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { useState } from "react";
import { UserPlus } from "lucide-react";

export default function Agents() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", password: "", fullName: "", role: "agent" });
  const [error, setError] = useState("");

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

  const register = useMutation({
    mutationFn: async () => {
      await api.post("/auth/register", {
        username: form.username,
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        role: form.role,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowForm(false);
      setForm({ username: "", email: "", password: "", fullName: "", role: "agent" });
      setError("");
    },
    onError: (err: any) => setError(err.response?.data?.error || "Gagal membuat agent"),
  });

  const loadByAgent = (agentId: string) =>
    tickets?.filter((t: any) => t.assignee_id === agentId).length || 0;

  const agents = users?.filter((u: any) => u.role === "agent" || u.role === "admin") || [];

  return (
    <div className="page">
      <div className="page-head">
        <h1>Manajemen Agent</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
          <UserPlus size={16} /> Tambah Agent
        </button>
      </div>

      {showForm && (
        <form
          className="agent-form panel"
          onSubmit={(e) => { e.preventDefault(); register.mutate(); }}
        >
          <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <input placeholder="Nama Lengkap" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" disabled={register.isPending} className="btn btn-primary">Simpan</button>
          {error && <div className="error">{error}</div>}
        </form>
      )}

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
                className={u.is_active ? "btn-danger" : "btn-primary"}
                onClick={() => updateUser.mutate({ id: u.id, isActive: !u.is_active })}
              >
                {u.is_active ? "Nonaktifkan" : "Aktifkan"}
              </button>
            </div>
          </div>
        ))}
        {agents.length === 0 && <span className="muted">Belum ada agent</span>}
      </div>
    </div>
  );
}
