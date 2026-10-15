/* =========================================================
   SEBY AI — COMPLETE BACKEND
   OpenAI Responses API
   Web Search + Image Understanding + Conversation History
   Render + Node.js 18+
========================================================= */

"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

/* =========================================================
   ENVIRONMENT CONFIGURATION
========================================================= */

loadEnvFile();

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT) || 3001;

const OPENAI_API_KEY = (
    process.env.OPENAI_API_KEY || ""
).trim();

const OPENAI_MODEL = (
    process.env.OPENAI_MODEL || "gpt-4.1-mini"
).trim();

const ENABLE_WEB_SEARCH =
    String(process.env.ENABLE_WEB_SEARCH || "true")
        .toLowerCase() !== "false";

const REQUEST_TIMEOUT = 90000;
const MAX_BODY_SIZE = 15 * 1024 * 1024;
const MAX_HISTORY = 20;
const MAX_MESSAGE_LENGTH = 50000;
const MAX_IMAGE_LENGTH = 12 * 1024 * 1024;
const MAX_OUTPUT_TOKENS = 2500;

const FRONTEND_URL = (
    process.env.FRONTEND_URL || ""
)
    .split(",")
    .map(value => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);

const LOCAL_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001"
];

/* =========================================================
   SYSTEM PROMPT
========================================================= */

const SYSTEM_PROMPT = `
Ou se SEBY AI, yon asistan entèlijan, itil, klè, epi natirèl.

LANG:
- Si itilizatè a ekri an kreyòl ayisyen, reponn an kreyòl.
- Si itilizatè a ekri an franse, reponn an franse.
- Si itilizatè a ekri an anglè, reponn an anglè.
- Si itilizatè a melanje plizyè lang, sèvi ak lang ki domine a.

RÈG:
1. Reponn kesyon itilizatè a dirèkteman.
2. Pa envante enfòmasyon oswa sous.
3. Pou enfòmasyon aktyèl, sèvi ak rechèch entènèt si zouti a disponib.
4. Separe enfòmasyon verifye ak sa ki pa sèten.
5. Itilize istwa konvèsasyon an lè sa nesesè.
6. Bay eksplikasyon ki fasil pou konprann.
7. Pou matematik, verifye kalkil yo.
8. Pou travay akademik, esplike etap yo klèman.
9. Si ou pa konnen yon bagay, di sa onètman.
10. Pa itilize karaktè Japonè, Chinwa oswa Koreyen sof si itilizatè a mande sa.
11. Pa pretann ou te fè yon rechèch entènèt si ou pa t fè li.
12. Pa pretann ou te kreye oswa modifye yon fichye si ou pa t fè sa.
13. Pa mande itilizatè a pataje modpas oswa kle API sekrè.
14. Lè itilizatè a voye yon imaj, analize sa ki vizib ladan l.
15. Bay repons ki itil, byen òganize, epi adapte ak kesyon an.
`;

/* =========================================================
   ENVIRONMENT VALIDATION
========================================================= */

if (!OPENAI_API_KEY) {
    console.error(
        "[CONFIG ERROR] OPENAI_API_KEY pa konfigire."
    );
}

if (!/^gpt-/i.test(OPENAI_MODEL)) {
    console.warn(
        "[CONFIG WARNING] Verifye non modèl OpenAI a."
    );
}

/* =========================================================
   HTTP SERVER
========================================================= */

