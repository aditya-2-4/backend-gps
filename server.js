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
      <html>
      <head>
        <title>ASHA Backend Status</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; background-color: #f4f7f6; color: #333; }
          .card { background: white; padding: 20px 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 500px; margin: auto; }
          h1 { color: #2c3e50; }
          p { font-size: 16px; line-height: 1.6; }
          .status { color: #27ae60; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Backend Dashboard</h1>
          <p><strong>Database Status:</strong> <span class="status">Connected (Active)</span></p>
          <p><strong>Domain Name:</strong> ${domain}</p>
          <p><strong>Frontend Password:</strong> ${password}</p>
          <hr>
          <p style="font-size: 14px; color: #7f8c8d;">API Endpoints: /api/households, /api/sensors</p>
        </div>
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
