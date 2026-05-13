/* =========================================================
   SERVER SETUP
========================================================= */

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/* =========================================================
   CONFIG
========================================================= */

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = "uploads";
const REPORT_DIR = "reports";
const REPORT_FILE = path.join(REPORT_DIR, "reports.json");

let waitingUsers = [];
let onlineUsers = 0;

app.use(express.static("public"));

ensureDirectory(UPLOAD_DIR);
ensureDirectory(REPORT_DIR);

app.use("/uploads", express.static(UPLOAD_DIR));

/* =========================================================
   FILE SYSTEM HELPERS
========================================================= */

function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
}

/* =========================================================
   FILE UPLOAD SETUP
========================================================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, `${UPLOAD_DIR}/`);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, uniqueName + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/jpg",
      "image/webp",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-matroska"
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image and video files are allowed."));
    }
  }
});

/* =========================================================
   MATCHING HELPERS
========================================================= */

function formatInterestList(interests) {
  if (!Array.isArray(interests) || interests.length === 0) return "";
  if (interests.length === 1) return interests[0];
  if (interests.length === 2) return `${interests[0]} and ${interests[1]}`;

  return `${interests.slice(0, -1).join(", ")} and ${interests.at(-1)}`;
}

function findMatch(user) {
  const userInterests = Array.isArray(user.interests) ? user.interests : [];

  if (userInterests.length > 0) {
    let bestMatchIndex = -1;
    let maxCommon = 0;

    for (let i = 0; i < waitingUsers.length; i++) {
      const otherUser = waitingUsers[i];
      const otherInterests = Array.isArray(otherUser.interests)
        ? otherUser.interests
        : [];

      if (otherInterests.length === 0) continue;

      const commonInterests = userInterests.filter((interest) => {
        return otherInterests.includes(interest);
      });

      if (commonInterests.length > maxCommon) {
        maxCommon = commonInterests.length;
        bestMatchIndex = i;
      }
    }

    if (bestMatchIndex === -1) return null;

    const matchedUser = waitingUsers.splice(bestMatchIndex, 1)[0];

    const commonInterests = userInterests.filter((interest) => {
      return matchedUser.interests.includes(interest);
    });

    const formattedCommonInterests = formatInterestList(commonInterests);

    user.commonInterest = formattedCommonInterests;
    matchedUser.commonInterest = formattedCommonInterests;

    return matchedUser;
  }

  for (let i = 0; i < waitingUsers.length; i++) {
    const otherUser = waitingUsers[i];
    const otherInterests = Array.isArray(otherUser.interests)
      ? otherUser.interests
      : [];

    if (otherInterests.length === 0) {
      return waitingUsers.splice(i, 1)[0];
    }
  }

  return null;
}

function connectUsers(userA, userB) {
  const room = `${userA.id}#${userB.id}`;

  userA.join(room);
  userB.join(room);

  userA.room = room;
  userB.room = room;

  const message = userA.commonInterest
    ? `Connected! You both like: ${userA.commonInterest}`
    : "Connected with a stranger";

  io.to(room).emit("chat start", message);
}

/* =========================================================
   CHAT SESSION HELPERS
========================================================= */

function leaveCurrentRoom(socket, leaveMessage, reason = "disconnected") {
  if (!socket.room) return;

  const currentRoom = socket.room;
  const roomData = io.sockets.adapter.rooms.get(currentRoom);

  if (roomData && roomData.size >= 1) {
    if (leaveMessage) {
      socket.to(currentRoom).emit("system-message", leaveMessage);
    }

    socket.to(currentRoom).emit("chat-ended", { reason });
  }

  socket.leave(currentRoom);
  socket.room = null;
  socket.commonInterest = null;
}

function removeFromQueue(socketId) {
  waitingUsers = waitingUsers.filter((user) => user.id !== socketId);
}

/* =========================================================
   REPORT HANDLING
========================================================= */

function saveReport(data) {
  let reports = [];

  if (fs.existsSync(REPORT_FILE)) {
    try {
      const fileData = fs.readFileSync(REPORT_FILE, "utf-8");
      reports = fileData ? JSON.parse(fileData) : [];
    } catch {
      reports = [];
    }
  }

  reports.push(data);

  fs.writeFileSync(REPORT_FILE, JSON.stringify(reports, null, 2));
}

/* =========================================================
   SOCKET EVENTS
========================================================= */

io.on("connection", (socket) => {
  onlineUsers++;
  io.emit("onlineCount", onlineUsers);

  socket.on("joinQueue", (interests) => {
    socket.interests = Array.isArray(interests) ? interests : [];
    socket.commonInterest = null;

    removeFromQueue(socket.id);

    const match = findMatch(socket);

    if (match) {
      connectUsers(socket, match);
    } else {
      waitingUsers.push(socket);
      socket.emit("waiting", "Waiting for a stranger...");
    }
  });

  socket.on("message", (msg) => {
    if (!socket.room) return;
    socket.to(socket.room).emit("message", msg);
  });

  socket.on("typing", () => {
    if (!socket.room) return;
    socket.to(socket.room).emit("typing");
  });

  socket.on("report-user", () => {
    saveReport({
      reportedBy: socket.id,
      room: socket.room || null,
      interests: Array.isArray(socket.interests) ? socket.interests : [],
      timestamp: new Date().toISOString()
    });
  });

  socket.on("next", () => {
    removeFromQueue(socket.id);
    leaveCurrentRoom(socket, "Stranger left the chat.", "left");

    const match = findMatch(socket);

    if (match) {
      connectUsers(socket, match);
    } else {
      waitingUsers.push(socket);
      socket.emit("waiting", "Searching for new stranger...");
    }
  });

  socket.on("leave-chat", () => {
    removeFromQueue(socket.id);
    leaveCurrentRoom(socket, "Stranger left the chat.", "left");
  });

  socket.on("disconnecting", () => {
    leaveCurrentRoom(socket, "Stranger disconnected.", "disconnected");
  });

  socket.on("disconnect", () => {
    onlineUsers = Math.max(0, onlineUsers - 1);
    io.emit("onlineCount", onlineUsers);
    removeFromQueue(socket.id);
  });
});

/* =========================================================
   UPLOAD ROUTE
========================================================= */

app.post("/upload", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const fileType = req.file.mimetype.startsWith("image") ? "image" : "video";

    return res.json({
      url: `/uploads/${req.file.filename}`,
      type: fileType
    });
  });
});

/* =========================================================
   START SERVER
========================================================= */

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});