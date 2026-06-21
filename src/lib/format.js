export function normalizeCommitteeCode(value) {
  return (value ?? '').trim().toUpperCase();
}

export function formatPhaseLabel(value) {
  const labels = {
    formal_debate: 'Formal debate',
    moderated_caucus: 'Moderated caucus',
    unmoderated_caucus: 'Unmoderated caucus',
    informal_consultation: 'Informal consultation',
    voting: 'Voting procedure',
    adjourned: 'Adjourned'
  };

  return labels[value] ?? value.replaceAll('_', ' ');
}

export function formatTimestamp(value) {
  if (!value) {
    return 'Just now';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));
}

export function buildChairLink(origin, code, token) {
  return `${origin}/chair/${code}?token=${token}`;
}

export function buildDelegateLink(origin, code) {
  return `${origin}/delegate/${code}`;
}

export function getVoteCounts(ballots = []) {
  return ballots.reduce(
    (counts, ballot) => {
      counts[ballot.choice] += 1;
      return counts;
    },
    {
      yes: 0,
      no: 0,
      abstain: 0
    }
  );
}

export function buildSignatoryMap(signatories = []) {
  return signatories.reduce((map, signatory) => {
    map[signatory.draft_id] = (map[signatory.draft_id] ?? 0) + 1;
    return map;
  }, {});
}

export function buildAiContext(snapshot) {
  const currentSpeaker = snapshot.speakerQueue.find(
    (entry) => entry.status === 'current'
  );
  const queuedSpeakers = snapshot.speakerQueue
    .filter((entry) => entry.status === 'queued')
    .slice(0, 8)
    .map((entry) => ({
      country: entry.country,
      order: entry.order_index
    }));
  const pendingRequests = snapshot.speakerRequests
    .filter((request) => request.status === 'pending')
    .map((request) => ({
      country: request.country,
      requestedAt: request.requested_at
    }));
  const signatoryMap = buildSignatoryMap(snapshot.signatories);

  return {
    committee: {
      name: snapshot.committee.name,
      topic: snapshot.committee.topic,
      code: snapshot.committee.code,
      phase: snapshot.committee.phase,
      statusNote: snapshot.committee.status_note,
      currentSpeaker: currentSpeaker?.country ?? null,
      currentSpeakerSince: currentSpeaker?.updated_at ?? null
    },
    delegates: snapshot.delegates.map((delegate) => ({
      country: delegate.country,
      name: delegate.display_name ?? null
    })),
    pendingRequests,
    queuedSpeakers,
    openVote: snapshot.openVote
      ? {
          title: snapshot.openVote.title,
          description: snapshot.openVote.description,
          motionType: snapshot.openVote.motion_type,
          threshold: snapshot.openVote.threshold,
          tally: getVoteCounts(snapshot.ballots)
        }
      : null,
    activeDrafts: snapshot.drafts
      .filter((draft) => draft.status === 'open')
      .map((draft) => ({
        title: draft.title,
        description: draft.description,
        signatories: signatoryMap[draft.id] ?? 0
      })),
    recentEvents: snapshot.eventLog.slice(0, 14).map((event) => ({
      at: event.created_at,
      summary: event.summary,
      kind: event.kind
    }))
  };
}

export function copyText(value) {
  if (!navigator.clipboard) {
    return Promise.reject(new Error('Clipboard access is not available here.'));
  }

  return navigator.clipboard.writeText(value);
}
