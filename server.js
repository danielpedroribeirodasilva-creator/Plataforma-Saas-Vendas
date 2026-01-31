// =====================================================
// MDA VENDAS - SERVER.JS
// Servidor Express com API RESTful e WebSockets
// =====================================================

require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Importar módulos locais
const { connectDB, Usuario, Produto, Pagamento, Notificacao, Auditoria, Feedback } = require('./database');
const mercadoPago = require('./services/mercadopago');
const { configurarWebSockets, obterHistoricoPublico, obterHistoricoPrivado } = require('./services/chat-websockets');
const {
    verificarToken,
    verificarAcesso,
    verificarAdmin,
    verificarDonoOuSubDono,
    gerarToken
} = require('./middleware/auth-middleware');

// Criar app Express
const app = express();
const server = http.createServer(app);

// =====================================================
// AUTH0 CONFIGURATION
// =====================================================
// Auth0 é usado para autenticação via frontend
// Credenciais Auth0:
// Domain: dev-wjozy17a6uvy4w1t.us.auth0.com
// Client ID: WcXtEDk5HU8wdTyFv8kxf4mmKqvAvVHy
// App Name: Plataforma De Vendas
console.log('✅ Auth0 configurado para autenticação via frontend');

// Configurar WebSockets
const io = configurarWebSockets(server);

// =====================================================
// MIDDLEWARES GLOBAIS
// =====================================================

// Segurança com Helmet (configurado para permitir scripts inline)
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true
}));

// Parse JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // 100 requests por IP
    message: { success: false, message: 'Muitas requisições. Tente novamente mais tarde.' }
});
app.use('/api/', limiter);

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Logging simples
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// =====================================================
// ROTAS DE AUTENTICAÇÃO
// =====================================================

// Registrar com email/senha
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, senha, nome } = req.body;

        if (!email || !senha) {
            return res.status(400).json({ success: false, message: 'Email e senha são obrigatórios' });
        }

        // Verificar se já existe
        const existente = await Usuario.findOne({ email: email.toLowerCase() });
        if (existente) {
            return res.status(400).json({ success: false, message: 'Este email já está cadastrado' });
        }

        // Criar usuário
        const usuario = new Usuario({
            email: email.toLowerCase(),
            senha: senha,
            nome: nome || '',
            auth_provider: 'email',
            plano_pago: false
        });

        await usuario.save();

        // Gerar token
        const token = gerarToken(usuario);

        // Registrar auditoria
        await new Auditoria({
            usuario: usuario._id,
            acao: 'cadastro',
            descricao: 'Novo cadastro via email'
        }).save();

        res.json({
            success: true,
            message: 'Conta criada com sucesso!',
            token,
            usuario: {
                id: usuario._id,
                email: usuario.email,
                nome: usuario.nome,
                cargo: usuario.cargo,
                plano_pago: usuario.plano_pago,
                isAdmin: usuario.isAdmin()
            }
        });
    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ success: false, message: 'Erro ao criar conta' });
    }
});

// Login com email/senha
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        if (!email || !senha) {
            return res.status(400).json({ success: false, message: 'Email e senha são obrigatórios' });
        }

        // Buscar usuário
        const usuario = await Usuario.findOne({ email: email.toLowerCase() });
        if (!usuario) {
            return res.status(401).json({ success: false, message: 'Email ou senha inválidos' });
        }

        // Verificar senha
        const senhaCorreta = await usuario.compararSenha(senha);
        if (!senhaCorreta) {
            return res.status(401).json({ success: false, message: 'Email ou senha inválidos' });
        }

        // Atualizar último login
        usuario.ultimo_login = new Date();
        await usuario.save();

        // Gerar token
        const token = gerarToken(usuario);

        res.json({
            success: true,
            token,
            usuario: {
                id: usuario._id,
                email: usuario.email,
                nome: usuario.nome,
                foto: usuario.foto,
                cargo: usuario.cargo,
                plano_pago: usuario.plano_pago,
                plano_ativo: usuario.plano_ativo,
                isAdmin: usuario.isAdmin()
            }
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ success: false, message: 'Erro ao fazer login' });
    }
});

