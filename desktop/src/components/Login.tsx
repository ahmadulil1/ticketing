import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLogin } from "../hooks/useAuth";
import { Loader2, Eye, EyeOff } from "lucide-react";

interface Props {
  onLogin: () => void;
}

export default function Login({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { mutate: login, isPending } = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    login({ username, password }, {
      onSuccess: (data: any) => {
        // Admin hanya boleh login via web panel
        if (data?.user?.role === "admin") {
          setError("Admin hanya bisa login melalui web panel. Buka http://192.168.0.100 di browser.");
          return;
        }
        onLogin();
        navigate("/");
      },
      onError: (err: any) => {
        setError(err.response?.data?.error || "Login gagal");
      },
    });
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-logo">
          <img
            src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NSIgZmlsbD0iI2ZmZDcwMCIvPjxjaXJjbGUgY3g9IjM1IiBjeT0iNDAiIHI9IjgiIGZpbGw9IiMzMzMiLz48Y2lyY2xlIGN4PSI2NSIgY3k9IjQwIiByPSI4IiBmaWxsPSIjMzMzIi8+PGVsbGlwc2UgY3g9IjUwIiBjeT0iNjUiIHJ4PSIxNSIgcnk9IjgiIGZpbGw9IiMzMzMiLz48L3N2Zz4="
            alt="Ticketing"
          />
        </div>
        <h1>Ticketing</h1>
        <p className="login-sub">Laporkan masalah dan pantau perkembangannya</p>
        <form onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="login-username">Username</label>
          <input
            id="login-username"
            type="text"
            placeholder="Masukkan username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
          <label className="field-label" htmlFor="login-password">Password</label>
          <div className="password-field">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              placeholder="Masukkan password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={isPending}>
            {isPending ? <Loader2 size={18} className="spinner" /> : "Masuk"}
          </button>
        </form>
      </div>
    </div>
  );
}
