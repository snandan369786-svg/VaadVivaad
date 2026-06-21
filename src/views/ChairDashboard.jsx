import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Field,
  Panel,
  StatCard
} from '../components/ui';
import { useCommitteeData } from '../lib/useCommitteeData';
import {
  addChairNote,
  advanceSpeaker,
  claimChairAccess,
  closeDraft,
  closeVote,
  getMyMembership,
  lookupCommittee,
  openDraft,
  openVote,
  queueSpeakerRequest,
  dismissSpeakerRequest,
  setCommitteePhase
} from '../lib/supabase';
import {
  buildAiContext,
  buildChairLink,
  buildDelegateLink,
  buildSignatoryMap,
  copyText,
  formatPhaseLabel,
  formatTimestamp,
  getVoteCounts
} from '../lib/format';

const PHASE_OPTIONS = [
  'formal_debate',
  'moderated_caucus',
  'unmoderated_caucus',
  'informal_consultation',
  'voting',
  'adjourned'
];

const AI_SUGGESTIONS = [
  'Suggest the most sensible next motion.',
  'Draft a short chair statement on the current deadlock.',
  'Summarize the last 20 minutes for a late delegate.',
  'Flag any procedural risks in this room state.'
];

export function ChairDashboard({
  committeeCode,
  chairToken,
  navigate,
  authReady,
  authError,
  configReady
}) {
  const [accessState, setAccessState] = useState({
    loading: true,
    error: '',
    committeeInfo: null,
    membership: null
  });
  const [phaseForm, setPhaseForm] = useState({
    phase: 'formal_debate',
    note: ''
  });
  const [voteForm, setVoteForm] = useState({
    title: '',
    description: '',
    motionType: 'substantive',
    threshold: 'simple_majority'
  });
  const [draftForm, setDraftForm] = useState({
    title: '',
    description: ''
  });
  const [chairNote, setChairNote] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'I can help with motions, statements, summaries, and procedural sanity-checks. Ask me anything about the committee state.'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const hasAccess = accessState.membership?.role === 'chair';
  const { snapshot, loading, error, refresh } = useCommitteeData(
    committeeCode,
    hasAccess
  );
  const origin = useMemo(() => window.location.origin, []);

  useEffect(() => {
    if (!committeeCode || !configReady || !authReady) {
      setAccessState((current) => ({
        ...current,
        loading: false
      }));
      return;
    }

    let isActive = true;

    async function bootstrap() {
      try {
        const [committeeInfo, membership] = await Promise.all([
          lookupCommittee(committeeCode),
          getMyMembership(committeeCode)
        ]);

        if (!committeeInfo) {
          throw new Error('That committee code does not exist.');
        }

        if (!isActive) {
          return;
        }

        if (membership?.role === 'chair') {
          setAccessState({
            loading: false,
            error: '',
            committeeInfo,
            membership
          });
          return;
        }

        if (!chairToken) {
          throw new Error(
            'This chair URL is missing its private token. Use the full link generated at committee creation time.'
          );
        }

        await claimChairAccess(committeeCode, chairToken);
        const claimedMembership = await getMyMembership(committeeCode);

        if (!claimedMembership || claimedMembership.role !== 'chair') {
          throw new Error('Unable to unlock chair access for this browser.');
        }

        setAccessState({
          loading: false,
          error: '',
          committeeInfo,
          membership: claimedMembership
        });
      } catch (nextError) {
        if (isActive) {
          setAccessState({
            loading: false,
            error: nextError.message,
            committeeInfo: null,
            membership: null
          });
        }
      }
    }

    bootstrap();

    return () => {
      isActive = false;
    };
  }, [authReady, chairToken, committeeCode, configReady]);

  useEffect(() => {
    if (snapshot?.committee?.phase) {
      setPhaseForm((current) => ({
        ...current,
        phase: snapshot.committee.phase,
        note: snapshot.committee.status_note ?? ''
      }));
    }
  }, [snapshot?.committee?.phase, snapshot?.committee?.status_note]);

  const currentSpeaker = snapshot?.speakerQueue?.find(
    (entry) => entry.status === 'current'
  );
  const queuedSpeakers =
    snapshot?.speakerQueue?.filter((entry) => entry.status === 'queued') ?? [];
  const pendingRequests =
    snapshot?.speakerRequests?.filter((request) => request.status === 'pending') ??
    [];
  const activeDrafts =
    snapshot?.drafts?.filter((draft) => draft.status === 'open') ?? [];
  const voteCounts = getVoteCounts(snapshot?.ballots);
  const signatoryMap = buildSignatoryMap(snapshot?.signatories);
  const chairLink = snapshot
    ? buildChairLink(origin, snapshot.committee.code, chairToken ?? '')
    : '';
  const delegateLink = snapshot
    ? buildDelegateLink(origin, snapshot.committee.code)
    : '';

  async function runAction(label, work, onSuccess) {
    setBusyAction(label);
    setActionError('');
    setActionMessage('');

    try {
      await work();
      setActionMessage(onSuccess ?? 'Updated live.');
      refresh();
    } catch (nextError) {
      setActionError(nextError.message);
    } finally {
      setBusyAction('');
    }
  }

  async function handleCopy(value) {
    try {
      await copyText(value);
      setCopyMessage('Copied.');
    } catch (nextError) {
      setCopyMessage(nextError.message);
    }
  }

  async function handleChatSubmit(promptText) {
    const prompt = promptText.trim();

    if (!prompt || !snapshot) {
      return;
    }

    const nextMessages = [...messages, { role: 'user', content: prompt }];
    setMessages(nextMessages);
    setChatInput('');
    setChatBusy(true);

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: nextMessages.slice(-8),
          committee: buildAiContext(snapshot)
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'The AI copilot could not respond.');
      }

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: payload.reply
        }
      ]);
    } catch (nextError) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: `I hit an issue: ${nextError.message}`
        }
      ]);
    } finally {
      setChatBusy(false);
    }
  }

  if (!configReady) {
    return (
      <main className="page dashboard-page">
        <Callout tone="warning">
          Add your Supabase project URL and anon key first, then this dashboard
          will come alive.
        </Callout>
      </main>
    );
  }

  if (authError) {
    return (
      <main className="page dashboard-page">
        <Callout tone="danger">{authError}</Callout>
      </main>
    );
  }

  if (!authReady) {
    return (
      <main className="page dashboard-page">
        <Panel title="Connecting chair dashboard">
          <p>Starting your anonymous session and preparing the live room.</p>
        </Panel>
      </main>
    );
  }

  if (accessState.loading || (hasAccess && loading && !snapshot)) {
    return (
      <main className="page dashboard-page">
        <Panel title="Connecting chair dashboard">
          <p>Syncing your chair access and loading the committee state.</p>
        </Panel>
      </main>
    );
  }

  if (accessState.error) {
    return (
      <main className="page dashboard-page">
        <Panel
          title="Chair access blocked"
          action={
            <Button tone="secondary" onClick={() => navigate('/')}>
              Back to home
            </Button>
          }
        >
          <Callout tone="danger">{accessState.error}</Callout>
        </Panel>
      </main>
    );
  }

  if (error && !snapshot) {
    return (
      <main className="page dashboard-page">
        <Callout tone="danger">{error}</Callout>
      </main>
    );
  }

  if (!snapshot) {
    return null;
  }

  return (
    <main className="page dashboard-page">
      <section className="dashboard-topbar">
        <div>
          <span className="eyebrow">Chair dashboard</span>
          <h1>{snapshot.committee.name}</h1>
          <p>{snapshot.committee.topic}</p>
        </div>
        <div className="topbar-actions">
          <Badge tone="accent">{snapshot.committee.code}</Badge>
          <Badge tone="default">{formatPhaseLabel(snapshot.committee.phase)}</Badge>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard
          label="Delegates joined"
          value={snapshot.delegates.length}
          tone="cool"
        />
        <StatCard
          label="Pending placards"
          value={pendingRequests.length}
          tone="warm"
        />
        <StatCard
          label="Queued speakers"
          value={queuedSpeakers.length}
          tone="default"
        />
        <StatCard
          label="Open drafts"
          value={activeDrafts.length}
          tone="default"
        />
      </section>

      {actionError ? <Callout tone="danger">{actionError}</Callout> : null}
      {actionMessage ? <Callout tone="success">{actionMessage}</Callout> : null}
      {copyMessage ? <Callout tone="default">{copyMessage}</Callout> : null}
      {error ? <Callout tone="warning">{error}</Callout> : null}

      <section className="dashboard-grid">
        <div className="main-column">
          <Panel
            title="Room state"
            subtitle="Switch phases, keep a running note, and manage the floor."
            action={
              <Button
                tone="secondary"
                disabled={busyAction === 'advance-speaker'}
                onClick={() =>
                  runAction(
                    'advance-speaker',
                    () => advanceSpeaker(committeeCode),
                    currentSpeaker
                      ? 'Moved to the next speaker.'
                      : 'Started the next speaker.'
                  )
                }
              >
                {busyAction === 'advance-speaker'
                  ? 'Updating...'
                  : currentSpeaker
                    ? 'Advance speaker'
                    : 'Start next speaker'}
              </Button>
            }
          >
            <div className="room-state">
              <div className="room-current">
                <span>Current speaker</span>
                <strong>{currentSpeaker?.country ?? 'No speaker on the floor'}</strong>
                <small>
                  {currentSpeaker
                    ? `Live since ${formatTimestamp(currentSpeaker.updated_at)}`
                    : 'Queue a request and advance when ready.'}
                </small>
              </div>
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  runAction(
                    'set-phase',
                    () =>
                      setCommitteePhase(
                        committeeCode,
                        phaseForm.phase,
                        phaseForm.note
                      ),
                    'Committee phase updated.'
                  );
                }}
              >
                <Field label="Committee phase">
                  <select
                    className="input"
                    value={phaseForm.phase}
                    onChange={(event) =>
                      setPhaseForm((current) => ({
                        ...current,
                        phase: event.target.value
                      }))
                    }
                  >
                    {PHASE_OPTIONS.map((phase) => (
                      <option key={phase} value={phase}>
                        {formatPhaseLabel(phase)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Status note"
                  hint="Visible to delegates and folded into the AI context."
                >
                  <textarea
                    className="input textarea"
                    value={phaseForm.note}
                    onChange={(event) =>
                      setPhaseForm((current) => ({
                        ...current,
                        note: event.target.value
                      }))
                    }
                    placeholder="Moderated caucus on operative clause 4, 45 seconds per speaker"
                  />
                </Field>
                <Button type="submit" disabled={busyAction === 'set-phase'}>
                  {busyAction === 'set-phase' ? 'Saving...' : 'Update room state'}
                </Button>
              </form>
            </div>
          </Panel>

          <Panel
            title="Speaker requests"
            subtitle="Approve placards into the queue or dismiss them."
          >
            {pendingRequests.length ? (
              <div className="list">
                {pendingRequests.map((request) => (
                  <div className="list-row" key={request.id}>
                    <div>
                      <strong>{request.country}</strong>
                      <p>Raised at {formatTimestamp(request.requested_at)}</p>
                    </div>
                    <div className="row-actions">
                      <Button
                        tone="secondary"
                        disabled={busyAction === request.id}
                        onClick={() =>
                          runAction(
                            request.id,
                            () => queueSpeakerRequest(committeeCode, request.id),
                            `${request.country} added to the speakers list.`
                          )
                        }
                      >
                        Queue
                      </Button>
                      <Button
                        tone="ghost"
                        disabled={busyAction === `${request.id}-dismiss`}
                        onClick={() =>
                          runAction(
                            `${request.id}-dismiss`,
                            () => dismissSpeakerRequest(committeeCode, request.id),
                            `${request.country} request dismissed.`
                          )
                        }
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No raised placards"
                body="Delegate requests will appear here in realtime."
              />
            )}
          </Panel>

          <Panel
            title="Speakers list"
            subtitle="Delegates see this queue as it changes."
          >
            {snapshot.speakerQueue.length ? (
              <div className="list">
                {snapshot.speakerQueue.map((entry) => (
                  <div className="list-row" key={entry.id}>
                    <div>
                      <strong>{entry.country}</strong>
                      <p>
                        {entry.status === 'current'
                          ? 'Currently speaking'
                          : entry.status === 'queued'
                            ? `Queued as #${entry.order_index}`
                            : 'Already completed'}
                      </p>
                    </div>
                    <Badge
                      tone={
                        entry.status === 'current'
                          ? 'accent'
                          : entry.status === 'queued'
                            ? 'default'
                            : 'muted'
                      }
                    >
                      {entry.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Queue is empty"
                body="Approve a placard request to start building the list."
              />
            )}
          </Panel>

          <Panel
            title="Voting"
            subtitle="Open a vote, watch the tally update, and close it when ready."
          >
            {snapshot.openVote ? (
              <div className="stack">
                <div className="vote-header">
                  <div>
                    <strong>{snapshot.openVote.title}</strong>
                    <p>{snapshot.openVote.description || 'No additional note.'}</p>
                  </div>
                  <Badge tone="accent">
                    {snapshot.openVote.threshold.replaceAll('_', ' ')}
                  </Badge>
                </div>
                <div className="vote-tally">
                  <StatCard label="Yes" value={voteCounts.yes} tone="cool" />
                  <StatCard label="No" value={voteCounts.no} tone="warm" />
                  <StatCard
                    label="Abstain"
                    value={voteCounts.abstain}
                    tone="default"
                  />
                </div>
                <Button
                  tone="secondary"
                  disabled={busyAction === 'close-vote'}
                  onClick={() =>
                    runAction(
                      'close-vote',
                      () => closeVote(committeeCode, snapshot.openVote.id),
                      'Vote closed and result logged.'
                    )
                  }
                >
                  {busyAction === 'close-vote' ? 'Closing...' : 'Close vote'}
                </Button>
              </div>
            ) : (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  runAction(
                    'open-vote',
                    () => openVote(committeeCode, voteForm),
                    'Vote opened.'
                  );
                }}
              >
                <Field label="Vote title">
                  <input
                    className="input"
                    value={voteForm.title}
                    onChange={(event) =>
                      setVoteForm((current) => ({
                        ...current,
                        title: event.target.value
                      }))
                    }
                    placeholder="Amendment 1.2"
                  />
                </Field>
                <Field label="Short description">
                  <textarea
                    className="input textarea"
                    value={voteForm.description}
                    onChange={(event) =>
                      setVoteForm((current) => ({
                        ...current,
                        description: event.target.value
                      }))
                    }
                    placeholder="Strike operative clause 5 and replace with..."
                  />
                </Field>
                <div className="inline-fields">
                  <Field label="Motion type">
                    <select
                      className="input"
                      value={voteForm.motionType}
                      onChange={(event) =>
                        setVoteForm((current) => ({
                          ...current,
                          motionType: event.target.value
                        }))
                      }
                    >
                      <option value="substantive">Substantive</option>
                      <option value="procedural">Procedural</option>
                      <option value="amendment">Amendment</option>
                    </select>
                  </Field>
                  <Field label="Threshold">
                    <select
                      className="input"
                      value={voteForm.threshold}
                      onChange={(event) =>
                        setVoteForm((current) => ({
                          ...current,
                          threshold: event.target.value
                        }))
                      }
                    >
                      <option value="simple_majority">Simple majority</option>
                      <option value="two_thirds">Two thirds</option>
                      <option value="consensus">Consensus</option>
                    </select>
                  </Field>
                </div>
                <Button type="submit" disabled={busyAction === 'open-vote'}>
                  {busyAction === 'open-vote' ? 'Opening...' : 'Open vote'}
                </Button>
              </form>
            )}
          </Panel>

          <Panel
            title="Draft sign-ons"
            subtitle="Open draft working papers and track signatory interest."
          >
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                runAction(
                  'open-draft',
                  () =>
                    openDraft(
                      committeeCode,
                      draftForm.title,
                      draftForm.description
                    ),
                  'Draft opened for signatories.'
                );
              }}
            >
              <Field label="Draft title">
                <input
                  className="input"
                  value={draftForm.title}
                  onChange={(event) =>
                    setDraftForm((current) => ({
                      ...current,
                      title: event.target.value
                    }))
                  }
                  placeholder="Working paper 1.1"
                />
              </Field>
              <Field label="Description">
                <textarea
                  className="input textarea"
                  value={draftForm.description}
                  onChange={(event) =>
                    setDraftForm((current) => ({
                      ...current,
                      description: event.target.value
                    }))
                  }
                  placeholder="Humanitarian safeguards package"
                />
              </Field>
              <Button type="submit" disabled={busyAction === 'open-draft'}>
                {busyAction === 'open-draft' ? 'Opening...' : 'Open draft'}
              </Button>
            </form>

            {activeDrafts.length ? (
              <div className="list">
                {activeDrafts.map((draft) => (
                  <div className="list-row" key={draft.id}>
                    <div>
                      <strong>{draft.title}</strong>
                      <p>
                        {(signatoryMap[draft.id] ?? 0)} signatories ·{' '}
                        {draft.description || 'No description provided.'}
                      </p>
                    </div>
                    <Button
                      tone="ghost"
                      disabled={busyAction === `close-${draft.id}`}
                      onClick={() =>
                        runAction(
                          `close-${draft.id}`,
                          () => closeDraft(committeeCode, draft.id),
                          `${draft.title} closed.`
                        )
                      }
                    >
                      Close
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </Panel>

          <Panel title="Chair notes" subtitle="Add context for your team and the AI copilot.">
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                if (!chairNote.trim()) {
                  return;
                }
                runAction(
                  'chair-note',
                  async () => {
                    await addChairNote(committeeCode, chairNote);
                    setChairNote('');
                  },
                  'Chair note logged.'
                );
              }}
            >
              <textarea
                className="input textarea"
                value={chairNote}
                onChange={(event) => setChairNote(event.target.value)}
                placeholder="France and Brazil are aligned on clause 3, Russia wants a suspension..."
              />
              <Button type="submit" disabled={busyAction === 'chair-note'}>
                {busyAction === 'chair-note' ? 'Logging...' : 'Add note'}
              </Button>
            </form>
          </Panel>

          <Panel title="Recent committee log" subtitle="Useful for handoffs and late arrivals.">
            <div className="list">
              {snapshot.eventLog.map((event) => (
                <div className="log-row" key={event.id}>
                  <div>
                    <strong>{event.summary}</strong>
                    <p>
                      {event.actor_label} · {formatTimestamp(event.created_at)}
                    </p>
                  </div>
                  <Badge tone="muted">{event.kind}</Badge>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <aside className="side-column">
          <Panel title="Share committee" subtitle="Send the delegate link and keep the chair link private.">
            <div className="share-card">
              <span>Session code</span>
              <code>{snapshot.committee.code}</code>
              <Button tone="ghost" onClick={() => handleCopy(snapshot.committee.code)}>
                Copy code
              </Button>
            </div>
            <div className="share-card">
              <span>Delegate link</span>
              <code>{delegateLink}</code>
              <Button tone="ghost" onClick={() => handleCopy(delegateLink)}>
                Copy delegate link
              </Button>
            </div>
            <div className="share-card">
              <span>Chair recovery link</span>
              <code>{chairLink}</code>
              <Button tone="ghost" onClick={() => handleCopy(chairLink)}>
                Copy chair link
              </Button>
            </div>
          </Panel>

          <Panel
            title="AI copilot"
            subtitle="Procedural advice depends on your ruleset, so the assistant states assumptions when needed."
          >
            <div className="ai-suggestions">
              {AI_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  className="suggestion-chip"
                  type="button"
                  onClick={() => handleChatSubmit(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <div className="chat-log">
              {messages.map((message, index) => (
                <article
                  className={`chat-bubble chat-${message.role}`}
                  key={`${message.role}-${index}`}
                >
                  <span>{message.role === 'assistant' ? 'Copilot' : 'Chair'}</span>
                  <p>{message.content}</p>
                </article>
              ))}
            </div>
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                handleChatSubmit(chatInput);
              }}
            >
              <textarea
                className="input textarea"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="What threshold would normally apply to this amendment?"
              />
              <Button type="submit" disabled={chatBusy}>
                {chatBusy ? 'Thinking...' : 'Ask copilot'}
              </Button>
            </form>
          </Panel>
        </aside>
      </section>
    </main>
  );
}
