const mongoose = require('mongoose');
const { Usuario } = require('./database');
require('dotenv').config();

const verifyUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mda-vendas');
        console.log('Connected to DB');

        const users = await Usuario.find({});
        console.log(`Found ${users.length} users:`);
        users.forEach(u => {
            console.log(`- ${u.email} (Provider: ${u.auth_provider}, Admin: ${u.cargo})`);
            console.log(`  Senha set: ${!!u.senha}`);
        });

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

verifyUsers();
