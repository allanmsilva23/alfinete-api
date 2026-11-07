
const nodemailer = require('nodemailer');

const BRAND = {
  primary: '#A0452C',
  brown: '#8A5A38',
  background: '#FFFDF9',
  cream: '#F6EEE5',
  border: '#EAE0D0',
};

const LOGO_URL =
  'https://alfinete.alwaysdata.net/uploads/alfinete-logo.png';

function smtpReady() {
  return [
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
  ].every(key => Boolean(process.env[key]));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendEmail({ to, subject, text, html }) {
  if (!smtpReady()) {
    throw new Error('SMTP não configurado.');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  });
}

function approvalTemplate(nomeBrecho) {
  const nome = escapeHtml(nomeBrecho);

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport"
        content="width=device-width, initial-scale=1.0">
  <title>Brechó aprovado — Alfinete</title>
</head>

<body style="
  margin:0;
  padding:32px 12px;
  background-color:#F4F0E9;
  font-family:Arial,Helvetica,sans-serif;
  color:#4D4037;
">

  <table role="presentation"
         cellpadding="0"
         cellspacing="0"
         border="0"
         width="100%"
         style="max-width:580px;margin:0 auto;
                background:#FFFDF9;
                border:1px solid #EAE0D0;
                border-radius:18px;">

    <tr>
      <td align="center" style="padding:36px 24px 26px;">
        <img
          src="${LOGO_URL}"
          alt="Alfinete"
          width="145"
          style="display:block;width:145px;
                 max-width:100%;height:auto;
                 border:0;"
        >

        <p style="
          color:${BRAND.brown};
          font-size:11px;
          letter-spacing:2px;
          margin:20px 0 0;
          font-weight:bold;">
          MODA COM HISTÓRIA. NOVAS CONEXÕES.
        </p>
      </td>
    </tr>

    <tr>
      <td style="
        border-top:1px solid ${BRAND.border};
        padding:36px 34px 18px;
        text-align:center;">

        <div style="
          font-size:38px;
          color:#23864B;
          margin-bottom:12px;">
          &#10003;
        </div>

        <h1 style="
          margin:0 0 12px;
          color:${BRAND.primary};
          font-size:27px;
          line-height:1.3;">
          Seu brechó foi aprovado!
        </h1>

        <p style="
          color:${BRAND.brown};
          font-size:15px;
          margin:0;">
          Uma nova história começa por aqui.
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding:18px 34px 36px;">

        <p style="font-size:15px;line-height:1.8;">
          Olá!
        </p>

        <p style="font-size:15px;line-height:1.8;">
          Temos uma ótima notícia: o cadastro do
          <strong>${nome}</strong> foi aprovado!
          Agora sua loja faz parte do
          <strong>Alfinete</strong>.
        </p>

        <table role="presentation"
               width="100%"
               cellpadding="0"
               cellspacing="0"
               style="
                 background:${BRAND.cream};
                 border-radius:12px;
                 margin:24px 0;">

          <tr>
            <td align="center"
                style="padding:22px 18px;">

              <p style="
                color:${BRAND.primary};
                font-size:12px;
                font-weight:bold;
                letter-spacing:1.5px;
                margin:0 0 10px;">
                BRECHÓ APROVADO
              </p>

              <p style="
                color:${BRAND.brown};
                font-size:15px;
                margin:0;
                line-height:1.6;">
                Sua loja já pode se conectar
                com novos clientes.
              </p>

            </td>
          </tr>
        </table>

        <p style="font-size:15px;line-height:1.8;">
          Acesse o aplicativo para:
        </p>

        <ul style="
          font-size:14px;
          line-height:2;
          padding-left:20px;">
          <li>Atualizar as informações da loja</li>
          <li>Adicionar fotos do seu brechó</li>
          <li>Acompanhar avaliações de peças</li>
          <li>Responder aos comentários dos clientes</li>
        </ul>

        <p style="
          color:${BRAND.primary};
          font-size:17px;
          font-weight:bold;
          text-align:center;
          margin:32px 0 10px;">
          Bem-vindo à comunidade Alfinete!
        </p>

        <p style="
          font-size:14px;
          color:${BRAND.brown};
          text-align:center;
          line-height:1.7;">
          Estamos felizes em ter você com a gente.
        </p>

      </td>
    </tr>

    <tr>
      <td align="center" style="
        background:#F1E9DF;
        border-radius:0 0 18px 18px;
        padding:25px 20px;">

        <p style="
          color:${BRAND.brown};
          font-size:14px;
          font-weight:bold;
          margin:0 0 8px;">
          Equipe Alfinete
        </p>

        <p style="
          color:${BRAND.brown};
          font-size:11px;
          line-height:1.6;
          margin:0;">
          Este é um e-mail automático
          de confirmação de cadastro.
        </p>

      </td>
    </tr>

  </table>

</body>
</html>
`;
}

async function sendApprovalEmail({ to, nomeBrecho }) {
  const text =
    `Olá!\n\n` +
    `O cadastro do brechó ${nomeBrecho} foi aprovado!\n\n` +
    `Agora você pode acessar o Alfinete, ` +
    `gerenciar sua loja e acompanhar as avaliações.\n\n` +
    `Bem-vindo à comunidade Alfinete!\n\n` +
    `Equipe Alfinete`;

  return sendEmail({
    to,
    subject: 'Seu brechó foi aprovado no Alfinete!',
    text,
    html: approvalTemplate(nomeBrecho),
  });
}

module.exports = {
  sendEmail,
  sendApprovalEmail,
  smtpReady,
};