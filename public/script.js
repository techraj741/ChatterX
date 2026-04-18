/* =========================================================
   SOCKET CONNECTION
========================================================= */
const socket = io();

/* =========================================================
   DOM ELEMENTS
========================================================= */
const interestInput = document.getElementById("interestInput");
const interestTags = document.getElementById("interestTags");
const themeSwitch = document.getElementById("themeSwitch");
const menuBackdrop = document.getElementById("menuBackdrop");
const welcomeScreen = document.getElementById("welcomeScreen");
const chatScreen = document.getElementById("chatScreen");


const chatPlaceholder = document.getElementById("chatPlaceholder");
const status = document.getElementById("status");
const onlineUsersText = document.getElementById("onlineUsers");
const chatBox = document.getElementById("chatBox");
const messageInput = document.getElementById("messageInput");
const typingIndicator = document.getElementById("typingIndicator");
const backBtn = document.getElementById("backBtn");

const fileInput = document.getElementById("fileInput");
const filePreview = document.getElementById("filePreview");

const sendBtn = document.getElementById("sendBtn");
const startBtn = document.getElementById("startBtn");
const nextBtn = document.getElementById("nextBtn");

const plusBtn = document.getElementById("plusBtn");
const actionMenu = document.getElementById("actionMenu");
const photoOption = document.getElementById("photoOption");
const videoOption = document.getElementById("videoOption");
const reportOption = document.getElementById("reportOption");

/* =========================================================
   STATE VARIABLES
========================================================= */
let interests = [];
let confirmMode = false;
let isConnected = false;
let isSearching = false;
let chatEnded = false;
let strangerTypingTimeout;
let reportConfirmMode = false;
let mediaUnlocked = false;
let chatStartTime = null;
let mediaUnlockTimer = null;

/* =========================================================
   UI HELPERS
========================================================= */

function togglePlaceholder() {
    const hasMessages = chatBox.querySelectorAll(".message, .system-message").length > 0;
    chatPlaceholder.style.display = hasMessages ? "none" : "block";
}

function showWelcomeScreen() {
    welcomeScreen.classList.remove("hidden");
    chatScreen.classList.add("hidden");
}

function showChatScreen() {
    welcomeScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
}

function resetReportConfirmState() {
    reportConfirmMode = false;
    reportOption.innerText = "Report User";
}

function getCurrentTime() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
}

function openActionMenu() {
    actionMenu.classList.remove("hidden");
    menuBackdrop.classList.remove("hidden");
    plusBtn.classList.add("active");

    requestAnimationFrame(() => {
        actionMenu.classList.add("show");
        menuBackdrop.classList.add("show");
    });
}

function closeActionMenu() {
    actionMenu.classList.remove("show");
    menuBackdrop.classList.remove("show");
    plusBtn.classList.remove("active");
    resetReportConfirmState();

    setTimeout(() => {
        if (!actionMenu.classList.contains("show")) {
            actionMenu.classList.add("hidden");
            menuBackdrop.classList.add("hidden");
        }
    }, 280);
}

function updateMediaAccessUI() {
    if (mediaUnlocked) {
        photoOption.classList.remove("disabled-action");
        videoOption.classList.remove("disabled-action");
    } else {
        photoOption.classList.add("disabled-action");
        videoOption.classList.add("disabled-action");
    }
}

function updateNextButtonState() {
    if (isSearching) {
        nextBtn.disabled = true;
        nextBtn.innerText = "Next";
        confirmMode = false;
        return;
    }

    if (isConnected || chatEnded) {
        nextBtn.disabled = false;
        return;
    }

    nextBtn.disabled = true;
    nextBtn.innerText = "Next";
    confirmMode = false;
}

function startMediaUnlockTimer() {
    clearTimeout(mediaUnlockTimer);
    mediaUnlocked = false;
    updateMediaAccessUI();

    mediaUnlockTimer = setTimeout(() => {
        mediaUnlocked = true;
        updateMediaAccessUI();
    }, 5 * 60 * 1000);
}

