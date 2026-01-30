// =====================================================
// MDA VENDAS - DATABASE.JS
// Conexão MongoDB e Schemas Mongoose
// =====================================================

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Conexão com MongoDB
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mda-vendas', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log(`✅ MongoDB Conectado: ${conn.connection.host}`);

        // Criar admin master após conexão
        await criarAdminMaster();

        return conn;
    } catch (error) {
        console.error(`❌ Erro ao conectar MongoDB: ${error.message}`);
        process.exit(1);
    }
};

// =====================================================
// SCHEMA: USUÁRIO
// =====================================================
const UsuarioSchema = new mongoose.Schema({
    email: {
        type: String,
        unique: true,
        required: true,
        lowercase: true,
        trim: true
    },
    senha: {
        type: String,
        required: false // Não obrigatório para login Google
    },
    nome: {
        type: String,
        default: ''
    },
    foto: {
        type: String,
        default: ''
    },
    cpf: {
        type: String,
        default: ''
    },
    telefone: {
        type: String,
        default: ''
    },
    cargo: {
        type: String,
        enum: ['usuario', 'adm_cuidador', 'adm_completo', 'sub_dono', 'dono'],
        default: 'usuario'
    },
    firebase_uid: {
        type: String,
        default: null
    },
    auth_provider: {
        type: String,
        enum: ['email', 'google'],
        default: 'email'
    },
    plano_ativo: {
        tipo: {
            type: String,
            enum: ['mensal', 'semestral', 'anual', null],
            default: null
        },
        dias_restantes: {
            type: Number,
            default: 0
        },
        data_inicio: {
            type: Date,
            default: null
        },
        data_expiracao: {
            type: Date,
            default: null
        }
    },
    plano_pago: {
        type: Boolean,
        default: false
    },
    ativo: {
        type: Boolean,
        default: true
    },
    criado_em: {
        type: Date,
        default: Date.now
    },
    ultimo_login: {
        type: Date,
        default: Date.now
    },
    twofa_secret: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Hash senha antes de salvar
UsuarioSchema.pre('save', async function (next) {
    if (!this.isModified('senha') || !this.senha) return next();
    this.senha = await bcrypt.hash(this.senha, 12);
    next();
});

// Método para comparar senhas
UsuarioSchema.methods.compararSenha = async function (senhaCandidata) {
    if (!this.senha) return false;
    return await bcrypt.compare(senhaCandidata, this.senha);
};

// Verificar se é admin
UsuarioSchema.methods.isAdmin = function () {
    return ['adm_cuidador', 'adm_completo', 'sub_dono', 'dono'].includes(this.cargo);
};

// Verificar se tem acesso (pagou ou é admin)
UsuarioSchema.methods.temAcesso = function () {
    return this.isAdmin() || this.plano_pago;
};

// =====================================================
// SCHEMA: PRODUTO
// =====================================================
const ProdutoSchema = new mongoose.Schema({
    dono: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true
    },
    nome: {
        type: String,
        required: true,
        maxlength: 100
    },
    descricao: {
        type: String,
        minlength: 10,
        default: ''
    },
    preco: {
        type: Number,
        min: 5,
        required: true
    },
    nicho: {
        type: String,
        enum: [
            'Aplicativo/Software',
            'Curso Online',
            'E-book',
            'Mentoria',
            'Consultoria',
            'PLR',
            'Templates Gráficos',
            'Ferramentas SaaS',
            'Outros'
        ],
        required: true
    },
    link_produto: {
        type: String,
        required: true
    },
    // Afiliados - opcional
    afiliados_habilitado: {
        type: Boolean,
        default: false
    },
    link_afiliado: {
        type: String,
        default: ''
    },
    comissao_afiliados: {
        type: Number,
        min: 0,
        max: 100,
        default: 30
    },
    // Imagem
    imagem_capa: {
        type: String,
        default: ''
    },
    // Arquivos para área de membros
    arquivos_membros: [{
        nome: String,
        url: String,
        tipo: String
    }],
    // Estatísticas
    vendas: {
        type: Number,
        default: 0
    },
    visualizacoes: {
        type: Number,
        default: 0
    },
    rating: {
        type: Number,
        default: 0
    },
    // Visibilidade
    visivel_vitrine: {
        type: Boolean,
        default: true
    },
    aprovado: {
        type: Boolean,
        default: true
    },
    criado_em: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Índice para busca de texto
ProdutoSchema.index({ nome: 'text', descricao: 'text' });

// =====================================================
// SCHEMA: PAGAMENTO
// =====================================================
const PagamentoSchema = new mongoose.Schema({
    usuario: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true
    },
    plano: {
        type: String,
        enum: ['mensal', 'semestral', 'anual'],
        required: true
    },
    valor: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pendente', 'aprovado', 'reembolsado', 'expirado'],
        default: 'pendente'
    },
    mercadopago_id: {
        type: String,
        default: ''
    },
    mercadopago_payment_id: {
        type: String,
        default: ''
    },
    qr_code: {
        type: String,
        default: ''
    },
    qr_code_base64: {
        type: String,
        default: ''
    },
    pix_copia_cola: {
        type: String,
        default: ''
    },
    data_expiracao_pix: {
        type: Date,
        default: null
    },
    data_pagamento: {
        type: Date,
        default: null
    },
    criado_em: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// =====================================================
// SCHEMA: MENSAGEM DE CHAT
// =====================================================
const ChatMensagemSchema = new mongoose.Schema({
    de: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true
    },
    para: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        default: null // null = chat público
    },
    mensagem: {
        type: String,
        required: true
    },
    tipo: {
        type: String,
        enum: ['texto', 'imagem', 'arquivo'],
        default: 'texto'
    },
    arquivo_url: {
        type: String,
        default: ''
    },
    lida: {
        type: Boolean,
        default: false
    },
    criado_em: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// =====================================================
// SCHEMA: NOTIFICAÇÃO
// =====================================================
const NotificacaoSchema = new mongoose.Schema({
    usuario: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true
    },
    titulo: {
        type: String,
        required: true
    },
    mensagem: {
        type: String,
        required: true
    },
    tipo: {
        type: String,
        enum: ['info', 'sucesso', 'aviso', 'erro', 'atualizacao'],
        default: 'info'
    },
    link: {
        type: String,
        default: ''
    },
    lida: {
        type: Boolean,
        default: false
    },
    criado_em: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// =====================================================
// SCHEMA: AUDITORIA
// =====================================================
const AuditoriaSchema = new mongoose.Schema({
    usuario: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario'
    },
    acao: {
        type: String,
        required: true
    },
    descricao: {
        type: String,
        default: ''
    },
    ip: {
        type: String,
        default: ''
    },
    dados: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    criado_em: {
        type: Date,
        default: Date.now
    }
});

// =====================================================
// SCHEMA: FEEDBACK
// =====================================================
const FeedbackSchema = new mongoose.Schema({
    usuario: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario'
    },
    nome: {
        type: String,
        default: 'Anônimo'
    },
    email: {
        type: String,
        default: ''
    },
    mensagem: {
        type: String,
        required: true
    },
    rating: {
        type: Number,
        min: 1,
        max: 5,
        default: 5
    },
    status: {
        type: String,
        enum: ['pendente', 'respondido', 'arquivado'],
        default: 'pendente'
    },
    resposta: {
        type: String,
        default: ''
    },
    criado_em: {
        type: Date,
        default: Date.now
    }
});

// =====================================================
// CRIAR ADMIN MASTER
// =====================================================
const criarAdminMaster = async () => {
    const Usuario = mongoose.model('Usuario');
    const adminEmail = process.env.ADMIN_EMAIL || 'danielpedroribeirodasilva@gmail.com';

    try {
        const adminExiste = await Usuario.findOne({ email: adminEmail });

        if (!adminExiste) {
            const admin = new Usuario({
                email: adminEmail,
                nome: 'Admin Master',
                cargo: 'dono',
                plano_pago: true,
                plano_ativo: {
                    tipo: 'anual',
                    dias_restantes: 99999,
                    data_inicio: new Date(),
                    data_expiracao: new Date(Date.now() + 365 * 100 * 24 * 60 * 60 * 1000) // 100 anos
                },
                auth_provider: 'google',
                ativo: true
            });

            await admin.save();
            console.log(`✅ Admin Master criado: ${adminEmail}`);
        } else {
            // Garantir que sempre tenha cargo dono
            if (adminExiste.cargo !== 'dono') {
                adminExiste.cargo = 'dono';
                adminExiste.plano_pago = true;
                await adminExiste.save();
                console.log(`✅ Admin Master atualizado para cargo 'dono': ${adminEmail}`);
            }
        }
    } catch (error) {
        console.error('Erro ao criar admin master:', error);
    }
};

// =====================================================
// EXPORTAR MODELS
// =====================================================
const Usuario = mongoose.model('Usuario', UsuarioSchema);
const Produto = mongoose.model('Produto', ProdutoSchema);
const Pagamento = mongoose.model('Pagamento', PagamentoSchema);
const ChatMensagem = mongoose.model('ChatMensagem', ChatMensagemSchema);
const Notificacao = mongoose.model('Notificacao', NotificacaoSchema);
const Auditoria = mongoose.model('Auditoria', AuditoriaSchema);
const Feedback = mongoose.model('Feedback', FeedbackSchema);

module.exports = {
    connectDB,
    Usuario,
    Produto,
    Pagamento,
    ChatMensagem,
    Notificacao,
    Auditoria,
    Feedback,
    criarAdminMaster
};