// Login/Registro com Google (Auth0)
app.post('/api/auth/google', async (req, res) => {
    try {
        const { email, nome, foto, auth0_sub } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email é obrigatório' });
        }

        // Buscar ou criar usuário
        let usuario = await Usuario.findOne({ email: email.toLowerCase() });

        if (!usuario) {
            // Criar novo usuário
            usuario = new Usuario({
                email: email.toLowerCase(),
                nome: nome || '',
                foto: foto || '',
                auth0_sub: auth0_sub,
                auth_provider: 'auth0',
                plano_pago: false
            });

            // Verificar se é o admin master
            if (email.toLowerCase() === (process.env.ADMIN_EMAIL || 'danielpedroribeirodasilva@gmail.com').toLowerCase()) {
                usuario.cargo = 'dono';
                usuario.plano_pago = true;
                usuario.plano_ativo = {
                    tipo: 'anual',
                    dias_restantes: 99999,
                    data_inicio: new Date(),
                    data_expiracao: new Date(Date.now() + 365 * 100 * 24 * 60 * 60 * 1000)
                };
            }

            await usuario.save();

            // Registrar auditoria
            await new Auditoria({
                usuario: usuario._id,
                acao: 'cadastro_auth0',
                descricao: 'Novo cadastro via Auth0/Google'
            }).save();
        } else {
            // Atualizar dados do Google
            if (nome) usuario.nome = nome;
            if (foto) usuario.foto = foto;
            if (auth0_sub) usuario.auth0_sub = auth0_sub;
            usuario.ultimo_login = new Date();
            await usuario.save();
        }

        // Gerar token
        const token = gerarToken(usuario);

        res.json({
            success: true,
            token,
            usuario: {
                id: usuario._id,
                email: usuario.email,
                nome: usuario.nome,
                foto: usuario.foto,
                cargo: usuario.cargo,
                plano_pago: usuario.plano_pago,
                plano_ativo: usuario.plano_ativo,
                isAdmin: usuario.isAdmin()
            }
        });
    } catch (error) {
        console.error('Erro no login Auth0:', error);
        res.status(500).json({ success: false, message: 'Erro ao autenticar com Auth0' });
    }
});

// Verificar token e obter dados do usuário
app.get('/api/auth/me', verificarToken, async (req, res) => {
    try {
        const usuario = req.usuario;

        // Calcular dias restantes
        let diasRestantes = 0;
        if (usuario.plano_ativo && usuario.plano_ativo.data_expiracao) {
            const hoje = new Date();
            const expiracao = new Date(usuario.plano_ativo.data_expiracao);
            diasRestantes = Math.max(0, Math.ceil((expiracao - hoje) / (1000 * 60 * 60 * 24)));
        }

        res.json({
            success: true,
            usuario: {
                id: usuario._id,
                email: usuario.email,
                nome: usuario.nome,
                foto: usuario.foto,
                cpf: usuario.cpf,
                telefone: usuario.telefone,
                cargo: usuario.cargo,
                plano_pago: usuario.plano_pago,
                plano_ativo: {
                    ...usuario.plano_ativo?.toObject(),
                    dias_restantes: diasRestantes
                },
                isAdmin: usuario.isAdmin(),
                criado_em: usuario.criado_em
            }
        });
    } catch (error) {
        console.error('Erro ao obter usuário:', error);
        res.status(500).json({ success: false, message: 'Erro ao obter dados' });
    }
});

// =====================================================
// ROTAS DE PAGAMENTO (MERCADO PAGO REAL)
// =====================================================

// Obter planos disponíveis
app.get('/api/planos', (req, res) => {
    res.json({
        success: true,
        planos: mercadoPago.obterPlanos()
    });
});

// Gerar PIX para pagamento
app.post('/api/pagamento/pix', verificarToken, async (req, res) => {
    try {
        const { plano, cpf, telefone } = req.body;
        const usuario = req.usuario;

        if (!plano || !cpf) {
            return res.status(400).json({ success: false, message: 'Plano e CPF são obrigatórios' });
        }

        // Atualizar CPF e telefone do usuário
        if (cpf) usuario.cpf = cpf;
        if (telefone) usuario.telefone = telefone;
        await usuario.save();

        // Gerar PIX
        const resultado = await mercadoPago.gerarPixQRCode(
            plano,
            usuario._id.toString(),
            usuario.email,
            cpf
        );

        if (!resultado.success) {
            return res.status(400).json({ success: false, message: resultado.error });
        }

        // Salvar pagamento no banco
        const pagamento = new Pagamento({
            usuario: usuario._id,
            plano: plano,
            valor: resultado.valor,
            status: 'pendente',
            mercadopago_id: resultado.external_reference,
            mercadopago_payment_id: resultado.payment_id.toString(),
            qr_code: resultado.qr_code,
            qr_code_base64: resultado.qr_code_base64,
            pix_copia_cola: resultado.pix_copia_cola,
            data_expiracao_pix: resultado.expiracao
        });

        await pagamento.save();

        res.json({
            success: true,
            pagamento_id: pagamento._id,
            qr_code: resultado.qr_code,
            qr_code_base64: resultado.qr_code_base64,
            pix_copia_cola: resultado.pix_copia_cola,
            valor: resultado.valor,
            plano: resultado.plano_info,
            expiracao: resultado.expiracao
        });
    } catch (error) {
        console.error('Erro ao gerar PIX:', error);
        res.status(500).json({ success: false, message: 'Erro ao gerar pagamento' });
    }
});

