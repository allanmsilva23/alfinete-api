const pool = require('../config/db');
const logger = require('../config/logger');

const createRequest = async (req, res) => {
  try {
    console.log('================================');
    console.log('POST /solicitacoes');
    console.log('BODY:', req.body);
    console.log('FILES:', req.files);
    console.log('================================');

    const {
      usuario_id,
      brecho_id,
      categoria_peca,
      marca,
      tamanho,
      possui_manchas,
      possui_rasgos,
      descricao,
    } = req.body || {};

    // ============================================
    // VALIDAÇÕES
    // ============================================

    if (!usuario_id) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'usuario_id é obrigatório.',
      });
    }

    if (!brecho_id) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'brecho_id é obrigatório.',
      });
    }

    if (!categoria_peca) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'categoria_peca é obrigatória.',
      });
    }

    // ============================================
    // ARQUIVOS
    // ============================================

    const arquivoFrente =
      req.files?.fotoFrente?.[0] || null;

    const arquivoVerso =
      req.files?.fotoVerso?.[0] || null;

    if (!arquivoFrente) {
      return res.status(400).json({
        sucesso: false,
        mensagem:
          'A foto da frente é obrigatória.',
      });
    }

    // ============================================
    // URLs
    // ============================================

    const baseUrl =
      `${req.protocol}://${req.get('host')}/uploads/`;

    const fotoFrenteUrl =
      arquivoFrente
        ? baseUrl + arquivoFrente.filename
        : null;

    const fotoVersoUrl =
      arquivoVerso
        ? baseUrl + arquivoVerso.filename
        : null;

    console.log(
      'Foto frente URL:',
      fotoFrenteUrl
    );

    console.log(
      'Foto verso URL:',
      fotoVersoUrl
    );

    // ============================================
    // BANCO DE DADOS
    // ============================================

    const [result] = await pool.query(
      `
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
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          'PENDENTE'
        )
      `,
      [
        usuario_id,
        brecho_id,
        categoria_peca,
        marca || null,
        tamanho || null,

        possui_manchas === 'true',
        possui_rasgos === 'true',

        descricao || '',

        fotoFrenteUrl,
        fotoVersoUrl,
      ]
    );

    logger.info(
      `Nova solicitação cadastrada com sucesso. ID: ${result.insertId}`
    );

    return res.status(201).json({
      sucesso: true,

      mensagem:
        'Solicitação enviada com sucesso.',

      dados: {
        solicitacao_id:
          result.insertId,

        foto_frente_url:
          fotoFrenteUrl,

        foto_verso_url:
          fotoVersoUrl,
      },
    });
  } catch (error) {
    console.error(
      'ERRO POST /solicitacoes:',
      error
    );

    logger.error(
      `Erro na rota POST /solicitacoes: ${error.message}`
    );

    return res.status(500).json({
      sucesso: false,

      mensagem:
        'Erro interno ao cadastrar solicitação.',

      erro:
        process.env.NODE_ENV ===
        'development'
          ? error.message
          : undefined,
    });
  }
};

module.exports = {
  createRequest,
};