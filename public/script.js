const menuToggle = document.getElementById("menuToggle");
const closeMenu = document.getElementById("closeMenu");
const navMenu = document.getElementById("navMenu");
const navBackdrop = document.getElementById("navBackdrop");

function openNavMenu() {
  navMenu?.classList.add("show");
  navBackdrop?.classList.add("show");
}

function closeNavMenu() {
  navMenu?.classList.remove("show");
  navBackdrop?.classList.remove("show");
}

menuToggle?.addEventListener("click", openNavMenu);
closeMenu?.addEventListener("click", closeNavMenu);
navBackdrop?.addEventListener("click", closeNavMenu);

const isChatPage = typeof io !== "undefined" && document.getElementById("chatScreen");

if (isChatPage) {
  const socket = io();

  const interestInput = document.getElementById("interestInput");
  const interestTags = document.getElementById("interestTags");
  const themeSwitch = document.getElementById("themeSwitch");
  const menuBackdrop = document.getElementById("menuBackdrop");
  const welcomeScreen = document.getElementById("welcomeScreen");
  const chatScreen = document.getElementById("chatScreen");
  const chatPlaceholder = document.getElementById("chatPlaceholder");
  const status = document.getElementById("status");
  const statusDot = document.getElementById("statusDot");
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

  let interests = [];
  let confirmMode = false;
  let isConnected = false;
  let isSearching = false;
  let chatEnded = false;
  let reportConfirmMode = false;
  let mediaUnlocked = false;
  let strangerTypingTimeout;
  let typingThrottle;
  let mediaUnlockTimer;

  function togglePlaceholder() {
    const hasMessages = chatBox.querySelectorAll(".message, .system-message").length > 0;
    chatPlaceholder.style.display = hasMessages ? "none" : "block";
  }

  function scrollChatToBottom() {
    chatBox.scrollTo({
      top: chatBox.scrollHeight,
      behavior: "smooth"
    });
  }

  function setStatusState(state) {
    statusDot.classList.remove("disconnected", "searching", "connected");
    statusDot.classList.add(state);
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
    photoOption.classList.toggle("disabled-action", !mediaUnlocked);
    videoOption.classList.toggle("disabled-action", !mediaUnlocked);
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
    }, 2 * 60 * 1000);
  }

  function resetFilePreview() {
    fileInput.value = "";
    filePreview.innerHTML = "";
    filePreview.classList.add("hidden");
  }

  function clearChatBox() {
    chatBox.querySelectorAll(".message, .system-message").forEach((message) => {
      message.remove();
    });

    togglePlaceholder();
  }

  function resetChatSessionState() {
    isConnected = false;
    isSearching = false;
    chatEnded = false;
    mediaUnlocked = false;

    clearTimeout(mediaUnlockTimer);
    updateMediaAccessUI();
    closeActionMenu();

    startBtn.disabled = false;
    updateNextButtonState();
  }

  function createMessageWrapper(sender) {
    const div = document.createElement("div");

    div.classList.add("message");
    div.classList.add(sender === "you" ? "message-you" : "message-stranger");
    div.style.animation = "fadeIn 0.25s ease";

    const label = document.createElement("span");
    label.className = `label-${sender}`;
    label.innerText = sender === "you" ? "You" : "Stranger";

    div.appendChild(label);
    div.appendChild(document.createElement("br"));

    return div;
  }

  function addMessage(sender, text) {
    const div = createMessageWrapper(sender);

    const messageText = document.createElement("div");
    messageText.className = "message-text";
    messageText.innerText = text;

    const messageTime = document.createElement("div");
    messageTime.className = "message-time";
    messageTime.innerText = getCurrentTime();

    div.appendChild(messageText);
    div.appendChild(messageTime);

    chatBox.appendChild(div);
    scrollChatToBottom();
    togglePlaceholder();
  }

  function addSystemMessage(text) {
    const div = document.createElement("div");

    div.className = "system-message";
    div.innerText = text;
    div.style.animation = "fadeIn 0.25s ease";

    chatBox.appendChild(div);
    scrollChatToBottom();
    togglePlaceholder();
  }

  function addMedia(sender, url, type) {
    const div = createMessageWrapper(sender);
    const media = document.createElement(type === "image" ? "img" : "video");

    media.className = "chat-media";
    media.src = url;

    if (type === "video") {
      media.controls = true;
    }

    const messageTime = document.createElement("div");
    messageTime.className = "message-time";
    messageTime.innerText = getCurrentTime();

    div.appendChild(media);
    div.appendChild(messageTime);

    chatBox.appendChild(div);
    scrollChatToBottom();
    togglePlaceholder();
  }

  function createTag(text) {
    const tag = document.createElement("div");

    tag.className = "tag";
    tag.innerHTML = `${text} <span>×</span>`;

    tag.querySelector("span").onclick = () => {
      interests = interests.filter((interest) => interest !== text);
      tag.remove();
    };

    interestTags.appendChild(tag);
  }

  function validateVideoDuration(file) {
    return new Promise((resolve) => {
      if (!file.type.startsWith("video/")) {
        resolve(true);
        return;
      }

      const video = document.createElement("video");

      video.preload = "metadata";

      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
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

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      addMedia("you", data.url, data.type);
      socket.emit("message", data);
      resetFilePreview();
    } catch (error) {
      alert(error.message || "Upload failed");
    }
  }

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
    showChatScreen();

    socket.emit("joinQueue", interests);

    status.innerText = "Searching for stranger...";
    setStatusState("searching");
  };

  sendBtn.onclick = () => {
    const msg = messageInput.value.trim();

    if (!msg || !isConnected) return;

    confirmMode = false;
    nextBtn.innerText = "Next";

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

  messageInput.addEventListener("input", () => {
    if (!isConnected || typingThrottle) return;

    socket.emit("typing");

    typingThrottle = setTimeout(() => {
      typingThrottle = null;
    }, 800);
  });

  nextBtn.onclick = () => {
    if (isSearching || (!isConnected && !chatEnded)) return;

    if (!confirmMode) {
      confirmMode = true;
      nextBtn.innerText = "Sure?";
      return;
    }

    confirmMode = false;
    nextBtn.innerText = "Next";

    resetReportConfirmState();
    typingIndicator.classList.add("hidden");
    resetFilePreview();
    clearChatBox();

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
    setStatusState("searching");
  };

  plusBtn.onclick = () => {
    if (actionMenu.classList.contains("show")) {
      closeActionMenu();
    } else {
      openActionMenu();
    }
  };

  backBtn.onclick = () => {
    if (chatScreen.classList.contains("hidden")) return;

    if (isConnected || isSearching) {
      socket.emit("leave-chat");
    }

    confirmMode = false;
    nextBtn.innerText = "Next";

    resetReportConfirmState();
    resetChatSessionState();
    resetFilePreview();
    clearChatBox();

    status.innerText = "Not connected";
    setStatusState("disconnected");

    showWelcomeScreen();
  };

  photoOption.onclick = () => {
    if (!isConnected) return;

    if (!mediaUnlocked) {
      alert("Media sharing unlocks after 2 minutes of active chat.");
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
      alert("Media sharing unlocks after 2 minutes of active chat.");
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

    typingIndicator.classList.add("hidden");
    resetFilePreview();
    clearChatBox();

    isConnected = false;
    chatEnded = false;
    isSearching = true;
    mediaUnlocked = false;

    clearTimeout(mediaUnlockTimer);
    updateMediaAccessUI();
    closeActionMenu();

    status.innerText = "User reported. Searching for new stranger...";
    setStatusState("searching");
    updateNextButtonState();

    socket.emit("next");
  };

  interestInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;

    e.preventDefault();

    const value = interestInput.value.trim().toLowerCase();

    if (!value || interests.includes(value)) return;

    interests.push(value);
    createTag(value);
    interestInput.value = "";
  });

  document.addEventListener("click", (e) => {
    const clickedInsideMenu = actionMenu.contains(e.target);
    const clickedPlus = plusBtn.contains(e.target);

    if (!clickedInsideMenu && !clickedPlus && actionMenu.classList.contains("show")) {
      closeActionMenu();
    }
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];

    if (!file) {
      resetFilePreview();
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const isImage = file.type.startsWith("image/");

    filePreview.innerHTML = `
      <div class="preview-header">
        <span>Selected ${isImage ? "image" : "video"}</span>
        <button type="button" id="removePreviewBtn" class="remove-preview-btn">×</button>
      </div>
      ${
        isImage
          ? `<img src="${previewUrl}" alt="Selected image">`
          : `<video src="${previewUrl}" controls></video>`
      }
    `;

    filePreview.classList.remove("hidden");

    document.getElementById("removePreviewBtn").onclick = () => {
      URL.revokeObjectURL(previewUrl);
      resetFilePreview();
    };

    await uploadSelectedFile();
  });

  socket.on("message", (msg) => {
    typingIndicator.classList.add("hidden");

    if (typeof msg === "string") {
      addMessage("stranger", msg);
      return;
    }

    if (msg.type === "text") {
      addMessage("stranger", msg.text);
    } else if (msg.type === "image" || msg.type === "video") {
      addMedia("stranger", msg.url, msg.type);
    }
  });

  socket.on("system-message", addSystemMessage);

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

    setStatusState("disconnected");
    updateNextButtonState();
  });

  socket.on("chat start", (msg) => {
    status.innerText = msg;

    setStatusState("connected");

    isConnected = true;
    isSearching = false;
    chatEnded = false;

    startBtn.disabled = true;

    startMediaUnlockTimer();
    closeActionMenu();
    updateNextButtonState();
  });

  socket.on("waiting", (msg) => {
    status.innerText = msg;

    setStatusState("searching");

    isConnected = false;
    isSearching = true;
    chatEnded = false;
    mediaUnlocked = false;

    startBtn.disabled = true;

    updateMediaAccessUI();
    updateNextButtonState();
  });

  socket.on("typing", () => {
    if (!isConnected) return;

    typingIndicator.classList.remove("hidden");

    clearTimeout(strangerTypingTimeout);

    strangerTypingTimeout = setTimeout(() => {
      typingIndicator.classList.add("hidden");
    }, 1500);
  });

  socket.on("onlineCount", (count) => {
    onlineUsersText.innerText = `Users online: ${count}`;
  });

  const savedTheme = localStorage.getItem("theme");

  if (savedTheme === "dark") {
    document.body.classList.remove("light");
    themeSwitch.checked = false;
  } else {
    document.body.classList.add("light");
    themeSwitch.checked = true;
    localStorage.setItem("theme", "light");
  }

  themeSwitch.addEventListener("change", () => {
    document.body.classList.toggle("light");

    localStorage.setItem(
      "theme",
      document.body.classList.contains("light") ? "light" : "dark"
    );
  });

  updateMediaAccessUI();
  togglePlaceholder();
  closeActionMenu();
  updateNextButtonState();
  showWelcomeScreen();
  setStatusState("disconnected");
}