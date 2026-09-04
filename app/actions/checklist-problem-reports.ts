'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const ATTACHMENT_BUCKET = 'checklist-problem-reports'
const MAX_FILE_SIZE = 15 * 1024 * 1024

const ALLOWED_PROBLEM_TYPES = new Set([
  'wrong_team',
  'wrong_section',
  'missing_card',
  'duplicate_card',
  'wrong_card_number',
  'wrong_player',
  'wrong_variation',
  'wrong_details',
  'import_problem',
  'other',
])

type SubmitChecklistProblemReportResult = {
  success: boolean
  message: string
  reportId?: string
}

function clean(value: FormDataEntryValue | null) {
  return String(value ?? '').trim()
}

function optionalText(value: FormDataEntryValue | null) {
  const text = clean(value)
  return text || null
}

function safeFileName(name: string) {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return cleaned || 'attachment'
}

function fileFromFormData(value: FormDataEntryValue | null) {
  if (!(value instanceof File)) return null
  if (!value.name || value.size <= 0) return null
  return value
}

function validateFile(file: File | null, label: string) {
  if (!file) return null

  if (file.size > MAX_FILE_SIZE) {
    return `${label} must be 15 MB or smaller.`
  }

  return null
}

async function uploadAttachment({
  supabase,
  userId,
  reportId,
  folder,
  file,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  reportId: string
  folder: 'source' | 'screenshot'
  file: File
}) {
  const fileName = `${Date.now()}-${safeFileName(file.name)}`
  const path = `${userId}/${reportId}/${folder}/${fileName}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, bytes, {
      contentType: file.type || undefined,
      upsert: false,
    })

  if (error) {
    throw new Error(`${folder === 'source' ? 'Checklist' : 'Screenshot'} upload failed: ${error.message}`)
  }

  return path
}

export async function submitChecklistProblemReport(
  formData: FormData
): Promise<SubmitChecklistProblemReportResult> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      success: false,
      message: 'You must be signed in to report a checklist problem.',
    }
  }

  const checklistId = clean(formData.get('checklistId'))
  const checklistItemId = optionalText(formData.get('checklistItemId'))
  const checklistName = optionalText(formData.get('checklistName'))
  const sectionName = optionalText(formData.get('sectionName'))
  const teamName = optionalText(formData.get('teamName'))
  const cardNumber = optionalText(formData.get('cardNumber'))
  const playerName = optionalText(formData.get('playerName'))
  const problemType = clean(formData.get('problemType'))
  const description = optionalText(formData.get('description'))
  const expectedValue = optionalText(formData.get('expectedValue'))
  const sourceAlsoAppearsWrong =
    clean(formData.get('sourceAlsoAppearsWrong')).toLowerCase() === 'true' ||
    clean(formData.get('sourceAlsoAppearsWrong')).toLowerCase() === 'on'

  if (!checklistId) {
    return {
      success: false,
      message: 'Checklist context is missing. Please refresh and try again.',
    }
  }

  if (!ALLOWED_PROBLEM_TYPES.has(problemType)) {
    return {
      success: false,
      message: 'Choose a valid problem type.',
    }
  }

  if (!description && !expectedValue) {
    return {
      success: false,
      message: 'Please describe the problem or enter what the checklist should show instead.',
    }
  }

  const sourceFile = fileFromFormData(formData.get('sourceFile'))
  const screenshot = fileFromFormData(formData.get('screenshot'))

  const sourceError = validateFile(sourceFile, 'Attached checklist')
  if (sourceError) {
    return { success: false, message: sourceError }
  }

  const screenshotError = validateFile(screenshot, 'Screenshot')
  if (screenshotError) {
    return { success: false, message: screenshotError }
  }

  const reportId = crypto.randomUUID()
  const uploadedPaths: string[] = []

  try {
    let sourceFilePath: string | null = null
    let screenshotPath: string | null = null

    if (sourceFile) {
      sourceFilePath = await uploadAttachment({
        supabase,
        userId: user.id,
        reportId,
        folder: 'source',
        file: sourceFile,
      })
      uploadedPaths.push(sourceFilePath)
    }

    if (screenshot) {
      screenshotPath = await uploadAttachment({
        supabase,
        userId: user.id,
        reportId,
        folder: 'screenshot',
        file: screenshot,
      })
      uploadedPaths.push(screenshotPath)
    }

    const { error: insertError } = await supabase
      .from('checklist_problem_reports')
      .insert({
        id: reportId,
        user_id: user.id,
        checklist_id: checklistId,
        checklist_item_id: checklistItemId,
        checklist_name: checklistName,
        section_name: sectionName,
        team_name: teamName,
        card_number: cardNumber,
        player_name: playerName,
        problem_type: problemType,
        description,
        expected_value: expectedValue,
        source_file_path: sourceFilePath,
        screenshot_path: screenshotPath,
        source_also_appears_wrong: sourceAlsoAppearsWrong,
      })

    if (insertError) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(ATTACHMENT_BUCKET).remove(uploadedPaths)
      }

      return {
        success: false,
        message: `Unable to submit report: ${insertError.message}`,
      }
    }

    revalidatePath(`/app/checklists/${checklistId}`)

    return {
      success: true,
      message: 'Checklist problem reported. Thank you for helping improve the HITS checklist library.',
      reportId,
    }
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await supabase.storage.from(ATTACHMENT_BUCKET).remove(uploadedPaths)
    }

    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Unable to submit the checklist problem report.',
    }
  }
}
