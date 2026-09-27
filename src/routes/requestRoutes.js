const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');

// Mapeia a criação de solicitações para a raiz deste grupo de rotas
router.post('/', requestController.createRequest);

module.exports = router;