const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || "";

    if (origin && !isOriginAllowed(origin)) {
        sendJSON(res, 403, {
            success: false,
            error: "Orijin sa a pa otorize."
        });
        return;
    }

    if (origin) {
        res.setHeader(
            "Access-Control-Allow-Origin",
            origin
        );

        res.setHeader("Vary", "Origin");
    }

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    res.setHeader(
        "X-Content-Type-Options",
        "nosniff"
    );

    res.setHeader(
        "Cache-Control",
        "no-store"
    );

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    const requestURL = new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
    );

    const pathname = requestURL.pathname;

    /* ---------------- HEALTH CHECK ---------------- */

    if (req.method === "GET" && pathname === "/") {
        sendJSON(res, 200, {
            success: true,
            status: "online",
            service: "SEBY AI Backend",
            provider: "OpenAI",
            model: OPENAI_MODEL,
            webSearch: ENABLE_WEB_SEARCH,
            apiKeyConfigured: Boolean(OPENAI_API_KEY),
            timestamp: new Date().toISOString()
        });

        return;
    }

    /* ---------------- API STATUS ---------------- */

    if (
        req.method === "GET" &&
        pathname === "/api/status"
    ) {
        sendJSON(res, 200, {
            success: true,
            status: "online",
            service: "SEBY AI",
            provider: "OpenAI",
            model: OPENAI_MODEL,
            webSearchEnabled: ENABLE_WEB_SEARCH,
            apiKeyConfigured: Boolean(OPENAI_API_KEY)
        });

        return;
    }

    /* ---------------- CHAT ENDPOINT ---------------- */

    if (
        req.method === "POST" &&
        pathname === "/api/chat"
    ) {
        if (!OPENAI_API_KEY) {
            sendJSON(res, 503, {
                success: false,
                error:
                    "Sèvis AI a poko konfigire. " +
                    "Administratè a dwe verifye OPENAI_API_KEY."
            });

            return;
        }

        try {
            const rawBody = await readBody(req);

            let data;

            try {
                data = JSON.parse(rawBody);
            } catch {
                sendJSON(res, 400, {
                    success: false,
                    error: "Done JSON yo pa valab."
                });

                return;
            }

            if (
                !data ||
                typeof data !== "object" ||
                Array.isArray(data)
            ) {
                sendJSON(res, 400, {
                    success: false,
                    error: "Fòma demann lan pa valab."
                });

                return;
            }

            const message =
                typeof data.message === "string"
                    ? data.message.trim()
                    : "";

            if (!message) {
                sendJSON(res, 400, {
                    success: false,
                    error: "Tanpri ekri yon mesaj."
                });

                return;
            }

            if (message.length > MAX_MESSAGE_LENGTH) {
                sendJSON(res, 413, {
                    success: false,
                    error: "Mesaj la twò long."
                });

                return;
            }

            const history = buildHistory(data.history);

            const image = validateImage(data.image);

            const input = buildInput(
                history,
                message,
                image
            );

            const useWebSearch =
                ENABLE_WEB_SEARCH &&
                shouldUseWebSearch(message);

            console.log(
                "[SEBY AI REQUEST]",
                JSON.stringify({
                    model: OPENAI_MODEL,
                    historyMessages: history.length,
                    imageAttached: Boolean(image),
                    webSearch: useWebSearch
                })
            );

            const result = await callOpenAI(
                input,
                useWebSearch
            );

            const reply = extractReply(result);

            if (!reply) {
                console.error(
                    "[OPENAI EMPTY RESPONSE]",
                    JSON.stringify({
                        status: result.status,
                        incompleteDetails:
                            result.incomplete_details || null
                    })
                );

                throw new Error(
                    "OpenAI pa retounen yon repons tèks."
                );
            }

            sendJSON(res, 200, {
                success: true,
                reply,
                provider: "OpenAI",
                model: OPENAI_MODEL,
                webSearchUsed: didUseWebSearch(result),
                sources: extractSources(result),
                usage: result.usage || null
            });

        } catch (error) {
            console.error(
                "[SEBY AI ERROR]",
                error.message
            );

            const status = Number(error.statusCode) || 500;

            sendJSON(res, status, {
                success: false,
                error: friendlyError(error)
            });
        }

        return;
    }

    /* ---------------- 404 ---------------- */

    sendJSON(res, 404, {
        success: false,
        error: "Route sa a pa egziste.",
        availableRoutes: [
            "GET /",
            "GET /api/status",
            "POST /api/chat"
        ]
    });
});

/* =========================================================
   CORS
========================================================= */

function isOriginAllowed(origin) {
    if (!origin) {
        return true;
    }

    const normalized = origin.replace(/\/+$/, "");

    return (
        FRONTEND_URL.includes(normalized) ||
        LOCAL_ORIGINS.includes(normalized)
    );
}

/* =========================================================
   WEB SEARCH DECISION
========================================================= */

