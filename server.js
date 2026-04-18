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

if (!fs.existsSync("reports")) {
    fs.mkdirSync("reports");
}

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

function formatInterestList(interests) {
    if (!Array.isArray(interests) || interests.length === 0) return "";

    if (interests.length === 1) {
        return interests[0];
    }

    if (interests.length === 2) {
        return `${interests[0]} and ${interests[1]}`;
    }

    return `${interests.slice(0, -1).join(", ")} and ${interests[interests.length - 1]}`;
}

function findMatch(user) {
    const userInterests = Array.isArray(user.interests) ? user.interests : [];

    // Case 1: User has interests
    if (userInterests.length > 0) {
        let bestMatchIndex = -1;
        let maxCommon = 0;

        for (let i = 0; i < waitingUsers.length; i++) {
            const other = waitingUsers[i];
            const otherInterests = Array.isArray(other.interests) ? other.interests : [];

            if (otherInterests.length === 0) continue;

            const common = userInterests.filter((interest) =>
                otherInterests.includes(interest)
            );

            if (common.length > maxCommon) {
                maxCommon = common.length;
                bestMatchIndex = i;
            }
        }

        if (bestMatchIndex !== -1) {
            const matchedUser = waitingUsers.splice(bestMatchIndex, 1)[0];

            const common = userInterests.filter((i) =>
    matchedUser.interests.includes(i)
);

const formattedCommonInterests = formatInterestList(common);

user.commonInterest = formattedCommonInterests;
matchedUser.commonInterest = formattedCommonInterests;

            return matchedUser;
        }

        return null;
    }

    // Case 2: No interest users
    for (let i = 0; i < waitingUsers.length; i++) {
        const other = waitingUsers[i];
        const otherInterests = Array.isArray(other.interests) ? other.interests : [];

        if (otherInterests.length === 0) {
            waitingUsers.splice(i, 1);
            return other;
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

    const interestText = userA.commonInterest
        ? `Connected! You both like: ${userA.commonInterest}`
        : "Connected with a stranger";

    io.to(room).emit("chat start", interestText);
}

function leaveCurrentRoom(socket, leaveMessage, reason = "disconnected") {
    if (!socket.room) return;

    const currentRoom = socket.room;
    const roomData = io.sockets.adapter.rooms.get(currentRoom);

    if (roomData && roomData.size >= 1) {
        if (leaveMessage) {
            socket.to(currentRoom).emit("system-message", leaveMessage);
        }

        socket.to(currentRoom).emit("chat-ended", {
            reason
        });
    }

    socket.leave(currentRoom);
    socket.room = null;
    socket.commonInterest = null;
}

function saveReport(data) {
    const reportPath = path.join("reports", "reports.json");

    let reports = [];

    if (fs.existsSync(reportPath)) {
        try {
            const fileData = fs.readFileSync(reportPath, "utf-8");
            reports = fileData ? JSON.parse(fileData) : [];
        } catch (error) {
            reports = [];
        }
    }

    reports.push(data);

    fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2));
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

    socket.on("report-user", () => {
    const reportData = {
        reportedBy: socket.id,
        room: socket.room || null,
        interests: Array.isArray(socket.interests) ? socket.interests : [],
        timestamp: new Date().toISOString()
    };

    saveReport(reportData);
});

    socket.on("next", () => {
        // remove from waiting queue first
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);

        leaveCurrentRoom(socket, "Stranger left the chat.", "left");

        const match = findMatch(socket);

        if (match) {
            connectUsers(socket, match);
        } else {
            waitingUsers.push(socket);
            socket.emit("waiting", "Searching for new stranger...");
        }
    });

    socket.on("disconnecting", () => {
    console.log("User disconnecting:", socket.id);
    leaveCurrentRoom(socket, "Stranger disconnected.", "disconnected");
});

socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    onlineUsers--;
    io.emit("onlineCount", onlineUsers);

    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
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
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});