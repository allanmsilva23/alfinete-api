const addressFields = ['logradouro', 'numero', 'bairro', 'cidade', 'estado', 'cep'];
const limits = { logradouro: 200, numero: 20, bairro: 120, cidade: 120, estado: 2, cep: 9 };

function splitChanges(body) {
  const address = {};
  for (const key of addressFields) {
    if (!Object.prototype.hasOwnProperty.call(body || {}, key)) continue;
    if (typeof body[key] !== 'string' || body[key].trim().length > limits[key] ||
      (key === 'estado' && body[key].trim() && !/^[A-Za-z]{2}$/.test(body[key].trim()))) {
      throw Object.assign(new Error(`Endereço inválido: ${key}.`), { status: 400 });
    }
    address[key] = body[key].trim();
  }
  return address;
}

async function saveAddress(conn, brechoId, address) {
  if (!Object.keys(address).length) return;
  const [[exists]] = await conn.execute(
    'SELECT brecho_id FROM enderecos_brechos WHERE brecho_id = ? LIMIT 1', [brechoId]
  );
  if (exists) {
    await conn.query(`UPDATE enderecos_brechos SET
      ${Object.keys(address).map(k => `\`${k}\` = ?`).join(', ')},
      latitude = NULL, longitude = NULL, geocoded_at = NULL
      WHERE brecho_id = ?`, [...Object.values(address), brechoId]);
  } else {
    const fields = addressFields;
    const data = fields.map(k => address[k] || null);
    await conn.execute(
      `INSERT INTO enderecos_brechos (brecho_id, ${fields.join(',')}) VALUES (?,?,?,?,?,?,?)`,
      [brechoId, ...data]
    );
  }
}

module.exports = { addressFields, splitChanges, saveAddress };
