import { useViewTiming } from '../hooks/useViewTiming';
import { startupLog, startupSpan } from '../services/startupTiming';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Campaign } from '../services/startup';

export function OpeningCampaign({ campaign, dismiss }: { campaign: Campaign | null; dismiss: (completed?: boolean) => void }) {
  const onViewLayout = useViewTiming('Campaña');
  const imageTiming = useRef<ReturnType<typeof startupSpan> | null>(null);
  const finished = useRef(false);
  const finish = (completed = false) => { if (!finished.current) { startupLog('Campaña: termina', { completed }); finished.current = true; dismiss(completed); } };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState(false);
  const [remaining, setRemaining] = useState(campaign?.durationSeconds ?? 0);
  useEffect(() => {
    if (!campaign || loaded) return;
    if (!imageTiming.current) imageTiming.current = startupSpan('Campaña: cargar imagen');
    const timeout = setTimeout(() => { imageTiming.current?.('timeout'); finishRef.current(false); }, 10000);
    return () => clearTimeout(timeout);
  }, [campaign, loaded, dismiss]);
  useEffect(() => {
    if (!campaign || !loaded) return;
    let left = campaign.durationSeconds * 1000;
    let previous = Date.now();
    let active = AppState.currentState === 'active';
    const subscription = AppState.addEventListener('change', state => {
      if (active) left -= Date.now() - previous;
      previous = Date.now(); active = state === 'active';
    });
    const timer = setInterval(() => {
      const now = Date.now();
      if (active) left -= now - previous;
      previous = now;
      setRemaining(Math.max(0, Math.ceil(left / 1000)));
      if (left <= 0) finishRef.current(true);
    }, 200);
    return () => { clearInterval(timer); subscription.remove(); };
  }, [campaign, loaded, dismiss]);
  return <View onLayout={onViewLayout} style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top, paddingBottom: insets.bottom, justifyContent: 'center' }}>
    {campaign ? <>
      <Text style={{ textAlign: 'center', padding: 16 }}>Publicidad{loaded ? ` · ${remaining} s` : ''}</Text>
      <Image source={{ uri: campaign.imageUrl }} style={{ flex: 1 }} resizeMode="contain"
        accessibilityLabel={campaign.accessibilityLabel} onLoad={() => { imageTiming.current?.('ok'); startupLog('Campaña: empieza exposición', { seconds: campaign.durationSeconds }); setRemaining(campaign.durationSeconds); setLoaded(true); }} onError={() => { imageTiming.current?.('error'); finishRef.current(false); }} />
      {!loaded && <ActivityIndicator style={{ padding: 20 }} color="#1f6feb" />}
    </> : <><ActivityIndicator color="#1f6feb" /><Text style={{ textAlign: 'center', marginTop: 12 }}>Preparando tu viaje…</Text></>}
  </View>;
}
