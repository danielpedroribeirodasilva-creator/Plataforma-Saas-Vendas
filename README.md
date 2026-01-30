# MDA Vendas

🚀 Plataforma brasileira inovadora para venda de produtos digitais com vitrine de afiliados e marketplace colaborativo.

## 📋 Funcionalidades

- ✅ **Autenticação Firebase** - Login com Google e email/senha
- ✅ **Pagamento PIX Real** - Integração com Mercado Pago API (QR Code real)
- ✅ **Sistema de Planos** - Mensal (R$200), Semestral (R$500), Anual (R$1000)
- ✅ **Dashboard Completo** - Gerenciamento de produtos e visualizações
- ✅ **Vitrine Pública** - Showcase de produtos com filtros e busca
- ✅ **Links de Afiliados** - Integração com Kimify, Cakto, Kirvano
- ✅ **Chat em Tempo Real** - Socket.io para comunicação
- ✅ **Painel Admin** - Gerenciamento de usuários e cargos
- ✅ **Sistema de Cargos** - Dono, Sub-Dono, ADM Completo, ADM Cuidador, Usuário
- ✅ **Design Espacial** - Tema escuro/azul com lua e estrelas 3D

## 🛠️ Tecnologias

- **Frontend**: HTML5, CSS3, JavaScript ES6+, TailwindCSS
- **Backend**: Node.js, Express.js, Socket.io
- **Banco de Dados**: MongoDB (Mongoose)
- **Autenticação**: Firebase Auth, JWT
- **Pagamentos**: Mercado Pago API (PIX real)

## 📦 Instalação

### Pré-requisitos
- Node.js v18+
- MongoDB (local ou Atlas)
- Conta Mercado Pago (opcional para testes)

### Passos

1. **Clonar o projeto**
```bash
cd "Zoer Dan Ai"
```

2. **Instalar dependências**
```bash
npm install
```

3. **Configurar variáveis de ambiente**
Edite o arquivo `.env` com suas configurações:
```env
MONGODB_URI=mongodb://localhost:27017/mda-vendas
JWT_SECRET=sua_chave_secreta
MERCADOPAGO_ACCESS_TOKEN=sua_chave_mercado_pago
ADMIN_EMAIL=seu_email_admin@gmail.com
```

4. **Iniciar MongoDB** (se local)
```bash
mongod
```

5. **Iniciar o servidor**
```bash
npm start
```

6. **Acessar a plataforma**
```
http://localhost:3000
```

## 🔑 Admin Master

O email configurado em `ADMIN_EMAIL` (padrão: `danielpedroribeirodasilva@gmail.com`) é automaticamente criado como **Dono** com acesso total, sem precisar pagar plano.

## 📂 Estrutura

```
├── package.json
├── server.js           # Servidor Express + API
├── database.js         # Schemas MongoDB
├── .env                # Variáveis de ambiente
├── public/
│   ├── index.html      # Landing page
│   ├── dashboard.html  # Dashboard do usuário
│   ├── vitrine.html    # Vitrine pública
│   ├── admin.html      # Painel admin
│   └── css/styles.css  # Estilos
├── services/
│   ├── mercadopago.js  # Integração pagamentos
│   └── chat-websockets.js
└── middleware/
    └── auth-middleware.js
```

## 💳 Pagamentos

A plataforma usa a API do **Mercado Pago** para gerar PIX reais:
- QR Code gerado instantaneamente
- Confirmação via webhook automática
- Plano ativado em até 10 segundos após pagamento

## 🤝 Afiliados

Ao criar um produto, o vendedor pode:
1. Habilitar "Aceitar Afiliados"
2. Adicionar link de afiliado externo (Kimify, Cakto, Kirvano, etc.)
3. Definir comissão em %

## 📱 Responsivo

A plataforma funciona em:
- Desktop (1920px+)
- Tablet (768px)
- Mobile (320px)

## 🚀 Deploy

### Recomendações:
- **Frontend/Backend**: Render, Railway, ou Vercel
- **Banco de Dados**: MongoDB Atlas (gratuito)
- **Domínio**: Qualquer provedor (Namecheap, Cloudflare)

### Comandos:
```bash
# Produção
npm start

# Desenvolvimento (com nodemon)
npm run dev
```

## ⚠️ Notas Importantes

1. A chave do Mercado Pago no `.env` é de **produção** - pagamentos são reais
2. O Firebase está configurado para o projeto `app-finance-ai`
3. MongoDB deve estar rodando antes de iniciar o servidor
4. O admin master é criado automaticamente no primeiro start

## 📧 Suporte

WhatsApp: +55 11 99999-9999

---

© 2024 MDA Vendas - Todos os direitos reservados.
