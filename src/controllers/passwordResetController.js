'use strict';

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../config/db');
const { sendPasswordOtpEmail } = require('../services/passwordOtpEmail');
const { reject } = require('../utils');

const GENERIC = {
  sucesso: true,
  mensagem: 'Se houver uma conta com senha ativa nesse e-mail, enviaremos um código de verificação.',
};
const cleanEmail = value => String(value || '').trim().toLowerCase();
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 190;
const validPassword = value => typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;
const validCode = value => typeof value === 'string' && /^\d{6}$/.test(value);

// Mesmo segredo permanece no servidor. Sem o JWT_SECRET, o backend já não inicia.
function codeHash(userId, code) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET)
    .update(`alfinete-reset-otp:${userId}:${code}`)
    .digest('hex');
}
function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
function equalHex(a, b) {
  if (typeof a !== 'string' || a.length !== 64) return false;
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === 32 && y.length === 32 && crypto.timingSafeEqual(x, y);
}

// 1) Pede um código. Resposta genérica não revela se o e-mail existe.
async function requestOtp(req, res, next) {
  try {
    const email = cleanEmail(req.body?.email);
    if (!validEmail(email)) return reject(res, 400, 'Informe um e-mail válido.');

    // Não cria senha para perfis que só usam autenticação Google.
    const [[user]] = await pool.execute(
      'SELECT id, nome FROM usuarios WHERE email = ? AND senha_hash IS NOT NULL AND ativo = 1 LIMIT 1',
      [email]
    );
    if (!user) return res.json(GENERIC);

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const hash = codeHash(user.id, code);
    const conn = await pool.getConnection();
    let shouldSend = false;
    try {
      await conn.beginTransaction();
      const [[existing]] = await conn.execute(
        `SELECT usuario_id,
          (ultimo_envio > DATE_SUB(NOW(), INTERVAL 60 SECOND)) AS aguardando
         FROM recuperacao_senha_otp WHERE usuario_id = ? FOR UPDATE`,
        [user.id]
      );
      if (!existing) {
        await conn.execute(
          `INSERT INTO recuperacao_senha_otp
            (usuario_id, codigo_hash, codigo_expira_em, tentativas, ultimo_envio,
             reset_token_hash, reset_token_expira)
           VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 0, NOW(), NULL, NULL)`,
          [user.id, hash]
        );
        shouldSend = true;
      } else if (!Number(existing.aguardando)) {
        await conn.execute(
          `UPDATE recuperacao_senha_otp SET codigo_hash = ?,
            codigo_expira_em = DATE_ADD(NOW(), INTERVAL 10 MINUTE),
            tentativas = 0, ultimo_envio = NOW(),
            reset_token_hash = NULL, reset_token_expira = NULL
           WHERE usuario_id = ?`,
          [hash, user.id]
        );
        shouldSend = true;
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      if (e.code === 'ER_DUP_ENTRY') return res.json(GENERIC);
      throw e;
    } finally {
      conn.release();
    }

    if (shouldSend) {
      try {
        await sendPasswordOtpEmail({ to: email, code, nome: user.nome });
      } catch (e) {
        // Não revela existência da conta. A falha é registrada no servidor.
        console.error('Falha ao enviar OTP de recuperação:', e.code || e.name || 'SMTP_ERROR');
      }
    }
    return res.json(GENERIC);
  } catch (e) { return next(e); }
}

// 2) Verifica o código, consome o OTP e emite autorização curta para trocar senha.
async function verifyOtp(req, res, next) {
  let conn;
  try {
    const email = cleanEmail(req.body?.email);
    const code = req.body?.codigo;
    if (!validEmail(email) || !validCode(code)) {
      return reject(res, 400, 'Código inválido ou expirado. Solicite um novo código.');
    }
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [[record]] = await conn.execute(
      `SELECT o.usuario_id, o.codigo_hash, o.tentativas,
              (o.codigo_expira_em > NOW()) AS valido
       FROM recuperacao_senha_otp o
       INNER JOIN usuarios u ON u.id = o.usuario_id
       WHERE u.email = ? AND u.senha_hash IS NOT NULL AND u.ativo = 1
       FOR UPDATE`,
      [email]
    );
    if (!record || !record.codigo_hash || !Number(record.valido) || record.tentativas >= 5) {
      await conn.commit();
      return reject(res, 400, 'Código inválido ou expirado. Solicite um novo código.');
    }
    const matches = equalHex(record.codigo_hash, codeHash(record.usuario_id, code));
    if (!matches) {
      const attempts = Number(record.tentativas) + 1;
      if (attempts >= 5) {
        // Conserva o controle de 60s para impedir reenvios imediatos após 5 falhas.
        await conn.execute(
          'UPDATE recuperacao_senha_otp SET codigo_hash = NULL, codigo_expira_em = NULL, tentativas = 5, reset_token_hash = NULL, reset_token_expira = NULL WHERE usuario_id = ?',
          [record.usuario_id]
        );
      } else {
        await conn.execute('UPDATE recuperacao_senha_otp SET tentativas = ? WHERE usuario_id = ?', [attempts, record.usuario_id]);
      }
      await conn.commit();
      return reject(res, 400, attempts >= 5
        ? 'Muitas tentativas incorretas. Solicite um novo código.'
        : 'Código incorreto ou expirado. Confira e tente novamente.');
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    await conn.execute(
      `UPDATE recuperacao_senha_otp SET codigo_hash = NULL,
        codigo_expira_em = NULL, tentativas = 0,
        reset_token_hash = ?, reset_token_expira = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
       WHERE usuario_id = ?`,
      [tokenHash(resetToken), record.usuario_id]
    );
    await conn.commit();
    return res.json({ sucesso: true, dados: { reset_token: resetToken, expira_em_minutos: 10 } });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch (_) {} }
    return next(e);
  } finally {
    if (conn) conn.release();
  }
}

// 3) Somente com o token temporário obtido após confirmar o OTP.
async function resetPassword(req, res, next) {
  let conn;
  try {
    const { reset_token, nova_senha, confirmar_senha } = req.body || {};
    if (typeof reset_token !== 'string' || !/^[a-f0-9]{64}$/.test(reset_token)) {
      return reject(res, 400, 'Confirmação expirada. Solicite um novo código.');
    }
    if (!validPassword(nova_senha)) {
      return reject(res, 400, 'A senha deve ter pelo menos 8 caracteres e até 72 bytes.');
    }
    if (nova_senha !== confirmar_senha) {
      return reject(res, 400, 'As duas senhas precisam ser iguais.');
    }
    // Faz o hash antes da transação para reduzir o tempo de bloqueio do banco.
    const senhaHash = await bcrypt.hash(nova_senha, 12);
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [[record]] = await conn.execute(
      `SELECT o.usuario_id FROM recuperacao_senha_otp o
       INNER JOIN usuarios u ON u.id = o.usuario_id
       WHERE o.reset_token_hash = ? AND o.reset_token_expira > NOW()
         AND u.ativo = 1 AND u.senha_hash IS NOT NULL
       FOR UPDATE`,
      [tokenHash(reset_token)]
    );
    if (!record) {
      await conn.rollback();
      return reject(res, 400, 'Confirmação expirada ou já utilizada. Solicite outro código.');
    }
    await conn.execute(
      `UPDATE usuarios SET senha_hash = ?, reset_token_hash = NULL,
       reset_token_expira = NULL WHERE id = ? AND ativo = 1`,
      [senhaHash, record.usuario_id]
    );
    await conn.execute('DELETE FROM recuperacao_senha_otp WHERE usuario_id = ?', [record.usuario_id]);
    await conn.commit();
    return res.json({ sucesso: true, mensagem: 'Senha alterada com sucesso. Entre com sua nova senha.' });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch (_) {} }
    return next(e);
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { requestOtp, verifyOtp, resetPassword };