function shouldUseWebSearch(message) {
    const text = String(message).toLowerCase();

    const keywords = [
        "jodi a",
        "kounye a",
        "dènye",
        "denye",
        "resan",
        "fèk soti",
        "fek soti",
        "latest",
        "today",
        "right now",
        "recent",
        "news",
        "nouvèl",
        "nouvel",
        "mizajou",
        "update",
        "pri aktyèl",
        "current price",
        "price",
        "prix",
        "2026",
        "2027",
        "ki sa ki pase",
        "kisa ki pase",
        "what happened",
        "what's happening",
        "when is",
        "kilè",
        "ki lè",
        "match",
        "score",
        "rezilta",
        "result",
        "release date",
        "released",
        "lansman",
        "disponib kounye a",
        "available now",
        "iphone",
        "samsung",
        "google",
        "openai",
        "chatgpt",
        "free fire",
        "pubg",
        "tiktok",
        "render",
        "github"
    ];

    return keywords.some(keyword =>
        text.includes(keyword)
    );
}

/* =========================================================
   OPENAI RESPONSES API
========================================================= */

function callOpenAI(input, useWebSearch) {
    return new Promise((resolve, reject) => {
        const requestData = {
            model: OPENAI_MODEL,
            instructions: SYSTEM_PROMPT,
            input,
            max_output_tokens: MAX_OUTPUT_TOKENS
        };

        if (useWebSearch) {
            requestData.tools = [
                {
                    type: "web_search"
                }
            ];
        }

        const payload = JSON.stringify(requestData);

        const request = https.request(
            {
                hostname: "api.openai.com",
                port: 443,
                path: "/v1/responses",
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization":
                        `Bearer ${OPENAI_API_KEY}`,
                    "Content-Length":
                        Buffer.byteLength(payload)
                },

                timeout: REQUEST_TIMEOUT
            },

            response => {
                let responseBody = "";
                let responseTooLarge = false;

                response.on("data", chunk => {
                    if (responseTooLarge) {
                        return;
                    }

                    responseBody += chunk.toString();

                    if (
                        Buffer.byteLength(responseBody) >
                        20 * 1024 * 1024
                    ) {
                        responseTooLarge = true;

                        request.destroy(
                            new Error(
                                "Repons API a depase limit la."
                            )
                        );
                    }
                });

                response.on("end", () => {
                    if (responseTooLarge) {
                        return;
                    }

                    let json;

                    try {
                        json = JSON.parse(responseBody);
                    } catch {
                        const error = new Error(
                            "Repons OpenAI a pa yon JSON valab."
                        );

                        error.statusCode = 502;
                        reject(error);

                        return;
                    }

                    if (
                        response.statusCode < 200 ||
                        response.statusCode >= 300
                    ) {
                        const apiMessage =
                            json?.error?.message ||
                            `OpenAI HTTP ${response.statusCode}`;

                        const error = new Error(apiMessage);

                        error.statusCode = response.statusCode;

                        reject(error);

                        return;
                    }

                    resolve(json);
                });
            }
        );

        request.setTimeout(REQUEST_TIMEOUT, () => {
            const error = new Error(
                "Demann OpenAI a pran twòp tan."
            );

            error.code = "ETIMEDOUT";

            request.destroy(error);
        });

        request.on("error", reject);

        request.end(payload);
    });
}

/* =========================================================
   IMAGE VALIDATION
========================================================= */

function validateImage(image) {
    if (image === undefined || image === null || image === "") {
        return null;
    }

    if (typeof image !== "string") {
        const error = new Error(
            "Fòma imaj la pa valab."
        );

        error.statusCode = 400;

        throw error;
    }

    const match = image.match(
        /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/i
    );

    if (!match) {
        const error = new Error(
            "Voye yon imaj PNG, JPEG, WEBP oswa GIF ki gen fòma data URL."
        );

        error.statusCode = 400;

        throw error;
    }

    if (image.length > MAX_IMAGE_LENGTH) {
        const error = new Error(
            "Imaj la twò gwo."
        );

        error.statusCode = 413;

        throw error;
    }

    return image;
}

/* =========================================================
   BUILD OPENAI INPUT
========================================================= */

