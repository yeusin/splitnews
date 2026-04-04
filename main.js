const { app, BrowserWindow } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const os = require("os");

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

let server;
let serverPort;
const CONFIG_FILE = path.join(__dirname, "config.json");

function loadConfig() {
  let config = { channels: [], positions: [0, 1, 2, 3] };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    }
  } catch (err) {
    console.error("Failed to load config:", err);
  }
  // Inject server info for the UI
  config.server = {
    ip: getLocalIp(),
    port: serverPort
  };
  return config;
}

function saveConfig(config) {
  try {
    // Don't save the injected server info back to the file
    const { server, ...rest } = config;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(rest, null, 2));
  } catch (err) {
    console.error("Failed to save config:", err);
  }
}

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const { method, url } = req;

      if (url === "/config") {
        if (method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(loadConfig()));
          return;
        } else if (method === "POST") {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", () => {
            try {
              const newConfig = JSON.parse(body);
              saveConfig(newConfig);
              res.writeHead(200);
              res.end("OK");
            } catch (err) {
              res.writeHead(400);
              res.end("Invalid JSON");
            }
          });
          return;
        }
      }

      let filePath = "index.html";
      if (url === "/control") {
        filePath = "control.html";
      }

      const fullPath = path.join(__dirname, filePath);
      if (fs.existsSync(fullPath)) {
        const ext = path.extname(filePath);
        const contentType = ext === ".html" ? "text/html" : "text/plain";
        res.writeHead(200, { "Content-Type": contentType });
        fs.createReadStream(fullPath).pipe(res);
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    // Listen on all interfaces to allow external access (e.g., from mobile)
    server.listen(0, "0.0.0.0", () => {
      serverPort = server.address().port;
      console.log(`Server running at http://localhost:${serverPort}`);
      resolve(serverPort);
    });
  });
}

async function createWindow() {
  const port = await startServer();

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Split News",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL(`http://127.0.0.1:${port}`);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (server) server.close();
  app.quit();
});
