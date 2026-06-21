import { useEffect, useState } from 'react';
import { LandingPage } from './views/LandingPage';
import { ChairDashboard } from './views/ChairDashboard';
import { DelegateDashboard } from './views/DelegateDashboard';
import { ensureAnonymousSession, hasSupabaseConfig } from './lib/supabase';
import { normalizeCommitteeCode } from './lib/format';

function parseRoute() {
  const url = new URL(window.location.href);
  const parts = url.pathname.split('/').filter(Boolean);

  if (parts[0] === 'chair') {
    return {
      mode: 'chair',
      committeeCode: normalizeCommitteeCode(parts[1] ?? ''),
      chairToken: url.searchParams.get('token') ?? ''
    };
  }

  if (parts[0] === 'delegate') {
    return {
      mode: 'delegate',
      committeeCode: normalizeCommitteeCode(parts[1] ?? url.searchParams.get('code')),
      chairToken: ''
    };
  }

  return {
    mode: 'landing',
    committeeCode: '',
    chairToken: ''
  };
}

export default function App() {
  const [route, setRoute] = useState(() => parseRoute());
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [session, setSession] = useState(null);

  useEffect(() => {
    function syncRoute() {
      setRoute(parseRoute());
    }

    window.addEventListener('popstate', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function bootstrapAuth() {
      if (!hasSupabaseConfig) {
        setAuthReady(true);
        return;
      }

      try {
        const nextSession = await ensureAnonymousSession();

        if (isActive) {
          setSession(nextSession);
        }
      } catch (nextError) {
        if (isActive) {
          setAuthError(nextError.message);
        }
      } finally {
        if (isActive) {
          setAuthReady(true);
        }
      }
    }

    bootstrapAuth();

    return () => {
      isActive = false;
    };
  }, []);

  function navigate(pathname) {
    window.history.pushState({}, '', pathname);
    setRoute(parseRoute());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (route.mode === 'chair') {
    return (
      <ChairDashboard
        committeeCode={route.committeeCode}
        chairToken={route.chairToken}
        navigate={navigate}
        authReady={authReady}
        authError={authError}
        configReady={hasSupabaseConfig}
      />
    );
  }

  if (route.mode === 'delegate') {
    return (
      <DelegateDashboard
        committeeCode={route.committeeCode}
        navigate={navigate}
        authReady={authReady}
        authError={authError}
        configReady={hasSupabaseConfig}
        session={session}
      />
    );
  }

  return (
    <LandingPage
      navigate={navigate}
      authReady={authReady}
      authError={authError}
      configReady={hasSupabaseConfig}
    />
  );
}
