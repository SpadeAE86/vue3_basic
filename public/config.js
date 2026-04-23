// public/config.js
// This file is loaded BEFORE the app bootstrap (see index.html).
// In deployment, you can replace this file via Nginx/ConfigMap to change apiBase at runtime.
window.__APP_CONFIG__ = {
  // Examples:
  // - Web + Nginx reverse proxy: "/api"
  // - App served under a prefix: "/app/api"
  apiBase: "/api",
};

