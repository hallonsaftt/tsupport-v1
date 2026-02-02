import { redirect } from 'next/navigation'

export default function Home() {
  // Use a client-side redirect approach if server-side is failing unexpectedly
  redirect('/a/client')
}
