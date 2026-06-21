import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { normalizeCommitteeCode } from './format';

export const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = hasSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        storageKey: 'committee-flow-auth'
      }
    })
  : null;

function requireClient() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    );
  }

  return supabase;
}

function singleRow(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

async function rpc(fn, params = {}) {
  const client = requireClient();
  const { data, error } = await client.rpc(fn, params);

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function ensureAnonymousSession() {
  const client = requireClient();
  const {
    data: { session }
  } = await client.auth.getSession();

  if (session) {
    return session;
  }

  const { data, error } = await client.auth.signInAnonymously();

  if (error) {
    throw new Error(error.message);
  }

  return data.session;
}

export async function lookupCommittee(code) {
  const data = await rpc('lookup_committee', {
    p_code: normalizeCommitteeCode(code)
  });
  return singleRow(data);
}

export async function getMyMembership(code) {
  const data = await rpc('get_my_membership', {
    p_code: normalizeCommitteeCode(code)
  });
  return singleRow(data);
}

export async function createCommittee(name, topic) {
  const data = await rpc('create_committee', {
    p_name: name.trim(),
    p_topic: topic.trim()
  });
  return singleRow(data);
}

export async function claimChairAccess(code, chairToken) {
  const data = await rpc('claim_chair_access', {
    p_code: normalizeCommitteeCode(code),
    p_chair_token: chairToken
  });
  return singleRow(data);
}

export async function claimDelegateSlot(code, country, displayName) {
  const data = await rpc('claim_delegate_slot', {
    p_code: normalizeCommitteeCode(code),
    p_country: country,
    p_display_name: displayName?.trim() || null
  });
  return singleRow(data);
}

export async function raisePlacard(code) {
  const data = await rpc('raise_placard', {
    p_code: normalizeCommitteeCode(code)
  });
  return singleRow(data);
}

export async function queueSpeakerRequest(code, requestId) {
  const data = await rpc('queue_speaker_request', {
    p_code: normalizeCommitteeCode(code),
    p_request_id: requestId
  });
  return singleRow(data);
}

export async function dismissSpeakerRequest(code, requestId) {
  const data = await rpc('dismiss_speaker_request', {
    p_code: normalizeCommitteeCode(code),
    p_request_id: requestId
  });
  return singleRow(data);
}

export async function advanceSpeaker(code) {
  const data = await rpc('advance_speaker', {
    p_code: normalizeCommitteeCode(code)
  });
  return singleRow(data);
}

export async function setCommitteePhase(code, phase, note) {
  const data = await rpc('set_committee_phase', {
    p_code: normalizeCommitteeCode(code),
    p_phase: phase,
    p_note: note?.trim() || null
  });
  return singleRow(data);
}

export async function openVote(code, payload) {
  const data = await rpc('open_vote', {
    p_code: normalizeCommitteeCode(code),
    p_title: payload.title.trim(),
    p_description: payload.description.trim() || null,
    p_motion_type: payload.motionType,
    p_threshold: payload.threshold
  });
  return singleRow(data);
}

export async function closeVote(code, voteId) {
  const data = await rpc('close_vote', {
    p_code: normalizeCommitteeCode(code),
    p_vote_id: voteId
  });
  return singleRow(data);
}

export async function castVote(voteId, choice) {
  const data = await rpc('cast_vote', {
    p_vote_id: voteId,
    p_choice: choice
  });
  return singleRow(data);
}

export async function openDraft(code, title, description) {
  const data = await rpc('open_draft', {
    p_code: normalizeCommitteeCode(code),
    p_title: title.trim(),
    p_description: description.trim() || null
  });
  return singleRow(data);
}

export async function closeDraft(code, draftId) {
  const data = await rpc('close_draft', {
    p_code: normalizeCommitteeCode(code),
    p_draft_id: draftId
  });
  return singleRow(data);
}

export async function toggleDraftSignatory(draftId) {
  const data = await rpc('toggle_draft_signatory', {
    p_draft_id: draftId
  });
  return singleRow(data);
}

export async function addChairNote(code, note) {
  const data = await rpc('add_chair_note', {
    p_code: normalizeCommitteeCode(code),
    p_note: note.trim()
  });
  return singleRow(data);
}

export async function fetchCommitteeSnapshot(code) {
  const client = requireClient();
  const normalizedCode = normalizeCommitteeCode(code);
  const { data: committee, error } = await client
    .from('committees')
    .select('*')
    .eq('code', normalizedCode)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const committeeId = committee.id;

  const [
    membershipsResult,
    requestsResult,
    queueResult,
    votesResult,
    draftsResult,
    eventLogResult
  ] = await Promise.all([
    client
      .from('committee_memberships')
      .select('*')
      .eq('committee_id', committeeId)
      .order('joined_at', { ascending: true }),
    client
      .from('speaker_requests')
      .select(
        `
          *,
          committee_memberships (
            id,
            country,
            display_name
          )
        `
      )
      .eq('committee_id', committeeId)
      .order('requested_at', { ascending: true }),
    client
      .from('speaker_queue')
      .select('*')
      .eq('committee_id', committeeId)
      .order('order_index', { ascending: true }),
    client
      .from('votes')
      .select('*')
      .eq('committee_id', committeeId)
      .order('opened_at', { ascending: false }),
    client
      .from('drafts')
      .select('*')
      .eq('committee_id', committeeId)
      .order('created_at', { ascending: false }),
    client
      .from('event_log')
      .select('*')
      .eq('committee_id', committeeId)
      .order('created_at', { ascending: false })
      .limit(40)
  ]);

  [
    membershipsResult,
    requestsResult,
    queueResult,
    votesResult,
    draftsResult,
    eventLogResult
  ].forEach((result) => {
    if (result.error) {
      throw new Error(result.error.message);
    }
  });

  const votes = votesResult.data ?? [];
  const openVoteRecord = votes.find((vote) => vote.status === 'open') ?? null;
  const drafts = draftsResult.data ?? [];
  const draftIds = drafts.map((draft) => draft.id);

  const ballotsResult = openVoteRecord
    ? await client
        .from('vote_ballots')
        .select('*')
        .eq('committee_id', committeeId)
        .eq('vote_id', openVoteRecord.id)
    : { data: [], error: null };

  if (ballotsResult.error) {
    throw new Error(ballotsResult.error.message);
  }

  const signatoriesResult = draftIds.length
    ? await client
        .from('draft_signatories')
        .select('*')
        .eq('committee_id', committeeId)
        .in('draft_id', draftIds)
    : { data: [], error: null };

  if (signatoriesResult.error) {
    throw new Error(signatoriesResult.error.message);
  }

  const memberships = membershipsResult.data ?? [];

  return {
    committee,
    memberships,
    delegates: memberships.filter((membership) => membership.role === 'delegate'),
    speakerRequests: (requestsResult.data ?? []).map((request) => ({
      ...request,
      country: request.committee_memberships?.country ?? 'Unknown delegate',
      display_name: request.committee_memberships?.display_name ?? null
    })),
    speakerQueue: queueResult.data ?? [],
    votes,
    openVote: openVoteRecord,
    ballots: ballotsResult.data ?? [],
    drafts,
    signatories: signatoriesResult.data ?? [],
    eventLog: eventLogResult.data ?? []
  };
}

export function subscribeToCommittee(committeeId, onChange) {
  const client = requireClient();
  const channel = client.channel(`committee:${committeeId}`);
  const tableFilters = [
    ['committees', `id=eq.${committeeId}`],
    ['committee_memberships', `committee_id=eq.${committeeId}`],
    ['speaker_requests', `committee_id=eq.${committeeId}`],
    ['speaker_queue', `committee_id=eq.${committeeId}`],
    ['votes', `committee_id=eq.${committeeId}`],
    ['vote_ballots', `committee_id=eq.${committeeId}`],
    ['drafts', `committee_id=eq.${committeeId}`],
    ['draft_signatories', `committee_id=eq.${committeeId}`],
    ['event_log', `committee_id=eq.${committeeId}`]
  ];

  tableFilters.forEach(([table, filter]) => {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        filter
      },
      onChange
    );
  });

  channel.subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
