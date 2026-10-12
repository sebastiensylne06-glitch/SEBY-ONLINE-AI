
// =========================================================
// SEBY AI - SCRIPT.JS COMPLET
// Frontend -> Backend -> OpenAI + Web Search
// =========================================================

"use strict";

/* ===================== API CONFIG ===================== */

// Pou Termux sou menm telefòn lan:
const API_URL =
    window.SEBY_AI_API_URL ||
    "http://127.0.0.1:3001/api/chat";

// Si backend lan sou Render, ranplase URL ki anlè a
// ak URL HTTPS sèvis Render ou a + /api/chat.

const API_TIMEOUT = 60000;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_HISTORY = 20;

// ==================== SYSTEM PROMPT ====================

const SEBY_AI_SYSTEM_PROMPT = `
Ou se SEBY AI, yon asistan entèlijan, rapid ak itil.

LANG:
- Reponn nan menm lang prensipal itilizatè a itilize.
- Kreyòl ayisyen: reponn an kreyòl ayisyen.
- Franse: reponn an franse.
- Anglè: reponn an anglè.
- Pa chanje lang san rezon.

KALITE REPONS:
- Reponn dirèkteman, klèman, natirèlman.
- Pa envante enfòmasyon, sous, lyen oswa rezilta rechèch.
- Si ou pa konnen yon bagay, di sa onètman.
- Sèvi ak istwa konvèsasyon an lè sa nesesè.
- Bay egzanp ak eksplikasyon lè sa itil.
- Pou matematik, montre etap yo.
- Pa kòmanse tout repons ak "Men repons lan".

RECHÈCH ENTÈNÈT:
- Pou nouvèl, evènman, pri, mizajou ak enfòmasyon aktyèl,
  sèvi ak zouti rechèch entènèt backend lan si li disponib.
- Pa pretann ou fè rechèch si ou pa t fè li.
- Distenge enfòmasyon verifye ak enfòmasyon ki ensèten.

IMAJ:
- Si itilizatè a voye yon imaj epi backend lan sipòte sa,
  analize sa ki vizib ladan l.
- Pa envante detay ki pa vizib.
`;

// ======================== STORAGE ========================

function loadJSON(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
    } catch (error) {
        console.error("Storage error:", error);
        return fallback;
    }
}

let chatMessages = loadJSON("seby_ai_messages", []);
let savedMessages = loadJSON("seby_ai_saved", []);

if (!Array.isArray(chatMessages)) chatMessages = [];
if (!Array.isArray(savedMessages)) savedMessages = [];

let userName = localStorage.getItem("seby_ai_name") || "Seby";
let voiceEnabled = localStorage.getItem("seby_ai_voice") === "true";

let selectedImage = null;
let toastTimer = null;
let isSending = false;

// =========================== DOM ==========================

function $(id) {
    return document.getElementById(id);
}

const sidebar = $("sidebar");
const overlay = $("overlay");
const openSidebar = $("openSidebar");
const closeSidebar = $("closeSidebar");
const newChat = $("newChat");
const chatArea = $("chatArea");
const welcome = $("welcome");
const messagesContainer = $("messages");
const messageInput = $("messageInput");
const sendButton = $("sendButton");
const attachButton = $("attachButton");
const imageInput = $("imageInput");
const imagePreview = $("imagePreview");
const microphone = $("microphone");
const profile = $("profile");
const profilePopup = $("profilePopup");
const profileSettings = $("profileSettings");
const notification = $("notification");
const toastElement = $("toast");

// ========================= START ==========================

document.addEventListener("DOMContentLoaded", init);

function init() {
    updateUserInterface();
    setupSidebar();
    setupNavigation();
    setupNewChat();
    setupChat();
    setupQuickButtons();
    setupProfile();
    setupSettings();
    setupNotification();
    renderMessages();
    renderSaved();
    autoResize();

    console.log("SEBY AI loaded.");
    console.log("API endpoint:", API_URL);
}

