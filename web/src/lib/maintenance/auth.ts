export function getToken() { return localStorage.getItem("token"); }
export function getUser() { try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; } }
export function isLoggedIn() { return !!getToken(); }
export function logout() { localStorage.removeItem("token"); localStorage.removeItem("user"); window.location.href = "/login"; }