function buildInput(history, message, image) {
    const input = history.map(item => ({
        role: item.role,
        content: item.content
    }));

    if (image) {
        input.push({
            role: "user",

            content: [
                {
                    type: "input_text",
                    text: message
                },
                {
                    type: "input_image",
                    image_url: image,
                    detail: "auto"
                }
            ]
        });
    } else {
        input.push({
            role: "user",
            content: message
        });
    }

    return input;
}

/* =========================================================
   CONVERSATION HISTORY
========================================================= */

function buildHistory(history) {
    if (!Array.isArray(history)) {
        return [];
    }

    return history
        .slice(-MAX_HISTORY)

        .filter(item =>
            item &&
            ["user", "assistant"].includes(item.role) &&
            typeof item.content === "string" &&
            item.content.trim().length > 0
        )

        .map(item => ({
            role: item.role,

            content: item.content
                .slice(0, 20000)
        }));
}

/* =========================================================
   EXTRACT RESPONSE TEXT
========================================================= */

function extractReply(data) {
    if (
        typeof data?.output_text === "string" &&
        data.output_text.trim()
    ) {
        return data.output_text.trim();
    }

    const parts = [];

    for (const item of data?.output || []) {
        if (item.type !== "message") {
            continue;
        }

        for (const content of item.content || []) {
            if (
                content.type === "output_text" &&
                typeof content.text === "string"
            ) {
                parts.push(content.text);
            }
        }
    }

    return parts.join("\n").trim();
}

/* =========================================================
   CHECK ACTUAL WEB SEARCH USE
========================================================= */

function didUseWebSearch(data) {
    return (data?.output || []).some(item =>
        item.type === "web_search_call"
    );
}

/* =========================================================
   EXTRACT WEB SOURCES
========================================================= */

function extractSources(data) {
    const sources = [];
    const seen = new Set();

    for (const item of data?.output || []) {
        for (const content of item.content || []) {
            for (const annotation of content.annotations || []) {
                if (
                    annotation.type !== "url_citation" ||
                    !annotation.url ||
                    seen.has(annotation.url)
                ) {
                    continue;
                }

                seen.add(annotation.url);

                sources.push({
                    title:
                        annotation.title ||
                        annotation.url,

                    url: annotation.url
                });
            }
        }
    }

    return sources.slice(0, 8);
}

/* =========================================================
   SAFE ERROR MESSAGES
========================================================= */

function friendlyError(error) {
    const message = String(error.message || "");
    const lower = message.toLowerCase();
    const status = error.statusCode;

    if (
        error.code === "ETIMEDOUT" ||
        lower.includes("timeout") ||
        lower.includes("twòp tan")
    ) {
        return (
            "SEBY AI pran twòp tan pou reponn. " +
            "Tanpri eseye ankò."
        );
    }

    if (status === 400) {
        return (
            "Gen yon pwoblèm nan demann lan. " +
            "Verifye mesaj la, imaj la oswa paramèt API yo."
        );
    }

    if (status === 401) {
        return (
            "Kle API a pa valab. " +
            "Verifye OPENAI_API_KEY sou Render."
        );
    }

    if (status === 403) {
        return (
            "Kont API a pa gen otorizasyon pou demann sa a. " +
            "Verifye aksè modèl la ak zouti yo."
        );
    }

    if (status === 404) {
        return (
            "Modèl la oswa resous la pa disponib. " +
            "Verifye OPENAI_MODEL sou Render."
        );
    }

    if (status === 413) {
        return "Demann lan oswa imaj la twò gwo.";
    }

    if (status === 429) {
        return (
            "Limit API a rive oswa kont lan pa gen kredi disponib. " +
            "Verifye quota ak billing OpenAI ou."
        );
    }

    if (status === 500 || status === 502 || status === 503) {
        return (
            "Sèvis OpenAI a rankontre yon pwoblèm. " +
            "Eseye ankò pita."
        );
    }

    console.error(
        "[ERROR DETAILS]",
        message
    );

    return (
        "SEBY AI pa kapab reponn kounye a. " +
        "Eseye ankò pita."
    );
}

