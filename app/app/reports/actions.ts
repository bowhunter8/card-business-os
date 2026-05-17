'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  isValidUserReportPresetName,
  normalizeUserReportPresetName,
} from '@/lib/reports/user-report-presets'
import type { ReportPresetType } from '@/lib/reports/report-presets'

const VALID_REPORT_TYPES: ReportPresetType[] = [
  'inventory',
  'sales',
  'expenses',
  'tax',
]

function isValidReportType(value: string): value is ReportPresetType {
  return VALID_REPORT_TYPES.includes(value as ReportPresetType)
}

function cleanReturnPath(value: FormDataEntryValue | null) {
  const raw = String(value || '').trim()

  if (!raw || !raw.startsWith('/app/')) {
    return '/app/reports'
  }

  return raw
}

export async function saveReportPresetAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('You must be signed in to save a report preset.')
  }

  const reportTypeRaw = String(formData.get('reportType') || '')
  const name = normalizeUserReportPresetName(String(formData.get('name') || ''))
  const description = String(formData.get('description') || '').trim()
  const returnPath = cleanReturnPath(formData.get('returnPath'))

  if (!isValidReportType(reportTypeRaw)) {
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
    report_type: reportTypeRaw,
    name,
    description: description || null,
    params,
  })

  if (error) {
    throw new Error(`Could not save report preset: ${error.message}`)
  }

  revalidatePath(returnPath)
}

export async function deleteReportPresetAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('You must be signed in to delete a report preset.')
  }

  const presetId = String(formData.get('presetId') || '').trim()
  const returnPath = cleanReturnPath(formData.get('returnPath'))

  if (!presetId) {
    throw new Error('Missing preset id.')
  }

  const { error } = await supabase
    .from('user_report_presets')
    .delete()
    .eq('id', presetId)
    .eq('user_id', user.id)

  if (error) {
    throw new Error(`Could not delete report preset: ${error.message}`)
  }

  revalidatePath(returnPath)
}
