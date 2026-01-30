// =====================================================
// MDA VENDAS - AUTH MIDDLEWARE
// Middleware de autenticação e autorização por cargo
// =====================================================

const jwt = require('jsonwebtoken');
const { Usuario } = require('../database');

// =====================================================
// VERIFICAR TOKEN JWT
// =====================================================
const verificarToken = async (req, res, next) => {
    try {
        // Obter token do header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Token não fornecido'
            });
        }

        const token = authHeader.split(' ')[1];

        // Verificar token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'mda_vendas_secret');

        // Buscar usuário
        const usuario = await Usuario.findById(decoded.id);

        if (!usuario) {
            return res.status(401).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        if (!usuario.ativo) {
            return res.status(401).json({
                success: false,
                message: 'Conta desativada'
            });
        }

        // Adicionar usuário ao request
        req.usuario = usuario;
        next();
    } catch (error) {
        console.error('Erro de autenticação:', error);
        return res.status(401).json({
            success: false,
            message: 'Token inválido ou expirado'
        });
    }
};

// =====================================================
// VERIFICAR SE PAGOU PLANO OU É ADMIN
// =====================================================
const verificarAcesso = async (req, res, next) => {
    try {
        if (!req.usuario) {
            return res.status(401).json({
                success: false,
                message: 'Não autorizado'
            });
        }

        // Admins sempre têm acesso
        if (req.usuario.isAdmin()) {
            return next();
        }

        // Verificar se pagou plano
        if (!req.usuario.plano_pago) {
            return res.status(403).json({
                success: false,
                message: 'Acesso bloqueado. Por favor, adquira um plano.',
                redirect: '/planos'
            });
        }

        // Verificar se plano não expirou
        if (req.usuario.plano_ativo && req.usuario.plano_ativo.data_expiracao) {
            if (new Date() > new Date(req.usuario.plano_ativo.data_expiracao)) {
                // Plano expirou
                req.usuario.plano_pago = false;
                await req.usuario.save();

                return res.status(403).json({
                    success: false,
                    message: 'Seu plano expirou. Renove para continuar.',
                    redirect: '/planos'
                });
            }
        }

        next();
    } catch (error) {
        console.error('Erro ao verificar acesso:', error);
        return res.status(500).json({
            success: false,
            message: 'Erro interno'
        });
    }
};

// =====================================================
// VERIFICAR CARGO MÍNIMO
// =====================================================
const verificarCargo = (...cargosPermitidos) => {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({
                success: false,
                message: 'Não autorizado'
            });
        }

        if (!cargosPermitidos.includes(req.usuario.cargo)) {
            return res.status(403).json({
                success: false,
                message: 'Permissão insuficiente para esta ação'
            });
        }

        next();
    };
};

// =====================================================
// VERIFICAR SE É ADMIN
// =====================================================
const verificarAdmin = (req, res, next) => {
    if (!req.usuario) {
        return res.status(401).json({
            success: false,
            message: 'Não autorizado'
        });
    }

    if (!req.usuario.isAdmin()) {
        return res.status(403).json({
            success: false,
            message: 'Acesso restrito a administradores'
        });
    }

    next();
};

// =====================================================
// VERIFICAR SE É DONO OU SUB-DONO
// =====================================================
const verificarDonoOuSubDono = (req, res, next) => {
    if (!req.usuario) {
        return res.status(401).json({
            success: false,
            message: 'Não autorizado'
        });
    }

    if (!['dono', 'sub_dono'].includes(req.usuario.cargo)) {
        return res.status(403).json({
            success: false,
            message: 'Acesso restrito a Dono ou Sub-Dono'
        });
    }

    next();
};

// =====================================================
// VERIFICAR SE É DONO
// =====================================================
const verificarDono = (req, res, next) => {
    if (!req.usuario) {
        return res.status(401).json({
            success: false,
            message: 'Não autorizado'
        });
    }

    if (req.usuario.cargo !== 'dono') {
        return res.status(403).json({
            success: false,
            message: 'Acesso restrito ao Dono'
        });
    }

    next();
};

// =====================================================
// GERAR TOKEN JWT
// =====================================================
const gerarToken = (usuario) => {
    return jwt.sign(
        {
            id: usuario._id,
            email: usuario.email,
            cargo: usuario.cargo
        },
        process.env.JWT_SECRET || 'mda_vendas_secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
};

module.exports = {
    verificarToken,
    verificarAcesso,
    verificarCargo,
    verificarAdmin,
    verificarDonoOuSubDono,
    verificarDono,
    gerarToken
};
