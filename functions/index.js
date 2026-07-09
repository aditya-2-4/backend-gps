const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const twilio = require("twilio");

admin.initializeApp();
const db = admin.database();
const firestore = admin.firestore();

// Twilio Config (Stub)
const accountSid = "YOUR_TWILIO_ACCOUNT_SID";
const authToken = "YOUR_TWILIO_AUTH_TOKEN";
const twilioClient = new twilio(accountSid, authToken);

// Haversine Distance
function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Scheduled Function: Runs every 30 minutes
exports.computeRiskScores = functions.pubsub.schedule("every 30 minutes").onRun(async (context) => {
  try {
    // 1. Fetch IMD Weather API forecast (Stub)
    // const weatherRes = await axios.get("YOUR_WEATHER_API_ENDPOINT");
    // const regionalHeatForecast = weatherRes.data.heat_index;
    const regionalHeatForecast = 42; // Fallback simulation

    // 2. Read Sensors from Realtime DB
    const sensorsSnapshot = await db.ref("sensors").once("value");
    const sensors = sensorsSnapshot.val() || {};

    // 3. Read Households from Firestore
    const householdsSnapshot = await firestore.collection("households").get();
    
    const batch = firestore.batch();

    for (const doc of householdsSnapshot.docs) {
      const house = doc.data();
      let closestSensor = null;
      let minDistance = Infinity;

      // Spatial Matcher
      for (const [sensorId, sensorData] of Object.entries(sensors)) {
        const dist = getHaversineDistance(house.lat, house.lng, sensorData.lat, sensorData.lng);
        if (dist < minDistance) {
          minDistance = dist;
          closestSensor = sensorData;
          closestSensor.id = sensorId;
        }
      }

      let heatIndex = regionalHeatForecast;
      let sensorId = null;
      let sensorStatus = "offline";
      let sensorBattery = null;

      if (closestSensor && minDistance < 2000) { // If sensor is within 2km
        heatIndex = closestSensor.heat_index;
        sensorId = closestSensor.id;
        sensorStatus = closestSensor.status;
        sensorBattery = closestSensor.battery;
      }

      // Compute Risk Score
      // Base risk on age, roof type, and heat index
      let riskScore = (heatIndex / 50) * 50; 
      if (house.age > 75) riskScore += 15;
      if (house.age > 65) riskScore += 10;
      if (house.roof_type === "tin") riskScore += 20;
      if (house.has_ac === false) riskScore += 10;
      
      riskScore = Math.min(Math.max(Math.round(riskScore), 0), 100);

      let zoneStatus = "safe";
      if (riskScore >= 70) zoneStatus = "risk";
      else if (riskScore >= 50) zoneStatus = "watch";

      // Detect status change to trigger SMS
      if (zoneStatus === "risk" && house.zone_status !== "risk") {
        await sendSMSAlert(house.mobile, house.name);
      }

      // Update Household in Firestore
      batch.update(doc.ref, {
        risk_score: riskScore,
        heat_index: heatIndex,
        zone_status: zoneStatus,
        device_id: sensorId,
        device_status: sensorStatus,
        device_battery: sensorBattery,
        last_updated: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    await batch.commit();
    console.log("Successfully computed risk scores and updated households.");

  } catch (error) {
    console.error("Error computing risk scores:", error);
  }
});

async function sendSMSAlert(mobile, name) {
  console.log(`[STUB] Sending SMS to ${mobile} for ${name}`);
  // Uncomment and configure Twilio when ready:
  /*
  try {
    await twilioClient.messages.create({
      body: `ALERT: ${name} has entered a HIGH RISK heat zone. Please check on them immediately. - ASHA GPS System`,
      from: "YOUR_TWILIO_PHONE_NUMBER",
      to: mobile
    });
  } catch (error) {
    console.error("Twilio Error:", error);
  }
  */
}
