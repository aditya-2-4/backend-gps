// Removed Firebase Configuration
// Fetching data from local Node.js server instead

// Global State Configurations
let households = [];
let ashaLocation = { lat: 28.6139, lng: 77.2090 };
let activeFilter = "all";
let selectedHouseholdId = null;

// Settings variables (Persisted to localStorage)
let appSettings = {
  workerName: "Anjali Sharma",
  wardNum: "Ward 12 (Shakurpur)",
  coverageRadius: 500,        // walkable distance in meters
  lowBatteryLimit: 20,       // alarm under this %
  useDeviceGps: false,       // real phone GPS toggle
  activeLang: "bi"           // "en", "hi", "bi" (bilingual)
};

// Leaflet Map objects
let mainMap = null;
let ashaMarker = null;
let ashaCoverageCircle = null;
let mapHouseCircles = {}; // house_id -> L.Circle
let mapHouseMarkers = {}; // house_id -> L.Marker

// Mini map object in Details sidebar
let detailsMap = null;
let detailsMapMarker = null;

// Watch ID for native GPS tracking
let gpsWatchId = null;

// 2. Haversine Distance Formula
function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius of Earth in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // returns distance in meters
}

// 3. Database & Settings Initialization
function initDatabaseAndSettings() {
  // Load settings
  const cachedSettings = localStorage.getItem("asha_settings");
  if (cachedSettings) {
    try {
      appSettings = { ...appSettings, ...JSON.parse(cachedSettings) };
    } catch (e) {
      console.error("Error parsing settings", e);
    }
  }
  
  // Start polling local server for data
  setInterval(fetchLocalData, 3000);
  fetchLocalData();
}

async function fetchLocalData() {
  try {
    const res = await fetch('/api/households');
    if (res.ok) {
      households = await res.json();
      
      // Refresh the UI
      updateAshaCalculations();
      updateMapMarkers();
      
      if (selectedHouseholdId) {
        selectHousehold(selectedHouseholdId);
      }
    }
  } catch (err) {
    console.error("Error fetching local data:", err);
  }
}

function saveDatabase() {
  localStorage.setItem("asha_gps_db", JSON.stringify(households));
}

function saveSettings() {
  localStorage.setItem("asha_settings", JSON.stringify(appSettings));
}

function resetDatabase() {
  localStorage.removeItem("asha_settings");
  
  // Reset memory
  appSettings = {
    workerName: "Anjali Sharma",
    wardNum: "Ward 12 (Shakurpur)",
    coverageRadius: 500,
    lowBatteryLimit: 20,
    useDeviceGps: false,
    activeLang: "bi"
  };
  
  saveSettings();
  
  // Disable real GPS if active
  if (gpsWatchId) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  
  showSystemNotification("Database Reset / डेटा रीसेट", "All demo defaults restored.", "safe");
  
  // Sync inputs
  syncSettingsUIInputs();
  
  // Reset Map View
  ashaLocation = { lat: 28.6139, lng: 77.2090 };
  document.getElementById("asha-lat").value = ashaLocation.lat;
  document.getElementById("asha-lng").value = ashaLocation.lng;
  
  mainMap.setView([ashaLocation.lat, ashaLocation.lng], 16);
  ashaMarker.setLatLng([ashaLocation.lat, ashaLocation.lng]);
  ashaCoverageCircle.setLatLng([ashaLocation.lat, ashaLocation.lng]);
  ashaCoverageCircle.setRadius(appSettings.coverageRadius);
  
  // Re-run updates
  updateAppUI();
  updateMapMarkers();
  
  if (selectedHouseholdId) {
    selectHousehold(selectedHouseholdId);
  }
}

// Calculate Zone status based on risk score
function computeZoneStatus(riskScore) {
  if (riskScore >= 70) return "risk";
  if (riskScore >= 50) return "watch";
  return "safe";
}

// 4. Color/Text Resolvers
function getZoneColor(status) {
  switch (status) {
    case "risk": return "#dc2626";
    case "watch": return "#d97706";
    case "safe": return "#16a34a";
    default: return "#4b5563";
  }
}

function getZoneBadgeHTML(status) {
  const lang = appSettings.activeLang;
  let text = "";
  
  if (status === "risk") {
    if (lang === "en") text = "RISK ZONE";
    else if (lang === "hi") text = "जोखिम क्षेत्र";
    else text = "RISK ZONE / जोखिम क्षेत्र";
    return `<span class="zone-badge risk">${text}</span>`;
  }
  if (status === "watch") {
    if (lang === "en") text = "WATCH ZONE";
    else if (lang === "hi") text = "निगरानी क्षेत्र";
    else text = "WATCH ZONE / निगरानी क्षेत्र";
    return `<span class="zone-badge watch">${text}</span>`;
  }
  if (status === "safe") {
    if (lang === "en") text = "SAFE ZONE";
    else if (lang === "hi") text = "सुरक्षित क्षेत्र";
    else text = "SAFE ZONE / सुरक्षित क्षेत्र";
    return `<span class="zone-badge safe">${text}</span>`;
  }
  return `<span class="zone-badge">UNKNOWN</span>`;
}