// ========================= SAVE STATE =====================

function saveState() {
    try {
        localStorage.setItem(
            "seby_ai_messages",
            JSON.stringify(chatMessages)
        );

        localStorage.setItem(
            "seby_ai_saved",
            JSON.stringify(savedMessages)
        );

        localStorage.setItem("seby_ai_name", userName);
        localStorage.setItem("seby_ai_voice", String(voiceEnabled));
    } catch (error) {
        console.error("Could not save state:", error);
        showToast("Pa kapab sove done yo sou aparèy la.");
    }
}

// ========================= USER UI ========================

function updateUserInterface() {
    const sidebarName = $("sidebarName");
    const profileName = $("profileName");
    const nameInput = $("nameInput");

    if (sidebarName) sidebarName.textContent = userName;
    if (profileName) profileName.textContent = userName;
    if (nameInput) nameInput.value = userName;
}

// =========================== SIDEBAR ======================

function setupSidebar() {
    openSidebar?.addEventListener("click", () => {
        sidebar?.classList.add("open");
        overlay?.classList.add("show");
    });

    closeSidebar?.addEventListener("click", closeSidebarMenu);
    overlay?.addEventListener("click", closeSidebarMenu);
}

function closeSidebarMenu() {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("show");
}

// ========================= NAVIGATION =====================

function setupNavigation() {
    document.querySelectorAll(".menu-item").forEach(button => {
        button.addEventListener("click", () => {
            const page = button.dataset.page;
            if (!page) return;

            showPage(page);
            activateMenu(page);
            closeSidebarMenu();
        });
    });
}

function showPage(pageName) {
    document.querySelectorAll(".page").forEach(page => {
        page.classList.remove("active");
    });

    $(pageName + "Page")?.classList.add("active");
}

function activateMenu(pageName) {
    document.querySelectorAll(".menu-item").forEach(item => {
        item.classList.toggle(
            "active",
            item.dataset.page === pageName
        );
    });
}

// =========================== NEW CHAT =====================

function setupNewChat() {
    newChat?.addEventListener("click", () => {
        if (isSending) {
            showToast("Tann repons aktyèl la fini anvan.");
            return;
        }

        chatMessages = [];
        saveState();
        renderMessages();
        showPage("chat");
        activateMenu("chat");
        closeSidebarMenu();

        showToast("Nouvo diskisyon kreye.");
        messageInput?.focus();
    });
}

// ============================== CHAT ======================

function setupChat() {
    sendButton?.addEventListener("click", sendMessage);

    messageInput?.addEventListener("input", autoResize);

    messageInput?.addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    attachButton?.addEventListener("click", () => {
        imageInput?.click();
    });

    imageInput?.addEventListener("change", handleImage);
    microphone?.addEventListener("click", startVoiceRecognition);
}

// ========================== QUICK BUTTONS =================

function setupQuickButtons() {
    document.querySelectorAll(".quick-button").forEach(button => {
        button.addEventListener("click", () => {
            if (!messageInput) return;

            messageInput.value =
                button.dataset.question ||
                button.textContent.trim();

            autoResize();
            sendMessage();
        });
    });
}

// ============================= TEXTAREA ===================

function autoResize() {
    if (!messageInput) return;

    messageInput.style.height = "auto";
    messageInput.style.height =
        Math.min(messageInput.scrollHeight, 130) + "px";
}

// ============================== IMAGE =====================

function handleImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        showToast("Fichye sa a pa yon imaj.");
        event.target.value = "";
        return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
        showToast("Imaj la twò gwo. Maksimòm 8 MB.");
        event.target.value = "";
        return;
    }

    const reader = new FileReader();

    reader.onload = () => {
        selectedImage = reader.result;
        renderImagePreview();
        showToast("Imaj ajoute.");
    };

    reader.onerror = () => {
        showToast("Mwen pa rive li imaj la.");
    };

    reader.readAsDataURL(file);
}

