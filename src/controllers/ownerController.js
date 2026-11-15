
'use strict';

const pool = require('../config/db');
const { validId, reject, publicUrl, unlinkLocal } = require('../utils');
const { splitChanges, saveAddress } = require('../services/address');

const fields = [
  'nome',
  'descricao',
  'endereco_curto',
  'horario_funcionamento',
  'regras_avaliacao',
  'telefone',
  'link_instagram',
];

const limits = {
  nome: 120,
  descricao: 1800,
  endereco_curto: 255,
  horario_funcionamento: 255,
  regras_avaliacao: 1800,
  telefone: 30,
  link_instagram: 255,
};

const has = (obj, key) =>
  Object.prototype.hasOwnProperty.call(obj, key);

async function owned(userId) {
  const [[b]] = await pool.execute(
    'SELECT * FROM brecho WHERE usuario_id=? AND ativo=1 LIMIT 1',
    [userId]
  );

  return b;
}

async function me(req, res, next) {
  try {
    const b = await owned(req.user.id);

    if (!b) return reject(res, 404, 'Brechó não encontrado.');

    const [[addr]] = await pool.execute(
      'SELECT logradouro,numero,bairro,cidade,estado,cep FROM enderecos_brechos WHERE brecho_id=? LIMIT 1',
      [b.id]
    );

    const [fotos] = await pool.execute(
      'SELECT id,url,ordem FROM brecho_fotos WHERE brecho_id=? ORDER BY ordem,id',
      [b.id]
    );

    const [estilos] = await pool.execute(
      `SELECT e.nome FROM estilo e
       INNER JOIN brecho_estilo be ON be.estilo_id=e.id
       WHERE be.brecho_id=?
       ORDER BY e.nome ASC`,
      [b.id]
    );

    const [[stats]] = await pool.execute(
      'SELECT COUNT(*) total,ROUND(AVG(nota),1) media FROM avaliacoes WHERE brecho_id=?',
      [b.id]
    );

    return res.json({
      sucesso: true,
      dados: {
        ...b,
        ...(addr || {}),
        fotos,
        estilos: estilos.map(e => e.nome),
        nota_media: stats.media,
        total_avaliacoes: stats.total,
      },
    });
  } catch (e) {
    return next(e);
  }
}

