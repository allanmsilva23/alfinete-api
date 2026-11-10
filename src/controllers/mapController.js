import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { api } from '../../src/api/client';
import { boundsOf, distanceLabel, norm, storesWithCoords } from '../../src/maps/geo';
import { BASE_STYLE_URL, loadAlfineteStyle } from '../../src/maps/alfineteStyle';

const COLOR = {
  terracotta: '#B84D3D', brown: '#8E7756', ground: '#E9EEE3',
  cream: '#FBF3E7', gold: '#D8B551', mint: '#6FE7CD',
  muted: '#B3A28F', white: '#FFFFFF', border: '#DFD7C8',
};
const FALLBACK = { latitude: -23.55052, longitude: -46.63331 };

async function obtainLocation() {
  const current = await Location.getForegroundPermissionsAsync();
  const permission = current.granted ? current : await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return { coords: null, allowed: false };
  const last = await Location.getLastKnownPositionAsync({ maxAge: 300000, requiredAccuracy: 1500 }).catch(() => null);
  const servicesOn = await Location.hasServicesEnabledAsync().catch(() => false);
  if (!servicesOn) return { coords: last?.coords || null, allowed: true };

  let timeoutId;
  const fresh = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
    new Promise(resolve => { timeoutId = setTimeout(() => resolve(null), 8500); }),
  ]).finally(() => clearTimeout(timeoutId));
  return { coords: fresh?.coords || last?.coords || null, allowed: true };
}

function StorePin({ selected }) {
  return (
    <View style={styles.storePinWrap} collapsable={false}>
      <View style={[styles.pinDiamond, selected && styles.pinSelected]}>
        <View style={styles.pinIconRotate}>
          <MaterialCommunityIcons name="tshirt-crew" size={17} color="#FFFFFF" />
        </View>
      </View>
    </View>
  );
}
function UserPin() {
  return (
    <View style={styles.userPulseArea} collapsable={false}>
      <View style={styles.pulseBig} />
      <View style={styles.pulseSmall} />
      <View style={styles.userDot}><View style={styles.userWhiteDot} /></View>
    </View>
  );
}
function StoreBubble({ store, onOpen, onRoute }) {
  return (
    <View style={styles.bubbleWrap} collapsable={false}>
      <View style={styles.bubble}>
        <View style={styles.bubbleIcon}>
          <MaterialCommunityIcons name="shopping" size={19} color={COLOR.gold} />
        </View>
        <Pressable onPress={onOpen} style={styles.bubbleInfo}>
          <Text style={styles.bubbleName} numberOfLines={2}>{store.nome}</Text>
          <Text style={styles.bubbleSub} numberOfLines={2}>
            {distanceLabel(store.distanceMeters)}{store.estilos ? ` · ${store.estilos}` : ''}
          </Text>
        </Pressable>
        <Pressable onPress={onRoute} accessibilityLabel="Traçar rota para este brechó" style={styles.bubbleRoute}>
          <Feather name="navigation" size={16} color={COLOR.terracotta} />
        </Pressable>
      </View>
      <View style={styles.bubbleCaret} />
    </View>
  );
}