function renderImagePreview() {
    if (!imagePreview) return;

    imagePreview.replaceChildren();

    if (!selectedImage) {
        imagePreview.classList.remove("show");
        return;
    }

    const image = document.createElement("img");
    image.src = selectedImage;
    image.alt = "Imaj chwazi";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-image";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Retire imaj");
    remove.addEventListener("click", clearImage);

    imagePreview.append(image, remove);
    imagePreview.classList.add("show");
}

function clearImage() {
    selectedImage = null;
    if (imageInput) imageInput.value = "";
    renderImagePreview();
}

// ========================== SEND MESSAGE ==================

async function sendMessage() {
    if (!messageInput || isSending) return;

    const text = messageInput.value.trim();

    if (!text && !selectedImage) {
        showToast("Ekri yon mesaj oswa ajoute yon imaj.");
        return;
    }

    const userText = text || "Tanpri analize imaj sa a.";
    const imageToSend = selectedImage;

    addMessage("user", userText);

    messageInput.value = "";
    autoResize();
    clearImage();

    isSending = true;
    setSendState(true);

    const loading = addLoading();

    try {
        const result = await callRealAPI(userText, imageToSend);

        loading?.remove();

        addAssistantMessage(result.reply, result.sources);

        if (voiceEnabled) speakText(result.reply);

    } catch (error) {
        loading?.remove();
        console.error("SEBY AI API error:", error);

        addMessage("assistant", "⚠️ " + error.message);

    } finally {
        isSending = false;
        setSendState(false);
        messageInput?.focus();
    }
}

function setSendState(loading) {
    if (!sendButton) return;

    sendButton.disabled = loading;
    sendButton.style.opacity = loading ? "0.5" : "";

    if (loading) {
        sendButton.setAttribute("aria-busy", "true");
    } else {
        sendButton.removeAttribute("aria-busy");
    }
}

// ============================== API =======================

async function callRealAPI(text, image) {
    const previousHistory = chatMessages
        .slice(0, -1)
        .slice(-MAX_HISTORY)
        .map(message => ({
            role: message.role === "assistant" ? "assistant" : "user",
            content: String(message.content || "")
        }));

    const requestBody = {
        message: text,
        systemPrompt: SEBY_AI_SYSTEM_PROMPT,
        history: previousHistory,
        image: image || null
    };

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, API_TIMEOUT);

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });

        const raw = await response.text();
        let data;

        try {
            data = JSON.parse(raw);
        } catch {
            throw new Error(
                "Backend lan pa retounen JSON valab. Verifye server.js."
            );
        }

        if (!response.ok) {
            throw new Error(
                data.error ||
                data.details ||
                data.message ||
                `Erè HTTP ${response.status}.`
            );
        }

        const reply =
            data.reply ??
            data.response ??
            data.content ??
            (typeof data.message === "string" ? data.message : null);

        if (typeof reply !== "string" || !reply.trim()) {
            throw new Error(
                "API a pa retounen repons lan nan fòma ki nesesè a."
            );
        }

        return {
            reply: reply.trim(),
            sources: Array.isArray(data.sources) ? data.sources : []
        };

    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error(
                "Demann nan pran twòp tan. Verifye backend ak API a."
            );
        }

        if (error instanceof TypeError) {
            throw new Error(
                "Koneksyon API a echwe. Verifye URL backend lan, " +
                "koneksyon entènèt ak paramèt CORS yo."
            );
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}

// =========================== ADD MESSAGE ==================

function addMessage(role, content) {
    chatMessages.push({
        role,
        content: String(content),
        time: new Date().toISOString()
    });

    saveState();
    renderMessages();
}

function addAssistantMessage(content, sources) {
    chatMessages.push({
        role: "assistant",
        content: String(content),
        sources: Array.isArray(sources) ? sources : [],
        time: new Date().toISOString()
    });

    saveState();
    renderMessages();
}

// =========================== RENDER =======================

