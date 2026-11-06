import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts, BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold_Italic } from '@expo-google-fonts/barlow-condensed';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/core/auth';
import { OrgContextProvider } from './src/core/orgContext';
import RootNavigator from './src/navigation/RootNavigator';
import { isSupabaseConfigured } from './src/core/supabase';
import { hydrateDemo, startDemoAutosave } from './src/data/demoStore';
import { hydrateReminderPrefs } from './src/data/reminderPrefs';
import { hydrateTimeZone } from './src/core/time';
import { hydrateRegion } from './src/core/region';
import { hydrateHapticsPref } from './src/core/hapticsPref';
import { startTelemetry } from './src/core/telemetry';
import { hydrateAnalyticsConsent } from './src/core/analyticsConsent';
import { AnalyticsConsentBanner } from './src/components/AnalyticsConsentBanner';
import { LaunchAnimation } from './src/components/LaunchAnimation';
import ErrorBoundary from './src/components/ErrorBoundary';
import { ConfirmSheetHost } from './src/components/ConfirmSheet';

// Error handlers + app_open as early as possible (no-op in demo mode).
startTelemetry();

export default function App() {
  // In demo mode, wait for the persisted store to load before first render (avoids
  // a seed→saved flash), then start autosaving. Live mode skips this entirely.
  const [ready, setReady] = useState(isSupabaseConfigured);
  // 2026-10-29 redesign: the condensed headline font (theme.fonts). Never wait
  // on it for long: after 2.5 s (or an error) the platform font is used.
  const [fontsLoaded, fontError] = useFonts({ BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold_Italic });
  const [fontWait, setFontWait] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setFontWait(false), 2500);
    return () => clearTimeout(t);
  }, []);
  const fontsReady = fontsLoaded || !!fontError || !fontWait;
  useEffect(() => {
    void hydrateReminderPrefs(); // user reminder timers (both demo + live)
    void hydrateTimeZone(); // viewer's display timezone (first run: the device's zone, else IST)
    void hydrateRegion(); // SD-150: country + date/clock/week overrides (default: from the device)
    void hydrateHapticsPref(); // SD-110: scoring-tap buzz on/off (this device)
    void hydrateAnalyticsConsent(); // SD-152: "Essential only" / "Allow analytics" (UK/EU ask first)
    if (isSupabaseConfigured) return;
    let on = true;
    hydrateDemo().then(() => {
      if (!on) return;
      setReady(true);
      startDemoAutosave();
    });
    return () => { on = false; };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {ready && fontsReady && (
        <ErrorBoundary>
          <AuthProvider>
            <OrgContextProvider>
              <RootNavigator />
            </OrgContextProvider>
          </AuthProvider>
        </ErrorBoundary>
      )}
      {/* SD-106: the shared "Are you sure?" sheet (askConfirm). */}
      <ConfirmSheetHost />
      {/* SD-152: UK/EU first visit — ask before analytics. */}
      <AnalyticsConsentBanner />
      {/* Reference-video A1: the launch animation, over the app as it loads. */}
      <LaunchAnimation fontsReady={fontsLoaded} />
    </SafeAreaProvider>
  );
}
