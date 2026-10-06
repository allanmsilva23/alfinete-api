require('dotenv').config();
require('newrelic');

const express = require('express');
const logger = require('./src/config/logger');
const apiLimiter = require('./src/config/rateLimit'); 

// Importação das rotas
const thriftRoutes = require('./src/routes/thriftRoutes');
const requestRoutes = require('./src/routes/requestRoutes');
const reviewRoutes = require('./src/routes/reviewRoutes');

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  logger.info('Acessada a rota raiz de saúde da API');
  res.send('API do Alfinete rodando com sucesso!');
});

// Grupos de Rotas protegidos
app.use('/brechos', apiLimiter, thriftRoutes);
app.use('/solicitacoes', apiLimiter, requestRoutes);
app.use('/avaliacoes', apiLimiter, reviewRoutes);

app.listen(port, () => {
  console.log(`Servidor iniciado na porta ${port}`);
});