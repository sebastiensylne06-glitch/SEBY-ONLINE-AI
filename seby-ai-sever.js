
/* =========================================================
   SEBY AI - BACKEND FINAL
   OpenAI Responses API + Web Search + Images
   Compatible with Render and local Node.js
========================================================= */

"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

/* =========================================================
   CONFIGURATION
========================================================= */

loadEnvFile();

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT) || 3001;

const OPENAI_API_KEY =
    process.env.OPENAI_API_KEY || "";

const OPENAI_MODEL =
    process.env.OPENAI_MODEL || "gpt-4.1-mini";

const ENABLE_WEB_SEARCH =
    process.env.ENABLE_WEB_SEARCH !== "false";

const MAX_BODY_SIZE = 15 * 1024 * 1024;
const MAX_HISTORY = 20;
const REQUEST_TIMEOUT = 90000;

const ALLOWED_ORIGINS = (
    process.env.FRONTEND_URL || ""
)
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

const LOCAL_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001"
];

const SYSTEM_PROMPT = `
Ou se SEBY AI, yon asistan entèlijan.

LANG:
- Reponn an kreyòl ayisyen si itilizatè a ekri kreyòl.
- Reponn an franse si itilizatè a ekri franse.
- Reponn an anglè si itilizatè a ekri anglè.
- Si itilizatè a melanje lang, sèvi ak lang ki domine a.

RÈG:
1. Reponn kesyon itilizatè a dirèkteman.
2. Pa envante enfòmasyon.
3. Pou enfòmasyon aktyèl, sèvi ak rechèch entènèt lè zouti a disponib.
4. Pa prezante enfòmasyon ansyen kòm si yo aktyèl.
5. Sèvi ak istwa konvèsasyon an sèlman lè li itil.
6. Bay repons klè, natirèl, epi adapte ak kesyon an.
7. Pou matematik, verifye rezilta yo.
8. Pou kesyon akademik, esplike etap yo fasil pou konprann.
9. Si ou pa konnen yon bagay, di sa klèman.
10. Pa itilize karaktè Japonè, Chinwa oswa Koreyen sof si itilizatè a mande sa.
`;

/* =========================================================
   ENVIRONMENT VALIDATION
========================================================= */

if (!OPENAI_API_KEY) {
    console.error(
        "ERÈ: Mete OPENAI_API_KEY nan Environment Variables."
    );
}

/* =========================================================
   HTTP SERVER
========================================================= */

const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || "";

    const allowed =
        !origin ||
        ALLOWED_ORIGINS.includes(origin) ||
        LOCAL_ORIGINS.includes(origin);

    if (origin && allowed) {
        res.setHeader(
            "Access-Control-Allow-Origin",
            origin
        );

        res.setHeader(
            "Vary",
            "Origin"
        );
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
        "Content-Type",
        "application/json; charset=utf-8"
    );

    res.setHeader(
        "X-Content-Type-Options",
        "nosniff"
    );

    if (!allowed) {
        sendJSON(res, 403, {
            success: false,
            error: "Orijin sa a pa otorize."
        });
        return;
    }

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    /* HEALTH CHECK */

    if (req.method === "GET" && req.url === "/") {
        sendJSON(res, 200, {
            success: true,
            status: "online",
            service: "SEBY AI Backend",
            provider: "OpenAI",
            model: OPENAI_MODEL,
            webSearch: ENABLE_WEB_SEARCH
        });
        return;
    }

    /* CHAT ENDPOINT */

    if (req.method === "POST" && req.url === "/api/chat") {
        if (!OPENAI_API_KEY) {
            sendJSON(res, 503, {
                success: false,
                error: "Sèvis AI a poko konfigire sou sèvè a."
            });
            return;
        }

        try {
            const body = await readBody(req);
            let data;

            try {
                data = JSON.parse(body);
            } catch {
                sendJSON(res, 400, {
                    success: false,
                    error: "Demann JSON lan pa valid."
                });
                return;
            }

            const message = String(
                data.message || ""
            ).trim();

            if (!message) {
                sendJSON(res, 400, {
                    success: false,
                    error: "Tanpri ekri yon mesaj."
                });
                return;
            }

            if (message.length > 50000) {
                sendJSON(res, 413, {
                    success: false,
                    error: "Mesaj la twò long."
                });
                return;
            }

            const history = buildHistory(data.history);

            const input = buildInput(
                history,
                message,
                data.image
            );

            const useWebSearch =
                ENABLE_WEB_SEARCH &&
                shouldUseWebSearch(message);

            console.log(
                `[SEBY AI] Model=${OPENAI_MODEL} ` +
                `History=${history.length} ` +
                `Image=${Boolean(data.image)} ` +
                `WebSearch=${useWebSearch}`
            );

            const result = await callOpenAI(
                input,
                useWebSearch
            );

            const reply = extractReply(result);

            if (!reply) {
                throw new Error(
                    "Modèl la pa retounen yon repons tèks."
                );
            }

            sendJSON(res, 200, {
                success: true,
                reply,
                provider: "OpenAI",
                model: OPENAI_MODEL,
                webSearchUsed: useWebSearch,
                sources: extractSources(result)
            });

        } catch (error) {
            console.error(
                "[SEBY AI ERROR]",
                error.message
            );

            const status = error.statusCode || 500;

            sendJSON(res, status, {
                success: false,
                error: friendlyError(error)
            });
        }

        return;
    }

    sendJSON(res, 404, {
        success: false,
        error: "Route sa a pa egziste."
    });
});

/* =========================================================
   WEB SEARCH DECISION
========================================================= */