function getZoneBannerHTML(status) {
  const lang = appSettings.activeLang;
  
  if (status === "risk") {
    if (lang === "en") return "RISK ZONE — Immediate visit required";
    if (lang === "hi") return "जोखिम क्षेत्र — तुरंत यात्रा आवश्यक है";
    return "RISK ZONE / जोखिम क्षेत्र — Immediate visit required";
  }
  if (status === "watch") {
    if (lang === "en") return "WATCH ZONE — Visit within 24 hours";
    if (lang === "hi") return "निगरानी — 24 घंटे के भीतर दौरा करें";
    return "WATCH ZONE / निगरानी — Visit within 24 hours";
  }
  if (status === "safe") {
    if (lang === "en") return "SAFE ZONE — No action needed today";
    if (lang === "hi") return "सुरक्षित — आज कोई कार्रवाई की आवश्यकता नहीं";
    return "SAFE ZONE / सुरक्षित — No action needed today";
  }
  return "UNKNOWN ZONE";
}

// 5. Toast Notifications
function showToastNotification(options) {
  const container = document.getElementById("notification-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${options.type} ${options.zone || ""}`;
  
  let iconName = "bell";
  if (options.type === "sms-alert") iconName = "smartphone";
  else if (options.zone === "risk") iconName = "alert-triangle";
  else if (options.zone === "watch") iconName = "eye";
  else if (options.zone === "safe") iconName = "check-circle-2";
  else if (options.type === "battery-warning") iconName = "battery-warning";

  toast.innerHTML = `
    <div class="toast-icon-wrapper">
      <i data-lucide="${iconName}"></i>
    </div>
    <div class="toast-content">
      <div class="toast-title">${options.title}</div>
      <div class="toast-desc">${options.message}</div>
      ${options.smsContent ? `
        <div class="sms-bubble">
          <div class="sms-bubble-tag">Simulated SMS Alert</div>
          <div>${options.smsContent.en}</div>
          <div class="sms-divider"></div>
          <div style="color: #fdba74;">${options.smsContent.hi}</div>
        </div>
      ` : ""}
    </div>
    <button class="toast-close">
      <i data-lucide="x"></i>
    </button>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  const closeBtn = toast.querySelector(".toast-close");
  closeBtn.addEventListener("click", () => removeToast(toast));

  const delay = options.type === "sms-alert" ? 15000 : 8000;
  setTimeout(() => {
    if (toast.parentElement) {
      removeToast(toast);
    }
  }, delay);
}

function removeToast(toast) {
  toast.classList.add("removing");
  toast.addEventListener("animationend", () => {
    toast.remove();
  });
}

function showSystemNotification(title, message, zoneStatus) {
  showToastNotification({
    type: "system",
    zone: zoneStatus,
    title: title,
    message: message
  });
}

// 6. Map Initialization
function initMap() {
  mainMap = L.map("map", {
    zoomControl: true,
    minZoom: 13,
    maxZoom: 18
  }).setView([ashaLocation.lat, ashaLocation.lng], 16);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(mainMap);

  // ASHA Star Marker Icon
  const starIcon = L.divIcon({
    className: 'asha-star-marker-div',
    html: `
      <div style="
        display:flex;
        align-items:center;
        justify-content:center;
        background: rgba(59, 130, 246, 0.25);
        border: 2px solid #3b82f6;
        box-shadow: 0 0 15px #3b82f6;
        border-radius: 50%;
        width: 38px;
        height: 38px;
        transform: translate(-3px, -3px);
      ">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#3b82f6" stroke="#fff" stroke-width="1.5">
          <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9"/>
        </svg>
      </div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19]
  });

  // ASHA Coverage Circle
  ashaCoverageCircle = L.circle([ashaLocation.lat, ashaLocation.lng], {
    radius: appSettings.coverageRadius,
    color: '#3b82f6',
    fillColor: '#3b82f6',
    fillOpacity: 0.05,
    dashArray: '8, 6',
    weight: 2
  }).addTo(mainMap);

  // ASHA Marker
  ashaMarker = L.marker([ashaLocation.lat, ashaLocation.lng], {
    icon: starIcon,
    draggable: !appSettings.useDeviceGps // Draggable only if not using real GPS
  }).addTo(mainMap);

  // Dragging event handlers
  ashaMarker.on("drag", function (e) {
    if (appSettings.useDeviceGps) return; // Prevent drag actions modifying state if live GPS active
    const latLng = e.target.getLatLng();
    ashaLocation.lat = parseFloat(latLng.lat.toFixed(5));
    ashaLocation.lng = parseFloat(latLng.lng.toFixed(5));
    
    document.getElementById("asha-lat").value = ashaLocation.lat;
    document.getElementById("asha-lng").value = ashaLocation.lng;
    
    ashaCoverageCircle.setLatLng(latLng);
    updateAshaCalculations();
  });

  updateMapMarkers();
}

