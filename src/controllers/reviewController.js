const pool = require('../config/db');
const logger = require('../config/logger');

const createReview = async (req, res) => {
  const { brecho_id, usuario_id, usuario_nome, nota, comentario } = req.body;

  try {
    const [result] = await pool.query(`
      INSERT INTO avaliacoes (brecho_id, usuario_id, usuario_nome, nota, comentario)
      VALUES (?, ?, ?, ?, ?)
    `, [brecho_id, usuario_id || 1, usuario_nome || 'Usuário', nota, comentario]);

    logger.info(`Nova avaliação inserida com sucesso. ID: ${result.insertId}`);

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Avaliação enviada com sucesso.',
      dados: { id: result.insertId }
    });
  } catch (error) {
    logger.error(`Erro na rota POST /avaliacoes: ${error.message}`);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao salvar a avaliação.'
    });
  }
};

module.exports = { createReview };