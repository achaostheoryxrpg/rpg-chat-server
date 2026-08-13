const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const wss = new WebSocket.Server({
    server
});

const PORT = process.env.PORT || 3000;


// =====================================================
// DADOS EM MEMÓRIA
// =====================================================

// socket -> usuário
const users = new Map();

// nome da sala -> Set de sockets
const rooms = new Map();


// Salas iniciais
rooms.set("principal", new Set());
rooms.set("taverna", new Set());
rooms.set("arena", new Set());


// =====================================================
// ROTA HTTP
// =====================================================

app.get("/", (req, res) => {

    res.json({
        status: "online",
        service: "RPG Chat Server",
        version: "2.0"
    });

});


// =====================================================
// WEBSOCKET
// =====================================================

wss.on("connection", (socket) => {

    console.log("Novo usuário conectado.");

    socket.user = null;
    socket.room = null;


    // =================================================
    // RECEBER MENSAGEM
    // =================================================

    socket.on("message", (data) => {

        try {

            const message =
                JSON.parse(data.toString());


            console.log(
                "Mensagem recebida:",
                message
            );


            // =========================================
            // ENTRAR NA SALA
            // =========================================

            if (message.type === "join") {

                entrarNaSala(
                    socket,
                    message.username,
                    message.room
                );

                return;
            }


            // =========================================
            // SAIR DA SALA
            // =========================================

            if (message.type === "leave") {

                sairDaSala(socket);

                return;
            }


            // =========================================
            // MENSAGEM NORMAL
            // =========================================

            if (message.type === "message") {

                enviarMensagem(
                    socket,
                    message.text
                );

                return;
            }


            // =========================================
            // /ME
            // =========================================

            if (message.type === "me") {

                enviarAcao(
                    socket,
                    message.text
                );

                return;
            }


            // =========================================
            // /ROLL
            // =========================================

            if (message.type === "roll") {

                rolarDados(
                    socket,
                    message.sides
                );

                return;
            }


        } catch (error) {

            console.error(
                "Erro ao processar mensagem:",
                error
            );

        }

    });


    // =================================================
    // DESCONECTOU
    // =================================================

    socket.on("close", () => {

        if (socket.user) {

            const usuario =
                socket.user.username;

            const sala =
                socket.user.room;


            sairDaSala(socket);


            console.log(
                `${usuario} desconectou da sala ${sala}.`
            );

        } else {

            console.log(
                "Usuário desconectou."
            );

        }

    });

});


// =====================================================
// ENTRAR NA SALA
// =====================================================

function entrarNaSala(
    socket,
    username,
    roomName
) {

    username =
        limparTexto(
            username,
            30
        ) || "Visitante";


    roomName =
        limparTexto(
            roomName,
            30
        ) || "principal";


    // -----------------------------------------------
    // Se já estava em uma sala
    // -----------------------------------------------

    if (socket.user) {

        sairDaSala(socket);

    }


    // -----------------------------------------------
    // Criar sala se não existir
    // -----------------------------------------------

    if (!rooms.has(roomName)) {

        rooms.set(
            roomName,
            new Set()
        );

    }


    // -----------------------------------------------
    // Registrar usuário
    // -----------------------------------------------

    socket.user = {

        username: username,

        room: roomName,

        joinedAt: Date.now()

    };


    socket.room =
        roomName;


    users.set(
        socket,
        socket.user
    );


    rooms
        .get(roomName)
        .add(socket);


    // -----------------------------------------------
    // Confirmar entrada
    // -----------------------------------------------

    send(socket, {

        type: "system",

        message:
            `Você entrou na sala ${roomName}.`

    });


    // -----------------------------------------------
    // Avisar os outros usuários
    // -----------------------------------------------

    broadcastRoomExcept(
        roomName,
        socket,
        {

            type: "system",

            message:
                `${username} entrou na sala.`

        }
    );


    // -----------------------------------------------
    // Atualizar lista
    // -----------------------------------------------

    sendUserList(roomName);

}


// =====================================================
// SAIR DA SALA
// =====================================================

