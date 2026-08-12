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

// Usuários conectados
const users = new Map();

// Salas
const rooms = new Map();

rooms.set("principal", new Set());


// ==============================
// ROTA DE TESTE
// ==============================

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "RPG Chat Server"
    });
});


// ==============================
// WEBSOCKET
// ==============================

wss.on("connection", (socket) => {

    console.log("Novo usuário conectado.");

    socket.user = null;
    socket.room = null;


    socket.on("message", (data) => {

        try {

            const message = JSON.parse(data.toString());

            console.log("Mensagem recebida:", message);


            // --------------------------
            // ENTRAR NA SALA
            // --------------------------

            if (message.type === "join") {

                const username = String(message.username || "Visitante");
                const roomName = String(message.room || "principal");

                socket.user = username;
                socket.room = roomName;

                users.set(socket, {
                    username,
                    room: roomName
                });


                if (!rooms.has(roomName)) {
                    rooms.set(roomName, new Set());
                }

                rooms.get(roomName).add(socket);


                send(socket, {
                    type: "system",
                    message: `Você entrou na sala ${roomName}.`
                });


                broadcastRoom(roomName, {
                    type: "system",
                    message: `${username} entrou na sala.`
                });


                sendUserList(roomName);

                return;
            }


            // --------------------------
            // MENSAGEM
            // --------------------------

            if (message.type === "message") {

                if (!socket.user || !socket.room) {
                    return;
                }

                const text = String(message.text || "").trim();

                if (!text) {
                    return;
                }


                broadcastRoom(socket.room, {

                    type: "message",

                    username: socket.user,

                    text: text,

                    timestamp: Date.now()

                });

                return;
            }

        } catch (error) {

            console.error(
                "Erro ao processar mensagem:",
                error
            );

        }

    });


    // --------------------------
    // DESCONECTOU
    // --------------------------

    socket.on("close", () => {

        const user = users.get(socket);

        if (!user) {
            return;
        }

        const room = rooms.get(user.room);

        if (room) {
            room.delete(socket);
        }

        users.delete(socket);


        broadcastRoom(user.room, {
            type: "system",
            message: `${user.username} saiu da sala.`
        });


        sendUserList(user.room);

        console.log(
            `${user.username} desconectou.`
        );

    });

});


// ==============================
// FUNÇÕES
// ==============================

function send(socket, data) {

    if (socket.readyState === WebSocket.OPEN) {

        socket.send(
            JSON.stringify(data)
        );

    }

}


function broadcastRoom(roomName, data) {

    const room = rooms.get(roomName);

    if (!room) {
        return;
    }


    for (const socket of room) {

        send(socket, data);

    }

}


function sendUserList(roomName) {

    const room = rooms.get(roomName);

    if (!room) {
        return;
    }


    const usernames = [];

    for (const socket of room) {

        const user = users.get(socket);

        if (user) {
            usernames.push(user.username);
        }

    }


    broadcastRoom(roomName, {

        type: "users",

        users: usernames

    });

}


// ==============================
// INICIAR SERVIDOR
// ==============================

server.listen(PORT, () => {

    console.log(
        `Servidor rodando na porta ${PORT}`
    );

});
