export async function analyzeMatchPhoto(base64Image: string) {
  const apiKey = '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';

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: "This is a FIFA match result screen. Extract the following information and return ONLY a JSON object with no other text: { home_team: string, away_team: string, score_home: number, score_away: number }. If you cannot read the screen clearly, return { error: 'Could not read match result' }"
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              }
            }
          ]
        }
      ],
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('OpenAI API Error:', errorData);
    throw new Error('Failed to analyze image with OpenAI');
  }

  const result = await response.json();
  const content = result.choices[0].message.content.trim();

  // Try to parse the JSON output (in case it wraps it in markdown)
  let cleanContent = content;
  if (cleanContent.startsWith('```json')) {
    cleanContent = cleanContent.replace(/```json\n?/, '').replace(/```/, '');
  } else if (cleanContent.startsWith('```')) {
    cleanContent = cleanContent.replace(/```\n?/, '').replace(/```/, '');
  }

  return JSON.parse(cleanContent);
}
