"use strict";


/* =========================
   HELPERS
========================= */

const $ = id =>
    document.getElementById(id);


const get = (key, defaultValue) =>
    localStorage.getItem(key) ?? defaultValue;


const set = (key, value) =>
    localStorage.setItem(key, value);


const json = (key, defaultValue) => {

    try {

        return JSON.parse(
            localStorage.getItem(key)
        ) ?? defaultValue;

    } catch (error) {

        return defaultValue;

    }

};


/* =========================
   USERS
========================= */

let users = json(
    "seby_admin_users",
    [
        {
            id: 1,
            name: "Seby",
            email: "seby@example.com",
            status: "Actif"
        },

        {
            id: 2,
            name: "Utilisateur Demo",
            email: "user@example.com",
            status: "Actif"
        }
    ]
);


/* =========================
   START
========================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        if (
            get(
                "seby_admin_session",
                ""
            ) === "1"
        ) {

            showApp();

        } else {

            showLogin();

        }


        bind();

        render();

    }
);


/* =========================
   LOGIN
========================= */

function showLogin() {

    $("login")
        .classList
        .remove("hidden");


    $("app")
        .classList
        .add("hidden");

}


function showApp() {

    $("login")
        .classList
        .add("hidden");


    $("app")
        .classList
        .remove("hidden");


    $("adminName")
        .textContent =
            get(
                "seby_admin_name",
                "Administrateur"
            );


    $("nameInput")
        .value =
            get(
                "seby_admin_name",
                "Administrateur"
            );

}


/* =========================
   EVENTS
========================= */

function bind() {


    /* LOGIN */

    $("loginForm").onsubmit =
        event => {

            event.preventDefault();


            if (
                !$("email").value ||
                !$("password").value
            ) {

                $("error")
                    .textContent =
                        "Remplissez les champs.";

                return;

            }


            set(
                "seby_admin_session",
                "1"
            );


            showApp();


            toast(
                "Connexion réussie."
            );

        };


    /* LOGOUT */

    $("logout").onclick =
        () => {

            localStorage.removeItem(
                "seby_admin_session"
            );


            showLogin();

        };


    /* MOBILE MENU */

    $("menu").onclick =
        () => {

            $("side")
                .classList
                .add("open");

        };


    $("close").onclick =
        () => {

            $("side")
                .classList
                .remove("open");

        };


    /* REFRESH */

    $("refresh").onclick =
        () => {

            render();

            toast(
                "Actualisé."
            );

        };


    /* NAVIGATION */

    document
        .querySelectorAll(".nav")
        .forEach(button => {

            button.onclick =
                () => {

                    page(
                        button.dataset.page
                    );

                };

        });


    /* SEARCH */

    $("search").oninput =
        renderUsers;


    /* ADD USER */

    $("addUser").onclick =
        () => {

            $("modal")
                .classList
                .remove("hidden");


            $("newName").focus();

        };


    /* CLOSE MODAL */

    $("modalClose").onclick =
        () => {

            $("modal")
                .classList
                .add("hidden");

        };


    /* ADD USER FORM */

    $("userForm").onsubmit =
        event => {

            event.preventDefault();


            users.push({

                id: Date.now(),

                name:
                    $("newName")
                        .value,

                email:
                    $("newEmail")
                        .value,

                status:
                    "Actif"

            });


            localStorage.setItem(
                "seby_admin_users",
                JSON.stringify(users)
            );


            $("userForm").reset();


            $("modal")
                .classList
                .add("hidden");


            renderUsers();

            update();


            toast(
                "Utilisateur ajouté."
            );

        };


    /* CLEAR CHATS */

    $("clearChats").onclick =
        () => {

            if (
                confirm(
                    "Effacer l'historique local ?"
                )
            ) {

                localStorage.removeItem(
                    "seby_ai_messages"
                );


                renderChats();

                update();


                toast(
                    "Historique effacé."
                );

            }

        };


    /* SAVE ADMIN NAME */

    $("saveName").onclick =
        () => {

            let name =
                $("nameInput")
                    .value
                    .trim()
                ||
                "Administrateur";


            set(
                "seby_admin_name",
                name
            );


            $("adminName")
                .textContent =
                    name;


            toast(
                "Nom enregistré."
            );

        };


    /* NOTIFICATION */

    $("saveNotify").onclick =
        () => {

            let title =
                $("ntitle")
                    .value
                    .trim();


            let message =
                $("nmsg")
                    .value
                    .trim();


            if (
                !title ||
                !message
            ) {

                toast(
                    "Remplissez les deux champs."
                );

                return;

            }


            localStorage.setItem(

                "seby_admin_notification",

                JSON.stringify({

                    n: title,

                    m: message

                })

            );


            renderPreview();


            toast(
                "Notification enregistrée."
            );

        };


    /* AI */

    $("aiEnabled").onchange =
        () => {

            set(
                "seby_ai_enabled",
                $("aiEnabled").checked
            );

        };


    $("voice").onchange =
        () => {

            set(
                "seby_ai_voice",
                $("voice").checked
            );

        };

}


/* =========================
   PAGE NAVIGATION
========================= */

