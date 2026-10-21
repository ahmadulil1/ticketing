import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost/api";

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Endpoint remote boleh dipanggil guest (pakai device secret).
    // Jangan paksa logout kalau 401 datang dari sana.
    const url = err.config?.url || "";
    const isRemote = url.includes("/remote/");
    if (err.response?.status === 401 && !isRemote) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
