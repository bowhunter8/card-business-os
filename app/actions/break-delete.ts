'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function deleteBreakAction(formData: FormData) {
  const supabase = await createClient()
  const breakId = String(formData.get('break_id') || '').trim()

  if (!breakId) return

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  await supabase
    .from('breaks')
    .update({
      deleted_at: new Date().toISOString(),
    })
    .eq('id', breakId)
    .eq('user_id', user.id)
    .is('deleted_at', null)

  revalidatePath('/app/breaks')
}