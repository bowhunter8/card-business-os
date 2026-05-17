import type { ReportPresetType } from '@/lib/reports/report-presets'

export type UserReportPresetRow = {
  id: string
  user_id: string
  report_type: ReportPresetType
  name: string
  description: string | null
  params: Record<string, string>
  created_at: string
  updated_at: string | null
}

export type UserReportPresetInput = {
  reportType: ReportPresetType
  name: string
  description?: string
  params: Record<string, string>
}

export function normalizeUserReportPresetName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

export function isValidUserReportPresetName(name: string) {
  return normalizeUserReportPresetName(name).length >= 2
}