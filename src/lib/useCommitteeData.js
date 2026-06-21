import { useEffect, useState } from 'react';
import { fetchCommitteeSnapshot, subscribeToCommittee } from './supabase';

export function useCommitteeData(committeeCode, enabled) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [committeeId, setCommitteeId] = useState(null);

  useEffect(() => {
    if (!enabled || !committeeCode) {
      setLoading(false);
      setSnapshot(null);
      setCommitteeId(null);
      return undefined;
    }

    let isActive = true;

    async function loadSnapshot() {
      if (isActive) {
        setLoading(true);
      }

      try {
        const nextSnapshot = await fetchCommitteeSnapshot(committeeCode);

        if (!isActive) {
          return;
        }

        setSnapshot(nextSnapshot);
        setError('');
        setCommitteeId(nextSnapshot.committee.id);
      } catch (nextError) {
        if (isActive) {
          setError(nextError.message);
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    loadSnapshot();

    return () => {
      isActive = false;
    };
  }, [committeeCode, enabled, refreshKey]);

  useEffect(() => {
    if (!committeeId) {
      return undefined;
    }

    return subscribeToCommittee(committeeId, () => {
      setRefreshKey((value) => value + 1);
    });
  }, [committeeId]);

  return {
    snapshot,
    loading,
    error,
    refresh: () => setRefreshKey((value) => value + 1)
  };
}
