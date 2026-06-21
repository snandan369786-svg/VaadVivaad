const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';

function buildContextBlock(committee) {
  return JSON.stringify(committee, null, 2);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY is missing.'
    });
  }

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const committee = req.body?.committee ?? {};

  const conversation = messages
    .slice(-8)
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: [
        {
          type: 'text',
          text: String(message.content ?? '')
        }
      ]
    }));

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
},
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 900,
        system: [
          'You are a calm Model United Nations chair copilot.',
          'Use the supplied committee state as your source of truth.',
          'Offer practical help: procedural guidance, motions, statements, summaries, and issue-spotting.',
          'Never invent committee-specific rules. If a threshold or ruling depends on the rules of procedure, say what assumption you are making.',
          'Keep answers concise, chair-friendly, and operational.'
        ].join(' '),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Current committee state:\n${buildContextBlock(committee)}`
              }
            ]
          },
          ...conversation
        ]
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: payload.error?.message || payload.error || 'Anthropic request failed.'
      });
    }

    const reply = (payload.content ?? [])
      .filter((entry) => entry.type === 'text')
      .map((entry) => entry.text)
      .join('\n\n')
      .trim();

    return res.status(200).json({
      reply: reply || 'No response came back from the AI service.'
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Unexpected server error.'
    });
  }
}
