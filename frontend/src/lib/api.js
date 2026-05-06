import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BASE}/api`;

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

export function setToken(token) {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    localStorage.setItem("lf_token", token);
  } else {
    delete api.defaults.headers.common["Authorization"];
    localStorage.removeItem("lf_token");
  }
}

const cached = localStorage.getItem("lf_token");
if (cached) {
  api.defaults.headers.common["Authorization"] = `Bearer ${cached}`;
}

export function wsUrl() {
  // Convert https:// → wss:// and http:// → ws://
  const u = BASE.replace(/^http/, "ws");
  return `${u}/api/ws`;
}
