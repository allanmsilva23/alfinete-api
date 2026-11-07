'use strict';

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.resolve(__dirname, '../../uploads/alfinete-logo.png');
const LOGO_URL = 'https://alfinete.alwaysdata.net/uploads/alfinete-logo.png';
const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function emailHtml({ code, nome, embeddedLogo }) {
  const firstName = String(nome || '').trim().split(/\s+/)[0] || 'Olá';
  const logoSrc = embeddedLogo ? 'cid:alfinete-logo-otp' : LOGO_URL;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F0E9;font-family:Arial,Helvetica,sans-serif;color:#463B35;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F4F0E9;"><tr><td align="center" style="padding:38px 14px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#FFFDF9;border:1px solid #EAE0D0;border-radius:20px;overflow:hidden;">
<tr><td align="center" style="padding:34px 30px 24px;">
<img src="${logoSrc}" alt="Alfinete" width="145" style="display:block;width:145px;max-width:100%;height:auto;border:0;">
<p style="font-size:10px;letter-spacing:2px;font-weight:bold;color:#8A5A38;margin:16px 0 0;">MODA COM HISTÓRIA. NOVAS CONEXÕES.</p>
</td></tr>
<tr><td style="height:3px;background:#A0452C;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:30px 34px 35px;">
<p style="margin:0 0 10px;color:#8A5A38;font-size:14px;">Olá, ${escapeHtml(firstName)}!</p>
<h1 style="color:#A0452C;font-size:27px;line-height:1.3;margin:0 0 14px;">Vamos recuperar seu acesso?</h1>
<p style="font-size:15px;line-height:1.75;color:#5A4C43;margin:0 0 24px;">Recebemos uma solicitação para redefinir a senha da sua conta no Alfinete. Digite o código abaixo no aplicativo para continuar.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F6EEE5;border:1px solid #EAE0D0;border-radius:14px;"><tr><td align="center" style="padding:28px 12px;">
<p style="font-size:11px;letter-spacing:1.5px;color:#8A5A38;font-weight:bold;margin:0 0 14px;">SEU CÓDIGO DE VERIFICAÇÃO</p>
<p style="font-family:Consolas,'Courier New',monospace;font-size:36px;font-weight:bold;letter-spacing:7px;color:#A0452C;margin:0;">${escapeHtml(code)}</p>
<p style="color:#8A5A38;font-size:12px;margin:15px 0 0;">Válido por 10 minutos · Uso único</p>
</td></tr></table>
<p style="font-size:14px;line-height:1.75;color:#5A4C43;margin:24px 0 0;">Depois de confirmar o código, você poderá escolher uma nova senha. Não é necessário clicar em nenhum link.</p>
<p style="font-size:13px;line-height:1.65;color:#8A5A38;margin:20px 0 0;"><strong>Não solicitou a alteração?</strong> Ignore este e-mail. Nunca compartilhe o código com outras pessoas.</p>
</td></tr>
<tr><td align="center" style="background:#F1E9DF;padding:22px 25px;">
<p style="color:#8A5A38;font-weight:bold;font-size:13px;margin:0 0 6px;">Equipe Alfinete</p>
<p style="color:#8A5A38;font-size:11px;line-height:1.5;margin:0;">Esta é uma mensagem automática de segurança.</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
}

async function sendPasswordOtpEmail({ to, code, nome }) {
  const needed = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
  if (needed.some(key => !process.env[key])) throw new Error('SMTP não configurado.');
  const embeddedLogo = fs.existsSync(LOGO_PATH);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: process.env.SMTP_SECURE !== 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'Seu código para recuperar a senha — Alfinete',
    text: `Olá! Seu código de verificação do Alfinete é ${code}.\nEle expira em 10 minutos.\nDigite-o no aplicativo para criar uma nova senha.\nSe não solicitou, ignore este e-mail.`,
    html: emailHtml({ code, nome, embeddedLogo }),
    ...(embeddedLogo ? { attachments: [{ filename: 'alfinete-logo.png', path: LOGO_PATH, cid: 'alfinete-logo-otp', contentDisposition: 'inline' }] } : {}),
  });
}

module.exports = { sendPasswordOtpEmail };
