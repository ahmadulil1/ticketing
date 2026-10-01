import { useState, useRef, useEffect } from "react";
import { LogOut, ChevronDown } from "lucide-react";
import { useUser, useLogout } from "../hooks/useAuth";

export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const user = useUser();
  const logout = useLogout();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onOutside);
    return () => document.removeEventListener("click", onOutside);
  }, []);

  if (!user) return null;

  const initials = (user.full_name || user.username)
    .split(" ")
    .slice(0, 2)
    .map(s => s.charAt(0).toUpperCase())
    .join("");

  const roleLabel = user.role === "user" ? "Pengguna" : user.role === "agent" ? "Agent Support" : "Admin";

  return (
    <div className="account-menu" ref={ref}>
      <button className="account-btn" onClick={() => setOpen(!open)} title="Akun">
        <span className="avatar">{initials}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="account-dropdown">
          <div className="account-info">
            <div className="account-name">{user.full_name || user.username}</div>
            <div className="account-sub">{user.username} • {roleLabel}</div>
          </div>
          <hr />
          <button className="danger" onClick={() => { setOpen(false); logout(); }}>
            <LogOut size={16} /> Keluar
          </button>
        </div>
      )}
    </div>
  );
}
