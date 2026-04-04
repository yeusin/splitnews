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
const CONFIG_FILE = path.join(app.getPath("userData"), "config.json");
const BUNDLED_CONFIG = path.join(__dirname, "config.json");

function loadConfig() {
  let config = { channels: [], positions: [0, 1, 2, 3] };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    } else if (fs.existsSync(BUNDLED_CONFIG)) {
      // Copy bundled config to userData on first run
      config = JSON.parse(fs.readFileSync(BUNDLED_CONFIG, "utf8"));
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
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
      const parsedUrl = new URL(url, "http://localhost");
      const pathname = parsedUrl.pathname;

      if (pathname === "/config") {
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

      let filePath = pathname === "/" ? "index.html" : pathname.substring(1);
      if (pathname === "/control") {
        filePath = "control.html";
      }

      const fullPath = path.join(__dirname, filePath);
      if (fs.existsSync(fullPath)) {
        const ext = path.extname(filePath);
        const contentTypes = {
          ".html": "text/html",
          ".js": "application/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".gif": "image/gif",
        };
        const contentType = contentTypes[ext] || "text/plain";
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
