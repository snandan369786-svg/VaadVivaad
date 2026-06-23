console.log("BUILD 24 JUNE 11:47 PM");
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
import { COUNTRIES } from '../data/countries';
import { useCommitteeData } from '../lib/useCommitteeData';
import {
  castVote,
  claimDelegateSlot,
  getMyMembership,
  lookupCommittee,
  raisePlacard,
  toggleDraftSignatory
} from '../lib/supabase';
import {
  buildSignatoryMap,
  formatPhaseLabel,
  formatTimestamp,
  getVoteCounts,
  normalizeCommitteeCode
} from '../lib/format';

export function DelegateDashboard({
  committeeCode,
  navigate,
  authReady,
  authError,
  configReady,
  session
}) {
  const [landingCode, setLandingCode] = useState(committeeCode ?? '');
  const [committeeInfo, setCommitteeInfo] = useState(null);
  const [membership, setMembership] = useState(null);
  const [bootLoading, setBootLoading] = useState(Boolean(committeeCode));
  const [bootError, setBootError] = useState('');
  const [joinForm, setJoinForm] = useState({
    country: '',
    displayName: ''
  });
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const hasAccess = membership?.role === 'delegate';

const membershipId = membership?.id ?? membership?.membership_id;

const { snapshot, loading, error, refresh } = useCommitteeData(
  committeeCode,
  hasAccess
);

console.log("MEMBERSHIP:", membership);
console.log("HAS ACCESS:", hasAccess);
console.log("SNAPSHOT:", snapshot);
  

  useEffect(() => {
    setLandingCode(committeeCode ?? '');
  }, [committeeCode]);

  useEffect(() => {
    if (!committeeCode || !configReady || !authReady) {
      setBootLoading(false);
      return;
    }

    let isActive = true;

    async function bootstrap() {
      setBootLoading(true);

      try {
        const [nextCommitteeInfo, nextMembership] = await Promise.all([
          lookupCommittee(committeeCode),
          getMyMembership(committeeCode)
        ]);

        if (!nextCommitteeInfo) {
          throw new Error('That committee code does not exist.');
        }

        if (isActive) {
          setCommitteeInfo(nextCommitteeInfo);
          setMembership(nextMembership?.role === 'delegate' ? nextMembership : null);
          setBootError('');
        }
      } catch (nextError) {
        if (isActive) {
          setBootError(nextError.message);
          setCommitteeInfo(null);
          setMembership(null);
        }
      } finally {
        if (isActive) {
          setBootLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      isActive = false;
    };
  }, [authReady, committeeCode, configReady]);

  useEffect(() => {
    if (!snapshot || !session?.user?.id) {
      return;
    }

    const liveMembership = snapshot.memberships.find(
      (candidate) => candidate.user_id === session.user.id
    );

    if (liveMembership?.role === 'delegate') {
      setMembership(liveMembership);
    }
  }, [session?.user?.id, snapshot]);

  const currentSpeaker = snapshot?.speakerQueue?.find(
    (entry) => entry.status === 'current'
  );
  const myPendingRequest =
    snapshot?.speakerRequests?.find(
      (request) =>
        request.membership_id === membershipId &&
        request.status === 'pending'
    ) ?? null;
  const myQueueEntry =
    snapshot?.speakerQueue?.find(
      (entry) =>
        entry.membership_id === membershipId &&
        ['queued', 'current'].includes(entry.status)
    ) ?? null;
  const myBallot =
    snapshot?.ballots?.find(
      (ballot) => ballot.membership_id === membershipId
    ) ?? null;
  const signatoryMap = buildSignatoryMap(snapshot?.signatories);
  const signedDraftIds = new Set(
    (snapshot?.signatories ?? [])
      .filter((signatory) => signatory.membership_id === membershipId)
      .map((signatory) => signatory.draft_id)
  );
  const availableCountries = useMemo(() => {
    const claimed = new Set(
      (committeeInfo?.claimed_countries ?? []).map((country) => country.toLowerCase())
    );
    return COUNTRIES.filter((country) => !claimed.has(country.toLowerCase()));
  }, [committeeInfo]);
  const voteCounts = getVoteCounts(snapshot?.ballots);

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

  if (!configReady) {
    return (
      <main className="page dashboard-page">
        <Callout tone="warning">
          Add your Supabase project URL and anon key before delegate access will
          work.
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
        <Panel title="Loading delegate dashboard">
          <p>Starting your anonymous session and opening the committee.</p>
        </Panel>
      </main>
    );
  }

  if (!committeeCode) {
    return (
      <main className="page delegate-entry-page">
        <Panel
          className="delegate-entry-panel"
          title="Join a committee"
          subtitle="Open the delegate link, add the session code, and claim your country."
        >
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              const normalizedCode = normalizeCommitteeCode(landingCode);
              if (!normalizedCode) {
                setBootError('Enter a session code to continue.');
                return;
              }
              navigate(`/delegate/${normalizedCode}`);
            }}
          >
            <Field label="Session code">
              <input
                className="input"
                value={landingCode}
                onChange={(event) => setLandingCode(event.target.value)}
                placeholder="MUN-K9F2"
              />
            </Field>
            <Button type="submit">Continue</Button>
          </form>
          {bootError ? <Callout tone="danger">{bootError}</Callout> : null}
        </Panel>
      </main>
    );
  }

  if (bootLoading || (hasAccess && loading && !snapshot)) {
    return (
      <main className="page dashboard-page">
        <Panel title="Loading delegate dashboard">
          <p>Checking committee access and syncing the live state.</p>
        </Panel>
      </main>
    );
  }

  if (bootError) {
    return (
      <main className="page dashboard-page">
        <Callout tone="danger">{bootError}</Callout>
      </main>
    );
  }
console.log("MEMBERSHIP =", membership);
console.log("HAS ACCESS =", hasAccess);
console.log("BOOT LOADING =", bootLoading);
  if (!hasAccess) {
    return (
      <main className="page dashboard-page">
        <section className="dashboard-topbar">
          <div>
            <span className="eyebrow">Delegate join</span>
            <h1>{committeeInfo?.name ?? 'Committee'}</h1>
            <p>{committeeInfo?.topic}</p>
          </div>
          <Badge tone="accent">{committeeCode}</Badge>
        </section>

        <Panel
          title="Claim your country"
          subtitle="No signup, no password. Country claims are first-come, first-served."
        >
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (!joinForm.country) {
                setActionError('Choose a country before joining.');
                return;
              }
              runAction(
                'join-committee',
                async () => {
                  await claimDelegateSlot(
                    committeeCode,
                    joinForm.country,
                    joinForm.displayName
                  );
                  const nextMembership = await getMyMembership(committeeCode);
                  console.log("NEXT MEMBERSHIP:", nextMembership);
setMembership(nextMembership);
                  setMembership(nextMembership);
                },
                `Joined as ${joinForm.country}.`
              );
            }}
          >
            <Field label="Country">
              <select
                className="input"
                value={joinForm.country}
                onChange={(event) =>
                  setJoinForm((current) => ({
                    ...current,
                    country: event.target.value
                  }))
                }
              >
                <option value="">Select your country</option>
                {availableCountries.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Display name"
              hint="Optional. Helpful if a delegation shares a laptop."
            >
              <input
                className="input"
                value={joinForm.displayName}
                onChange={(event) =>
                  setJoinForm((current) => ({
                    ...current,
                    displayName: event.target.value
                  }))
                }
                placeholder="Delegate from France"
              />
            </Field>
            <Button type="submit" disabled={busyAction === 'join-committee'}>
              {busyAction === 'join-committee' ? 'Joining...' : 'Join committee'}
            </Button>
          </form>
          {availableCountries.length === 0 ? (
            <Callout tone="warning">
              Every listed country is already claimed. You can expand the list in
              the country dataset or free an occupied seat in Supabase.
            </Callout>
          ) : null}
          {actionError ? <Callout tone="danger">{actionError}</Callout> : null}
          {actionMessage ? <Callout tone="success">{actionMessage}</Callout> : null}
        </Panel>
      </main>
    );
  }

  if (!snapshot) {
  return (
    <main className="page">
      <p>Loading committee data...</p>
      <pre>
        {JSON.stringify(
          {
            membership,
            hasAccess,
            loading,
            error
          },
          null,
          2
        )}
      </pre>
    </main>
  );
}

  return (
    <main className="page dashboard-page">
      <section className="dashboard-topbar">
        <div>
          <span className="eyebrow">Delegate dashboard</span>
          <h1>{snapshot.committee.name}</h1>
          <p>{snapshot.committee.topic}</p>
        </div>
        <div className="topbar-actions">
          <Badge tone="accent">{membership?.country}</Badge>
          <Badge tone="default">{formatPhaseLabel(snapshot.committee.phase)}</Badge>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard
          label="Current speaker"
          value={currentSpeaker?.country ?? 'None'}
          tone="cool"
        />
        <StatCard
          label="Your placard"
          value={
            myQueueEntry
              ? myQueueEntry.status === 'current'
                ? 'On floor'
                : `Queued #${myQueueEntry.order_index}`
              : myPendingRequest
                ? 'Pending'
                : 'Down'
          }
          tone="warm"
        />
        <StatCard
          label="Vote status"
          value={snapshot.openVote ? 'Open now' : 'Closed'}
          tone="default"
        />
        <StatCard
          label="Open drafts"
          value={snapshot.drafts.filter((draft) => draft.status === 'open').length}
          tone="default"
        />
      </section>

      {snapshot.committee.status_note ? (
        <Callout tone="default">{snapshot.committee.status_note}</Callout>
      ) : null}
      {actionError ? <Callout tone="danger">{actionError}</Callout> : null}
      {actionMessage ? <Callout tone="success">{actionMessage}</Callout> : null}
      {error ? <Callout tone="warning">{error}</Callout> : null}

      <section className="dashboard-grid delegate-grid">
        <div className="main-column">
          <Panel
            title="Raise placard"
            subtitle="Your request appears instantly on the chair dashboard."
            action={
              <Button
                disabled={
                  Boolean(myPendingRequest || myQueueEntry) ||
                  busyAction === 'raise-placard'
                }
                onClick={() =>
                  runAction(
                    'raise-placard',
                    () => raisePlacard(committeeCode),
                    'Placard raised.'
                  )
                }
              >
                {busyAction === 'raise-placard' ? 'Sending...' : 'Raise placard'}
              </Button>
            }
          >
            {myQueueEntry ? (
              <Callout tone="success">
                {myQueueEntry.status === 'current'
                  ? 'You currently have the floor.'
                  : `You are queued as speaker #${myQueueEntry.order_index}.`}
              </Callout>
            ) : myPendingRequest ? (
              <Callout tone="warning">
                Your request is waiting on the chair.
              </Callout>
            ) : (
              <p className="helper-text">
                When the chair accepts your placard, your country moves into the
                live speakers list.
              </p>
            )}
          </Panel>

          <Panel title="Speakers list" subtitle="Updates live across every delegate screen.">
            {snapshot.speakerQueue.length ? (
              <div className="list">
                {snapshot.speakerQueue.map((entry) => (
                  <div className="list-row" key={entry.id}>
                    <div>
                      <strong>{entry.country}</strong>
                      <p>
                        {entry.status === 'current'
                          ? 'Speaking now'
                          : entry.status === 'queued'
                            ? `Queued as #${entry.order_index}`
                            : 'Completed'}
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
                title="No speakers yet"
                body="As soon as the chair starts the queue, it will appear here."
              />
            )}
          </Panel>

          <Panel title="Voting" subtitle="Cast once, or update your ballot while the vote is open.">
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
                <div className="vote-actions">
                  {['yes', 'no', 'abstain'].map((choice) => (
                    <Button
                      key={choice}
                      tone={myBallot?.choice === choice ? 'secondary' : 'ghost'}
                      disabled={busyAction === `vote-${choice}`}
                      onClick={() =>
                        runAction(
                          `vote-${choice}`,
                          () => castVote(snapshot.openVote.id, choice),
                          `Vote recorded as ${choice}.`
                        )
                      }
                    >
                      {choice}
                    </Button>
                  ))}
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
              </div>
            ) : (
              <EmptyState
                title="No vote is open"
                body="The voting controls appear here the moment the chair opens one."
              />
            )}
          </Panel>

          <Panel title="Draft signatories" subtitle="Support drafts without leaving the live room state.">
            {snapshot.drafts.filter((draft) => draft.status === 'open').length ? (
              <div className="list">
                {snapshot.drafts
                  .filter((draft) => draft.status === 'open')
                  .map((draft) => (
                    <div className="list-row" key={draft.id}>
                      <div>
                        <strong>{draft.title}</strong>
                        <p>
                          {(signatoryMap[draft.id] ?? 0)} signatories ·{' '}
                          {draft.description || 'No description provided.'}
                        </p>
                      </div>
                      <Button
                        tone={signedDraftIds.has(draft.id) ? 'secondary' : 'ghost'}
                        disabled={busyAction === `draft-${draft.id}`}
                        onClick={() =>
                          runAction(
                            `draft-${draft.id}`,
                            () => toggleDraftSignatory(draft.id),
                            signedDraftIds.has(draft.id)
                              ? `Removed your support from ${draft.title}.`
                              : `Signed on to ${draft.title}.`
                          )
                        }
                      >
                        {signedDraftIds.has(draft.id) ? 'Signed' : 'Sign on'}
                      </Button>
                    </div>
                  ))}
              </div>
            ) : (
              <EmptyState
                title="No drafts are collecting signatories"
                body="Open drafts will appear here as soon as the chair publishes them."
              />
            )}
          </Panel>
        </div>

        <aside className="side-column">
          <Panel title="Your seat" subtitle="This browser is tied to your anonymous session.">
            <div className="seat-card">
              <strong>{membership?.country}</strong>
              <p>{membership?.display_name || 'Delegate session active'}</p>
              <small>Joined at {formatTimestamp(membership?.joined_at)}</small>
            </div>
          </Panel>

          <Panel title="Committee feed" subtitle="Recent chair actions and live room changes.">
            <div className="list">
              {snapshot.eventLog.slice(0, 10).map((event) => (
                <div className="log-row" key={event.id}>
                  <div>
                    <strong>{event.summary}</strong>
                    <p>{formatTimestamp(event.created_at)}</p>
                  </div>
                  <Badge tone="muted">{event.kind}</Badge>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </section>
    </main>
  );
}
