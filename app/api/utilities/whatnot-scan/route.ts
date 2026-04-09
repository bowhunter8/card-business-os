import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ExtractedData = {
  detectedFormat: 'desktop_order' | 'mobile_order' | 'delivery_email' | 'unknown'
  orderId: string | null
  trackingNumber: string | null
  seller: string | null
  orderDate: string | null
  total: number | null
  titles: string[]
  normalizedText: string
}

type MatchedOrder = {
  id: string
  break_id: string | null
  order_id: string | null
  order_numeric_id: string | null
  seller: string | null
  product_name: string | null
  processed_date: string | null
  processed_date_display: string | null
  total: number | null
  score?: number
  reasons?: string[]
}

type MatchedBreak = {
  id: string
  break_date: string | null
  source_name: string | null
  product_name: string | null
  order_number: string | null
  notes: string | null
  total_cost: number | null
}

function cleanDigits(value: string | null | undefined) {
  return String(value ?? '').replace(/\D/g, '')
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function extractData(rawText: string): ExtractedData {
  const lines = rawText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  let orderId: string | null = null
  let trackingNumber: string | null = null
  let seller: string | null = null
  let orderDate: string | null = null

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const nextLine = lines[i + 1] ?? ''

    const orderInline =
      line.match(/order\s*id\s*[:#]?\s*([0-9]{6,20})/i) ||
      line.match(/order\s*number\s*[:#]?\s*([0-9]{6,20})/i)

    if (!orderId && orderInline?.[1]) {
      orderId = orderInline[1]
    }

    if (!orderId && /^order\s*id\b/i.test(line)) {
      const nextMatch = nextLine.match(/([0-9]{6,20})/)
      if (nextMatch?.[1]) {
        orderId = nextMatch[1]
      }
    }

    const trackingInline =
      line.match(/tracking(?:\s*number|\s*id|\s*your purchase)?\s*[:#]?\s*(9[0-9]{15,29})/i)

    if (!trackingNumber && trackingInline?.[1]) {
      trackingNumber = trackingInline[1]
    }

    if (!trackingNumber && /track\s*your\s*purchase/i.test(line)) {
      const nextMatch = nextLine.match(/\b(9[0-9]{15,29})\b/)
      if (nextMatch?.[1]) {
        trackingNumber = nextMatch[1]
      }
    }

    const sellerInline = line.match(/sold\s*by\s*([a-z0-9._-]+)/i)
    if (!seller && sellerInline?.[1]) {
      seller = sellerInline[1]
    }

    if (!seller && /^sold\s*by\b/i.test(line)) {
      const nextMatch = nextLine.match(/([a-z0-9._-]{3,})/i)
      if (nextMatch?.[1]) {
        seller = nextMatch[1]
      }
    }

    const dateInline =
      line.match(/order\s*date\s*[:#]?\s*([a-z]{3,9}\s+\d{1,2},\s+\d{4})/i) ||
      line.match(/order\s*date\s*[:#]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)

    if (!orderDate && dateInline?.[1]) {
      orderDate = dateInline[1]
    }

    if (!orderDate && /^order\s*date\b/i.test(line)) {
      const nextMatch =
        nextLine.match(/([a-z]{3,9}\s+\d{1,2},\s+\d{4})/i) ||
        nextLine.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)
      if (nextMatch?.[1]) {
        orderDate = nextMatch[1]
      }
    }
  }

  if (!orderId) {
    const fallbackIds = rawText.match(/\b([0-9]{8,10})\b/g)
    if (fallbackIds?.length) {
      orderId = fallbackIds[0]
    }
  }

  const totalMatch = rawText.match(/\$([0-9]+\.[0-9]{2})/)

  const titles = lines
    .filter((line) => {
      const lower = line.toLowerCase()
      return (
        (lower.includes('topps') ||
          lower.includes('heritage') ||
          lower.includes('baseball') ||
          lower.includes('blue jays') ||
          lower.includes('brewers') ||
          lower.includes('guardians') ||
          lower.includes('mariners')) &&
        !lower.startsWith('order details') &&
        !lower.startsWith('category') &&
        !lower.startsWith('sold by')
      )
    })
    .slice(0, 5)

  let detectedFormat: ExtractedData['detectedFormat'] = 'unknown'
  const normalized = normalizeText(rawText)

  if (
    normalized.includes('your whatnot order has arrived') ||
    normalized.includes('items in this shipment')
  ) {
    detectedFormat = 'delivery_email'
  } else if (
    normalized.includes('track your purchase') &&
    normalized.includes('order details')
  ) {
    detectedFormat = 'mobile_order'
  } else if (
    normalized.includes('shipment details') &&
    normalized.includes('order details')
  ) {
    detectedFormat = 'desktop_order'
  }

  return {
    detectedFormat,
    orderId,
    trackingNumber,
    seller,
    orderDate,
    total: totalMatch ? Number(totalMatch[1]) : null,
    titles,
    normalizedText: rawText,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rawText = body.text

    if (!rawText || typeof rawText !== 'string') {
      return NextResponse.json({ error: 'OCR text is required.' }, { status: 400 })
    }

    const extracted = extractData(rawText)
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let matchedOrder: MatchedOrder | null = null
    let matchedBreak: MatchedBreak | null = null

    const cleanedOrderId = cleanDigits(extracted.orderId)

    if (cleanedOrderId) {
      const { data: exactMatch } = await supabase
        .from('whatnot_orders')
        .select(
          `
          id,
          break_id,
          order_id,
          order_numeric_id,
          seller,
          product_name,
          processed_date,
          processed_date_display,
          total
        `
        )
        .eq('user_id', user.id)
        .or(`order_id.eq.${cleanedOrderId},order_numeric_id.eq.${cleanedOrderId}`)
        .maybeSingle()

      if (exactMatch) {
        matchedOrder = {
          ...(exactMatch as MatchedOrder),
          score: 100,
          reasons: ['exact order id match'],
        }
      }
    }

    if (matchedOrder?.break_id) {
      const { data: linkedBreak } = await supabase
        .from('breaks')
        .select(
          `
          id,
          break_date,
          source_name,
          product_name,
          order_number,
          notes,
          total_cost
        `
        )
        .eq('user_id', user.id)
        .eq('id', matchedOrder.break_id)
        .maybeSingle()

      if (linkedBreak) {
        matchedBreak = linkedBreak as MatchedBreak
      }
    }

    return NextResponse.json({
      success: true,
      extracted,
      matchedOrder,
      matchedBreak,
      matchedBy: matchedOrder ? ['order id'] : [],
      confidence: matchedOrder ? 'exact' : 'low',
      candidates: {
        breaks: matchedBreak ? [matchedBreak] : [],
        whatnotOrders: matchedOrder ? [matchedOrder] : [],
      },
    })
  } catch (error) {
    console.error('Scanner route error:', error)

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Scanner route failed.',
      },
      { status: 500 }
    )
  }
}