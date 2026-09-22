import { loadPasses, savePasses } from '../services/passWallet';
import { startupLog, startupSpan } from '../services/startupTiming';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { StartupCover } from '../components/StartupCover';
import { ExploreReadyContext } from './ExploreReady';
import { Platform, StyleSheet, View } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useSession } from './Session';
import { getMyPasses, createOpeningCampaignLoader, type Campaign, type PurchasedPass } from '../services/startup';
import { getInstallationId } from '../services/installation';
import { campaignHistory } from '../services/campaignStorage';
import { USE_DUMMY_DATA } from '../services/transit';

type PassState = { owner: string | null; passes: PurchasedPass[] | null; error: string | null };
const PassContext = createContext<{ passes: PurchasedPass[] | null; error: string | null; reload: () => void }>({ passes: null, error: null, reload: () => {} });
export const usePurchasedPasses = () => useContext(PassContext);
export function OpeningProvider({ children, renderOpening }: { children: React.ReactNode; renderOpening: (campaign: Campaign | null, loading: boolean, dismiss: (completed?: boolean) => void) => React.ReactNode }) {
  const { account, busy } = useSession();
  const [nativeReady, setNativeReady] = useState(false);
  const [coverLayout, setCoverLayout] = useState(false);
  const [coverImage, setCoverImage] = useState(false);
  const markNativeReady = useCallback(() => setNativeReady(true), []);
  const markCoverLayout = useCallback(() => setCoverLayout(true), []);
  const markCoverImage = useCallback(() => setCoverImage(true), []);
  const [exploreReady, setExploreReady] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);
  const markExploreReady = useCallback(() => setExploreReady(true), []);
  const campaignLoader = useRef<ReturnType<typeof createOpeningCampaignLoader> | null>(null);
  if (!campaignLoader.current) campaignLoader.current = createOpeningCampaignLoader(getInstallationId, Platform.OS);
  const prepared = useRef<Promise<Campaign[]> | null>(null);
  const advancing = useRef(false);
  const [opening, setOpening] = useState<{ done: boolean; campaigns: Campaign[] }>({ done: false, campaigns: [] });
  const [state, setState] = useState<PassState>({ owner: null, passes: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt(n => n + 1), []);
  const dismiss = useCallback((completed = false) => {
    if (advancing.current) return;
    const campaign = opening.campaigns[0];
    if (!campaign) { setOpening({ done: true, campaigns: [] }); return; }
    advancing.current = true;
    void (async () => {
      try {
        if (completed) await campaignHistory.complete(campaign);
        setOpening(current => ({ done: true, campaigns: current.campaigns.slice(1) }));
      } catch {
        // If persistence fails, skip advertising rather than risk repeatedly exceeding limits.
        setOpening({ done: true, campaigns: [] });
      } finally { advancing.current = false; }
    })();
  }, [opening.campaigns]);
  const restoring = busy === 'restore';
  const owner = account?.id ?? null;
  useEffect(() => {
    if (opening.done) return;
    const timeout = setTimeout(() => { startupLog('Campañas: timeout de apertura', { limitMs: 15000 }); setOpening({ done: true, campaigns: [] }); }, 15000);
    return () => clearTimeout(timeout);
  }, [opening.done]);
  useEffect(() => {
    if (opening.done) return;
    let active = true;
    if (!prepared.current) {
      const finish = startupSpan('Campañas: preparar cola');
      prepared.current = campaignLoader.current!().then(async campaigns => {
        startupLog('Campañas: respuesta validada', { count: campaigns.length });
        const storageDone = startupSpan('Campañas: leer y depurar contadores');
        try {
          const eligible = USE_DUMMY_DATA || (Platform.OS !== 'android' && Platform.OS !== 'ios') ? [] : await campaignHistory.reconcile(campaigns);
          storageDone('ok', { eligible: eligible.length }); finish('ok');
          return eligible;
        } catch (error) { storageDone('error'); throw error; }
      }).catch(error => { finish('error'); throw error; });
    }
    void prepared.current.then(campaigns => {
      if (active) setOpening({ done: true, campaigns });
    }).catch(error => {
      console.warn('[Campañas] No se pudo preparar la publicidad', error instanceof Error ? error.message : String(error));
      if (active) setOpening({ done: true, campaigns: [] });
    });
    // Keep the single request through React effect cleanup/replay; request has its own timeout.
    return () => { active = false; };
  }, [opening.done]);
  useEffect(() => {
    const controller = new AbortController();
    setState({ owner, passes: null, error: null });
    if (!owner || restoring) return () => controller.abort();
    void (async () => {
      try {
        const tokenDone = startupSpan('Pasabordos: obtener token');
        let token: string;
        try { token = USE_DUMMY_DATA ? '' : (await GoogleSignin.getTokens()).idToken; tokenDone(); }
        catch (error) { tokenDone('error'); throw error; }
        if (controller.signal.aborted) return;
        const passes = await getMyPasses(token, controller.signal);
        if (!controller.signal.aborted) { await savePasses(owner,passes); setState({ owner, passes, error: null }); }
      } catch {
        if (!controller.signal.aborted) {
          const cached=await loadPasses(owner).catch(()=>[]);
          if (!controller.signal.aborted) setState({owner,passes:cached.length?cached:null,error:'No pudimos actualizar tus pasabordos. Intenta nuevamente.'});
        }
      }
    })();
    return () => controller.abort();
  }, [owner, restoring, attempt]);
  useEffect(() => {
    if (splashHidden) return;
    startupLog('Splash nativo: requisitos', { nativeReady, coverLayout, coverImage });
    if (!nativeReady || !coverLayout || !coverImage) {
      const timer = setInterval(() => startupLog('Splash nativo: sigue esperando', { nativeReady, coverLayout, coverImage }), 3000);
      return () => clearInterval(timer);
    }
    let active = true;
    // Wait for the committed native layout, then reveal the already mounted screen.
    const frame = requestAnimationFrame(() => {
      const finish = startupSpan('Splash: ocultar');
      void SplashScreen.hideAsync().then(() => finish('ok')).catch(() => finish('error')).then(() => { if (active) { startupLog('Splash nativo: liberado; mapa puede dibujarse'); setSplashHidden(true); } });
    });
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [nativeReady, coverLayout, coverImage, splashHidden]);
  const showCover = !splashHidden || !exploreReady || !opening.done;
  const covered = showCover || opening.campaigns.length > 0;
  const context = useMemo(() => ({ markNativeReady, markExploreReady }), [markNativeReady, markExploreReady]);
  useEffect(() => {
    if (!splashHidden) return;
    if (!covered) startupLog('Apertura: Explorar revelado sin cubiertas');
    else startupLog('Apertura: cubierta activa', { exploreReady, campaignsReady: opening.done, campaigns: opening.campaigns.length });
  }, [splashHidden, covered, exploreReady, opening.done, opening.campaigns.length]);
  const ownState = owner && state.owner === owner ? state : { passes: null, error: null };
  return <PassContext.Provider value={{ ...ownState, reload }}>
    <ExploreReadyContext.Provider value={context}>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }} pointerEvents={covered ? 'none' : 'auto'}
          accessibilityElementsHidden={covered} importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}>
          {children}
        </View>
        {showCover && <StartupCover onLayout={markCoverLayout} onImageReady={markCoverImage} />}
        {splashHidden && opening.campaigns.length > 0 && <View style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 100, backgroundColor: '#fff' }]} accessibilityViewIsModal>
          {renderOpening(opening.campaigns[0], false, dismiss)}
        </View>}
      </View>
    </ExploreReadyContext.Provider>
  </PassContext.Provider>;
}