function resetFilePreview() {
    fileInput.value = "";
    filePreview.innerHTML = "";
    filePreview.classList.add("hidden");
}

function resetChatSessionState() {
    isConnected = false;
    isSearching = false;
    chatEnded = false;
    mediaUnlocked = false;
    chatStartTime = null;
    clearTimeout(mediaUnlockTimer);
    updateMediaAccessUI();
    closeActionMenu();
    startBtn.disabled = false;
    updateNextButtonState();
}

/* =========================================================
   MESSAGE RENDERING
========================================================= */
function addMessage(sender, text) {
    const div = document.createElement("div");
    div.classList.add("message");
    div.classList.add(sender === "you" ? "message-you" : "message-stranger");

    div.innerHTML = `
        <span class="label-${sender}">${sender === "you" ? "You" : "Stranger"}</span><br>
        <div class="message-text">${text}</div>
        <div class="message-time">${getCurrentTime()}</div>
    `;

    div.style.animation = "fadeIn 0.25s ease";

    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    togglePlaceholder();
}

function addSystemMessage(text) {
    const div = document.createElement("div");
    div.className = "system-message";
    div.innerText = text;
    div.style.animation = "fadeIn 0.25s ease";

    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    togglePlaceholder();
}

function addImage(sender, url) {
    const div = document.createElement("div");
    div.classList.add("message", sender === "you" ? "message-you" : "message-stranger");

    div.innerHTML = `
        <span class="label-${sender}">${sender === "you" ? "You" : "Stranger"}</span><br>
        <img src="${url}" class="chat-media">
        <div class="message-time">${getCurrentTime()}</div>
    `;

    div.style.animation = "fadeIn 0.25s ease";

    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    togglePlaceholder();
}

function addVideo(sender, url) {
    const div = document.createElement("div");
    div.classList.add("message", sender === "you" ? "message-you" : "message-stranger");

    div.innerHTML = `
        <span class="label-${sender}">${sender === "you" ? "You" : "Stranger"}</span><br>
        <video class="chat-media" controls>
            <source src="${url}">
        </video>
        <div class="message-time">${getCurrentTime()}</div>
    `;

    div.style.animation = "fadeIn 0.25s ease";

    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    togglePlaceholder();
}

/* =========================================================
   CHAT CONTROL
========================================================= */
startBtn.onclick = () => {
    if (isSearching || isConnected) return;

    confirmMode = false;
    nextBtn.innerText = "Next";
    resetReportConfirmState();

    isSearching = true;
    chatEnded = false;
    startBtn.disabled = true;
    updateNextButtonState();

    typingIndicator.classList.add("hidden");

    // Switch from welcome screen to chat screen
    showChatScreen();

    socket.emit("joinQueue", interests);
    status.innerText = "Searching for stranger...";
};

sendBtn.onclick = () => {
    const msg = messageInput.value.trim();
    if (!msg || !isConnected) return;

    if (confirmMode) {
        confirmMode = false;
        nextBtn.innerText = "Next";
    }

    addMessage("you", msg);

    socket.emit("message", {
        type: "text",
        text: msg
    });

    messageInput.value = "";
};

messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        sendBtn.click();
    }
});

nextBtn.onclick = () => {
    if (isSearching) return;
    if (!isConnected && !chatEnded) return;

    if (!confirmMode) {
        confirmMode = true;
        nextBtn.innerText = "Sure?";
        return;
    }

    confirmMode = false;
    nextBtn.innerText = "Next";

    // Reset report confirmation if it was active
    resetReportConfirmState();

    typingIndicator.classList.add("hidden");
    resetFilePreview();
    chatBox.querySelectorAll(".message, .system-message").forEach((m) => m.remove());
    togglePlaceholder();

    isConnected = false;
    chatEnded = false;
    isSearching = true;
    mediaUnlocked = false;
    clearTimeout(mediaUnlockTimer);
    updateMediaAccessUI();
    closeActionMenu();
    startBtn.disabled = true;
    updateNextButtonState();

    socket.emit("next");
    status.innerText = "Searching for new stranger...";
};

