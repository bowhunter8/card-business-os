import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      imageDataUrl?: string
    }

    const imageDataUrl = String(body.imageDataUrl ?? '').trim()

    if (!imageDataUrl) {
      return NextResponse.json({ error: 'Missing image data.' }, { status: 400 })
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all visible text from this screenshot. Return plain text only. Preserve order numbers exactly. Do not add commentary.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageDataUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 2000,
      }),
    })

    const json = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: json?.error?.message || 'OCR request failed.' },
        { status: 500 }
      )
    }

    const text =
      json?.choices?.[0]?.message?.content?.trim?.() ||
      ''

    return NextResponse.json({ text })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'OCR request failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}