function sairDaSala(socket) {

    if (!socket.user) {

        return;

    }


    const username =
        socket.user.username;

    const roomName =
        socket.user.room;


    const room =
        rooms.get(roomName);


    if (room) {

        room.delete(socket);


        broadcastRoom(
            roomName,
            {

                type: "system",

                message:
                    `${username} saiu da sala.`

            }
        );


        sendUserList(roomName);


        // Remove salas vazias
        if (
            room.size === 0 &&
            !["principal", "taverna", "arena"]
                .includes(roomName)
        ) {

            rooms.delete(roomName);

        }

    }


    users.delete(socket);

    socket.user = null;

    socket.room = null;

}


// =====================================================
// MENSAGEM NORMAL
// =====================================================

function enviarMensagem(
    socket,
    text
) {

    if (!socket.user) {

        return;

    }


    text =
        limparTexto(
            text,
            1000
        );


    if (!text) {

        return;

    }


    broadcastRoom(
        socket.user.room,
        {

            type: "message",

            username:
                socket.user.username,

            text: text,

            timestamp:
                Date.now()

        }
    );

}


// =====================================================
// /ME
// =====================================================

function enviarAcao(
    socket,
    text
) {

    if (!socket.user) {

        return;

    }


    text =
        limparTexto(
            text,
            1000
        );


    if (!text) {

        return;

    }


    broadcastRoom(
        socket.user.room,
        {

            type: "me",

            username:
                socket.user.username,

            text: text,

            timestamp:
                Date.now()

        }
    );

}


// =====================================================
// /ROLL
// =====================================================

function rolarDados(
    socket,
    sides
) {

    if (!socket.user) {

        return;

    }


    sides =
        Number(sides);


    // Limite de segurança
    if (
        !Number.isInteger(sides) ||
        sides < 2 ||
        sides > 1000
    ) {

        send(socket, {

            type: "system",

            message:
                "Use /roll seguido de um número entre 2 e 1000."

        });

        return;

    }


    const resultado =
        Math.floor(
            Math.random() * sides
        ) + 1;


    broadcastRoom(
        socket.user.room,
        {

            type: "roll",

            username:
                socket.user.username,

            sides:
                sides,

            result:
                resultado,

            timestamp:
                Date.now()

        }
    );

}


// =====================================================
// LISTA DE USUÁRIOS
// =====================================================

function sendUserList(
    roomName
) {

    const room =
        rooms.get(roomName);


    if (!room) {

        return;

    }


    const usuarios = [];


    for (
        const socket of room
    ) {

        if (
            socket.user
        ) {

            usuarios.push({

                username:
                    socket.user.username

            });

        }

    }


    broadcastRoom(
        roomName,
        {

            type: "users",

            users:
                usuarios

        }
    );

}


// =====================================================
// ENVIAR PARA UM SOCKET
// =====================================================

function send(
    socket,
    data
) {

    if (
        socket.readyState ===
        WebSocket.OPEN
    ) {

        socket.send(
            JSON.stringify(data)
        );

    }

}


// =====================================================
// ENVIAR PARA SALA
// =====================================================

function broadcastRoom(
    roomName,
    data
) {

    const room =
        rooms.get(roomName);


    if (!room) {

        return;

    }


    for (
        const socket of room
    ) {

        send(
            socket,
            data
        );

    }

}


// =====================================================
// ENVIAR PARA SALA, EXCETO UM SOCKET
// =====================================================

function broadcastRoomExcept(
    roomName,
    excludedSocket,
    data
) {

    const room =
        rooms.get(roomName);


    if (!room) {

        return;

    }


    for (
        const socket of room
    ) {

        if (
            socket !==
            excludedSocket
        ) {

            send(
                socket,
                data
            );

        }

    }

}


// =====================================================
// LIMPAR TEXTO
// =====================================================

function limparTexto(
    texto,
    limite
) {

    return String(
        texto || ""
    )
        .trim()
        .slice(0, limite);

}


// =====================================================
// INICIAR SERVIDOR
// =====================================================

server.listen(
    PORT,
    () => {

        console.log(
            `Servidor rodando na porta ${PORT}`
        );

    }
);