plusBtn.onclick = () => {
    if (actionMenu.classList.contains("hidden")) {
        openActionMenu();
    } else if (actionMenu.classList.contains("show")) {
        closeActionMenu();
    } else {
        openActionMenu();
    }
};

backBtn.onclick = () => {
    // Agar already welcome pe hai to kuch mat karo
    if (!chatScreen || chatScreen.classList.contains("hidden")) return;

    // 🔥 Agar connected ya searching hai to properly leave
    if (isConnected || isSearching) {
        socket.emit("next"); // current chat/queue se nikal jao
    }

    // Reset everything
    confirmMode = false;
    nextBtn.innerText = "Next";
    resetReportConfirmState();

    resetChatSessionState();
    resetFilePreview();

    chatBox.querySelectorAll(".message, .system-message").forEach((m) => m.remove());
    status.innerText = "Not connected";

    // Switch back to welcome screen
    showWelcomeScreen();
};

photoOption.onclick = () => {
    if (!isConnected) return;

    if (!mediaUnlocked) {
        alert("Photo sharing unlocks after 5 minutes of active chat.");
        closeActionMenu();
        return;
    }

    fileInput.accept = "image/*";
    fileInput.click();
    closeActionMenu();
};

videoOption.onclick = () => {
    if (!isConnected) return;

    if (!mediaUnlocked) {
        alert("Video sharing unlocks after 5 minutes of active chat.");
        closeActionMenu();
        return;
    }

    fileInput.accept = "video/mp4,video/webm,video/quicktime";
    fileInput.click();
    closeActionMenu();
};

reportOption.onclick = () => {
    if (!isConnected) return;

    if (!reportConfirmMode) {
        reportConfirmMode = true;
        reportOption.innerText = "Sure?";
        return;
    }

    resetReportConfirmState();

    socket.emit("report-user");
    socket.emit("next");

    addSystemMessage("You reported this user.");

    resetChatSessionState();
    resetFilePreview();

    chatBox.querySelectorAll(".message").forEach((m) => m.remove());
    status.innerText = "Searching for new stranger...";
    togglePlaceholder();
};

/* =========================================================
   SOCKET EVENTS
========================================================= */
socket.on("message", (msg) => {
    typingIndicator.classList.add("hidden");

   if (typeof msg === "string") {
    addMessage("stranger", msg);
    return;
}

    if (msg.type === "image") addImage("stranger", msg.url);
    else if (msg.type === "video") addVideo("stranger", msg.url);
    else if (msg.type === "text") addMessage("stranger", msg.text);
});

socket.on("system-message", (text) => {
    addSystemMessage(text);
});

socket.on("chat-ended", ({ reason }) => {
    isConnected = false;
    isSearching = false;
    chatEnded = true;
    mediaUnlocked = false;

    clearTimeout(mediaUnlockTimer);
    updateMediaAccessUI();
    resetFilePreview();
    closeActionMenu();
    typingIndicator.classList.add("hidden");
    startBtn.disabled = false;

    status.innerText =
        reason === "left"
            ? "Stranger left. Click Next to find a new chat."
            : "Stranger disconnected. Click Next to find a new chat.";

    updateNextButtonState();
});

socket.on("chat start", (msg) => {
    status.innerText = msg;
    isConnected = true;
    isSearching = false;
    chatEnded = false;
    startBtn.disabled = true;
    chatStartTime = Date.now();
    startMediaUnlockTimer();
    closeActionMenu();
    updateNextButtonState();
});

socket.on("waiting", (msg) => {
    status.innerText = msg;
    isConnected = false;
    isSearching = true;
    chatEnded = false;
    startBtn.disabled = true;
    mediaUnlocked = false;
    updateMediaAccessUI();
    updateNextButtonState();
});

