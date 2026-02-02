'use server'

import { createClient } from '@/lib/supabase/server'
import ids from '@/lib/IDS.json'
import webpush from 'web-push'

if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:support@example.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

export async function validateCustomerId(id: string) {
  // First check the static list (fallback)
  if (ids.includes(id)) return true

  // Then check Supabase
  const supabase = await createClient()
  const { data } = await supabase
    .from('allowed_users')
    .select('customer_id')
    .eq('customer_id', id)
    .single()
  
  return !!data
}

export async function saveSubscription(subscription: any, customerId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  // Determine user_id or customer_id
  const userId = user?.id
  
  const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      customer_id: customerId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth
  }, { onConflict: 'endpoint' })

  if (error) {
      console.error('Error saving subscription:', error)
      return { success: false, error: error.message }
  }
  return { success: true }
}

export async function sendPushNotification(targetCustomerId: string | null, message: string) {
  const supabase = await createClient()
  
  let query = supabase.from('push_subscriptions').select('*')
  
  if (targetCustomerId) {
      // Send to customer
      query = query.eq('customer_id', targetCustomerId)
  } else {
      // Send to agents (users who have records in push_subscriptions and are agents)
      query = query.not('user_id', 'is', null)
  }
  
  const { data: subscriptions } = await query
  
  if (!subscriptions?.length) return { success: false, error: 'No subscriptions found' }

  const payload = JSON.stringify({
      title: 'Support Chat',
      body: message,
      url: targetCustomerId ? '/a/client' : '/a/dashboard'
  })

  try {
    await Promise.all(subscriptions.map(sub => {
        return webpush.sendNotification({
            endpoint: sub.endpoint,
            keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
            }
        }, payload).catch(err => {
            console.error('Error sending push:', err)
            // Optionally delete invalid subscription here
            if (err.statusCode === 410 || err.statusCode === 404) {
                 supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
            }
        })
    }))
    return { success: true }
  } catch (error) {
      console.error('Push notification error:', error)
      return { success: false, error: 'Failed to send notifications' }
  }
}
