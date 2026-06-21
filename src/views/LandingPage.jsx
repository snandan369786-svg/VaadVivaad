import { useMemo, useState } from 'react';
import { Button, Callout, Field, Panel, StatCard } from '../components/ui';
import { createCommittee } from '../lib/supabase';
import {
  buildChairLink,
  buildDelegateLink,
  copyText,
  normalizeCommitteeCode
} from '../lib/format';

function Feature({ title, body }) {
  return (
    <div className="feature-card">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

export function LandingPage({
  navigate,
  authReady,
  authError,
  configReady
}) {
  const [createForm, setCreateForm] = useState({
    name: '',
    topic: ''
  });
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [createdCommittee, setCreatedCommittee] = useState(null);
  const origin = useMemo(() => window.location.origin, []);

  async function handleCreate(event) {
    event.preventDefault();

    if (!createForm.name.trim() || !createForm.topic.trim()) {
      setError('Add both the committee name and topic.');
      return;
    }

    setBusy(true);
    setError('');
    setShareMessage('');

    try {
      const result = await createCommittee(createForm.name, createForm.topic);
      const chairLink = buildChairLink(origin, result.code, result.chair_token);
      const delegateLink = buildDelegateLink(origin, result.code);

      setCreatedCommittee({
        ...result,
        chairLink,
        delegateLink
      });
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(value) {
    try {
      await copyText(value);
      setShareMessage('Copied.');
    } catch (nextError) {
      setShareMessage(nextError.message);
    }
  }

  return (
    <main className="page landing-page">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Realtime committee control room</span>
          <h1>Run the whole committee from one browser tab.</h1>
          <p>
            Chair dashboard, delegate dashboard, live sync, voting, speaker
            queue, draft sign-ons, and an AI sidekick that understands the room
            state.
          </p>
          <div className="hero-stats">
            <StatCard label="Sync speed" value="< 1 second" tone="warm" />
            <StatCard label="Auth friction" value="None" tone="cool" />
            <StatCard label="Hosting cost" value="$0 to start" tone="default" />
          </div>
        </div>

        <Panel
          className="hero-panel"
          title="Start a committee"
          subtitle="Create a chair session, get the share links, and open the dashboard."
        >
          <form className="stack" onSubmit={handleCreate}>
            <Field label="Committee name">
              <input
                className="input"
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }
                placeholder="UNSC, WHO, DISEC..."
              />
            </Field>
            <Field label="Agenda or topic">
              <textarea
                className="input textarea"
                value={createForm.topic}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    topic: event.target.value
                  }))
                }
                placeholder="The humanitarian impact of autonomous weapons systems"
              />
            </Field>
            <Button
              type="submit"
              disabled={!configReady || !authReady || busy}
            >
              {busy ? 'Creating committee...' : 'Create committee'}
            </Button>
          </form>

          <form
            className="stack compact-form"
            onSubmit={(event) => {
              event.preventDefault();
              const normalizedCode = normalizeCommitteeCode(joinCode);
              if (!normalizedCode) {
                setError('Enter a session code to continue.');
                return;
              }
              navigate(`/delegate/${normalizedCode}`);
            }}
          >
            <Field label="Delegate quick join" hint="Paste a session code">
              <input
                className="input"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="MUN-K9F2"
              />
            </Field>
            <Button type="submit" tone="secondary">
              Open delegate dashboard
            </Button>
          </form>

          {error ? <Callout tone="danger">{error}</Callout> : null}
          {authError ? <Callout tone="danger">{authError}</Callout> : null}
          {!configReady ? (
            <Callout tone="warning">
              Add your Supabase URL and anon key in local or Vercel env vars
              before this goes live.
            </Callout>
          ) : null}
        </Panel>
      </section>

      {createdCommittee ? (
        <Panel
          className="share-panel"
          title={`Session ready: ${createdCommittee.code}`}
          subtitle="The chair link is private. The delegate link is safe to share with the code."
          action={
            <Button
              tone="secondary"
              onClick={() =>
                navigate(
                  `/chair/${createdCommittee.code}?token=${createdCommittee.chair_token}`
                )
              }
            >
              Open chair dashboard
            </Button>
          }
        >
          <div className="share-grid">
            <div className="share-card">
              <span>Chair link</span>
              <code>{createdCommittee.chairLink}</code>
              <Button
                type="button"
                tone="ghost"
                onClick={() => handleCopy(createdCommittee.chairLink)}
              >
                Copy chair link
              </Button>
            </div>
            <div className="share-card">
              <span>Delegate link</span>
              <code>{createdCommittee.delegateLink}</code>
              <Button
                type="button"
                tone="ghost"
                onClick={() => handleCopy(createdCommittee.delegateLink)}
              >
                Copy delegate link
              </Button>
            </div>
            <div className="share-card">
              <span>Session code</span>
              <code>{createdCommittee.code}</code>
              <Button
                type="button"
                tone="ghost"
                onClick={() => handleCopy(createdCommittee.code)}
              >
                Copy code
              </Button>
            </div>
          </div>
          {shareMessage ? <p className="helper-text">{shareMessage}</p> : null}
        </Panel>
      ) : null}

      <section className="feature-grid">
        <Feature
          title="Chair stays in control"
          body="Delegate actions land as requests. The chair alone advances speakers, opens votes, and manages drafts."
        />
        <Feature
          title="Delegates join in seconds"
          body="Anonymous auth plus country claiming keeps the join flow simple on phones and laptops."
        />
        <Feature
          title="Claude lives in the chair rail"
          body="Ask for statements, motion suggestions, or procedural red flags without leaving the dashboard."
        />
      </section>
    </main>
  );
}