function normalizarEstilo(entrada) {
  const texto = entrada
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');

  return texto
    .replace(/(^|[\s/\\&+.'_ -])(\p{L})/gu, (_, separador, letra) =>
      separador + letra.toLocaleUpperCase('pt-BR')
    )
    .replace(/\bY2k\b/g, 'Y2K');
}

function chaveEstilo(entrada) {
  return entrada
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
    .replace(/\s+/g, ' ');
}

function lerPreco(valor) {
  if (valor === null) return null;

  if (typeof valor !== 'string' && typeof valor !== 'number') {
    return undefined;
  }

  const texto = String(valor).trim();

  if (texto.length === 0 || texto.length > 11) {
    return undefined;
  }

  if (!/^[0-9]{1,8}([.,][0-9]{1,2})?$/.test(texto)) {
    return undefined;
  }

  const numero = Number(texto.replace(',', '.'));

  if (
    !Number.isFinite(numero) ||
    numero < 0 ||
    numero > 99999999.99
  ) {
    return undefined;
  }

  return Number(numero.toFixed(2));
}

function moeda(valor) {
  return `R$ ${valor.toFixed(2).replace('.', ',')}`;
}

function corpoValido(body) {
  return body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body);
}

async function update(req, res, next) {
  try {
    const b = await owned(req.user.id);

    if (!b) return reject(res, 404, 'Brechó não encontrado.');

    const body = req.body;

    if (!corpoValido(body)) {
      return reject(res, 400, 'Dados inválidos.');
    }

    const changes = {};
    const address = splitChanges(body);

    for (const field of fields) {
      if (!has(body, field)) continue;

      if (
        typeof body[field] !== 'string' ||
        body[field].length > limits[field] ||
        (field === 'nome' && body[field].trim().length < 2)
      ) {
        return reject(res, 400, `Valor inválido: ${field}.`);
      }

      changes[field] = body[field].trim();
    }

    const informouMin = has(body, 'preco_minimo');
    const informouMax = has(body, 'preco_maximo');

    if (informouMin !== informouMax) {
      return reject(
        res,
        400,
        'Informe ambos os preços, ou deixe ambos vazios.'
      );
    }

    if (informouMin) {
      const min = lerPreco(body.preco_minimo);
      const max = lerPreco(body.preco_maximo);

      if (
        min === undefined ||
        max === undefined ||
        (min === null) !== (max === null)
      ) {
        return reject(res, 400, 'Preço mínimo ou máximo inválido.');
      }

      if (min !== null && min > max) {
        return reject(
          res,
          400,
          'O preço mínimo não pode ser maior que o máximo.'
        );
      }

      changes.preco_minimo = min;
      changes.preco_maximo = max;
      changes.faixa_preco = min === null
        ? null
        : `${moeda(min)} a ${moeda(max)}`;
    }

    const informouEstilos = has(body, 'estilos');
    const estilos = [];

    if (informouEstilos) {
      if (!Array.isArray(body.estilos) || body.estilos.length > 12) {
        return reject(res, 400, 'Informe até 12 estilos.');
      }

      const vistos = new Set();

      for (const entrada of body.estilos) {
        if (
          typeof entrada !== 'string' ||
          entrada.length > 160
        ) {
          return reject(res, 400, 'Estilo inválido.');
        }

        const nome = normalizarEstilo(entrada);

        if (
          nome.length < 2 ||
          nome.length > 40 ||
          !/^[\p{L}\p{N}\s&'./+\-]+$/u.test(nome)
        ) {
          return reject(
            res,
            400,
            'Estilo inválido: use de 2 a 40 caracteres.'
          );
        }

        const key = chaveEstilo(nome);

        if (!vistos.has(key)) {
          vistos.add(key);
          estilos.push(nome);
        }
      }
    }

    if (
      !Object.keys(changes).length &&
      !Object.keys(address).length &&
      !informouEstilos
    ) {
      return reject(res, 400, 'Nenhum campo para atualizar.');
    }

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      if (Object.keys(changes).length) {
        const keys = Object.keys(changes);
        const assignments = keys.map(key => `${key}=?`).join(',');

        await conn.execute(
          `UPDATE brecho SET ${assignments} WHERE id=?`,
          [...keys.map(key => changes[key]), b.id]
        );
      }

      await saveAddress(conn, b.id, address);

      if (changes.nome) {
        await conn.execute(
          'UPDATE usuarios SET nome=? WHERE id=?',
          [changes.nome, req.user.id]
        );
      }

      if (informouEstilos) {
        await conn.execute(
          'DELETE FROM brecho_estilo WHERE brecho_id=?',
          [b.id]
        );

        for (const nome of estilos) {
          const [[existente]] = await conn.execute(
            'SELECT id,nome FROM estilo WHERE nome=? LIMIT 1',
            [nome]
          );

          let estiloId = existente?.id;

          if (!estiloId) {
            const [insert] = await conn.execute(
              'INSERT INTO estilo (nome) VALUES (?)',
              [nome]
            );

            estiloId = insert.insertId;
          } else if (existente.nome !== nome) {
            await conn.execute(
              'UPDATE estilo SET nome=? WHERE id=?',
              [nome, estiloId]
            );
          }

          await conn.execute(
            'INSERT INTO brecho_estilo (brecho_id,estilo_id) VALUES (?,?)',
            [b.id, estiloId]
          );
        }
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    return res.json({
      sucesso: true,
      mensagem: 'Informações do brechó atualizadas.',
    });
  } catch (e) {
    if (e.status) return reject(res, e.status, e.message);
    return next(e);
  }
}

async function photos(req, res, next) {
  const files = Array.isArray(req.files) ? req.files : [];

  try {
    const b = await owned(req.user.id);

    if (!b) return reject(res, 404, 'Brechó não encontrado.');

    if (!files.length) {
      return reject(res, 400, 'Selecione uma ou mais fotos.');
    }

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      await conn.execute(
        'SELECT id FROM brecho WHERE id=? FOR UPDATE',
        [b.id]
      );

      const [[{ total }]] = await conn.execute(
        'SELECT COUNT(*) total FROM brecho_fotos WHERE brecho_id=?',
        [b.id]
      );

      if (Number(total) + files.length > 5) {
        await conn.rollback();

        return reject(
          res,
          400,
          'O brechó pode ter no máximo 5 fotos.'
        );
      }

      for (const [i, file] of files.entries()) {
        await conn.execute(
          'INSERT INTO brecho_fotos (brecho_id,url,ordem) VALUES (?,?,?)',
          [b.id, publicUrl(file.filename), Number(total) + i]
        );
      }

      const [[cover]] = await conn.execute(
        'SELECT url FROM brecho_fotos WHERE brecho_id=? ORDER BY ordem,id LIMIT 1',
        [b.id]
      );

      await conn.execute(
        'UPDATE brecho SET imagem_url=? WHERE id=?',
        [cover?.url || null, b.id]
      );

      await conn.commit();

      return res.status(201).json({
        sucesso: true,
        mensagem: 'Fotos adicionadas com sucesso.',
      });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    return next(e);
  } finally {
    if (!res.headersSent || res.statusCode >= 400) {
      for (const f of files) {
        if (typeof f.filename === 'string') {
          await unlinkLocal(publicUrl(f.filename));
        }
      }
    }
  }
}

async function deletePhoto(req, res, next) {
  try {
    const b = await owned(req.user.id);

    if (!b || !validId(req.params.id)) {
      return reject(res, 404, 'Foto não encontrada.');
    }

    const [[f]] = await pool.execute(
      'SELECT id,url FROM brecho_fotos WHERE id=? AND brecho_id=?',
      [req.params.id, b.id]
    );

    if (!f) return reject(res, 404, 'Foto não encontrada.');

    await pool.execute(
      'DELETE FROM brecho_fotos WHERE id=? AND brecho_id=?',
      [f.id, b.id]
    );

    const [[cover]] = await pool.execute(
      'SELECT url FROM brecho_fotos WHERE brecho_id=? ORDER BY ordem,id LIMIT 1',
      [b.id]
    );

    await pool.execute(
      'UPDATE brecho SET imagem_url=? WHERE id=?',
      [cover?.url || null, b.id]
    );

    await unlinkLocal(f.url);

    return res.json({
      sucesso: true,
      mensagem: 'Foto excluída.',
    });
  } catch (e) {
    return next(e);
  }
}

async function requests(req, res, next) {
  try {
    const b = await owned(req.user.id);

    if (!b) return reject(res, 404, 'Brechó não encontrado.');

    const [rows] = await pool.execute(
      `SELECT s.*,u.nome AS nome_usuario
       FROM solicitacoes_pecas s
       JOIN usuarios u ON u.id=s.usuario_id
       WHERE s.brecho_id=?
       ORDER BY s.criado_em DESC`,
      [b.id]
    );

    return res.json({
      sucesso: true,
      dados: rows,
    });
  } catch (e) {
    return next(e);
  }
}

async function status(req, res, next) {
  try {
    const b = await owned(req.user.id);

    if (!b || !validId(req.params.id)) {
      return reject(res, 404, 'Solicitação não encontrada.');
    }

    const body = req.body;

    if (!corpoValido(body) || typeof body.status !== 'string') {
      return reject(res, 400, 'Status inválido.');
    }

    const estado = body.status.toUpperCase();

    if (!['PENDENTE', 'APROVADO', 'RECUSADO'].includes(estado)) {
      return reject(res, 400, 'Status inválido.');
    }

    const motivo = typeof body.motivo_recusa === 'string'
      ? body.motivo_recusa.trim()
      : '';

    if (
      estado === 'RECUSADO' &&
      (motivo.length < 3 || motivo.length > 500)
    ) {
      return reject(
        res,
        400,
        'Informe o motivo da recusa (3 a 500 caracteres).'
      );
    }

    const [r] = await pool.execute(
      `UPDATE solicitacoes_pecas
       SET status=?,motivo_recusa=?,atualizado_em=NOW()
       WHERE id=? AND brecho_id=?`,
      [
        estado,
        estado === 'RECUSADO' ? motivo : null,
        req.params.id,
        b.id,
      ]
    );

    return r.affectedRows
      ? res.json({ sucesso: true, mensagem: 'Status atualizado.' })
      : reject(res, 404, 'Solicitação não encontrada.');
  } catch (e) {
    return next(e);
  }
}

async function reviews(req, res, next) {
  try {
    const b = await owned(req.user.id);

    if (!b) return reject(res, 404, 'Brechó não encontrado.');

    const [rows] = await pool.execute(
      `SELECT id,usuario_nome,nota,comentario,data_criacao,
              resposta_brecho,resposta_em
       FROM avaliacoes
       WHERE brecho_id=?
       ORDER BY data_criacao DESC`,
      [b.id]
    );

    const [[s]] = await pool.execute(
      'SELECT ROUND(AVG(nota),1) media,COUNT(*) total FROM avaliacoes WHERE brecho_id=?',
      [b.id]
    );

    return res.json({
      sucesso: true,
      dados: {
        avaliacoes: rows,
        nota_media: s.media,
        total: s.total,
      },
    });
  } catch (e) {
    return next(e);
  }
}

async function reply(req, res, next) {
  try {
    const b = await owned(req.user.id);

    if (!b || !validId(req.params.id)) {
      return reject(res, 404, 'Avaliação não encontrada.');
    }

    const resposta = req.body?.resposta;

    if (
      typeof resposta !== 'string' ||
      resposta.trim().length < 2 ||
      resposta.trim().length > 1000
    ) {
      return reject(
        res,
        400,
        'Escreva uma resposta de 2 a 1.000 caracteres.'
      );
    }

    const [r] = await pool.execute(
      `UPDATE avaliacoes
       SET resposta_brecho=?,resposta_em=NOW()
       WHERE id=? AND brecho_id=?`,
      [resposta.trim(), req.params.id, b.id]
    );

    return r.affectedRows
      ? res.json({ sucesso: true, mensagem: 'Resposta publicada.' })
      : reject(res, 404, 'Avaliação não encontrada.');
  } catch (e) {
    return next(e);
  }
}

async function deleteAccount(req, res, next) {
  let conn;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [[b]] = await conn.execute(
      'SELECT id FROM brecho WHERE usuario_id=? AND ativo=1 FOR UPDATE',
      [req.user.id]
    );

    if (!b) {
      await conn.rollback();
      return reject(res, 404, 'Brechó não encontrado.');
    }

    await conn.execute(
      'UPDATE brecho SET ativo=0 WHERE id=?',
      [b.id]
    );

    await conn.execute(
      'UPDATE usuarios SET ativo=0,reset_token_hash=NULL WHERE id=?',
      [req.user.id]
    );

    await conn.commit();

    return res.json({
      sucesso: true,
      mensagem: 'Conta desativada e brechó removido do feed. Dados históricos preservados.',
    });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (_) {}
    }

    return next(e);
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  me,
  update,
  photos,
  deletePhoto,
  requests,
  status,
  reviews,
  reply,
  deleteAccount,
};