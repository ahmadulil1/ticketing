import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const warningRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || Date.now() < retryAt) return;
    setError("");
    setLoading(true);

    try {
      // Login admin memakai akun SIGAP (server meneruskan kredensial ke SIGAP).
      const res = await api.post("/auth/login/sigap", { email, password });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      navigate("/");
    } catch (err: any) {
      if (err.response?.status === 429) {
        const header = err.response.headers?.["retry-after"];
        const seconds = Number(header);
        const until = header && Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(header || "");
        setRetryAt(Number.isFinite(until) && until > Date.now() ? until : Date.now() + 60000);
        setError("Terlalu banyak percobaan login. Tunggu sebelum mencoba kembali.");
        warningRef.current?.showModal();
      } else setError(err.response?.data?.error || "Login gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>Ticketing System</h1>
        <p className="login-sub">Masuk dengan akun SIGAP</p>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email SIGAP"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading || remaining > 0}>
            {remaining > 0 ? `Coba lagi ${remaining} detik` : loading ? "Masuk..." : "Masuk"}
          </button>
        </form>
      </div>
      <dialog ref={warningRef} className="login-warning" aria-labelledby="login-warning-title">
        <h2 id="login-warning-title">Terlalu banyak percobaan</h2>
        <p>{error}</p><p role="status">Coba lagi dalam {remaining} detik. Jika masih dibatasi, tunggu sesuai ketentuan SIGAP.</p>
        <button className="btn btn-primary" onClick={() => warningRef.current?.close()}>Mengerti</button>
      </dialog>
    </div>
  );
}