/* =========================================================
   READ REQUEST BODY
========================================================= */

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        let size = 0;
        let finished = false;

        req.on("data", chunk => {
            if (finished) {
                return;
            }

            size += chunk.length;

            if (size > MAX_BODY_SIZE) {
                finished = true;

                const error = new Error(
                    "Demann lan depase limit gwosè a."
                );

                error.statusCode = 413;

                reject(error);

                req.destroy();

                return;
            }

            body += chunk.toString("utf8");
        });

        req.on("end", () => {
            if (!finished) {
                finished = true;
                resolve(body);
            }
        });

        req.on("error", error => {
            if (!finished) {
                finished = true;
                reject(error);
            }
        });
    });
}

/* =========================================================
   OPTIONAL .ENV LOADER
========================================================= */

function loadEnvFile() {
    const envPath = path.join(__dirname, ".env");

    if (!fs.existsSync(envPath)) {
        return;
    }

    try {
        const content = fs.readFileSync(
            envPath,
            "utf8"
        );

        for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();

            if (
                !trimmed ||
                trimmed.startsWith("#")
            ) {
                continue;
            }

            const equal = trimmed.indexOf("=");

            if (equal < 1) {
                continue;
            }

            const key = trimmed
                .slice(0, equal)
                .trim();

            let value = trimmed
                .slice(equal + 1)
                .trim();

            if (
                (value.startsWith('"') &&
                 value.endsWith('"')) ||

                (value.startsWith("'") &&
                 value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }

            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
    } catch (error) {
        console.error(
            "[ENV ERROR]",
            error.message
        );
    }
}

/* =========================================================
   JSON RESPONSE
========================================================= */

function sendJSON(res, statusCode, data) {
    if (res.writableEnded || res.destroyed) {
        return;
    }

    const payload = JSON.stringify(data);

    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(payload)
    });

    res.end(payload);
}

/* =========================================================
   START SERVER
========================================================= */

server.listen(PORT, HOST, () => {
    console.log("======================================");
    console.log("       SEBY AI BACKEND ONLINE");
    console.log("======================================");

    console.log(`Host: ${HOST}`);
    console.log(`Port: ${PORT}`);
    console.log(`Provider: OpenAI`);
    console.log(`Model: ${OPENAI_MODEL}`);
    console.log(`Web Search: ${ENABLE_WEB_SEARCH}`);
    console.log(
        `API Key: ${OPENAI_API_KEY ? "CONFIGURED" : "MISSING"}`
    );

    console.log("======================================");
});

/* =========================================================
   SERVER ERRORS + GRACEFUL SHUTDOWN
========================================================= */

server.on("error", error => {
    console.error(
        "[SERVER ERROR]",
        error.message
    );
});

