const rateLimit = require('express-rate-limit');
const logger = require('./logger');

// Define the rate limit rule: max 100 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limite de 100 requisições por IP a cada janela de 15 minutos
  message: {
    sucesso: false,
    mensagem: 'Muitas requisições feitas a partir deste IP. Por favor, tente novamente mais tarde.'
  },
  handler: (req, res, next, options) => {
    // Log the security event when an IP exceeds the limit
    logger.warn(`Rate limit excedido para o IP: ${req.ip} na rota ${req.originalUrl}`);
    res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true, // Retorna as informações de limite nos cabeçalhos `RateLimit-*`
  legacyHeaders: false, // Desativa os cabeçalhos antigos `X-RateLimit-*`
});

module.exports = apiLimiter;