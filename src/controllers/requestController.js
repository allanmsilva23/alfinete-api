const pool = require('../config/db');
const logger = require('../config/logger');

const createRequest = async (req, res) => {
  // Extrai os campos exigidos pelo formulário de avaliação de peça
  const {
    usuario_id,
    brecho_id,
    categoria_peca,
    marca,
    tamanho,
    possui_manchas,
    possui_rasgos,
    descricao,
    foto_frente_url,
    foto_verso_url
  } = req.body;

  try {
    // Insere no banco com status definido estaticamente como 'PENDENTE'
    const [result] = await pool.query(`
      INSERT INTO solicitacoes_pecas (
        usuario_id,
        brecho_id,
        categoria_peca,
        marca,
        tamanho,
        possui_manchas,
        possui_rasgos,
        descricao,
        foto_frente_url,
        foto_verso_url,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE')
    `, [
      usuario_id, 
      brecho_id, 
      categoria_peca, 
      marca, 
      tamanho,
      possui_manchas, 
      possui_rasgos, 
      descricao, 
      foto_frente_url, 
      foto_verso_url
    ]);

    logger.info(`Nova solicitação cadastrada com sucesso. ID: ${result.insertId}`);

    // Retorna mensagem estruturada de sucesso
    return res.status(201).json({
      sucesso: true,
      mensagem: 'Solicitação de avaliação enviada com sucesso.',
      dados: { solicitacao_id: result.insertId }
    });

  } catch (error) {
    logger.error(`Erro na rota POST /solicitacoes: ${error.message}`);
    
    // Retorna mensagem estruturada de erro
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno no servidor ao cadastrar a solicitação.'
    });
  }
};

module.exports = {
  createRequest
};