function shutdown(signal) {
    console.log(
        `[SERVER] ${signal} received. Closing server...`
    );

    server.close(error => {
        if (error) {
            console.error(
                "[SHUTDOWN ERROR]",
                error.message
            );

            process.exitCode = 1;
        }

        process.exit();
    });

    setTimeout(() => {
        console.error(
            "[SERVER] Forced shutdown after timeout."
        );

        process.exit(1);
    }, 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
/* =========================================================
   CHAT HANDLER
========================================================= */

async function handleChat(req, res) {
    if (!OPENAI_API_KEY) {
        sendJSON(res, 503, {
            success: false,
            error:
                "SEBY AI poko konfigire. " +
                "Administratè a dwe verifye OPENAI_API_KEY."
        });
        return;
    }

    try {
        const rawBody = await readBody(req);

        let data;

        try {
            data = JSON.parse(rawBody);
        } catch {
            sendJSON(res, 400, {
                success: false,
                error: "Done JSON yo pa valab."
            });
            return;
        }

        if (
            !data ||
            typeof data !== "object" ||
            Array.isArray(data)
        ) {
            sendJSON(res, 400, {
                success: false,
                error: "Fòma demann lan pa valab."
            });
            return;
        }

        const message =
            typeof data.message === "string"
                ? data.message.trim()
                : "";

        if (!message) {
            sendJSON(res, 400, {
                success: false,
                error: "Tanpri ekri yon mesaj."
            });
            return;
        }

        if (message.length > MAX_MESSAGE_LENGTH) {
            sendJSON(res, 413, {
                success: false,
                error: "Mesaj la twò long."
            });
            return;
        }

        const history = buildHistory(data.history);
        const image = validateImage(data.image);

        const input = buildInput(
            history,
            message,
            image
        );

        /*
         * Rechèch entènèt disponib lè li aktive
         * sou sèvè a. Modèl la ka deside si li
         * nesesè pou chak kesyon.
         */
        const useWebSearch =
            ENABLE_WEB_SEARCH &&
            data.webSearch !== false;

        console.log(
            "[SEBY AI REQUEST]",
            JSON.stringify({
                model: OPENAI_MODEL,
                historyMessages: history.length,
                imageAttached: Boolean(image),
                webSearchAvailable: useWebSearch
            })
        );

        const result = await callOpenAI(
            input,
            useWebSearch
        );

        const reply = extractReply(result);

        if (!reply) {
            console.error(
                "[OPENAI EMPTY RESPONSE]",
                JSON.stringify({
                    status: result.status,
                    incompleteDetails:
                        result.incomplete_details || null
                })
            );

            throw new Error(
                "OpenAI pa retounen yon repons tèks."
            );
        }

        sendJSON(res, 200, {
            success: true,
            reply,
            provider: "OpenAI",
            model: OPENAI_MODEL,
            webSearchUsed: didUseWebSearch(result),
            sources: extractSources(result),
            usage: result.usage || null
        });

    } catch (error) {
        console.error(
            "[SEBY AI ERROR]",
            error.message
        );

        const status = Number(error.statusCode) || 500;

        if (!res.writableEnded && !res.destroyed) {
            sendJSON(res, status, {
                success: false,
                error: friendlyError(error)
            });
        }
    }
}

/* =========================================================
   OPENAI RESPONSES API
========================================================= */

function callOpenAI(input, useWebSearch) {
    return new Promise((resolve, reject) => {
        const requestData = {
            model: OPENAI_MODEL,
            instructions: SYSTEM_PROMPT,
            input,
            max_output_tokens: MAX_OUTPUT_TOKENS
        };

        if (useWebSearch) {
            requestData.tools = [
                {
                    type: "web_search"
                }
            ];
        }

        const payload = JSON.stringify(requestData);

        const request = https.request(
            {
                hostname: "api.openai.com",
                port: 443,
                path: "/v1/responses",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization":
                        `Bearer ${OPENAI_API_KEY}`,
                    "Content-Length":
                        Buffer.byteLength(payload)
                },
                timeout: REQUEST_TIMEOUT
            },
            response => {
                let responseBody = "";
                let responseTooLarge = false;

                response.on("data", chunk => {
                    if (responseTooLarge) {
                        return;
                    }

                    responseBody += chunk.toString();

                    if (
                        Buffer.byteLength(responseBody) >
                        20 * 1024 * 1024
                    ) {
                        responseTooLarge = true;

                        request.destroy(
                            new Error(
                                "Repons API a depase limit la."
                            )
                        );
                    }
                });

                response.on("end", () => {
                    if (responseTooLarge) {
                        return;
                    }

                    let json;

                    try {
                        json = JSON.parse(responseBody);
                    } catch {
                        const error = new Error(
                            "Repons OpenAI a pa yon JSON valab."
                        );

                        error.statusCode = 502;
                        reject(error);
                        return;
                    }

                    if (
                        response.statusCode < 200 ||
                        response.statusCode >= 300
                    ) {
                        const apiMessage =
                            json?.error?.message ||
                            `OpenAI HTTP ${response.statusCode}`;

                        const error = new Error(apiMessage);

                        error.statusCode = response.statusCode;

                        reject(error);
                        return;
                    }

                    resolve(json);
                });
            }
        );

        request.setTimeout(REQUEST_TIMEOUT, () => {
            const error = new Error(
                "Demann OpenAI a pran twòp tan."
            );

            error.code = "ETIMEDOUT";
            request.destroy(error);
        });

        request.on("error", reject);

        request.end(payload);
    });
}

/* =========================================================
   BUILD OPENAI INPUT
========================================================= */

function buildInput(history, message, image) {
    const input = history.map(item => ({
        role: item.role,
        content: item.content
    }));

    if (image) {
        input.push({
            role: "user",
            content: [
                {
                    type: "input_text",
                    text: message
                },
                {
                    type: "input_image",
                    image_url: image,
                    detail: "auto"
                }
            ]
        });
    } else {
        input.push({
            role: "user",
            content: message
        });
    }

    return input;
}

/* =========================================================
   CONVERSATION HISTORY
========================================================= */

function buildHistory(history) {
    if (!Array.isArray(history)) {
        return [];
    }

    return history
        .slice(-MAX_HISTORY)
        .filter(item =>
            item &&
            ["user", "assistant"].includes(item.role) &&
            typeof item.content === "string" &&
            item.content.trim().length > 0
        )
        .map(item => ({
            role: item.role,
            content: item.content.slice(0, 20000)
        }));
}

/* =========================================================
   EXTRACT RESPONSE TEXT
========================================================= */

function extractReply(data) {
    if (
        typeof data?.output_text === "string" &&
        data.output_text.trim()
    ) {
        return data.output_text.trim();
    }

    const parts = [];

    for (const item of data?.output || []) {
        if (item.type !== "message") {
            continue;
        }

        for (const content of item.content || []) {
            if (
                content.type === "output_text" &&
                typeof content.text === "string"
            ) {
                parts.push(content.text);
            }
        }
    }

    return parts.join("\n").trim();
}

/* =========================================================
   WEB SEARCH DETECTION
========================================================= */

function didUseWebSearch(data) {
    return (data?.output || []).some(item =>
        item.type === "web_search_call"
    );
}

/* =========================================================
   EXTRACT WEB SOURCES
========================================================= */

function extractSources(data) {
    const sources = [];
    const seen = new Set();

    for (const item of data?.output || []) {
        for (const content of item.content || []) {
            for (const annotation of content.annotations || []) {
                if (
                    annotation.type !== "url_citation" ||
                    !annotation.url ||
                    seen.has(annotation.url)
                ) {
                    continue;
                }

                seen.add(annotation.url);

                sources.push({
                    title:
                        annotation.title ||
                        annotation.url,
                    url: annotation.url
                });
            }
        }
    }

    return sources.slice(0, 8);
}
/* =========================================================
   IMAGE VALIDATION
========================================================= */

function validateImage(image) {
    if (
        image === undefined ||
        image === null ||
        image === ""
    ) {
        return null;
    }

    if (typeof image !== "string") {
        const error = new Error(
            "Fòma imaj la pa valab."
        );

        error.statusCode = 400;
        throw error;
    }

    const match = image.match(
        /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/i
    );

    if (!match) {
        const error = new Error(
            "Voye yon imaj PNG, JPEG, WEBP oswa GIF " +
            "ki gen fòma data URL."
        );

        error.statusCode = 400;
        throw error;
    }

    if (image.length > MAX_IMAGE_LENGTH) {
        const error = new Error(
            "Imaj la twò gwo."
        );

        error.statusCode = 413;
        throw error;
    }

    return image;
}

/* =========================================================
   CORS
========================================================= */

function isOriginAllowed(origin) {
    if (!origin) {
        return true;
    }

    const normalized = origin.replace(/\/+$/, "");

    return (
        FRONTEND_URL.includes(normalized) ||
        LOCAL_ORIGINS.includes(normalized)
    );
}

/* =========================================================
   SAFE ERROR MESSAGES
========================================================= */

function friendlyError(error) {
    const message = String(error.message || "");
    const lower = message.toLowerCase();
    const status = error.statusCode;

    if (
        error.code === "ETIMEDOUT" ||
        lower.includes("timeout") ||
        lower.includes("twòp tan")
    ) {
        return (
            "SEBY AI pran twòp tan pou reponn. " +
            "Tanpri eseye ankò."
        );
    }

    if (status === 400) {
        return (
            "Gen yon pwoblèm nan demann lan. " +
            "Verifye mesaj la, imaj la oswa paramèt API yo."
        );
    }

    if (status === 401) {
        return (
            "Kle API a pa valab. " +
            "Verifye OPENAI_API_KEY sou Render."
        );
    }

    if (status === 403) {
        return (
            "Kont API a pa gen otorizasyon pou demann sa a. " +
            "Verifye aksè modèl la ak zouti yo."
        );
    }

    if (status === 404) {
        return (
            "Modèl la oswa resous la pa disponib. " +
            "Verifye OPENAI_MODEL sou Render."
        );
    }

    if (status === 413) {
        return "Demann lan oswa imaj la twò gwo.";
    }

    if (status === 429) {
        return (
            "Limit API a rive oswa pa gen kredi disponib. " +
            "Verifye limit ak billing OpenAI ou."
        );
    }

    if (
        status === 500 ||
        status === 502 ||
        status === 503
    ) {
        return (
            "Sèvis OpenAI a rankontre yon pwoblèm. " +
            "Eseye ankò pita."
        );
    }

    console.error(
        "[ERROR DETAILS]",
        message
    );

    return (
        "SEBY AI pa kapab reponn kounye a. " +
        "Eseye ankò pita."
    );
}

/* =========================================================
   READ REQUEST BODY
========================================================= */

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        let size = 0;
        let finished = false;

        req.on("data", chunk => {
            if (finished) {
                return;
            }

            size += chunk.length;

            if (size > MAX_BODY_SIZE) {
                finished = true;

                const error = new Error(
                    "Demann lan depase limit gwosè a."
                );

                error.statusCode = 413;
                reject(error);
                req.destroy();
                return;
            }

            body += chunk.toString("utf8");
        });

        req.on("end", () => {
            if (!finished) {
                finished = true;
                resolve(body);
            }
        });

        req.on("error", error => {
            if (!finished) {
                finished = true;
                reject(error);
            }
        });
    });
}

