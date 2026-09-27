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

const getThriftStoreById = async (req, res) => {
  const storeId = req.params.id; // Recebendo o ID pela URL

  try {
    const [rows] = await pool.query(`
      SELECT 
        b.id, 
        b.nome, 
        b.descricao,
        b.horario_funcionamento,
        b.faixa_preco,
        b.regras_avaliacao,
        b.imagem_url as imagem,
        JSON_OBJECT(
          'logradouro', eb.logradouro,
          'numero', eb.numero,
          'bairro', eb.bairro,
          'cidade', eb.cidade,
          'estado', eb.estado,
          'cep', eb.cep
        ) as endereco_completo,
        COALESCE(
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'nome_usuario', a.usuario_nome,
              'nota', a.nota,
              'comentario', a.comentario
            )
          ), JSON_ARRAY()
        ) as avaliacoes
      FROM brecho b
      LEFT JOIN enderecos_brechos eb ON b.id = eb.brecho_id
      LEFT JOIN avaliacoes a ON b.id = a.brecho_id
      WHERE b.id = ?
      GROUP BY b.id, eb.logradouro, eb.numero, eb.bairro, eb.cidade, eb.estado, eb.cep;
    `, [storeId]);

    if (rows.length === 0) {
      logger.warn(`Tentativa de acesso a brechó inexistente. ID: ${storeId}`);
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Brechó não encontrado.'
      });
    }

    logger.info(`Detalhes do brechó acessados com sucesso. ID: ${storeId}`);
    
    // Retornando o JSON completo com os detalhes da loja
    return res.status(200).json({
      sucesso: true,
      dados: rows[0]
    });

  } catch (error) {
    logger.error(`Erro na rota GET /brechos/${storeId}: ${error.message}`);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno no servidor ao buscar detalhes do brechó.'
    });
  }
};

module.exports = {
  getThriftStores,
  getThriftStoreById
};