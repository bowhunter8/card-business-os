'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  isValidUserReportPresetName,
  normalizeUserReportPresetName,
} from '@/lib/reports/user-report-presets'
import type { ReportPresetType } from '@/lib/reports/report-presets'

export async function saveReportPresetAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('You must be signed in to save a report preset.')
  }

  const reportType = String(formData.get('reportType') || '') as ReportPresetType
  const name = normalizeUserReportPresetName(String(formData.get('name') || ''))
  const description = String(formData.get('description') || '').trim()
  const returnPath = String(formData.get('returnPath') || '/app/reports')

  if (!['inventory', 'sales', 'expenses', 'tax'].includes(reportType)) {
    throw new Error('Invalid report type.')
  }

  if (!isValidUserReportPresetName(name)) {
    throw new Error('Preset name must be at least 2 characters.')
  }

  const params: Record<string, string> = {}

  for (const [key, value] of formData.entries()) {
    if (['reportType', 'name', 'description', 'returnPath'].includes(key)) continue

    const clean = String(value ?? '').trim()
    if (clean) params[key] = clean
  }

  const { error } = await supabase.from('user_report_presets').insert({
    user_id: user.id,
    report_type: reportType,
    name,
    description: description || null,
    params,
  })

  if (error) {
    throw new Error(`Could not save report preset: ${error.message}`)
  }

  revalidatePath(returnPath)
}