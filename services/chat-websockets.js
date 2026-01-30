// =====================================================
// MDA VENDAS - CHAT WEBSOCKETS SERVICE
// Sistema de chat em tempo real com Socket.io
// =====================================================

const { ChatMensagem, Usuario } = require('../database');

let io = null;

// Usuários online
const usuariosOnline = new Map();

// =====================================================
// CONFIGURAR SOCKET.IO
// =====================================================
const configurarWebSockets = (server) => {
    const { Server } = require('socket.io');

    io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log(`📡 Novo usuário conectado: ${socket.id}`);

        // Autenticar usuário
        socket.on('autenticar', async (data) => {
            try {
                const { userId, nome, foto } = data;

                if (userId) {
                    usuariosOnline.set(socket.id, {
                        id: userId,
                        nome: nome || 'Usuário',
                        foto: foto || '',
                        socketId: socket.id
                    });

                    // Notificar todos que usuário entrou
                    io.emit('usuario_entrou', {
                        id: userId,
                        nome: nome,
                        total_online: usuariosOnline.size
                    });

                    // Enviar lista de usuários online
                    socket.emit('usuarios_online', Array.from(usuariosOnline.values()));
                }
            } catch (error) {
                console.error('Erro ao autenticar socket:', error);
            }
        });

        // Enviar mensagem no chat público
        socket.on('mensagem_publica', async (data) => {
            try {
                const usuario = usuariosOnline.get(socket.id);
                if (!usuario) return;

                const mensagem = new ChatMensagem({
                    de: usuario.id,
                    para: null, // Público
                    mensagem: data.mensagem,
                    tipo: data.tipo || 'texto'
                });

                await mensagem.save();

                // Broadcast para todos
                io.emit('nova_mensagem_publica', {
                    id: mensagem._id,
                    de: {
                        id: usuario.id,
                        nome: usuario.nome,
                        foto: usuario.foto
                    },
                    mensagem: data.mensagem,
                    tipo: data.tipo || 'texto',
                    data: mensagem.criado_em
                });
            } catch (error) {
                console.error('Erro ao enviar mensagem pública:', error);
            }
        });

        // Enviar mensagem privada
        socket.on('mensagem_privada', async (data) => {
            try {
                const usuario = usuariosOnline.get(socket.id);
                if (!usuario) return;

                const { para, mensagem, tipo } = data;

                const novaMensagem = new ChatMensagem({
                    de: usuario.id,
                    para: para,
                    mensagem: mensagem,
                    tipo: tipo || 'texto'
                });

                await novaMensagem.save();

                // Encontrar socket do destinatário
                let destinatarioSocket = null;
                for (const [socketId, u] of usuariosOnline) {
                    if (u.id === para) {
                        destinatarioSocket = socketId;
                        break;
                    }
                }

                // Enviar para destinatário
                if (destinatarioSocket) {
                    io.to(destinatarioSocket).emit('nova_mensagem_privada', {
                        id: novaMensagem._id,
                        de: {
                            id: usuario.id,
                            nome: usuario.nome,
                            foto: usuario.foto
                        },
                        mensagem: mensagem,
                        tipo: tipo || 'texto',
                        data: novaMensagem.criado_em
                    });
                }

                // Confirmar envio para remetente
                socket.emit('mensagem_enviada', {
                    id: novaMensagem._id,
                    para: para,
                    mensagem: mensagem,
                    data: novaMensagem.criado_em
                });
            } catch (error) {
                console.error('Erro ao enviar mensagem privada:', error);
            }
        });

        // Usuário digitando
        socket.on('digitando', (data) => {
            const usuario = usuariosOnline.get(socket.id);
            if (!usuario) return;

            if (data.para) {
                // Digitando em chat privado
                for (const [socketId, u] of usuariosOnline) {
                    if (u.id === data.para) {
                        io.to(socketId).emit('usuario_digitando', {
                            id: usuario.id,
                            nome: usuario.nome,
                            privado: true
                        });
                        break;
                    }
                }
            } else {
                // Digitando no chat público
                socket.broadcast.emit('usuario_digitando', {
                    id: usuario.id,
                    nome: usuario.nome,
                    privado: false
                });
            }
        });

        // Parou de digitar
        socket.on('parou_digitar', (data) => {
            const usuario = usuariosOnline.get(socket.id);
            if (!usuario) return;

            if (data.para) {
                for (const [socketId, u] of usuariosOnline) {
                    if (u.id === data.para) {
                        io.to(socketId).emit('usuario_parou_digitar', {
                            id: usuario.id
                        });
                        break;
                    }
                }
            } else {
                socket.broadcast.emit('usuario_parou_digitar', {
                    id: usuario.id
                });
            }
        });

        // Desconexão
        socket.on('disconnect', () => {
            const usuario = usuariosOnline.get(socket.id);

            if (usuario) {
                usuariosOnline.delete(socket.id);

                io.emit('usuario_saiu', {
                    id: usuario.id,
                    nome: usuario.nome,
                    total_online: usuariosOnline.size
                });
            }

            console.log(`📡 Usuário desconectado: ${socket.id}`);
        });
    });

    return io;
};

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

// Enviar notificação para usuário específico
const enviarNotificacao = (userId, notificacao) => {
    for (const [socketId, usuario] of usuariosOnline) {
        if (usuario.id === userId) {
            io.to(socketId).emit('notificacao', notificacao);
            break;
        }
    }
};

// Broadcast para todos
const broadcastGeral = (evento, dados) => {
    if (io) {
        io.emit(evento, dados);
    }
};

// Obter histórico de mensagens públicas
const obterHistoricoPublico = async (limite = 50) => {
    try {
        const mensagens = await ChatMensagem.find({ para: null })
            .populate('de', 'nome foto')
            .sort({ criado_em: -1 })
            .limit(limite);

        return mensagens.reverse();
    } catch (error) {
        console.error('Erro ao obter histórico:', error);
        return [];
    }
};

// Obter histórico de mensagens privadas
const obterHistoricoPrivado = async (userId1, userId2, limite = 50) => {
    try {
        const mensagens = await ChatMensagem.find({
            $or: [
                { de: userId1, para: userId2 },
                { de: userId2, para: userId1 }
            ]
        })
            .populate('de', 'nome foto')
            .sort({ criado_em: -1 })
            .limit(limite);

        return mensagens.reverse();
    } catch (error) {
        console.error('Erro ao obter histórico privado:', error);
        return [];
    }
};

module.exports = {
    configurarWebSockets,
    enviarNotificacao,
    broadcastGeral,
    obterHistoricoPublico,
    obterHistoricoPrivado,
    usuariosOnline
};