// Verificar status do pagamento
app.get('/api/pagamento/status/:id', verificarToken, async (req, res) => {
    try {
        const pagamento = await Pagamento.findById(req.params.id);

        if (!pagamento) {
            return res.status(404).json({ success: false, message: 'Pagamento não encontrado' });
        }

        // Verificar status no Mercado Pago
        const mpStatus = await mercadoPago.verificarPagamento(pagamento.mercadopago_payment_id);

        if (mpStatus.success && mpStatus.status === 'approved' && pagamento.status !== 'aprovado') {
            // Aprovar pagamento
            pagamento.status = 'aprovado';
            pagamento.data_pagamento = new Date();
            await pagamento.save();

            // Ativar plano do usuário
            const planoInfo = mercadoPago.obterPlano(pagamento.plano);
            const usuario = await Usuario.findById(pagamento.usuario);

            if (usuario && planoInfo) {
                usuario.plano_pago = true;
                usuario.plano_ativo = {
                    tipo: pagamento.plano,
                    dias_restantes: planoInfo.dias,
                    data_inicio: new Date(),
                    data_expiracao: new Date(Date.now() + planoInfo.dias * 24 * 60 * 60 * 1000)
                };
                await usuario.save();

                // Criar notificação
                await new Notificacao({
                    usuario: usuario._id,
                    titulo: '🎉 Pagamento Aprovado!',
                    mensagem: `Seu plano ${planoInfo.nome} foi ativado. Aproveite a plataforma!`,
                    tipo: 'sucesso'
                }).save();
            }
        }

        res.json({
            success: true,
            status: pagamento.status,
            aprovado: pagamento.status === 'aprovado'
        });
    } catch (error) {
        console.error('Erro ao verificar status:', error);
        res.status(500).json({ success: false, message: 'Erro ao verificar pagamento' });
    }
});