function shouldUseWebSearch(message) {
    const text = String(message).toLowerCase();

    const keywords = [
        "jodi a", "kounye a", "dènye", "denye",
        "resan", "fèk soti", "fek soti",
        "latest", "today", "right now", "recent",
        "news", "nouvèl", "nouvel", "mizajou",
        "update", "pri aktyèl", "current price",
        "price", "prix", "2026", "2027",
        "ki sa ki pase", "kisa ki pase",
        "what happened", "what's happening",
        "ki lè", "kilè", "when is",
        "match", "score", "rezilta", "result",
        "release date", "released", "lansman",
        "disponib kounye a", "available now",
        "iphone", "samsung", "google",
        "openai", "chatgpt", "free fire",
        "pubg", "tiktok", "render", "github"
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
            max_output_tokens: 2500
        };

        if (useWebSearch) {
            requestData.tools = [
                { type: "web_search" }
            ];
        }

        const payload = JSON.stringify(requestData);

        const request = https.request({
            hostname: "api.openai.com",
            path: "/v1/responses",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`,
                "Content-Length": Buffer.byteLength(payload)
            },
            timeout: REQUEST_TIMEOUT
        }, response => {
            let responseBody = "";

            response.on("data", chunk => {
                responseBody += chunk.toString();

                if (responseBody.length > 20 * 1024 * 1024) {
                    request.destroy(
                        new Error("Repons API a twò gwo.")
                    );
                }
            });

            response.on("end", () => {
                let json;

                try {
                    json = JSON.parse(responseBody);
                } catch {
                    reject(new Error(
                        "Repons OpenAI a pa yon JSON valab."
                    ));
                    return;
                }

                if (
                    response.statusCode < 200 ||
                    response.statusCode >= 300
                ) {
                    const err = new Error(
                        json?.error?.message ||
                        `OpenAI HTTP ${response.statusCode}`
                    );

                    err.statusCode = response.statusCode;
                    reject(err);
                    return;
                }

                resolve(json);
            });
        });

        request.setTimeout(REQUEST_TIMEOUT, () => {
            request.destroy(
                new Error("Demann OpenAI a pran twòp tan.")
            );
        });

        request.on("error", reject);
        request.end(payload);
        request.write?.("");
    });
}

/* =========================================================
   INPUT + IMAGE SUPPORT
========================================================= */

function buildInput(history, message, image) {
    const input = history.map(item => ({
        role: item.role,
        content: item.content
    }));

    if (
        typeof image === "string" &&
        /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(image)
    ) {
        input.push({
            role: "user",
            content: [
                {
                    type: "input_text",
                    text: message
                },
                {
                    type: "input_image",
                    image_url: image
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
            item.content.trim()
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
    if (typeof data?.output_text === "string") {
        return data.output_text.trim();
    }

    const parts = [];

    for (const item of data?.output || []) {
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
                    title: annotation.title || annotation.url,
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
    const status = error.statusCode;

    if (status === 401) {
        return "Kle API a pa valid. Verifye OPENAI_API_KEY sou Render.";
    }

    if (status === 403) {
        return "Kont API a pa gen otorizasyon pou demann sa a.";
    }

    if (status === 404) {
        return "Modèl la pa disponib. Verifye OPENAI_MODEL sou Render.";
    }

    if (status === 429) {
        return "Limit API a rive. Verifye quota ak billing OpenAI ou.";
    }

    if (
        message.toLowerCase().includes("timeout") ||
        message.toLowerCase().includes("twòp tan")
    ) {
        return "SEBY AI pran twòp tan pou reponn. Eseye ankò.";
    }

    return "SEBY AI pa kapab reponn kounye a. Eseye ankò pita.";
}

/* =========================================================
   REQUEST BODY READER
========================================================= */

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        let finished = false;

        req.on("data", chunk => {
            if (finished) return;

            body += chunk.toString();

            if (Buffer.byteLength(body) > MAX_BODY_SIZE) {
                finished = true;

                const error = new Error(
                    "Demann lan depase limit gwosè a."
                );

                error.statusCode = 413;
                reject(error);
                req.destroy();
            }
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
   OPTIONAL LOCAL .ENV LOADER
   Render sèvi ak Environment Variables li yo.
========================================================= */

function loadEnvFile() {
    const envPath = path.join(__dirname, ".env");

    if (!fs.existsSync(envPath)) {
        return;
    }

    const content = fs.readFileSync(envPath, "utf8");

    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }

        const equal = trimmed.indexOf("=");

        if (equal < 1) {
            continue;
        }

        const key = trimmed.slice(0, equal).trim();

        let value = trimmed.slice(equal + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
}

/* =========================================================
   JSON RESPONSE
========================================================= */

function sendJSON(res, statusCode, data) {
    if (res.writableEnded || res.destroyed) {
        return;
    }

    res.writeHead(statusCode);
    res.end(JSON.stringify(data));
}

/* =========================================================
   START SERVER
========================================================= */

server.listen(PORT, HOST, () => {
    console.log("==================================");
    console.log("       SEBY AI BACKEND ONLINE");
    console.log("==================================");
    console.log(`Host: ${HOST}`);
    console.log(`Port: ${PORT}`);
    console.log(`Provider: OpenAI`);
    console.log(`Model: ${OPENAI_MODEL}`);
    console.log(`Web Search: ${ENABLE_WEB_SEARCH}`);
    console.log(
        `API Key: ${OPENAI_API_KEY ? "CONFIGURED" : "MISSING"}`
    );
    console.log("==================================");
});

server.on("error", error => {
    console.error("[SERVER ERROR]", error.message);
});

process.on("SIGTERM", () => {
    server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
    server.close(() => process.exit(0));
});
