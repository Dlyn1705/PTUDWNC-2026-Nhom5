import axios from "axios";

// Auth endpoints use a separate client so a 401 from refresh/login never
// enters the protected API retry interceptor.
export const authClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5156",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
});