// Webhook do Mercado Pago
app.post('/api/webhook/mercadopago', async (req, res) => {
    try {
        console.log('📡 Webhook Mercado Pago recebido:', req.body);

        const resultado = await mercadoPago.processarWebhook(req.body);

        if (resultado.success && resultado.approved) {
            // Buscar pagamento
            const pagamento = await Pagamento.findOne({
                mercadopago_payment_id: resultado.payment_id.toString()
            });

            if (pagamento && pagamento.status !== 'aprovado') {
                pagamento.status = 'aprovado';
                pagamento.data_pagamento = new Date();
                await pagamento.save();

                // Ativar plano
                const planoInfo = mercadoPago.obterPlano(pagamento.plano);
                const usuario = await Usuario.findById(pagamento.usuario);

                if (usuario && planoInfo) {
                    usuario.plano_pago = true;
                    usuario.plano_ativo = {
                        tipo: pagamento.plano,
                        dias_restantes: planoInfo.dias,
                        data_inicio: new Date(),
                        data_expiracao: new Date(Date.now() + planoInfo.dias * 24 * 60 * 60 * 1000)
                    };
                    await usuario.save();

                    // Notificação
                    await new Notificacao({
                        usuario: usuario._id,
                        titulo: '🎉 Pagamento Aprovado!',
                        mensagem: `Seu plano ${planoInfo.nome} foi ativado.`,
                        tipo: 'sucesso'
                    }).save();

                    console.log(`✅ Plano ativado para: ${usuario.email}`);
                }
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Erro no webhook:', error);
        res.status(500).send('Error');
    }
});

// =====================================================
// ROTAS DE PRODUTOS
// =====================================================

// Listar produtos do usuário
app.get('/api/produtos', verificarToken, verificarAcesso, async (req, res) => {
    try {
        const produtos = await Produto.find({ dono: req.usuario._id })
            .sort({ criado_em: -1 });

        res.json({ success: true, produtos });
    } catch (error) {
        console.error('Erro ao listar produtos:', error);
        res.status(500).json({ success: false, message: 'Erro ao listar produtos' });
    }
});

// Criar produto
app.post('/api/produtos', verificarToken, verificarAcesso, async (req, res) => {
    try {
        const {
            nome,
            descricao,
            preco,
            nicho,
            link_produto,
            imagem_capa,
            afiliados_habilitado,
            link_afiliado,
            comissao_afiliados
        } = req.body;

        if (!nome || !preco || !nicho || !link_produto) {
            return res.status(400).json({
                success: false,
                message: 'Nome, preço, nicho e link do produto são obrigatórios'
            });
        }

        const produto = new Produto({
            dono: req.usuario._id,
            nome,
            descricao: descricao || '',
            preco,
            nicho,
            link_produto,
            imagem_capa: imagem_capa || '',
            afiliados_habilitado: afiliados_habilitado || false,
            link_afiliado: afiliados_habilitado ? (link_afiliado || '') : '',
            comissao_afiliados: comissao_afiliados || 30,
            visivel_vitrine: true
        });

        await produto.save();

        res.json({ success: true, produto });
    } catch (error) {
        console.error('Erro ao criar produto:', error);
        res.status(500).json({ success: false, message: 'Erro ao criar produto' });
    }
});

// Atualizar produto
app.put('/api/produtos/:id', verificarToken, verificarAcesso, async (req, res) => {
    try {
        const produto = await Produto.findOne({
            _id: req.params.id,
            dono: req.usuario._id
        });

        if (!produto) {
            return res.status(404).json({ success: false, message: 'Produto não encontrado' });
        }

        const campos = [
            'nome', 'descricao', 'preco', 'nicho', 'link_produto',
            'imagem_capa', 'afiliados_habilitado', 'link_afiliado',
            'comissao_afiliados', 'visivel_vitrine'
        ];

        campos.forEach(campo => {
            if (req.body[campo] !== undefined) {
                produto[campo] = req.body[campo];
            }
        });

        await produto.save();

        res.json({ success: true, produto });
    } catch (error) {
        console.error('Erro ao atualizar produto:', error);
        res.status(500).json({ success: false, message: 'Erro ao atualizar produto' });
    }
});

// Deletar produto
app.delete('/api/produtos/:id', verificarToken, verificarAcesso, async (req, res) => {
    try {
        const produto = await Produto.findOneAndDelete({
            _id: req.params.id,
            dono: req.usuario._id
        });

        if (!produto) {
            return res.status(404).json({ success: false, message: 'Produto não encontrado' });
        }

        res.json({ success: true, message: 'Produto removido' });
    } catch (error) {
        console.error('Erro ao deletar produto:', error);
        res.status(500).json({ success: false, message: 'Erro ao deletar produto' });
    }
});

// =====================================================
// ROTAS DA VITRINE (PÚBLICA)
// =====================================================

// Listar produtos da vitrine
app.get('/api/vitrine', async (req, res) => {
    try {
        const { nicho, busca, ordem, pagina = 1, limite = 20 } = req.query;

        const filtros = { visivel_vitrine: true, aprovado: true };

        if (nicho) {
            filtros.nicho = nicho;
        }

        if (busca) {
            filtros.$text = { $search: busca };
        }

        let ordenacao = { criado_em: -1 };
        if (ordem === 'vendas') ordenacao = { vendas: -1 };
        if (ordem === 'preco_asc') ordenacao = { preco: 1 };
        if (ordem === 'preco_desc') ordenacao = { preco: -1 };

        const skip = (pagina - 1) * limite;

        const produtos = await Produto.find(filtros)
            .populate('dono', 'nome foto')
            .sort(ordenacao)
            .skip(skip)
            .limit(parseInt(limite));

        const total = await Produto.countDocuments(filtros);

        res.json({
            success: true,
            produtos,
            total,
            paginas: Math.ceil(total / limite),
            pagina_atual: parseInt(pagina)
        });
    } catch (error) {
        console.error('Erro ao listar vitrine:', error);
        res.status(500).json({ success: false, message: 'Erro ao listar produtos' });
    }
});

// Obter produto específico da vitrine
app.get('/api/vitrine/:id', async (req, res) => {
    try {
        const produto = await Produto.findOne({
            _id: req.params.id,
            visivel_vitrine: true,
            aprovado: true
        }).populate('dono', 'nome foto');

        if (!produto) {
            return res.status(404).json({ success: false, message: 'Produto não encontrado' });
        }

        // Incrementar visualizações
        produto.visualizacoes += 1;
        await produto.save();

        res.json({ success: true, produto });
    } catch (error) {
        console.error('Erro ao obter produto:', error);
        res.status(500).json({ success: false, message: 'Erro ao obter produto' });
    }
});

// =====================================================
// ROTAS ADMIN
// =====================================================

// Listar todos os usuários (admin)
app.get('/api/admin/usuarios', verificarToken, verificarAdmin, async (req, res) => {
    try {
        const usuarios = await Usuario.find()
            .select('-senha')
            .sort({ criado_em: -1 });

        res.json({ success: true, usuarios });
    } catch (error) {
        console.error('Erro ao listar usuários:', error);
        res.status(500).json({ success: false, message: 'Erro ao listar usuários' });
    }
});

// Atualizar cargo do usuário (admin)
app.patch('/api/admin/usuarios/:id/cargo', verificarToken, verificarDonoOuSubDono, async (req, res) => {
    try {
        const { cargo } = req.body;
        const usuario = await Usuario.findById(req.params.id);

        if (!usuario) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        // Não permitir alterar o dono principal
        if (usuario.email === (process.env.ADMIN_EMAIL || 'danielpedroribeirodasilva@gmail.com')) {
            return res.status(403).json({ success: false, message: 'Não é possível alterar o Dono principal' });
        }

        // Apenas dono pode promover a sub_dono ou dono
        if (['sub_dono', 'dono'].includes(cargo) && req.usuario.cargo !== 'dono') {
            return res.status(403).json({ success: false, message: 'Apenas o Dono pode promover a este cargo' });
        }

        const cargoAnterior = usuario.cargo;
        usuario.cargo = cargo;

        // Admins têm acesso sem precisar pagar
        if (usuario.isAdmin()) {
            usuario.plano_pago = true;
        }

        await usuario.save();

        // Auditoria
        await new Auditoria({
            usuario: req.usuario._id,
            acao: 'alteracao_cargo',
            descricao: `Alterou cargo de ${usuario.email} de ${cargoAnterior} para ${cargo}`
        }).save();

        res.json({ success: true, usuario });
    } catch (error) {
        console.error('Erro ao alterar cargo:', error);
        res.status(500).json({ success: false, message: 'Erro ao alterar cargo' });
    }
});

// Banir/Desbanir usuário
app.patch('/api/admin/usuarios/:id/status', verificarToken, verificarAdmin, async (req, res) => {
    try {
        const { ativo, motivo } = req.body;
        const usuario = await Usuario.findById(req.params.id);

        if (!usuario) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        // Não permitir alterar o dono principal
        if (usuario.email === (process.env.ADMIN_EMAIL || 'danielpedroribeirodasilva@gmail.com')) {
            return res.status(403).json({ success: false, message: 'Não é possível alterar o Dono principal' });
        }

        usuario.ativo = ativo;
        await usuario.save();

        // Auditoria
        await new Auditoria({
            usuario: req.usuario._id,
            acao: ativo ? 'desbanir_usuario' : 'banir_usuario',
            descricao: `${ativo ? 'Desbaniu' : 'Baniu'} usuário ${usuario.email}. Motivo: ${motivo || 'Não informado'}`
        }).save();

        res.json({ success: true, usuario });
    } catch (error) {
        console.error('Erro ao alterar status:', error);
        res.status(500).json({ success: false, message: 'Erro ao alterar status' });
    }
});

// Listar todos os pagamentos (admin)
app.get('/api/admin/pagamentos', verificarToken, verificarAdmin, async (req, res) => {
    try {
        const pagamentos = await Pagamento.find()
            .populate('usuario', 'email nome')
            .sort({ criado_em: -1 });

        res.json({ success: true, pagamentos });
    } catch (error) {
        console.error('Erro ao listar pagamentos:', error);
        res.status(500).json({ success: false, message: 'Erro ao listar pagamentos' });
    }
});

// Estatísticas do admin
app.get('/api/admin/stats', verificarToken, verificarAdmin, async (req, res) => {
    try {
        const totalUsuarios = await Usuario.countDocuments();
        const usuariosAtivos = await Usuario.countDocuments({ plano_pago: true });
        const totalProdutos = await Produto.countDocuments();
        const produtosAtivos = await Produto.countDocuments({ visivel_vitrine: true });
        const pagamentosAprovados = await Pagamento.countDocuments({ status: 'aprovado' });
        const receitaTotal = await Pagamento.aggregate([
            { $match: { status: 'aprovado' } },
            { $group: { _id: null, total: { $sum: '$valor' } } }
        ]);

        res.json({
            success: true,
            stats: {
                totalUsuarios,
                usuariosAtivos,
                totalProdutos,
                produtosAtivos,
                pagamentosAprovados,
                receitaTotal: receitaTotal[0]?.total || 0
            }
        });
    } catch (error) {
        console.error('Erro ao obter stats:', error);
        res.status(500).json({ success: false, message: 'Erro ao obter estatísticas' });
    }
});

// =====================================================
// ROTAS DE NOTIFICAÇÕES
// =====================================================

// Listar notificações do usuário
app.get('/api/notificacoes', verificarToken, async (req, res) => {
    try {
        const notificacoes = await Notificacao.find({ usuario: req.usuario._id })
            .sort({ criado_em: -1 })
            .limit(50);

        res.json({ success: true, notificacoes });
    } catch (error) {
        console.error('Erro ao listar notificações:', error);
        res.status(500).json({ success: false, message: 'Erro ao listar notificações' });
    }
});

// Marcar notificação como lida
app.patch('/api/notificacoes/:id/lida', verificarToken, async (req, res) => {
    try {
        await Notificacao.findByIdAndUpdate(req.params.id, { lida: true });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro' });
    }
});

// =====================================================
// ROTAS DE CHAT
// =====================================================

// Histórico do chat público
app.get('/api/chat/publico', verificarToken, async (req, res) => {
    try {
        const mensagens = await obterHistoricoPublico(50);
        res.json({ success: true, mensagens });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro' });
    }
});

// Histórico de chat privado
app.get('/api/chat/privado/:userId', verificarToken, async (req, res) => {
    try {
        const mensagens = await obterHistoricoPrivado(req.usuario._id, req.params.userId, 50);
        res.json({ success: true, mensagens });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro' });
    }
});

// =====================================================
// ROTAS DE PERFIL
// =====================================================

// Atualizar perfil
app.put('/api/perfil', verificarToken, async (req, res) => {
    try {
        const { nome, foto, telefone } = req.body;
        const usuario = req.usuario;

        if (nome) usuario.nome = nome;
        if (foto) usuario.foto = foto;
        if (telefone) usuario.telefone = telefone;

        await usuario.save();

        res.json({ success: true, usuario });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao atualizar perfil' });
    }
});

// =====================================================
// FEEDBACK
// =====================================================

// Enviar feedback
app.post('/api/feedback', async (req, res) => {
    try {
        const { nome, email, mensagem, rating } = req.body;

        const feedback = new Feedback({
            nome: nome || 'Anônimo',
            email: email || '',
            mensagem,
            rating: rating || 5
        });

        await feedback.save();

        res.json({ success: true, message: 'Feedback enviado!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao enviar feedback' });
    }
});

// Listar feedbacks (admin)
app.get('/api/admin/feedbacks', verificarToken, verificarAdmin, async (req, res) => {
    try {
        const feedbacks = await Feedback.find().sort({ criado_em: -1 });
        res.json({ success: true, feedbacks });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro' });
    }
});

// =====================================================
// ROTAS DE PÁGINAS HTML
// =====================================================

// Página inicial
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dashboard
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Vitrine
app.get('/vitrine', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'vitrine.html'));
});

// Admin
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 404
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================

const PORT = process.env.PORT || 3000;

// Conectar ao banco e iniciar servidor
connectDB().then(() => {
    server.listen(PORT, () => {
        console.log(`
🚀 ================================
   MDA VENDAS - Servidor Iniciado
   Porta: ${PORT}
   Ambiente: ${process.env.NODE_ENV || 'development'}
================================ 🚀
        `);
    });
}).catch(err => {
    console.error('Falha ao iniciar servidor:', err);
    process.exit(1);
});

module.exports = { app, server };
