const pool = require('../config/db');
const { geocodeStore, completeAddress } = require('../services/mapGeocoding');

const COOLDOWN_HOURS = 24;
const MAX_GEOCODINGS_PER_REQUEST = 12;
const validCoord = (lat, lng) => Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) &&
  Number(lat) >= -90 && Number(lat) <= 90 && Number(lng) >= -180 && Number(lng) <= 180 &&
  lat !== null && lng !== null;

/** GET /brechos/mapa - apenas lojas ativas e aprovadas. */
async function listOnMap(req, res, next) {
  try {
    // Impede que o cliente reutilize uma listagem anterior apos alteracao dos enderecos.
    res.set('Cache-Control', 'no-store, max-age=0');

    const [stores] = await pool.query(`
      SELECT b.id, b.nome, b.descricao, b.endereco_curto,
             b.imagem_url AS imagem, b.faixa_preco,
             eb.logradouro, eb.numero, eb.bairro, eb.cidade, eb.estado, eb.cep,
             eb.latitude, eb.longitude, eb.geocoded_at,
             (SELECT GROUP_CONCAT(DISTINCT e.nome SEPARATOR ', ')
                FROM brecho_estilo be JOIN estilo e ON e.id = be.estilo_id
               WHERE be.brecho_id = b.id) AS estilos
        FROM brecho b
        LEFT JOIN enderecos_brechos eb ON eb.brecho_id = b.id
       WHERE b.ativo = 1 AND b.status_aprovacao = 'APROVADO'
       ORDER BY b.nome ASC
    `);

    // Reserva atomica: impede geocodificacao duplicada por acessos simultaneos.
    // O carimbo de tempo tambem protege as cotas em falhas e enderecos sem resultado.
    const candidates = stores.filter(store =>
      !validCoord(store.latitude, store.longitude) && completeAddress(store) &&
      (!store.geocoded_at || Date.now() - new Date(store.geocoded_at).getTime() >= COOLDOWN_HOURS * 3600_000)
    ).slice(0, MAX_GEOCODINGS_PER_REQUEST);

    async function attemptGeocoding(store) {
      try {
        const [claim] = await pool.execute(`
          UPDATE enderecos_brechos SET geocoded_at = NOW()
           WHERE brecho_id = ? AND (latitude IS NULL OR longitude IS NULL)
             AND (geocoded_at IS NULL OR geocoded_at < DATE_SUB(NOW(), INTERVAL 24 HOUR))
        `, [store.id]);
        if (!claim.affectedRows) return;
        const coordinates = await geocodeStore(store);
        if (!coordinates) return;
        // Evita gravar coordenadas antigas se o endereco mudar durante a consulta.
        const [saved] = await pool.execute(`
          UPDATE enderecos_brechos SET latitude = ?, longitude = ?
           WHERE brecho_id = ? AND logradouro <=> ? AND numero <=> ?
             AND bairro <=> ? AND cidade <=> ? AND estado <=> ? AND cep <=> ?
        `, [coordinates.latitude, coordinates.longitude, store.id,
          store.logradouro ?? null, store.numero ?? null, store.bairro ?? null,
          store.cidade ?? null, store.estado ?? null, store.cep ?? null]);
        if (saved.affectedRows) {
          store.latitude = coordinates.latitude;
          store.longitude = coordinates.longitude;
        }
      } catch (error) {
        console.warn('Geocodificacao indisponivel para brecho ID', store.id, error.message);
      }
    }

    // Lotes pequenos evitam sobrecarga na hospedagem e quota do Google.
    for (let i = 0; i < candidates.length; i += 3) {
      await Promise.all(candidates.slice(i, i + 3).map(attemptGeocoding));
    }

    const mapped = stores.map(({ geocoded_at, ...store }) => ({
      ...store,
      latitude: validCoord(store.latitude, store.longitude) ? Number(store.latitude) : null,
      longitude: validCoord(store.latitude, store.longitude) ? Number(store.longitude) : null,
    }));
    return res.json({ sucesso: true, dados: mapped });
  } catch (error) { next(error); }
}

module.exports = { listOnMap };
