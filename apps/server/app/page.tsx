export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>NVAPP API Server</h1>
      <p>Next.js App Router API 运行中</p>
      <ul>
        <li>GET <a href="/api/health">/api/health</a></li>
        <li>GET <a href="/api/daily-logs">/api/daily-logs</a></li>
        <li>GET <a href="/api/health-profile">/api/health-profile</a></li>
      </ul>
    </main>
  );
}
