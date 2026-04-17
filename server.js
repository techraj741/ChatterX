const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
}

app.use("/uploads", express.static("uploads"));

let waitingUsers = [];
let onlineUsers = 0;

/* =========================================================
   FILE UPLOAD SETUP
========================================================= */
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, uniqueName + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10 MB
    },
    fileFilter: (req, file, cb) => {
        const allowed = [
            "image/jpeg",
            "image/png",
            "image/jpg",
            "image/webp",
            "video/mp4",
            "video/webm",
            "video/quicktime",
            "video/x-matroska"
        ];

        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only image and video files allowed"));
        }
    }
});

/* =========================================================
   MATCHING LOGIC
========================================================= */
function findMatch(user) {
    const userInterests = Array.isArray(user.interests) ? user.interests : [];

    // 1) Try matching by common interests first
    if (userInterests.length > 0) {
        for (let i = 0; i < waitingUsers.length; i++) {
            const other = waitingUsers[i];
            const otherInterests = Array.isArray(other.interests) ? other.interests : [];

            const common = userInterests.filter(x => otherInterests.includes(x));

            if (common.length > 0) {
                waitingUsers.splice(i, 1);
                user.commonInterest = common[0];
                other.commonInterest = common[0];
                return other;
            }
        }
    }

    // 2) If no interests, prefer another no-interest user
    if (userInterests.length === 0) {
        for (let i = 0; i < waitingUsers.length; i++) {
            const other = waitingUsers[i];
            const otherInterests = Array.isArray(other.interests) ? other.interests : [];

            if (otherInterests.length === 0) {
                waitingUsers.splice(i, 1);
                user.commonInterest = null;
                other.commonInterest = null;
                return other;
            }
        }
    }

    // 3) Fallback to anyone
    if (waitingUsers.length > 0) {
        const other = waitingUsers.shift();
        user.commonInterest = null;
        other.commonInterest = null;
        return other;
    }

    return null;
}

function connectUsers(userA, userB) {
    const room = `${userA.id}#${userB.id}`;

    userA.join(room);
    userB.join(room);

    userA.room = room;
    userB.room = room;

    const interestText = userA.commonInterest
        ? `Connected! You both like: ${userA.commonInterest}`
        : "Connected with a stranger";

    io.to(room).emit("chat start", interestText);
}

function leaveCurrentRoom(socket, leaveMessage) {
    if (!socket.room) return;

    const currentRoom = socket.room;
    const roomData = io.sockets.adapter.rooms.get(currentRoom);

    // Only send leave message if partner is actually still in room
    if (roomData && roomData.size > 1 && leaveMessage) {
        socket.to(currentRoom).emit("message", leaveMessage);
    }

    socket.leave(currentRoom);
    socket.room = null;
    socket.commonInterest = null;
}

/* =========================================================
   SOCKET EVENTS
========================================================= */
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    onlineUsers++;
    io.emit("onlineCount", onlineUsers);

    socket.on("joinQueue", (interests) => {
        socket.interests = Array.isArray(interests) ? interests : [];
        socket.commonInterest = null;

        // remove duplicate queue entry if any
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);

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

    socket.on("next", () => {
        // remove from waiting queue first
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);

        leaveCurrentRoom(socket, "Stranger left the chat.");

        const match = findMatch(socket);

        if (match) {
            connectUsers(socket, match);
        } else {
            waitingUsers.push(socket);
            socket.emit("waiting", "Searching for new stranger...");
        }
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);

        onlineUsers--;
        io.emit("onlineCount", onlineUsers);

        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);

        leaveCurrentRoom(socket, "Stranger disconnected.");
    });
});

/* =========================================================
   FILE UPLOAD ROUTE
========================================================= */
app.post("/upload", (req, res) => {
    upload.single("file")(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const fileType = req.file.mimetype.startsWith("image") ? "image" : "video";

        res.json({
            url: "/uploads/" + req.file.filename,
            type: fileType
        });
    });
});

/* =========================================================
   START SERVER
========================================================= */
server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});