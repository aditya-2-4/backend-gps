const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 3000;

// Mapping of file extensions to MIME types
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// In-Memory Database (Replaces Firebase for local-only setup)
let households = [
  {
    id: "h1",
    name: "Ramesh Chandra",
    age: 74,
    address: "H.No 12, Ward 12, Shakurpur Village, Near Kali Mandir, New Delhi",
    lat: 28.6148,
    lng: 77.2082,
    risk_score: 75,
    heat_index: 43,
    mobile: "+91 98110 55432",
    zone_status: "risk",
    device_id: "HI-IOT-101",
    device_status: "offline",
    device_battery: 85,
    last_ping: "Waiting for ESP32...",
  },
  {
    id: "h2",
    name: "Savitri Devi",
    age: 68,
    address: "H.No 45, Ward 12, Shakurpur Block A, Opp. MCD Primary School, New Delhi",
    lat: 28.6131,
    lng: 77.2098,
    risk_score: 55,
    heat_index: 39,
    mobile: "+91 99587 23451",
    zone_status: "watch",
    device_id: "HI-IOT-102",
    device_status: "offline",
    device_battery: 18,
    last_ping: "Waiting for ESP32..."
  }
];

let sensors = {};


const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
  // Handle CORS for ESP32 and other API clients
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // ESP32 Receiving Endpoint
  if (req.method === 'POST' && req.url === '/api/sensor') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const sensorData = JSON.parse(body);
        console.log(`[ESP32 Data Received] Device: ${sensorData.id || 'Unknown'}, Temp: ${sensorData.temp}°C, Humidity: ${sensorData.humidity}%, Heat Index: ${sensorData.heat_index}°C`);
        
        // Save sensor data in memory
        const deviceId = sensorData.id;
        if(deviceId) {
          sensors[deviceId] = sensorData;
          
          // Find if this sensor is attached to a household and update it
          let house = households.find(h => h.device_id === deviceId);
          if (house) {
            house.heat_index = Math.round(sensorData.heat_index);
            house.device_status = "online";
            house.device_battery = sensorData.battery;
            house.last_ping = new Date().toLocaleTimeString();
            
            // Recalculate Risk Score
            let riskScore = (house.heat_index / 50) * 50; 
            if (house.age > 75) riskScore += 15;
            if (house.age > 65) riskScore += 10;
            
            house.risk_score = Math.min(Math.max(Math.round(riskScore), 0), 100);
            
            if (house.risk_score >= 70) house.zone_status = "risk";
            else if (house.risk_score >= 50) house.zone_status = "watch";
            else house.zone_status = "safe";
          }
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', message: 'Sensor data received successfully.' }));
      } catch (err) {
        console.error("Error parsing ESP32 data:", err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON payload' }));
      }
    });
    return;
  }
  
  // API: Get Households
  if (req.method === 'GET' && req.url === '/api/households') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(households));
    return;
  }
  
  // API: Get Sensors
  if (req.method === 'GET' && req.url === '/api/sensors') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(sensors));
    return;
  }
  
  // Root Path: Simple Backend Dashboard instead of Frontend GUI
  if (req.method === 'GET' && req.url === '/') {
    const domain = req.headers.host || 'unknown-domain';
    const password = process.env.FRONTEND_PASSWORD || 'asha-admin-123';
    
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>ASHA Backend Status</title>
        <meta name="theme-color" content="#0b0f19">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="style.css">
        <script src="https://unpkg.com/lucide@latest"></script>
        <style>
          body { display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at 50% 50%, #111827 0%, #030712 100%); min-height: 100vh; margin: 0; }
          .dashboard-card { width: 100%; max-width: 500px; padding: 30px; margin: 20px; }
          .status { color: var(--color-safe); font-weight: bold; text-shadow: 0 0 8px var(--color-safe); }
          .highlight { color: #facc15; font-weight: bold; font-family: monospace; font-size: 14px; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;}
          .header-title { display: flex; align-items: center; gap: 12px; margin-bottom: 25px; border-bottom: 1px solid var(--border-light); padding-bottom: 15px; }
          .info-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding: 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); border-radius: 8px; }
          .info-label { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 13px; font-weight: 600; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <div class="dashboard-card">
          <div class="header-title">
            <i data-lucide="server" style="color: var(--color-primary); width: 32px; height: 32px;"></i>
            <h1 style="font-size: 20px;">AshaGuard <span class="accent-text">Backend</span></h1>
          </div>
          
          <div class="info-row">
            <div class="info-label"><i data-lucide="database"></i> Web App / Database</div>
            <div class="status">Connected (Active)</div>
          </div>
          
          <div class="info-row">
            <div class="info-label"><i data-lucide="globe"></i> Domain Name</div>
            <div style="font-size: 14px;">${domain}</div>
          </div>
          
          <div class="info-row">
            <div class="info-label"><i data-lucide="key"></i> Frontend Password</div>
            <div class="highlight">${password}</div>
          </div>
          
          <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid var(--border-light); font-size: 12px; color: var(--text-muted); text-align: center;">
            <i data-lucide="activity" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;"></i> API Services Running Perfectly
          </div>
        </div>
        <script>lucide.createIcons();</script>
      </body>
      </html>
    `;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }
  
  // Resolve target file path (sanitize queries/hashes)
  let urlPath = req.url.split('?')[0].split('#')[0];
  let filePath = path.join(__dirname, 'public', urlPath === '/' ? 'index.html' : urlPath);
  
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // File not found, serve 404
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found', 'utf-8');
      } else {
        // Generic server error, serve 500
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${err.code}`, 'utf-8');
      }
    } else {
      // Success, serve file with appropriate content-type
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` ASHA GPS Zone Detection App is running!`);
  console.log(` Local Server: http://localhost:${PORT}`);
  console.log(` Press Ctrl+C to stop.`);
  console.log(`==================================================`);
});