function renderMessages() {
    if (!messagesContainer) return;

    messagesContainer.replaceChildren();

    if (!chatMessages.length) {
        if (welcome) welcome.style.display = "";
        return;
    }

    if (welcome) welcome.style.display = "none";

    chatMessages.forEach((message, index) => {
        createMessageElement(message, index);
    });

    scrollChatToBottom();
}

function createMessageElement(message, index) {
    const row = document.createElement("div");

    row.className =
        "message-row " +
        (message.role === "user" ? "user" : "ai");

    if (message.role !== "user") {
        const icon = document.createElement("div");
        icon.className = "ai-icon";
        icon.textContent = "✺";
        row.appendChild(icon);
    }

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = String(message.content || "");
    row.appendChild(bubble);

    messagesContainer.appendChild(row);

    if (message.role === "assistant") {
        if (Array.isArray(message.sources) && message.sources.length) {
            createSources(message.sources);
        }

        createMessageActions(message.content, index);
    }
}

// ============================ SOURCES =====================

function createSources(sources) {
    const wrapper = document.createElement("div");
    wrapper.className = "message-sources";

    const title = document.createElement("div");
    title.textContent = "Sous entènèt";
    title.style.fontWeight = "600";
    wrapper.appendChild(title);

    sources.forEach(source => {
        if (!source || typeof source.url !== "string") return;

        try {
            const url = new URL(source.url);

            if (!["https:", "http:"].includes(url.protocol)) return;

            const link = document.createElement("a");
            link.href = url.href;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = source.title || url.hostname;

            wrapper.appendChild(link);
        } catch {
            // Ignore URLs ki pa valab.
        }
    });

    if (wrapper.children.length > 1) {
        messagesContainer.appendChild(wrapper);
    }
}

// =========================== MESSAGE ACTIONS ==============

function createMessageActions(text, index) {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "▢";
    copyButton.title = "Kopye";
    copyButton.addEventListener("click", () => copyText(text));

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = savedMessages.includes(text) ? "★" : "☆";
    saveButton.title = "Sove";

    saveButton.addEventListener("click", () => {
        toggleSaved(text);
        saveButton.textContent = savedMessages.includes(text) ? "★" : "☆";
    });

    const voiceButton = document.createElement("button");
    voiceButton.type = "button";
    voiceButton.textContent = "🔊";
    voiceButton.title = "Li repons lan";
    voiceButton.addEventListener("click", () => speakText(text));

    actions.append(copyButton, saveButton, voiceButton);
    messagesContainer.appendChild(actions);
}

// ============================= LOADING ====================

function addLoading() {
    if (!messagesContainer) return null;

    const row = document.createElement("div");
    row.className = "message-row ai";

    const icon = document.createElement("div");
    icon.className = "ai-icon";
    icon.textContent = "✺";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = "SEBY AI ap prepare repons lan...";

    row.append(icon, bubble);
    messagesContainer.appendChild(row);

    scrollChatToBottom();
    return row;
}

// ============================== SCROLL ===================

function scrollChatToBottom() {
    if (!chatArea) return;

    requestAnimationFrame(() => {
        chatArea.scrollTop = chatArea.scrollHeight;
    });
}

// ============================== SAVED =====================

function toggleSaved(text) {
    const index = savedMessages.indexOf(text);

    if (index >= 0) {
        savedMessages.splice(index, 1);
        showToast("Mesaj la retire nan Enregistrés.");
    } else {
        savedMessages.push(text);
        showToast("Mesaj la sove.");
    }

    saveState();
    renderSaved();
}

function renderSaved() {
    const list = $("savedList");
    if (!list) return;

    list.replaceChildren();

    if (!savedMessages.length) {
        const empty = document.createElement("div");
        empty.className = "saved-empty";
        empty.textContent = "Pa gen mesaj sove pou kounye a.";
        list.appendChild(empty);
        return;
    }

    [...savedMessages].reverse().forEach(text => {
        const item = document.createElement("div");
        item.className = "saved-item";
        item.textContent = text;

        const small = document.createElement("small");
        small.textContent = "Mesaj SEBY AI";

        item.appendChild(small);
        list.appendChild(item);
    });
}

