const pool = require('../config/db');
const logger = require('../config/logger');

const getThriftStores = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        b.id, 
        b.nome, 
        b.endereco_curto, 
        b.imagem_url as imagem,
        COALESCE(JSON_ARRAYAGG(e.nome), JSON_ARRAY()) as estilos
      FROM brecho b
      LEFT JOIN brecho_estilo be ON b.id = be.brecho_id
      LEFT JOIN estilo e ON be.estilo_id = e.id
      GROUP BY b.id;
    `);

    logger.info(`Listagem de brechós consultada com sucesso. Total de registros: ${rows.length}`);
    
    return res.status(200).json({
      sucesso: true,
      dados: rows
    });

  } catch (error) {
    logger.error(`Erro na rota GET /brechos/filtros: ${error.message}`);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno no servidor ao buscar os brechós.'
    });
  }
};

module.exports = {
  getThriftStores
};