function page(name) {

    document
        .querySelectorAll(".page")
        .forEach(section => {

            section
                .classList
                .remove("active");

        });


    document
        .querySelectorAll(".nav")
        .forEach(button => {

            button
                .classList
                .toggle(
                    "active",
                    button.dataset.page === name
                );

        });


    $(name)
        .classList
        .add("active");


    const titles = {

        dashboard: [
            "Dashboard",
            "Vue générale de SEBY AI"
        ],

        users: [
            "Utilisateurs",
            "Gestion des comptes"
        ],

        chats: [
            "Conversations",
            "Historique des échanges"
        ],

        ai: [
            "SEBY AI",
            "Configuration de l'assistant"
        ],

        notify: [
            "Notifications",
            "Messages utilisateurs"
        ],

        settings: [
            "Paramètres",
            "Configuration admin"
        ]

    };


    $("title")
        .textContent =
            titles[name][0];


    $("subtitle")
        .textContent =
            titles[name][1];


    $("side")
        .classList
        .remove("open");

}


/* =========================
   RENDER
========================= */

function render() {

    renderUsers();

    renderChats();

    renderActivity();

    renderPreview();

    update();

}


/* =========================
   UPDATE STATS
========================= */

function update() {

    let messages =
        json(
            "seby_ai_messages",
            []
        );


    $("usersCount")
        .textContent =
            users.length;


    $("msgCount")
        .textContent =
            messages.length;


    $("apiState")
        .textContent =
            "Demo";

}


/* =========================
   USERS
========================= */

function renderUsers() {

    let query =
        $("search")
            .value
            .toLowerCase();


    let body =
        $("usersTable");


    body.innerHTML = "";


    users
        .filter(user => {

            return (

                !query ||

                user.name
                    .toLowerCase()
                    .includes(query)

                ||

                user.email
                    .toLowerCase()
                    .includes(query)

            );

        })
        .forEach(user => {

            let row =
                document.createElement(
                    "tr"
                );


            row.innerHTML = `

                <td>
                    ${esc(user.name)}
                </td>

                <td>
                    ${esc(user.email)}
                </td>

                <td>
                    <span class="ok">
                        ${esc(user.status)}
                    </span>
                </td>

                <td>

                    <button
                        class="rowdel">

                        Supprimer

                    </button>

                </td>

            `;


            row
                .querySelector("button")
                .onclick =
                    () => {

                        if (
                            confirm(
                                "Supprimer ?"
                            )
                        ) {

                            users =
                                users.filter(
                                    x =>
                                        x.id !==
                                        user.id
                                );


                            localStorage.setItem(

                                "seby_admin_users",

                                JSON.stringify(
                                    users
                                )

                            );


                            renderUsers();

                            update();

                        }

                    };


            body.appendChild(row);

        });

}


/* =========================
   CHATS
========================= */

function renderChats() {

    let list =
        $("chatList");


    let messages =
        json(
            "seby_ai_messages",
            []
        );


    list.innerHTML = "";


    if (!messages.length) {

        list.innerHTML = `

            <div class="panel">

                <span class="muted">

                    Aucune conversation locale.

                </span>

            </div>

        `;

        return;

    }


    [
        ...messages
    ]
    .reverse()
    .forEach(message => {

        let div =
            document.createElement(
                "div"
            );


        div.className =
            "chat";


        div.innerHTML = `

            <b>

                ${
                    message.role === "user"
                    ? "Utilisateur"
                    : "SEBY AI"
                }

            </b>


            <p>

                ${esc(
                    message.content || ""
                )}

            </p>


            <small>

                ${
                    message.time
                    ?
                    new Date(
                        message.time
                    ).toLocaleString()
                    :
                    ""
                }

            </small>

        `;


        list.appendChild(div);

    });

}


/* =========================
   ACTIVITY
========================= */

function renderActivity() {

    const activities = [

        "Frontend SEBY AI chargé",

        "Stockage local opérationnel",

        "Backend à connecter",

        "OpenAI à connecter"

    ];


    $("activity")
        .innerHTML =

        activities
            .map(item => `

                <p
                    style="
                        padding:9px 0;
                        border-bottom:
                            1px solid
                            #ffffff0d;
                        font-size:12px;
                    ">

                    ${item}

                </p>

            `)
            .join("");

}


/* =========================
   NOTIFICATION PREVIEW
========================= */

function renderPreview() {

    let notification =
        json(
            "seby_admin_notification",
            null
        );


    let preview =
        $("preview");


    if (!notification) {

        preview
            .classList
            .add("hidden");

        return;

    }


    preview
        .classList
        .remove("hidden");


    preview.innerHTML = `

        <h3>
            ${esc(notification.n)}
        </h3>

        <p>
            ${esc(notification.m)}
        </p>

    `;

}


/* =========================
   SECURITY ESCAPE
========================= */

function esc(value) {

    return String(value)

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

}


/* =========================
   TOAST
========================= */

function toast(message) {

    let element =
        $("toast");


    element.textContent =
        message;


    element
        .classList
        .add("show");


    clearTimeout(
        window.toastTimer
    );


    window.toastTimer =
        setTimeout(
            () => {

                element
                    .classList
                    .remove("show");

            },

            2200
        );

}