// ================================ COPY ====================

async function copyText(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";

            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();

            const copied = document.execCommand("copy");
            textarea.remove();

            if (!copied) throw new Error("Copy failed");
        }

        showToast("Repons lan kopye.");
    } catch {
        showToast("Kopye pa disponib.");
    }
}

// =============================== VOICE ====================

function speakText(text) {
    if (!("speechSynthesis" in window)) {
        showToast("Fonksyon vwa pa disponib.");
        return;
    }

    window.speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "ht-HT";
    speech.rate = 0.95;
    speech.pitch = 1;

    window.speechSynthesis.speak(speech);
}

// ============================ MICROPHONE ==================

function startVoiceRecognition() {
    const Recognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

    if (!Recognition) {
        showToast("Mikwofòn pa disponib nan navigatè sa a.");
        return;
    }

    const recognition = new Recognition();
    recognition.lang = "ht-HT";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    showToast("M ap koute...");

    recognition.onstart = () => {
        if (microphone) microphone.style.transform = "scale(1.1)";
    };

    recognition.onresult = event => {
        const result = event.results[0][0].transcript;

        if (messageInput) {
            messageInput.value = result;
            autoResize();
        }
    };

    recognition.onerror = event => {
        console.error("Speech recognition error:", event.error);
        showToast("Mwen pa t rive pran vwa a.");
    };

    recognition.onend = () => {
        if (microphone) microphone.style.transform = "";
    };

    try {
        recognition.start();
    } catch {
        showToast("Mikwofòn nan deja ap itilize.");
    }
}

// =============================== PROFILE ==================

function setupProfile() {
    profile?.addEventListener("click", event => {
        event.stopPropagation();
        profilePopup?.classList.toggle("show");
    });

    profileSettings?.addEventListener("click", () => {
        profilePopup?.classList.remove("show");
        showPage("settings");
        activateMenu("settings");
    });

    document.addEventListener("click", event => {
        if (!profilePopup) return;

        if (
            !profilePopup.contains(event.target) &&
            event.target !== profile
        ) {
            profilePopup.classList.remove("show");
        }
    });
}

// ============================ NOTIFICATION ================

function setupNotification() {
    notification?.addEventListener("click", () => {
        showToast("Pa gen nouvo notifikasyon.");
    });
}

// ============================== SETTINGS ==================

function setupSettings() {
    const nameInput = $("nameInput");
    const voiceToggle = $("voiceToggle");
    const clearHistory = $("clearHistory");

    if (nameInput) {
        nameInput.value = userName;

        nameInput.addEventListener("change", () => {
            userName = nameInput.value.trim() || "Seby";
            saveState();
            updateUserInterface();
            showToast("Non ou sove.");
        });
    }

    if (voiceToggle) {
        voiceToggle.checked = voiceEnabled;

        voiceToggle.addEventListener("change", () => {
            voiceEnabled = voiceToggle.checked;
            saveState();
        });
    }

    clearHistory?.addEventListener("click", () => {
        const confirmed = window.confirm(
            "Èske ou vle efase tout istwa ak mesaj sove yo?"
        );

        if (!confirmed) return;

        chatMessages = [];
        savedMessages = [];

        saveState();
        renderMessages();
        renderSaved();

        showToast("Istwa a efase.");
    });
}

// ================================ TOAST ===================

function showToast(message) {
    if (!toastElement) {
        console.log(message);
        return;
    }

    toastElement.textContent = message;
    toastElement.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toastElement.classList.remove("show");
    }, 2500);
}

// ========================== ERROR PROTECTION ==============

window.addEventListener("error", event => {
    console.error(
        "SEBY AI JavaScript error:",
        event.error || event.message
    );
});

window.addEventListener("unhandledrejection", event => {
    console.error("SEBY AI Promise error:", event.reason);
});

console.log("SEBY AI script loaded.");
