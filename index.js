require('dotenv').config();
require('newrelic');

const express = require('express');
const logger = require('./src/config/logger');
const thriftRoutes = require('./src/routes/thriftRoutes');

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

// Rota base de saúde da API
app.get('/', (req, res) => {
  logger.info('Acessada a rota raiz de saúde da API');
  res.send('API do Alfinete rodando com sucesso!');
});

// Registro das rotas de brechós com o prefixo /brechos
app.use('/brechos', thriftRoutes);

app.listen(port, () => {
  console.log(`Servidor iniciado na porta ${port}`);
});