// Generate map pins based on current filters and data
function updateMapMarkers() {
  for (const id in mapHouseCircles) {
    mainMap.removeLayer(mapHouseCircles[id]);
  }
  for (const id in mapHouseMarkers) {
    mainMap.removeLayer(mapHouseMarkers[id]);
  }
  mapHouseCircles = {};
  mapHouseMarkers = {};

  households.forEach(house => {
    const isMatching = activeFilter === "all" || house.zone_status === activeFilter;
    const zoneColor = getZoneColor(house.zone_status);
    const displayColor = isMatching ? zoneColor : "#4b5563";
    const fillOpacity = isMatching ? 0.1 : 0.03;
    const borderDash = isMatching ? '6, 4' : '4, 8';

    // 1. Draw 30m Circle Marker
    const circle = L.circle([house.lat, house.lng], {
      radius: 30,
      color: displayColor,
      fillColor: displayColor,
      fillOpacity: fillOpacity,
      dashArray: borderDash,
      weight: 2
    }).addTo(mainMap);

    // 2. Draw Elderly Letter Pin
    const pinClass = `custom-house-pin ${isMatching ? house.zone_status : 'grayed-out'}`;
    const initialChar = house.name.charAt(0);
    
    const pinIcon = L.divIcon({
      className: 'custom-pin-container',
      html: `<div class="${pinClass}"><span>${initialChar}</span></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28]
    });

    const marker = L.marker([house.lat, house.lng], { icon: pinIcon }).addTo(mainMap);

    // Bind popup details
    const popupContent = `
      <div class="map-popup-container">
        <div class="map-popup-header">
          <h4>${house.name}</h4>
          <span class="popup-age">${house.age} Yrs</span>
        </div>
        <div class="popup-row">
          <span class="label">Device ID:</span>
          <span class="value">${house.device_id || 'Not Assigned'}</span>
        </div>
        <div class="popup-row">
          <span class="label">Zone Status:</span>
          ${getZoneBadgeHTML(house.zone_status)}
        </div>
        <div class="popup-row">
          <span class="label">Heat Index:</span>
          <span class="value" style="color: ${zoneColor}">${house.heat_index}°C</span>
        </div>
        <button class="popup-navigate-btn" onclick="openNav(${house.lat}, ${house.lng})">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
          Navigate (गूगल मैप्स)
        </button>
      </div>
    `;
    
    marker.bindPopup(popupContent);
    circle.bindPopup(popupContent);

    const handleSelect = () => {
      selectHousehold(house.id);
      // On mobile, if map popup clicked, switch to details tab automatically for richer view
      if (window.innerWidth <= 768) {
        // Show details tab
        document.querySelectorAll(".nav-item").forEach(btn => btn.classList.remove("active"));
        document.querySelector('[data-tab="detail-panel"]').classList.add("active");
        
        document.querySelectorAll(".mobile-view-panel").forEach(p => p.classList.remove("active-tab"));
        document.getElementById("detail-panel").classList.add("active-tab");
      }
    };
    marker.on("click", handleSelect);
    circle.on("click", handleSelect);

    mapHouseCircles[house.id] = circle;
    mapHouseMarkers[house.id] = marker;
  });
}

// 7. Distance & Proximity Operations
function updateAshaCalculations() {
  households.forEach(house => {
    house.distanceM = getHaversineDistance(ashaLocation.lat, ashaLocation.lng, house.lat, house.lng);
  });

  renderPriorityList();
  renderBottomSheet();

  if (selectedHouseholdId) {
    const selectedHouse = households.find(h => h.id === selectedHouseholdId);
    if (selectedHouse) {
      document.getElementById("detail-distance").textContent = formatDistance(selectedHouse.distanceM);
      const coverageTag = document.getElementById("detail-coverage-tag");
      if (selectedHouse.distanceM <= appSettings.coverageRadius) {
        coverageTag.textContent = "Within Reach";
        coverageTag.className = "coverage-tag";
      } else {
        coverageTag.textContent = "Out of Reach";
        coverageTag.className = "coverage-tag out-of-range";
      }
    }
  }
}

function formatDistance(m) {
  if (m < 1000) {
    return `${Math.round(m)}m`;
  }
  return `${(m / 1000).toFixed(2)}km`;
}

// 8. Priority list renderer
function renderPriorityList() {
  const listContainer = document.getElementById("priority-cards-list");
  if (!listContainer) return;

  const sorted = [...households].sort((a, b) => {
    const scoreMap = { risk: 3, watch: 2, safe: 1 };
    if (scoreMap[a.zone_status] !== scoreMap[b.zone_status]) {
      return scoreMap[b.zone_status] - scoreMap[a.zone_status];
    }
    return a.distanceM - b.distanceM;
  });

  listContainer.innerHTML = "";

  sorted.forEach(house => {
    const card = document.createElement("div");
    const activeClass = house.id === selectedHouseholdId ? "active" : "";
    card.className = `priority-card ${house.zone_status} ${activeClass}`;
    card.setAttribute("data-id", house.id);

    // Battery / Offline Icons block
    let batteryIcon = "";
    if (house.device_status === "offline") {
      batteryIcon = `<i data-lucide="wifi-off" style="width:12px; height:12px; color:var(--color-risk);" title="Sensor Offline"></i>`;
    } else if (house.device_status === "online") {
      const batColor = house.device_battery < appSettings.lowBatteryLimit ? "var(--color-risk)" : "var(--color-safe)";
      batteryIcon = `<span style="font-size:10px; color:${batColor}; display:inline-flex; align-items:center; gap:2px;"><i data-lucide="battery" style="width:12px; height:12px;"></i> ${house.device_battery}%</span>`;
    }

    card.innerHTML = `
      <div class="card-top">
        <h3>${house.name}</h3>
        <span class="age-text">${house.age} Yrs</span>
      </div>
      <div class="card-middle">
        <div class="badge-row">
          ${getZoneBadgeHTML(house.zone_status)}
          ${batteryIcon}
        </div>
      </div>
      <div class="card-bottom">
        <div class="dist-metric">
          <i data-lucide="navigation-2"></i>
          <span>${formatDistance(house.distanceM)}</span>
        </div>
        <div class="temp-metric ${house.zone_status}">
          <span>HI:</span>
          <strong>${house.heat_index}°C</strong>
        </div>
      </div>
    `;

    card.addEventListener("click", () => {
      selectHousehold(house.id);
      
      // On mobile, switch to Details Tab when card clicked
      if (window.innerWidth <= 768) {
        document.querySelectorAll(".nav-item").forEach(btn => btn.classList.remove("active"));
        document.querySelector('[data-tab="detail-panel"]').classList.add("active");
        
        document.querySelectorAll(".mobile-view-panel").forEach(p => p.classList.remove("active-tab"));
        document.getElementById("detail-panel").classList.add("active-tab");
      } else {
        // Pan to map location
        mainMap.setView([house.lat, house.lng], 17);
        mapHouseMarkers[house.id].openPopup();
      }
    });

    listContainer.appendChild(card);
  });

  lucide.createIcons();
}

// 9. Details Panel Rendering
function selectHousehold(id) {
  selectedHouseholdId = id;
  const house = households.find(h => h.id === id);
  if (!house) return;

  document.querySelectorAll(".priority-card").forEach(c => {
    c.classList.remove("active");
    if (c.getAttribute("data-id") === id) {
      c.classList.add("active");
    }
  });

  // Display detail UI
  document.getElementById("detail-placeholder").classList.add("hidden");
  document.getElementById("detail-view-content").classList.remove("hidden");

  // Reset scroll
  document.querySelector(".detail-body-scrollable").scrollTop = 0;

  // Banner Update
  const banner = document.getElementById("detail-zone-banner");
  banner.className = `zone-banner ${house.zone_status}`;
  banner.textContent = getZoneBannerHTML(house.zone_status);

  // Basic Info Update
  document.getElementById("detail-name").textContent = house.name;
  document.getElementById("detail-age").textContent = `${house.age} Yrs`;
  document.getElementById("detail-address").textContent = house.address;

  // IoT Sensor Telemetry displays
  const iotStatusBadge = document.getElementById("iot-status-badge");
  iotStatusBadge.className = `telemetry-badge ${house.device_status}`;
  
  if (house.device_status === "online") {
    iotStatusBadge.innerHTML = `<i data-lucide="wifi"></i> Online`;
  } else if (house.device_status === "offline") {
    iotStatusBadge.innerHTML = `<i data-lucide="wifi-off"></i> Offline`;
  } else {
    iotStatusBadge.innerHTML = `<i data-lucide="help-circle"></i> Unassigned`;
  }

  document.getElementById("tel-device-id").textContent = house.device_id || "Unregistered";
  document.getElementById("tel-battery-level").textContent = house.device_battery !== null ? `${house.device_battery}%` : "--";
  document.getElementById("tel-last-ping").textContent = house.last_ping || "--";

  // GPS Coordinates & Distance Update
  document.getElementById("detail-coords").textContent = `${house.lat.toFixed(5)}, ${house.lng.toFixed(5)}`;
  document.getElementById("google-maps-link").href = `https://maps.google.com/?q=${house.lat},${house.lng}`;
  document.getElementById("detail-distance").textContent = formatDistance(house.distanceM);
  
  const coverageTag = document.getElementById("detail-coverage-tag");
  if (house.distanceM <= appSettings.coverageRadius) {
    coverageTag.textContent = "Within Reach";
    coverageTag.className = "coverage-tag";
  } else {
    coverageTag.textContent = "Out of Reach";
    coverageTag.className = "coverage-tag out-of-range";
  }

  // IoT Device calibration form loaders
  document.getElementById("setup-device-id").value = house.device_id || "";
  document.getElementById("setup-lat").value = house.lat.toFixed(5);
  document.getElementById("setup-lng").value = house.lng.toFixed(5);
  document.getElementById("setup-battery").value = house.device_battery !== null ? house.device_battery : 95;
  document.getElementById("setup-status").value = house.device_status === "unassigned" ? "online" : house.device_status;

  // Parameter Simulator Sliders Load
  document.getElementById("sim-heat-index").value = house.heat_index;
  document.getElementById("sim-heat-index-val").textContent = `${house.heat_index}°C`;
  
  document.getElementById("sim-risk-score").value = house.risk_score;
  document.getElementById("sim-risk-score-val").textContent = house.risk_score;

  document.getElementById("sim-age").value = house.age;
  document.getElementById("sim-mobile").value = house.mobile;

  // Render Zone History Timeline
  renderHistoryTimeline(house.zone_history);

  // Initialize/Update Tiny Inline Map
  initDetailsMap(house);
}

function renderHistoryTimeline(history) {
  const container = document.getElementById("detail-timeline");
  if (!container) return;

  if (!history || history.length === 0) {
    container.innerHTML = `<div class="timeline-item"><p class="section-desc">No history logs recorded.</p></div>`;
    return;
  }

  container.innerHTML = "";
  history.forEach(item => {
    const tlItem = document.createElement("div");
    tlItem.className = "timeline-item";

    const zoneColor = getZoneColor(item.zone);
    const upperZone = item.zone.toUpperCase();

    tlItem.innerHTML = `
      <div class="timeline-dot ${item.zone}"></div>
      <div class="timeline-header">
        <span class="timeline-time">${item.timestamp}</span>
        <span class="timeline-temp ${item.zone}">${item.heat_index}°C</span>
      </div>
      <div class="timeline-desc">
        Zone Status: <strong style="color: ${zoneColor}">${upperZone}</strong>
      </div>
    `;
    container.appendChild(tlItem);
  });
}

function initDetailsMap(house) {
  if (detailsMap) {
    detailsMap.remove();
    detailsMap = null;
  }

  detailsMap = L.map("static-thumbnail-map", {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false
  }).setView([house.lat, house.lng], 16);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png").addTo(detailsMap);

  const zoneColor = getZoneColor(house.zone_status);
  
  const thumbIcon = L.divIcon({
    className: 'custom-pin-container-thumb',
    html: `<div class="custom-house-pin ${house.zone_status}" style="width:20px !important; height:20px !important; font-size: 8px; border-width: 1.5px;"><span>${house.name.charAt(0)}</span></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 20]
  });

  detailsMapMarker = L.marker([house.lat, house.lng], { icon: thumbIcon }).addTo(detailsMap);

  L.circle([house.lat, house.lng], {
    radius: 30,
    color: zoneColor,
    fillColor: zoneColor,
    fillOpacity: 0.15,
    dashArray: '4, 3',
    weight: 1.5
  }).addTo(detailsMap);

  setTimeout(() => {
    if (detailsMap) detailsMap.invalidateSize();
  }, 100);
}

// 10. Device Association Setup & Calibrations
function applyDeviceSetup() {
  if (!selectedHouseholdId) return;

  const house = households.find(h => h.id === selectedHouseholdId);
  if (!house) return;

  const devId = document.getElementById("setup-device-id").value.trim();
  const lat = parseFloat(document.getElementById("setup-lat").value);
  const lng = parseFloat(document.getElementById("setup-lng").value);
  const battery = parseInt(document.getElementById("setup-battery").value);
  const status = document.getElementById("setup-status").value;

  if (isNaN(lat) || isNaN(lng)) {
    alert("Please enter valid latitude and longitude coordinates.");
    return;
  }

  // Update properties
  house.lat = lat;
  house.lng = lng;
  
  if (devId === "") {
    house.device_id = null;
    house.device_status = "unassigned";
    house.device_battery = null;
    house.last_ping = null;
  } else {
    house.device_id = devId;
    house.device_status = status;
    house.device_battery = battery;
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    house.last_ping = `Today ${timeStr}`;
  }

  // Trigger Low Battery Warning immediately if below threshold
  if (devId !== "" && battery < appSettings.lowBatteryLimit && status === "online") {
    showToastNotification({
      type: "battery-warning",
      zone: "risk",
      title: `🔋 LOW BATTERY: ${house.name}'s Sensor`,
      message: `Sensor ${devId} is running critical on battery (${battery}%). Replace power cells during visit.`
    });
  }

  // Save database
  saveDatabase();

  // Re-calculate ASHA relative distances
  updateAshaCalculations();
  
  // Re-draw map coordinates
  updateMapMarkers();
  
  // Sync Details view
  selectHousehold(house.id);

  showSystemNotification("Device Calibrated", `Sensor data and coordinates saved successfully.`, "safe");
}

// 11. Simulation Vitals Logic & Warnings System
function applyVitalsSimulation() {
  if (!selectedHouseholdId) return;

  const house = households.find(h => h.id === selectedHouseholdId);
  if (!house) return;

  const newHeatIndex = parseInt(document.getElementById("sim-heat-index").value);
  const newRiskScore = parseInt(document.getElementById("sim-risk-score").value);
  const newAge = parseInt(document.getElementById("sim-age").value);
  const newMobile = document.getElementById("sim-mobile").value.trim();

  const prevZone = house.zone_status;
  const newZone = computeZoneStatus(newRiskScore);
  let zoneChanged = prevZone !== newZone;
  
  // Update properties
  house.heat_index = newHeatIndex;
  house.risk_score = newRiskScore;
  house.age = newAge;
  house.mobile = newMobile;
  house.zone_status = newZone;

  const now = new Date();
  const formatTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const timestampString = `Today ${formatTime}`;

  if (zoneChanged) {
    house.zone_history.unshift({
      timestamp: timestampString,
      zone: newZone,
      heat_index: newHeatIndex
    });
    
    if (house.zone_history.length > 10) house.zone_history.pop();

    // Trigger Transition Alert Popup
    let alertMsg = "";
    if (prevZone === "safe" && newZone === "watch") {
      alertMsg = `Zone change: ${house.name}'s home moved from SAFE to WATCH zone`;
    } else if (newZone === "risk") {
      alertMsg = `URGENT: ${house.name}'s home entered RISK ZONE — visit immediately`;
    } else if (prevZone === "risk" && newZone === "safe") {
      alertMsg = `Good news: ${house.name}'s home is now in SAFE zone`;
    } else {
      alertMsg = `Zone Transition: ${house.name}'s home changed from ${prevZone.toUpperCase()} to ${newZone.toUpperCase()}`;
    }

    showToastNotification({
      type: "transition-alert",
      zone: newZone,
      title: "Zone Transition Alert (क्षेत्र संक्रमण चेतावनी)",
      message: alertMsg
    });
  }

  // Evaluate SMS Alert
  if (newHeatIndex > 40 && newAge >= 70 && newZone === "risk") {
    const smsEn = `HEAT ALERT: ${house.name}, Age ${newAge} — RISK ZONE detected at ${house.address}.\nIndoor heat index: ${newHeatIndex}°C. GPS location: ${house.lat},${house.lng}\nTap GPS to navigate: https://maps.google.com/?q=${house.lat},${house.lng}\nPlease check immediately. Emergency: 104`;
    
    const smsHi = `ताप चेतावनी: ${house.name}, आयु ${newAge} — जोखिम क्षेत्र में है ${house.address} पर।\nइनडोर ताप सूचकांक: ${newHeatIndex}°C। GPS: ${house.lat},${house.lng}\nतुरंत जाँच करें। आपातकाल: 104`;

    showToastNotification({
      type: "sms-alert",
      title: `⚡ SMS HEAT ALERT SENT TO ${house.mobile}`,
      message: `Automatic cellular dispatch triggered for patient over 70 under risk temperature.`,
      smsContent: {
        en: smsEn,
        hi: smsHi
      }
    });
  }

  saveDatabase();
  updateAppUI();
  updateMapMarkers();
  selectHousehold(house.id);
  mapHouseMarkers[house.id].openPopup();
}

// 12. Bottom Sheet & ASHA Coverage list
function renderBottomSheet() {
  const listContainer = document.getElementById("bottom-sheet-list");
  const countBadge = document.getElementById("reach-count");
  if (!listContainer) return;

  const insideCoverage = households.filter(house => house.distanceM <= appSettings.coverageRadius);

  insideCoverage.sort((a, b) => {
    const scoreMap = { risk: 3, watch: 2, safe: 1 };
    if (scoreMap[a.zone_status] !== scoreMap[b.zone_status]) {
      return scoreMap[b.zone_status] - scoreMap[a.zone_status];
    }
    return a.distanceM - b.distanceM;
  });

  countBadge.textContent = insideCoverage.length;
  listContainer.innerHTML = "";

  if (insideCoverage.length === 0) {
    listContainer.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 20px; color: var(--text-muted);">
          <i data-lucide="info" style="display:inline-block; vertical-align:middle; width:16px; margin-right:6px;"></i>
          No households found within active walkable range (${appSettings.coverageRadius}m).
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  insideCoverage.forEach(house => {
    const tr = document.createElement("tr");
    const zoneColor = getZoneColor(house.zone_status);
    
    tr.innerHTML = `
      <td style="font-weight: 700; color: #fff;">${house.name}</td>
      <td>${house.age} Yrs</td>
      <td>${getZoneBadgeHTML(house.zone_status)}</td>
      <td style="font-weight: 600;">${house.risk_score}</td>
      <td style="color: ${zoneColor}; font-weight: 600;">${house.heat_index}°C</td>
      <td style="font-weight: 500; color: var(--color-primary);">${formatDistance(house.distanceM)}</td>
      <td>
        <button class="table-btn" onclick="inspectFromTable('${house.id}')">Inspect</button>
      </td>
    `;
    listContainer.appendChild(tr);
  });
}

// Global inspect hook
window.inspectFromTable = function(id) {
  selectHousehold(id);
  document.getElementById("bottom-sheet").classList.remove("open");
  
  if (window.innerWidth <= 768) {
    // switch to details tab automatically on mobile
    document.querySelectorAll(".nav-item").forEach(btn => btn.classList.remove("active"));
    document.querySelector('[data-tab="detail-panel"]').classList.add("active");
    
    document.querySelectorAll(".mobile-view-panel").forEach(p => p.classList.remove("active-tab"));
    document.getElementById("detail-panel").classList.add("active-tab");
  } else {
    const house = households.find(h => h.id === id);
    if (house) {
      mainMap.setView([house.lat, house.lng], 17);
      mapHouseMarkers[id].openPopup();
    }
  }
};

// 13. App Shell updates
function updateAppUI() {
  let riskCount = 0;
  let watchCount = 0;
  let safeCount = 0;

  households.forEach(house => {
    if (house.zone_status === "risk") riskCount++;
    else if (house.zone_status === "watch") watchCount++;
    else if (house.zone_status === "safe") safeCount++;
  });

  const globalCountsBanner = document.getElementById("global-counts-banner");
  if (globalCountsBanner) {
    globalCountsBanner.innerHTML = `
      <span class="count-item risk"><span class="bullet red"></span> ${riskCount} जोखिम (Risk)</span>
      <span class="count-item watch"><span class="bullet orange"></span> ${watchCount} निगरानी (Watch)</span>
      <span class="count-item safe"><span class="bullet green"></span> ${safeCount} सुरक्षित (Safe)</span>
    `;
  }

  const bilingualStrip = document.getElementById("bilingual-summary-strip");
  if (bilingualStrip) {
    bilingualStrip.innerHTML = `
      <div class="hindi">${riskCount} घर जोखिम क्षेत्र में | ${watchCount} निगरानी में | ${safeCount} सुरक्षित</div>
      <div class="english">${riskCount} homes in RISK ZONE | ${watchCount} in WATCH | ${safeCount} SAFE</div>
    `;
  }

  document.getElementById("list-total-count").textContent = households.length;
  document.getElementById("btn-radius-label").textContent = `${appSettings.coverageRadius}m`;
  document.getElementById("sheet-title-text").textContent = `Coverage Area (Walkable Distance < ${appSettings.coverageRadius}m)`;
  
  // Personnel Profiles header syncs
  document.getElementById("username-display").textContent = `${appSettings.workerName} (${appSettings.wardNum})`;
  
  // Avatar initials
  const initials = appSettings.workerName.split(" ").map(n => n[0]).join("").toUpperCase();
  document.getElementById("avatar-letters").textContent = initials;

  applyLanguageFilter();
  renderPriorityList();
  renderBottomSheet();
}

// Language layout filtering (Hides/Shows sections based on preference)
function applyLanguageFilter() {
  const lang = appSettings.activeLang;
  const bilingualStrip = document.getElementById("bilingual-summary-strip");
  const prioTitle = document.getElementById("lang-priority-title");
  
  if (!brioTitleText) return; // safety check
}

// Clean fallback variables
const brioTitleText = true;

// Language updates
function applyLanguageSettings() {
  const lang = appSettings.activeLang;
  const isBi = lang === "bi";
  const isEn = lang === "en";
  const isHi = lang === "hi";

  const strip = document.getElementById("bilingual-summary-strip");
  const stripEn = strip.querySelector(".english");
  const stripHi = strip.querySelector(".hindi");

  if (isEn) {
    if (stripEn) stripEn.style.display = "block";
    if (stripHi) stripHi.style.display = "none";
    document.getElementById("lang-priority-title").textContent = "Priority List";
  } else if (isHi) {
    if (stripEn) stripEn.style.display = "none";
    if (stripHi) stripHi.style.display = "block";
    document.getElementById("lang-priority-title").textContent = "प्राथमिकता सूची";
  } else {
    if (stripEn) stripEn.style.display = "block";
    if (stripHi) stripHi.style.display = "block";
    document.getElementById("lang-priority-title").textContent = "Priority List (प्राथमिकता सूची)";
  }
}

// 14. Geolocation API (Native GPS tracking)
function toggleNativeGps(enable) {
  if (enable) {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser or smartphone device.");
      document.getElementById("real-gps-toggle").checked = false;
      appSettings.useDeviceGps = false;
      saveSettings();
      return;
    }

    document.getElementById("real-gps-debug").classList.remove("hidden");
    document.getElementById("real-gps-val").textContent = "Acquiring GPS fix...";

    // Configure status dot
    const statusDot = document.getElementById("gps-status-dot");
    statusDot.className = "status-icon orange-dot";
    document.getElementById("gps-status-text").textContent = "GPS Linking...";

    // Options: enableHighAccuracy keeps battery active for true GPS fix
    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    gpsWatchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = parseFloat(position.coords.latitude.toFixed(5));
        const lng = parseFloat(position.coords.longitude.toFixed(5));
        
        ashaLocation.lat = lat;
        ashaLocation.lng = lng;

        // Update simulator inputs (read-only style)
        document.getElementById("asha-lat").value = lat;
        document.getElementById("asha-lng").value = lng;
        document.getElementById("real-gps-val").textContent = `${lat}, ${lng} (±${Math.round(position.coords.accuracy)}m)`;

        // Move Map elements
        if (mainMap) {
          ashaMarker.setLatLng([lat, lng]);
          ashaCoverageCircle.setLatLng([lat, lng]);
          ashaMarker.closePopup();
        }

        // Configure active dot
        statusDot.className = "status-icon green-dot";
        document.getElementById("gps-status-text").textContent = "Phone GPS Active";

        // Recalculate walkable matrixes
        updateAshaCalculations();
      },
      (err) => {
        console.error("GPS tracking error: ", err);
        document.getElementById("real-gps-val").textContent = `Error: ${err.message}`;
        statusDot.className = "status-icon";
        statusDot.classList.add("red-dot");
        document.getElementById("gps-status-text").textContent = "GPS Error";
      },
      options
    );

    // Disable dragging on ASHA map pin
    if (ashaMarker) ashaMarker.dragging.disable();

  } else {
    // Disable native tracking
    if (gpsWatchId) {
      navigator.geolocation.clearWatch(gpsWatchId);
      gpsWatchId = null;
    }

    document.getElementById("real-gps-debug").classList.add("hidden");
    const statusDot = document.getElementById("gps-status-dot");
    statusDot.className = "status-icon green-dot";
    document.getElementById("gps-status-text").textContent = "ASHA Simulated GPS";

    // Enable dragging back on ASHA pin
    if (ashaMarker) ashaMarker.dragging.enable();

    // Save variables
    appSettings.useDeviceGps = false;
    saveSettings();
  }
}

// Synchronize inputs in settings card
function syncSettingsUIInputs() {
  document.getElementById("set-worker-name").value = appSettings.workerName;
  document.getElementById("set-ward-num").value = appSettings.wardNum;
  document.getElementById("set-coverage-radius").value = appSettings.coverageRadius;
  document.getElementById("set-coverage-radius-val").textContent = `${appSettings.coverageRadius}m`;
  document.getElementById("set-battery-alert").value = appSettings.lowBatteryLimit;
  document.getElementById("set-battery-alert-val").textContent = `${appSettings.lowBatteryLimit}%`;
  document.getElementById("real-gps-toggle").checked = appSettings.useDeviceGps;

  // Language selects
  document.querySelectorAll('input[name="lang-select"]').forEach(radio => {
    if (radio.value === appSettings.activeLang) {
      radio.checked = true;
    }
  });

  applyLanguageSettings();
}

function applySettingsChanges() {
  appSettings.workerName = document.getElementById("set-worker-name").value.trim() || "ASHA Worker";
  appSettings.wardNum = document.getElementById("set-ward-num").value.trim() || "Ward 12";
  appSettings.coverageRadius = parseInt(document.getElementById("set-coverage-radius").value);
  appSettings.lowBatteryLimit = parseInt(document.getElementById("set-battery-alert").value);
  
  // Language extract
  const selectedLangRadio = document.querySelector('input[name="lang-select"]:checked');
  if (selectedLangRadio) {
    appSettings.activeLang = selectedLangRadio.value;
  }

  const gpsCheckbox = document.getElementById("real-gps-toggle").checked;
  
  saveSettings();
  
  // Apply GPS Toggle changes
  if (gpsCheckbox !== appSettings.useDeviceGps) {
    appSettings.useDeviceGps = gpsCheckbox;
    toggleNativeGps(gpsCheckbox);
  }

  // Update coverage circle visual radius
  if (ashaCoverageCircle) {
    ashaCoverageCircle.setRadius(appSettings.coverageRadius);
  }

  // Re-run loops
  updateAppUI();
  applyLanguageSettings();

  showSystemNotification("Settings Applied", "Global parameters synced successfully.", "safe");
}

// Bind UI actions
function bindEvents() {
  // Mobile Tab switching
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", (e) => {
      document.querySelectorAll(".nav-item").forEach(btn => btn.classList.remove("active"));
      item.classList.add("active");
      
      const targetTab = item.getAttribute("data-tab");
      document.querySelectorAll(".mobile-view-panel").forEach(panel => {
        panel.classList.remove("active-tab");
      });
      
      const activePanel = document.getElementById(targetTab);
      activePanel.classList.add("active-tab");
      
      // Invalidate Leaflet sizing on tab changes to redraw containers correctly
      if (targetTab === "map-panel" && mainMap) {
        setTimeout(() => {
          mainMap.invalidateSize();
        }, 50);
      }
    });
  });

  // Filter chips click handlers
  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", (e) => {
      document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      const targetChip = e.currentTarget;
      targetChip.classList.add("active");
      activeFilter = targetChip.getAttribute("data-filter");
      updateMapMarkers();
    });
  });

  // ASHA GPS input update (Manual relocation)
  document.getElementById("update-asha-loc-btn").addEventListener("click", () => {
    if (appSettings.useDeviceGps) {
      alert("Simulated location updates are disabled when native GPS is active. Disable device GPS in settings.");
      return;
    }
    const lat = parseFloat(document.getElementById("asha-lat").value);
    const lng = parseFloat(document.getElementById("asha-lng").value);
    
    if (isNaN(lat) || isNaN(lng)) {
      alert("Please enter valid latitude and longitude coordinates.");
      return;
    }

    ashaLocation.lat = lat;
    ashaLocation.lng = lng;

    mainMap.setView([lat, lng], 16);
    ashaMarker.setLatLng([lat, lng]);
    ashaCoverageCircle.setLatLng([lat, lng]);

    updateAshaCalculations();
    showSystemNotification("ASHA GPS Relocated", `Worker set at: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, "safe");
  });

  document.getElementById("my-location-btn").addEventListener("click", () => {
    mainMap.setView([ashaLocation.lat, ashaLocation.lng], 16);
    ashaMarker.openPopup();
  });

  document.getElementById("reset-db-btn").addEventListener("click", () => {
    if (confirm("Reset database and preferences to defaults? All device mapping records will be cleared.")) {
      resetDatabase();
    }
  });

  // Settings range displays
  document.getElementById("set-coverage-radius").addEventListener("input", (e) => {
    document.getElementById("set-coverage-radius-val").textContent = `${e.target.value}m`;
  });

  document.getElementById("set-battery-alert").addEventListener("input", (e) => {
    document.getElementById("set-battery-alert-val").textContent = `${e.target.value}%`;
  });

  // Settings Save click
  document.getElementById("save-settings-btn").addEventListener("click", () => {
    applySettingsChanges();
  });

  // Detailed calibration form auto-fill current location
  document.getElementById("autofill-gps-btn").addEventListener("click", () => {
    document.getElementById("setup-lat").value = ashaLocation.lat.toFixed(5);
    document.getElementById("setup-lng").value = ashaLocation.lng.toFixed(5);
    showSystemNotification("ASHA Position Captured", "Coordinates set to installer's current GPS location.", "safe");
  });

  // Device Calibration Save
  document.getElementById("save-device-setup-btn").addEventListener("click", () => {
    applyDeviceSetup();
  });

  // Sandbox slider values update text dynamically
  document.getElementById("sim-heat-index").addEventListener("input", (e) => {
    document.getElementById("sim-heat-index-val").textContent = `${e.target.value}°C`;
  });

  document.getElementById("sim-risk-score").addEventListener("input", (e) => {
    document.getElementById("sim-risk-score-val").textContent = e.target.value;
  });

  // Sandbox save simulation click
  document.getElementById("save-simulation-btn").addEventListener("click", () => {
    applyVitalsSimulation();
  });

  // Sliding Bottom Sheet controls
  const toggleSheetBtn = document.getElementById("toggle-sheet-btn");
  const bottomSheet = document.getElementById("bottom-sheet");
  const closeSheetBtn = document.getElementById("close-sheet-btn");
  const sheetHeader = document.getElementById("bottom-sheet-header");

  toggleSheetBtn.addEventListener("click", () => {
    bottomSheet.classList.toggle("open");
  });

  closeSheetBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    bottomSheet.classList.remove("open");
  });

  sheetHeader.addEventListener("click", () => {
    bottomSheet.classList.toggle("open");
  });
}

// 15. Application Entry Point
document.addEventListener("DOMContentLoaded", () => {
  // Load local data & preferences
  initDatabaseAndSettings();

  // Draw Leaflet Map Canvas
  initMap();

  // Sync inputs inside settings card
  syncSettingsUIInputs();

  // Trigger GPS Geolocation tracking on boot if configured true
  if (appSettings.useDeviceGps) {
    toggleNativeGps(true);
  }

  // Refresh relative proximities
  updateAshaCalculations();

  // Update layout components
  updateAppUI();

  // Set default active view tab for mobile view ports
  if (window.innerWidth <= 768) {
    document.getElementById("map-panel").classList.add("active-tab");
    setTimeout(() => {
      if (mainMap) mainMap.invalidateSize();
    }, 150);
  }

  // Bind browser event listeners
  bindEvents();
});
