require('dotenv').config();
require('newrelic');

const express = require('express');
const winston = require('winston');
const newrelicFormatter = require('@newrelic/winston-enricher')(winston);
const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.label({ label: 'alfinete-api' }),
    newrelicFormatter()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

app.get('/', (req, res) => {
  logger.info('Acedida a rota raiz da API Alfinete');
  res.send('API do Alfinete rodando com sucesso!');
});

app.listen(port, () => {
  console.log(`Servidor iniciado na porta ${port}`);
});