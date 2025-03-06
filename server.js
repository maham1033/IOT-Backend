require('dotenv').config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// ✅ Connect to MongoDB (Use Atlas Instead of Localhost)
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.log("❌ MongoDB Connection Error:", err));

// ✅ Define Sensor Schema
const sensorSchema = new mongoose.Schema({
    temperature: Number,
    humidity: Number,
    ozone: Number,
    co2: Number,
    tvoc: Number,
    dust: Number,
    timestamp: { type: Date, default: Date.now }
});

// ✅ Create Sensor Model
const SensorData = mongoose.model("SensorData", sensorSchema);

// ✅ WebSocket Server (Attach to Express Server)
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
    console.log("🔗 ESP32 Connected");

    ws.on("message", async (message) => {
        try {
            const data = JSON.parse(message);
            console.log("📡 Received Data:", data);

            // Store data in MongoDB
            const newSensorData = new SensorData(data);
            await newSensorData.save();
            console.log("💾 Data Saved to MongoDB");

            // Broadcast real-time data to frontend
            io.emit("sensorData", data);

            // Send confirmation to ESP32
            ws.send("Data Received");
        } catch (err) {
            console.error("❌ Error Processing Data:", err);
        }
    });

    ws.on("close", () => {
        console.log("🔌 ESP32 Disconnected");
    });
});

// ✅ Socket.io for Real-Time Data to Frontend
io.on("connection", (socket) => {
    console.log("🖥️ Frontend Connected");

    setInterval(async () => {
        try {
            const latestData = await SensorData.find().sort({ timestamp: -1 }).limit(1);
            if (latestData.length > 0) {
                socket.emit("sensorData", latestData[0]);
            }
        } catch (error) {
            console.error("❌ Error Fetching Latest Sensor Data:", error);
        }
    }, 2000);

    socket.on("disconnect", () => {
        console.log("❌ Frontend Disconnected");
    });
});

// ✅ API Endpoint to Get Latest Sensor Data
app.get("/sensors/latest", async (req, res) => {
    try {
        const latestData = await SensorData.find().sort({ timestamp: -1 }).limit(1);
        res.json(latestData);
    } catch (err) {
        res.status(500).json({ error: "❌ Failed to fetch data" });
    }
});

// ✅ API to Control Purifier (ESP32 & Frontend)
app.post("/purifier", (req, res) => {
    const { command } = req.body; // "ON" or "OFF"
    console.log("🔧 Purifier Command:", command);

    // Broadcast to WebSocket Clients (ESP32)
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(command);
        }
    });

    // Send update to frontend via Socket.io
    io.emit("purifierStatus", command);

    res.json({ message: `Purifier turned ${command}` });
});

// ✅ Start Express & WebSocket Server on the Same Port
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
