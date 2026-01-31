// =====================================================
// MDA VENDAS - MERCADO PAGO SERVICE
// Integração com API do Mercado Pago para pagamentos PIX REAIS
// =====================================================

const { MercadoPagoConfig, Payment } = require('mercadopago');

// Configurar cliente Mercado Pago com chave de produção
const client = new MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || 'APP_USR-2815752740971526-011023-795ec78c07f9c0af4e18a6b9b6487b9e-458181255'
});

const payment = new Payment(client);

// Valores dos planos - Assinatura Mensal/Anual
const PLANOS = {
    mensal: {
        nome: 'Plano Mensal',
        valor: 29.90,
        periodo: 'mês',
        dias: 30,
        descríção: 'Acesso completo mensal'
    },
    semestral: {
        nome: 'Plano Semestral',
        valor: 19.90,
        valorOriginal: 500.00,
        periodo: 'mês',
        dias: 30,
        promocional: true,
        descricao: 'Acesso completo com preço promocional'
    },
    anual: {
        nome: 'Plano Anual',
        valor: 199.90,
        periodo: 'ano',
        dias: 365,
        descricao: 'Acesso completo por 1 ano'
    }
};

// =====================================================
// GERAR PIX QR CODE REAL
// =====================================================
const gerarPixQRCode = async (plano, usuario, email, cpf) => {
    try {
        const planoInfo = PLANOS[plano];

        if (!planoInfo) {
            throw new Error('Plano inválido');
        }

        // Criar pagamento PIX no Mercado Pago
        const pagamentoData = {
            transaction_amount: planoInfo.valor,
            description: `MDA Vendas - ${planoInfo.nome}`,
            payment_method_id: 'pix',
            payer: {
                email: email,
                identification: {
                    type: 'CPF',
                    number: cpf.replace(/\D/g, '')
                }
            },
            notification_url: `${process.env.BASE_URL || 'https://mda-vendas.com.br'}/api/webhook/mercadopago`,
            external_reference: `${usuario}_${plano}_${Date.now()}`
        };

        const response = await payment.create({ body: pagamentoData });

        if (response && response.point_of_interaction && response.point_of_interaction.transaction_data) {
            const transactionData = response.point_of_interaction.transaction_data;

            return {
                success: true,
                payment_id: response.id,
                status: response.status,
                qr_code: transactionData.qr_code,
                qr_code_base64: transactionData.qr_code_base64,
                pix_copia_cola: transactionData.qr_code,
                valor: planoInfo.valor,
                plano: plano,
                plano_info: planoInfo,
                expiracao: new Date(Date.now() + 30 * 60 * 1000), // 30 minutos
                external_reference: pagamentoData.external_reference
            };
        } else {
            throw new Error('Resposta inválida do Mercado Pago');
        }
    } catch (error) {
        console.error('Erro ao gerar PIX:', error);
        return {
            success: false,
            error: error.message || 'Erro ao gerar pagamento PIX'
        };
    }
};

// =====================================================
// VERIFICAR STATUS DO PAGAMENTO
// =====================================================
const verificarPagamento = async (paymentId) => {
    try {
        const response = await payment.get({ id: paymentId });

        return {
            success: true,
            id: response.id,
            status: response.status, // approved, pending, rejected, etc.
            status_detail: response.status_detail,
            external_reference: response.external_reference,
            transaction_amount: response.transaction_amount,
            date_approved: response.date_approved
        };
    } catch (error) {
        console.error('Erro ao verificar pagamento:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

// =====================================================
// PROCESSAR WEBHOOK DO MERCADO PAGO
// =====================================================
const processarWebhook = async (data) => {
    try {
        if (data.type === 'payment') {
            const paymentId = data.data.id;
            const paymentInfo = await verificarPagamento(paymentId);

            if (paymentInfo.success && paymentInfo.status === 'approved') {
                return {
                    success: true,
                    approved: true,
                    payment_id: paymentId,
                    external_reference: paymentInfo.external_reference,
                    amount: paymentInfo.transaction_amount
                };
            }

            return {
                success: true,
                approved: false,
                status: paymentInfo.status
            };
        }

        return { success: false, error: 'Tipo de webhook não suportado' };
    } catch (error) {
        console.error('Erro ao processar webhook:', error);
        return { success: false, error: error.message };
    }
};

// =====================================================
// OBTER INFORMAÇÕES DOS PLANOS
// =====================================================
const obterPlanos = () => {
    return PLANOS;
};

const obterPlano = (tipo) => {
    return PLANOS[tipo] || null;
};

module.exports = {
    gerarPixQRCode,
    verificarPagamento,
    processarWebhook,
    obterPlanos,
    obterPlano,
    PLANOS
};
