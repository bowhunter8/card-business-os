import { NextRequest, NextResponse } from 'next/server'
import { createWorker } from 'tesseract.js'
import { createClient } from '@/lib/supabase/server'
import {
  extractWhatnotData,
  scoreBreakMatch,
  scoreWhatnotOrderMatch,
} from '@/lib/whatnot-scan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type WhatnotOrderRow = {
  id: string
  break_id: string | null
  order_id: string | null
  order_numeric_id: string | null
  seller: string | null
  product_name: string | null
  processed_date: string | null
  processed_date_display: string | null
  total: number | null
}

type BreakRow = {
  id: string
  break_date: string | null
  source_name: string | null
  product_name: string | null
  order_number: string | null
  notes: string | null
  total_cost: number | null
}

async function runOcr(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  const imageBuffer = Buffer.from(arrayBuffer)

  const worker = await createWorker('eng')

  try {
    const result = await worker.recognize(imageBuffer)
    return result.data.text ?? ''
  } finally {
    await worker.terminate()
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Image file is required.' },
        { status: 400 }
      )
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Please upload an image file.' },
        { status: 400 }
      )
    }

    const rawText = await runOcr(file)
    const extracted = extractWhatnotData(rawText)
    const exactOrderId = extracted.orderId

    let exactOrder: WhatnotOrderRow | null = null
    let linkedBreakFromOrder: BreakRow | null = null
    let exactBreak: BreakRow | null = null

    if (exactOrderId) {
      const [{ data: orderByOrderId }, { data: breakByOrderNumber }] =
        await Promise.all([
          supabase
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
            .or(`order_id.eq.${exactOrderId},order_numeric_id.eq.${exactOrderId}`)
            .maybeSingle(),

          supabase
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
            .eq('order_number', exactOrderId)
            .maybeSingle(),
        ])

      exactOrder = (orderByOrderId as WhatnotOrderRow | null) ?? null
      exactBreak = (breakByOrderNumber as BreakRow | null) ?? null

      if (exactOrder?.break_id) {
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
          .eq('id', exactOrder.break_id)
          .maybeSingle()

        linkedBreakFromOrder = (linkedBreak as BreakRow | null) ?? null
      }
    }

    const [recentOrdersResponse, recentBreaksResponse] = await Promise.all([
      supabase
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
        .order('processed_date', { ascending: false })
        .limit(300),

      supabase
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
        .order('break_date', { ascending: false })
        .limit(300),
    ])

    const recentOrders = (recentOrdersResponse.data ?? []) as WhatnotOrderRow[]
    const recentBreaks = (recentBreaksResponse.data ?? []) as BreakRow[]

    const scoredOrders = recentOrders
      .map((row) => {
        const match = scoreWhatnotOrderMatch(extracted, row)
        return {
          ...row,
          score: match.score,
          reasons: match.reasons,
        }
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    const scoredBreaks = recentBreaks
      .map((row) => {
        const match = scoreBreakMatch(extracted, row)
        return {
          ...row,
          score: match.score,
          reasons: match.reasons,
        }
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    let matchedBy: string[] = []
    let matchedBreak: BreakRow | null = null
    let matchedOrder: WhatnotOrderRow | null = null
    let confidence: 'exact' | 'high' | 'medium' | 'low' | 'none' = 'none'

    if (linkedBreakFromOrder) {
      matchedBreak = linkedBreakFromOrder
      matchedOrder = exactOrder
      matchedBy = ['exact_order_match', 'linked_whatnot_order_to_break']
      confidence = 'exact'
    } else if (exactBreak) {
      matchedBreak = exactBreak
      matchedBy = ['exact_break_order_number_match']
      confidence = 'exact'
    } else if (exactOrder) {
      matchedOrder = exactOrder
      matchedBy = ['exact_whatnot_order_match']
      confidence = 'high'
    } else if (scoredBreaks[0] && scoredBreaks[0].score >= 30) {
      matchedBreak = scoredBreaks[0]
      matchedBy = scoredBreaks[0].reasons
      confidence = scoredBreaks[0].score >= 60 ? 'high' : 'medium'
    } else if (scoredOrders[0] && scoredOrders[0].score >= 30) {
      matchedOrder = scoredOrders[0]
      matchedBy = scoredOrders[0].reasons
      confidence = scoredOrders[0].score >= 60 ? 'high' : 'medium'

      if (matchedOrder.break_id) {
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

        matchedBreak = (linkedBreak as BreakRow | null) ?? null
      }
    } else if (scoredBreaks[0] || scoredOrders[0]) {
      if ((scoredBreaks[0]?.score ?? 0) >= (scoredOrders[0]?.score ?? 0)) {
        matchedBreak = scoredBreaks[0] ?? null
        matchedBy = scoredBreaks[0]?.reasons ?? []
        confidence = 'low'
      } else {
        matchedOrder = scoredOrders[0] ?? null
        matchedBy = scoredOrders[0]?.reasons ?? []
        confidence = 'low'
      }
    }

    return NextResponse.json({
      success: true,
      extracted,
      matchedBreak,
      matchedOrder,
      matchedBy,
      confidence,
      candidates: {
        breaks: scoredBreaks,
        whatnotOrders: scoredOrders,
      },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Scanner route failed.'

    return NextResponse.json({ error: message }, { status: 500 })
  }
}