messageInput.addEventListener("input", () => {
    if (isConnected) socket.emit("typing");
});

socket.on("typing", () => {
    if (!isConnected) return;

    typingIndicator.classList.remove("hidden");

    clearTimeout(strangerTypingTimeout);
    strangerTypingTimeout = setTimeout(() => {
        typingIndicator.classList.add("hidden");
    }, 1200);
});

socket.on("onlineCount", (count) => {
    onlineUsersText.innerText = `Users online: ${count}`;
});

/* =========================================================
   INTEREST TAGS
========================================================= */
interestInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();

        const value = interestInput.value.trim().toLowerCase();
        if (!value || interests.includes(value)) return;

        interests.push(value);
        createTag(value);
        interestInput.value = "";
    }
});

function createTag(text) {
    const tag = document.createElement("div");
    tag.className = "tag";
    tag.innerHTML = `${text} <span>×</span>`;

    tag.querySelector("span").onclick = () => {
        interests = interests.filter((i) => i !== text);
        tag.remove();
    };

    interestTags.appendChild(tag);
}

document.addEventListener("click", (e) => {
    const clickedInsideMenu = actionMenu.contains(e.target);
    const clickedPlus = plusBtn.contains(e.target);

    if (!clickedInsideMenu && !clickedPlus && actionMenu.classList.contains("show")) {
        closeActionMenu();
    }
});

/* =========================================================
   FILE HANDLING
========================================================= */
fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];

    if (!file) {
        resetFilePreview();
        return;
    }

    filePreview.innerHTML = "";
    filePreview.classList.remove("hidden");

    if (file.type.startsWith("image/")) {
    filePreview.innerHTML = `
        <div class="preview-header">
            <span>Selected image</span>
            <button type="button" id="removePreviewBtn" class="remove-preview-btn">×</button>
        </div>
        <img src="${URL.createObjectURL(file)}">
    `;
} else {
    filePreview.innerHTML = `
        <div class="preview-header">
            <span>Selected video</span>
            <button type="button" id="removePreviewBtn" class="remove-preview-btn">×</button>
        </div>
        <video src="${URL.createObjectURL(file)}" controls></video>
    `;
}

const removePreviewBtn = document.getElementById("removePreviewBtn");
if (removePreviewBtn) {
    removePreviewBtn.onclick = () => {
        resetFilePreview();
    };
}

    await uploadSelectedFile();
});

function validateVideoDuration(file) {
    return new Promise((resolve) => {
        if (!file.type.startsWith("video/")) return resolve(true);

        const video = document.createElement("video");
        video.preload = "metadata";

        video.onloadedmetadata = () => {
            resolve(video.duration <= 60);
        };

        video.src = URL.createObjectURL(file);
    });
}

async function uploadSelectedFile() {
    if (!isConnected || !mediaUnlocked) return;

    const file = fileInput.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
        alert("File size must be 10 MB or less.");
        resetFilePreview();
        return;
    }

    if (!(await validateVideoDuration(file))) {
        alert("Video must be 60 seconds or less.");
        resetFilePreview();
        return;
    }

    try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Upload failed");

        if (data.type === "image") addImage("you", data.url);
        else addVideo("you", data.url);

        socket.emit("message", data);
        resetFilePreview();
    } catch (error) {
        alert(error.message || "Upload failed");
    }
}

/* =========================================================
   THEME
========================================================= */
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "light") {
    document.body.classList.add("light");
    themeSwitch.checked = true;
}

themeSwitch.addEventListener("change", () => {
    document.body.classList.toggle("light");

    localStorage.setItem(
        "theme",
        document.body.classList.contains("light") ? "light" : "dark"
    );
});

/* =========================================================
   INIT
========================================================= */
updateMediaAccessUI();
togglePlaceholder();
closeActionMenu();
updateNextButtonState();
showWelcomeScreen();