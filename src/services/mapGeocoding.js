/**
 * Geocodificacao dos enderecos comerciais com Google Geocoding API.
 */
function completeAddress(store) {
  const { logradouro, numero, cidade, estado } = store;
  if (![logradouro, numero, cidade, estado].every(v => typeof v === 'string' && v.trim())) {
    return null;
  }
  const parts = [
    `${logradouro.trim()}, ${numero.trim()}`,
    store.bairro,
    cidade,
    estado,
    store.cep,
    'Brasil',
  ].filter(v => v && String(v).trim());
  return parts.join(', ');
}

async function geocodeStore(store) {
  const key = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('Configure GOOGLE_GEOCODING_API_KEY no backend.');
  const address = completeAddress(store);
  if (!address) return null;

  const params = new URLSearchParams({
    address,
    components: 'country:BR',
    key,
    language: 'pt-BR',
  });
  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Falha HTTP ${response.status} na geocodificacao Google.`);
  const payload = await response.json();
  if (payload.status === 'ZERO_RESULTS') return null;
  if (payload.status !== 'OK') throw new Error(`Geocoding API: ${payload.status}. Confira chave, APIs, faturamento e cotas.`);
  const match = (payload.results || []).find(result => {
    const locationType = result.geometry?.location_type;
    const types = result.types || [];
    return !result.partial_match &&
      ['ROOFTOP', 'RANGE_INTERPOLATED'].includes(locationType) &&
      types.some(type => ['street_address', 'premise', 'subpremise', 'establishment'].includes(type));
  });
  const lat = Number(match?.geometry?.location?.lat);
  const lng = Number(match?.geometry?.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !match) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

module.exports = { geocodeStore, completeAddress };
