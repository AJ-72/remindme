import http from "http";
import net from "net";
import { spawn } from "child_process";

const PROXY_PORT = parseInt(process.env.PORT || "18115");
const METRO_PORT = PROXY_PORT + 1;

const metroEnv = {
  ...process.env,
  PORT: String(METRO_PORT),
  EXPO_PACKAGER_PROXY_URL: process.env.EXPO_PACKAGER_PROXY_URL || "",
  EXPO_PUBLIC_DOMAIN: process.env.EXPO_PUBLIC_DOMAIN || "",
  EXPO_PUBLIC_REPL_ID: process.env.EXPO_PUBLIC_REPL_ID || "",
  REACT_NATIVE_PACKAGER_HOSTNAME: process.env.REACT_NATIVE_PACKAGER_HOSTNAME || "",
};

const expo = spawn(
  "pnpm",
  ["exec", "expo", "start", "--localhost", "--port", String(METRO_PORT)],
  { env: metroEnv, stdio: "inherit" }
);

expo.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGTERM", () => expo.kill("SIGTERM"));
process.on("SIGINT", () => expo.kill("SIGINT"));

const server = http.createServer((req, res) => {
  const options = {
    hostname: "localhost",
    port: METRO_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", () => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("packager-status:running");
  });

  req.pipe(proxyReq, { end: true });
});

server.on("upgrade", (req, socket, head) => {
  const proxySocket = net.createConnection(METRO_PORT, "localhost", () => {
    proxySocket.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
        Object.entries(req.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n") +
        "\r\n\r\n"
    );
    if (head && head.length) proxySocket.write(head);
    socket.pipe(proxySocket);
    proxySocket.pipe(socket);
  });
  proxySocket.on("error", () => socket.destroy());
  socket.on("error", () => proxySocket.destroy());
});

server.listen(PROXY_PORT, () => {
  console.log(
    `Dev proxy ready on :${PROXY_PORT} → Metro on :${METRO_PORT}`
  );
});