/* =========================================================
   OPTIONAL .ENV LOADER
========================================================= */

function loadEnvFile() {
    const envPath = path.join(__dirname, ".env");

    if (!fs.existsSync(envPath)) {
        return;
    }

    try {
        const content = fs.readFileSync(
            envPath,
            "utf8"
        );

        for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();

            if (
                !trimmed ||
                trimmed.startsWith("#")
            ) {
                continue;
            }

            const equal = trimmed.indexOf("=");

            if (equal < 1) {
                continue;
            }

            const key = trimmed
                .slice(0, equal)
                .trim();

            let value = trimmed
                .slice(equal + 1)
                .trim();

            if (
                (value.startsWith('"') &&
                 value.endsWith('"')) ||
                (value.startsWith("'") &&
                 value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }

            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
    } catch (error) {
        console.error(
            "[ENV ERROR]",
            error.message
        );
    }
}

/* =========================================================
   JSON RESPONSE
========================================================= */

function sendJSON(res, statusCode, data) {
    if (res.writableEnded || res.destroyed) {
        return;
    }

    const payload = JSON.stringify(data);

    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(payload)
    });

    res.end(payload);
}
/* =========================================================
   START SERVER
========================================================= */

server.listen(PORT, HOST, () => {
    console.log("======================================");
    console.log("       SEBY AI BACKEND ONLINE");
    console.log("======================================");

    console.log(`Host: ${HOST}`);
    console.log(`Port: ${PORT}`);
    console.log("Provider: OpenAI");
    console.log(`Model: ${OPENAI_MODEL}`);
    console.log(`Web Search: ${ENABLE_WEB_SEARCH}`);

    console.log(
        `API Key: ${
            OPENAI_API_KEY
                ? "CONFIGURED"
                : "MISSING"
        }`
    );

    console.log("======================================");
});

/* =========================================================
   SERVER ERRORS
========================================================= */

server.on("error", error => {
    console.error(
        "[SERVER ERROR]",
        error.message
    );
});

/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

function shutdown(signal) {
    console.log(
        `[SERVER] ${signal} received. Closing server...`
    );

    server.close(error => {
        if (error) {
            console.error(
                "[SHUTDOWN ERROR]",
                error.message
            );

            process.exitCode = 1;
        }

        process.exit();
    });

    setTimeout(() => {
        console.error(
            "[SERVER] Forced shutdown after timeout."
        );

        process.exit(1);
    }, 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));