/**
 * Local reverse proxy for Supabase.
 * Works around iOS 26 Simulator bug where Cloudflare-hosted domains
 * are unreachable from React Native's networking stack.
 *
 * Usage:  node scripts/supabase-proxy.mjs
 * Proxy:  http://0.0.0.0:54321 → https://ztfclpmidzzskcjjlrbs.supabase.co
 */
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";

const SUPABASE_HOST = "ztfclpmidzzskcjjlrbs.supabase.co";
const PORT = 54321;

createServer((clientReq, clientRes) => {
  const headers = { ...clientReq.headers, host: SUPABASE_HOST };
  delete headers["transfer-encoding"];

  const proxyReq = httpsRequest(
    {
      hostname: SUPABASE_HOST,
      port: 443,
      path: clientReq.url,
      method: clientReq.method,
      headers,
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes, { end: true });
    },
  );

  proxyReq.on("error", (err) => {
    console.error("[proxy] upstream error:", err.message);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502);
      clientRes.end(JSON.stringify({ error: "proxy_error", message: err.message }));
    }
  });

  clientReq.pipe(proxyReq, { end: true });
}).listen(PORT, "0.0.0.0", () => {
  console.log(`[supabase-proxy] http://0.0.0.0:${PORT} → https://${SUPABASE_HOST}`);
});
