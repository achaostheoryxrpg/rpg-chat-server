const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;


// ======================================================
// SERVIDOR HTTP
// ======================================================

const server = http.createServer(app);


// ======================================================
// WEBSOCKET
// ======================================================

const wss = new WebSocket.Server({
    server
});


// ======================================================
// USUÁRIOS CONECTADOS
// ======================================================
//
// Cada conexão possui:
//
// {
//     socket,
//     username,
//     location
// }
//
// "location" é o local do RPG.
//
// Exemplos:
//
// calcdeirao-furado
// beco-diagonal
// hogwarts
//
// ======================================================

const users = new Map();


// ======================================================
// LIMPAR TEXTO
// ======================================================

function limparTexto(texto, limite = 500) {

    if (typeof texto !== "string") {
        return "";
    }

    return texto
        .trim()
        .slice(0, limite);
}


// ======================================================
// ENVIAR PARA UMA PESSOA
// ======================================================

function enviar(socket, dados) {

    if (socket.readyState === WebSocket.OPEN) {

        socket.send(
            JSON.stringify(dados)
        );

    }

}


// ======================================================
// ENVIAR PARA TODOS DO MESMO LOCAL
// ======================================================

function enviarLocal(location, dados) {

    users.forEach(function(usuario) {

        if (
            usuario.location === location &&
            usuario.socket.readyState === WebSocket.OPEN
        ) {

            usuario.socket.send(
                JSON.stringify(dados)
            );

        }

    });

}


// ======================================================
// LISTA DE USUÁRIOS DO LOCAL
// ======================================================

function enviarListaUsuarios(location) {

    const usuarios = [];

    users.forEach(function(usuario) {

        if (
            usuario.location === location &&
            usuario.username
        ) {

            usuarios.push(
                usuario.username
            );

        }

    });


    enviarLocal(location, {

        type: "users",

        users: usuarios

    });

}


// ======================================================
// CONEXÃO
// ======================================================

wss.on("connection", function(socket) {

    console.log("Nova conexão WebSocket.");


    // --------------------------------------------------
    // MENSAGEM RECEBIDA
    // --------------------------------------------------

    socket.on("message", function(data) {

        try {

            const mensagem =
                JSON.parse(data.toString());


            // ==========================================
            // ENTRAR NO LOCAL
            // ==========================================

            if (mensagem.type === "join") {

                const username =
                    limparTexto(
                        mensagem.username,
                        30
                    );

                const location =
                    limparTexto(
                        mensagem.location,
                        50
                    );


                if (!username || !location) {

                    enviar(socket, {

                        type: "error",

                        message:
                            "Usuário ou local inválido."

                    });

                    return;

                }


                // --------------------------------------
                // SALVAR USUÁRIO
                // --------------------------------------

                users.set(socket, {

                    socket: socket,

                    username: username,

                    location: location

                });


                console.log(
                    `${username} entrou em ${location}`
                );


                // --------------------------------------
                // AVISAR O LOCAL
                // --------------------------------------

                enviarLocal(location, {

                    type: "system",

                    message:
                        `${username} entrou no local.`

                });


                // --------------------------------------
                // ATUALIZAR LISTA
                // --------------------------------------

                enviarListaUsuarios(location);


                return;

            }


            // ==========================================
            // MENSAGEM NORMAL
            // ==========================================

            if (mensagem.type === "message") {

                const usuario =
                    users.get(socket);


                if (!usuario) {

                    enviar(socket, {

                        type: "error",

                        message:
                            "Você ainda não entrou em um local."

                    });

                    return;

                }


                const texto =
                    limparTexto(
                        mensagem.text,
                        1000
                    );


                if (!texto) {
                    return;
                }


                console.log(
                    `${usuario.location} | ${usuario.username}: ${texto}`
                );


                enviarLocal(
                    usuario.location,
                    {

                        type: "message",

                        username:
                            usuario.username,

                        text:
                            texto,

                        timestamp:
                            Date.now()

                    }
                );


                return;

            }


            // ==========================================
            // /ME
            // ==========================================

            if (mensagem.type === "me") {

                const usuario =
                    users.get(socket);


                if (!usuario) {
                    return;
                }


                const texto =
                    limparTexto(
                        mensagem.text,
                        500
                    );


                if (!texto) {
                    return;
                }


                enviarLocal(
                    usuario.location,
                    {

                        type: "action",

                        username:
                            usuario.username,

                        text:
                            texto,

                        timestamp:
                            Date.now()

                    }
                );


                return;

            }


            // ==========================================
            // /ROLL
            // ==========================================

            if (mensagem.type === "roll") {

                const usuario =
                    users.get(socket);


                if (!usuario) {
                    return;
                }


                const resultado =
                    Math.floor(
                        Math.random() * 20
                    ) + 1;


                enviarLocal(
                    usuario.location,
                    {

                        type: "roll",

                        username:
                            usuario.username,

                        result:
                            resultado,

                        timestamp:
                            Date.now()

                    }
                );


                return;

            }


            // ==========================================
            // SAIR DO LOCAL
            // ==========================================

            if (mensagem.type === "leave") {

                removerUsuario(socket);

                return;

            }

        } catch (erro) {

            console.error(
                "Erro ao processar mensagem:",
                erro
            );


            enviar(socket, {

                type: "error",

                message:
                    "Mensagem inválida."

            });

        }

    });


    // --------------------------------------------------
    // DESCONECTAR
    // --------------------------------------------------

    socket.on("close", function() {

        removerUsuario(socket);

    });


    // --------------------------------------------------
    // ERRO
    // --------------------------------------------------

    socket.on("error", function(erro) {

        console.error(
            "Erro WebSocket:",
            erro
        );

    });

});


// ======================================================
// REMOVER USUÁRIO
// ======================================================

function removerUsuario(socket) {

    const usuario =
        users.get(socket);


    if (!usuario) {
        return;
    }


    console.log(
        `${usuario.username} saiu de ${usuario.location}`
    );


    // ----------------------------------------------
    // AVISAR O LOCAL
    // ----------------------------------------------

    enviarLocal(
        usuario.location,
        {

            type: "system",

            message:
                `${usuario.username} saiu do local.`

        }
    );


    // ----------------------------------------------
    // REMOVER
    // ----------------------------------------------

    users.delete(socket);


    // ----------------------------------------------
    // ATUALIZAR LISTA
    // ----------------------------------------------

    enviarListaUsuarios(
        usuario.location
    );

}


// ======================================================
// ROTA PRINCIPAL
// ======================================================

app.get("/", function(req, res) {

    res.send(
        "Servidor do chat RPG funcionando."
    );

});


// ======================================================
// INICIAR SERVIDOR
// ======================================================

server.listen(
    PORT,
    "0.0.0.0",
    function() {

        console.log(
            `Servidor rodando na porta ${PORT}`
        );

    }
);
