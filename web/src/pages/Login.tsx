import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import api from "../lib/api";
import { useTheme } from "../hooks/useTheme";
import RunningText from "../components/RunningText";

const formVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};

export default function Login() {
  useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
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
    <div className="login-page">
      <main className="login-main">
        <motion.div
          className="login-main-inner"
          variants={formVariants}
          initial="hidden"
          animate="show"
        >
          <motion.div className="login-form-brand" variants={itemVariants}>
            <span className="brand-dot" />
            Ticketing
          </motion.div>
          <motion.h1 variants={itemVariants}>Selamat datang kembali</motion.h1>
          <motion.p className="login-sub" variants={itemVariants}>
            Masuk dengan akun SIGAP untuk mengelola tiket dan perangkat.
          </motion.p>
          <motion.form onSubmit={handleSubmit} variants={itemVariants}>
            <div className="login-field">
              <label htmlFor="login-email">Email SIGAP</label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="nama@marison.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <div className="login-password">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                  required
                />
                <button
                  type="button"
                  className="login-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {capsLock && (
                <p className="login-caps">
                  <TriangleAlert size={14} /> Caps Lock aktif
                </p>
              )}
            </div>
            <AnimatePresence>
              {error && (
                <motion.div
                  className="login-error"
                  role="alert"
                  key={error}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: [0, -8, 8, -4, 4, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <CircleAlert size={18} />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>
            <motion.button
              type="submit"
              className="login-submit"
              disabled={loading || remaining > 0}
              whileHover={loading || remaining > 0 ? undefined : { scale: 1.01 }}
              whileTap={loading || remaining > 0 ? undefined : { scale: 0.98 }}
            >
              {loading && <LoaderCircle size={18} className="login-spin" />}
              {remaining > 0 ? `Coba lagi ${remaining} detik` : loading ? "Memeriksa…" : "Masuk"}
            </motion.button>
          </motion.form>
          <motion.p className="login-note" variants={itemVariants}>
            <ShieldCheck size={16} />
            <span>Password hanya diteruskan ke SIGAP dan tidak disimpan di Ticketing.</span>
          </motion.p>
        </motion.div>
      </main>

      <motion.aside
        className="login-visual"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        aria-hidden="true"
      >
        <RunningText className="login-visual-canvas" />
      </motion.aside>

      <dialog ref={warningRef} className="login-warning" aria-labelledby="login-warning-title">
        <h2 id="login-warning-title">Terlalu banyak percobaan</h2>
        <p>{error}</p><p role="status">Coba lagi dalam {remaining} detik. Jika masih dibatasi, tunggu sesuai ketentuan SIGAP.</p>
        <button className="btn btn-primary" onClick={() => warningRef.current?.close()}>Mengerti</button>
      </dialog>
    </div>
  );
}
