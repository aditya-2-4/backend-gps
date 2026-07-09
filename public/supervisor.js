// Firebase Configuration (Replace with your actual keys)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
}
const db = typeof firebase !== 'undefined' ? firebase.firestore() : null;
const rtdb = typeof firebase !== 'undefined' ? firebase.database() : null;

// Map Setup
const supMap = L.map("sup-map").setView([28.6139, 77.2090], 14);
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(supMap);

let markers = [];

async function fetchDashboardData() {
  try {
    const hhRes = await fetch('/api/households');
    if (hhRes.ok) {
      const households = await hhRes.json();
      
      let risk = 0;
      let watch = 0;
      let safe = 0;
      
      // Clear old markers
      markers.forEach(m => supMap.removeLayer(m));
      markers = [];

      households.forEach(house => {
        if (house.zone_status === 'risk') risk++;
        else if (house.zone_status === 'watch') watch++;
        else if (house.zone_status === 'safe') safe++;

        let color = "#16a34a";
        if (house.zone_status === 'risk') color = "#dc2626";
        if (house.zone_status === 'watch') color = "#d97706";

        const circle = L.circle([house.lat, house.lng], {
          radius: 40,
          color: color,
          fillColor: color,
          fillOpacity: 0.4
        }).addTo(supMap);
        
        circle.bindPopup(`<b>${house.name}</b><br>Risk Score: ${house.risk_score}`);
        markers.push(circle);
      });

      document.getElementById("count-risk").textContent = risk;
      document.getElementById("count-watch").textContent = watch;
      document.getElementById("count-safe").textContent = safe;
    }
    
    const sensorsRes = await fetch('/api/sensors');
    if (sensorsRes.ok) {
      const sensors = await sensorsRes.json();
      document.getElementById("count-sensors").textContent = Object.keys(sensors).length;
    }
  } catch (err) {
    console.error("Error fetching dashboard data:", err);
  }
}

// Poll every 3 seconds
setInterval(fetchDashboardData, 3000);
fetchDashboardData();