export default function MapScreen() {
  const router = useRouter();
  const cameraRef = useRef(null);
  const mapRef = useRef(null);
  const initialCameraDone = useRef(false);
  const [styleDefinition, setStyleDefinition] = useState(BASE_STYLE_URL);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState('');
  const [mapKey, setMapKey] = useState(0);
  const nativeRenderLogged = useRef(false);
  const [zoom, setZoom] = useState(15);
  const [stores, setStores] = useState([]);
  const [position, setPosition] = useState(null);
  const [permissionOK, setPermissionOK] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    loadAlfineteStyle()
      .then(next => { if (active) { initialCameraDone.current = false; setMapLoaded(false); setStyleDefinition(next); } })
      .catch(e => console.warn('[ALFINETE/MAPLIBRE] Estilo personalizado indisponível, usando Positron:', e?.message));
    return () => { active = false; };
  }, []);

  const load = useCallback(async isActive => {
    if (isActive()) { setLoading(true); setDataError(''); }
    const [places, gps] = await Promise.allSettled([
      api('/brechos/mapa', { auth: false }),
      obtainLocation(),
    ]);
    if (!isActive()) return;
    if (places.status === 'fulfilled') {
      const response = places.value;
      const list = Array.isArray(response) ? response :
        Array.isArray(response?.brechos) ? response.brechos :
          Array.isArray(response?.data) ? response.data : [];
      setStores(list);
    } else {
      setStores([]);
      setDataError(places.reason?.message || 'Não foi possível consultar os brechós.');
    }
    if (gps.status === 'fulfilled') {
      const { coords, allowed } = gps.value;
      setPosition(coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)
        ? { latitude: coords.latitude, longitude: coords.longitude } : null);
      setPermissionOK(allowed);
    } else {
      setPosition(null);
      setPermissionOK(false);
    }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    load(() => active);
    return () => { active = false; };
  }, [load, revision]));

  useEffect(() => {
    if (mapLoaded) return undefined;
    const timer = setTimeout(() => {
      setMapError(current => current || 'O mapa ainda não terminou de carregar. Verifique a internet e tente novamente.');
    }, 13000);
    return () => clearTimeout(timer);
  }, [mapLoaded, mapKey, styleDefinition]);

  const sorted = useMemo(() => storesWithCoords(stores, position), [stores, position]);
  const visible = useMemo(() => {
    const q = norm(search);
    return !q ? sorted : sorted.filter(b => norm([
      b.nome, b.endereco_curto, b.bairro, b.cidade,
      typeof b.estilos === 'string' ? b.estilos : JSON.stringify(b.estilos || ''),
    ].join(' ')).includes(q));
  }, [sorted, search]);
  const selected = visible.find(s => String(s.id) === String(selectedId)) || visible[0] || null;

  const centerOn = useCallback((p, newZoom = 15.5) => {
    if (!p || !mapLoaded) return;
    cameraRef.current?.easeTo({
      center: [Number(p.longitude), Number(p.latitude)],
      zoom: newZoom, duration: 650,
      padding: { top: 110, right: 40, bottom: 175, left: 40 },
    });
  }, [mapLoaded]);

  useEffect(() => {
    if (!mapLoaded || loading || initialCameraDone.current) return;
    const near = position && visible.length
      ? visible.filter(b => b.distanceMeters <= Math.max(1600, visible[0].distanceMeters * 1.4)).slice(0, 4)
      : visible.slice(0, 3);
    const points = position ? [position, ...near] : near;
    if (!points.length) return;
    initialCameraDone.current = true;
    const [west, south, east, north] = boundsOf(points);
    if (Math.max(east - west, north - south) < 0.0001) {
      centerOn(position || near[0], 15.5);
      return;
    }

    cameraRef.current?.fitBounds([west, south, east, north], {
      padding: { top: 135, right: 54, bottom: 170, left: 54 },
      duration: 750,
    });
  }, [mapLoaded, loading, position, visible, centerOn]);

  const selectStore = b => {
    setSelectedId(b.id);
    centerOn(b, Math.max(14.3, zoom));
  };
  const openRoute = async b => {
    if (!b) return;
    const destination = `${b.latitude},${b.longitude}`;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    try { await Linking.openURL(url); }
    catch { Alert.alert('Rota indisponível', 'Não foi possível abrir o Google Maps.'); }
  };
  const recenter = async () => {
    try {
      const gps = await obtainLocation();
      setPermissionOK(gps.allowed);
      if (!gps.coords) {
        return Alert.alert('Localização indisponível', 'Ative o GPS e a permissão de localização para centralizar o mapa.');
      }
      const coords = { latitude: gps.coords.latitude, longitude: gps.coords.longitude };
      setPosition(coords);
      centerOn(coords, 15.5);
    } catch {
      Alert.alert('Localização indisponível', 'Verifique a configuração do GPS e tente novamente.');
    }
  };
  const changeZoom = async delta => {
    const current = await mapRef.current?.getZoom().catch(() => zoom);
    const next = Math.max(5, Math.min(19, (Number.isFinite(current) ? current : zoom) + delta));
    cameraRef.current?.zoomTo(next, { duration: 260 });
    setZoom(next);
  };
  const reload = () => {
    initialCameraDone.current = false;
    setRevision(v => v + 1);
  };
  const onMapFailure = () => {
    if (typeof styleDefinition !== 'string') {
      initialCameraDone.current = false;
      setMapLoaded(false);
      setStyleDefinition(BASE_STYLE_URL);
      return;
    }
    setMapError('Não foi possível carregar os dados cartográficos. Verifique sua conexão e tente novamente.');
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.mapArea}>
        <Map
          key={mapKey}
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          mapStyle={styleDefinition}
          androidView="texture"
          compass={false}
          logo={false}
          attribution={true}
          attributionPosition={{ bottom: 79, left: 10 }}
          onDidFinishLoadingStyle={() => { setMapLoaded(true); setMapError(''); }}
          onDidFailLoadingMap={onMapFailure}
          onDidFinishRenderingMapFully={() => {
            if (!nativeRenderLogged.current) {
              nativeRenderLogged.current = true;
              console.log('[ALFINETE/MAPLIBRE] renderização cartográfica concluída');
            }
          }}
          onRegionDidChange={event => {
            const currentZoom = event?.nativeEvent?.zoom;
            if (Number.isFinite(currentZoom)) setZoom(currentZoom);
          }}
        >
          <Camera ref={cameraRef} initialViewState={{
            center: [FALLBACK.longitude, FALLBACK.latitude], zoom: 13.8,
          }} />
          {position && (
            <Marker id="alfinete-user" lngLat={[position.longitude, position.latitude]} anchor="center">
              <UserPin />
            </Marker>
          )}
          {visible.map(b => (
            <Marker
              key={`store-${b.id}`}
              id={`alfinete-store-${b.id}`}
              lngLat={[b.longitude, b.latitude]}
              anchor="bottom"
              onPress={() => selectStore(b)}
            >
              <StorePin selected={selected && String(selected.id) === String(b.id)} />
            </Marker>
          ))}
          {selected && (
            <Marker
              id={`alfinete-bubble-${selected.id}`}
              lngLat={[selected.longitude, selected.latitude]}
              anchor="top"
              offset={[0, 18]}
            >
              <StoreBubble store={selected} onOpen={() => router.push(`/store/${selected.id}`)}
                onRoute={() => openRoute(selected)} />
            </Marker>
          )}
        </Map>

        <View style={styles.searchArea}>
          <View style={styles.searchBox}>
            <Feather name="search" size={19} color={COLOR.gold} />
            <TextInput
              placeholder="Buscar brechós..."
              placeholderTextColor="#C4B6A1"
              value={search}
              onChangeText={value => { setSearch(value); setSelectedId(null); }}
              style={styles.searchInput}
              accessibilityLabel="Buscar brechós"
            />
            <TouchableOpacity onPress={search ? () => { setSearch(''); setSelectedId(null); } : reload}
              accessibilityLabel={search ? 'Limpar busca' : 'Atualizar brechós'}>
              <Feather name={search ? 'x' : 'refresh-cw'} size={18} color={COLOR.brown} />
            </TouchableOpacity>
          </View>
          {!permissionOK && !loading && (
            <TouchableOpacity onPress={recenter} style={styles.notice}>
              <Feather name="navigation" size={14} color={COLOR.brown} />
              <Text style={styles.noticeText}>Permita a localização para ver distâncias</Text>
            </TouchableOpacity>
          )}
          {!!dataError && <Text style={styles.errorBox}>{dataError}</Text>}
        </View>

        {loading && <View style={styles.loadingBox}>
          <ActivityIndicator color={COLOR.terracotta} />
          <Text style={styles.loadingText}>Buscando brechós próximos...</Text>
        </View>}
        {!!mapError && <View style={styles.mapErrorBox}>
          <Text style={styles.mapErrorText}>{mapError}</Text>
          <TouchableOpacity onPress={() => { setMapError(''); setMapLoaded(false); initialCameraDone.current = false; setMapKey(k => k + 1); }}>
            <Text style={styles.mapErrorAction}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>}
        {!loading && !visible.length && <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            {search ? 'Nenhum brechó encontrado.' :
              stores.length ? 'Os brechós ainda não possuem coordenadas válidas.' :
                'Nenhum brechó aprovado disponível.'}
          </Text>
        </View>}

        <View style={styles.controls}>
          <View style={styles.zoomBox}>
            <TouchableOpacity onPress={() => changeZoom(1)} style={styles.zoomButton} accessibilityLabel="Aproximar">
              <Feather name="plus" size={23} color={COLOR.brown} />
            </TouchableOpacity>
            <View style={styles.zoomLine} />
            <TouchableOpacity onPress={() => changeZoom(-1)} style={styles.zoomButton} accessibilityLabel="Afastar">
              <Feather name="minus" size={23} color={COLOR.brown} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={recenter} style={styles.gpsButton} accessibilityLabel="Centralizar na minha localização">
            <Feather name="crosshair" size={23} color={COLOR.terracotta} />
          </TouchableOpacity>
        </View>

        {selected && !loading && <TouchableOpacity style={styles.routeButton} onPress={() => openRoute(selected)}>
          <Feather name="navigation" size={16} color="#FFFFFF" />
          <Text style={styles.routeText}>Traçar rota</Text>
          <Feather name="external-link" size={14} color="#FFFFFF" />
        </TouchableOpacity>}
        <Pressable onPress={() => Linking.openURL('https://openfreemap.org/')}
          style={styles.attributionLabel} accessibilityLabel="Créditos cartográficos">
          <Text style={styles.attributionText}>© OpenStreetMap · OpenFreeMap</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ground },
  mapArea: { flex: 1, backgroundColor: COLOR.ground },
  searchArea: { position: 'absolute', left: 24, right: 24, top: 30 },
  searchBox: { height: 56, borderRadius: 16, borderWidth: 1, borderColor: '#D9C9B5',
    backgroundColor: COLOR.cream, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center',
    shadowColor: '#56432C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12,
    shadowRadius: 12, elevation: 5 },
  searchInput: { flex: 1, fontSize: 14, color: COLOR.brown, paddingHorizontal: 13, paddingVertical: 10 },
  notice: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: COLOR.white, elevation: 2, flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 7 },
  noticeText: { fontSize: 11, color: COLOR.brown },
  errorBox: { padding: 10, marginTop: 8, backgroundColor: '#FFF6EE', color: COLOR.terracotta,
    borderRadius: 10, fontSize: 12 },
  userPulseArea: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center' },
  pulseBig: { position: 'absolute', width: 70, height: 70, backgroundColor: 'rgba(111,231,205,0.25)', borderRadius: 35 },
  pulseSmall: { position: 'absolute', width: 48, height: 48, backgroundColor: 'rgba(111,231,205,0.42)', borderRadius: 24 },
  userDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 3, borderColor: COLOR.white,
    backgroundColor: COLOR.mint, justifyContent: 'center', alignItems: 'center', elevation: 4 },
  userWhiteDot: { width: 8, height: 8, backgroundColor: COLOR.white, borderRadius: 4 },
  storePinWrap: { width: 40, height: 44, justifyContent: 'center', alignItems: 'center' },
  pinDiamond: { width: 31, height: 31, borderRadius: 16, borderBottomLeftRadius: 2,
    backgroundColor: COLOR.terracotta, transform: [{ rotate: '-45deg' }], alignItems: 'center',
    justifyContent: 'center', elevation: 4 },
  pinSelected: { borderWidth: 1.5, borderColor: '#FFF7EC' },
  pinIconRotate: { transform: [{ rotate: '45deg' }] },
  bubbleWrap: { width: 215, alignItems: 'center' },
  bubble: { width: 215, minHeight: 78, backgroundColor: '#FFFFFF', borderRadius: 16,
    paddingHorizontal: 11, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9,
    elevation: 7, shadowColor: '#443222', shadowOpacity: 0.15, shadowRadius: 16 },
  bubbleIcon: { width: 44, height: 44, borderRadius: 10, backgroundColor: COLOR.cream,
    alignItems: 'center', justifyContent: 'center' },
  bubbleInfo: { flex: 1, justifyContent: 'center' },
  bubbleName: { fontWeight: '700', color: COLOR.brown, fontSize: 13, lineHeight: 16 },
  bubbleSub: { color: COLOR.muted, fontSize: 10.5, marginTop: 4, lineHeight: 13 },
  bubbleRoute: { width: 22, height: 32, justifyContent: 'center', alignItems: 'center' },
  bubbleCaret: { width: 10, height: 10, backgroundColor: COLOR.white, marginTop: -6,
    transform: [{ rotate: '45deg' }] },
  controls: { position: 'absolute', bottom: 120, right: 24, gap: 12, alignItems: 'center' },
  zoomBox: { width: 52, borderRadius: 16, backgroundColor: COLOR.white, elevation: 5,
    shadowColor: '#3E3227', shadowOpacity: 0.12, shadowRadius: 10 },
  zoomButton: { width: 52, height: 48, alignItems: 'center', justifyContent: 'center' },
  zoomLine: { width: 32, height: 1, backgroundColor: '#E9E1D5', alignSelf: 'center' },
  gpsButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLOR.white,
    alignItems: 'center', justifyContent: 'center', elevation: 5 },
  routeButton: { position: 'absolute', left: 24, bottom: 27, borderRadius: 17,
    backgroundColor: COLOR.terracotta, paddingHorizontal: 17, height: 47,
    flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 5 },
  routeText: { fontSize: 13, fontWeight: '700', color: COLOR.white },
  attributionLabel: { position: 'absolute', bottom: 8, right: 9, padding: 3,
    backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: 4 },
  attributionText: { fontSize: 8, color: COLOR.brown },
  loadingBox: { position: 'absolute', top: '40%', alignSelf: 'center', padding: 14,
    backgroundColor: COLOR.white, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 4 },
  loadingText: { fontSize: 12, color: COLOR.brown },
  mapErrorBox: { position: 'absolute', top: '30%', alignSelf: 'center', maxWidth: 285,
    backgroundColor: COLOR.white, padding: 15, borderRadius: 13, elevation: 4 },
  mapErrorText: { color: COLOR.brown, lineHeight: 18, fontSize: 12 },
  mapErrorAction: { color: COLOR.terracotta, fontWeight: '700', fontSize: 13, marginTop: 9 },
  emptyBox: { position: 'absolute', top: '30%', left: 28, right: 28, padding: 18, borderRadius: 14,
    backgroundColor: COLOR.white, elevation: 4 },
  emptyText: { color: COLOR.brown, fontSize: 13, textAlign: 'center' },
});
