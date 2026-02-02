'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Short delay to ensure hydration
    const timer = setTimeout(() => {
      router.push('/a/client')
    }, 100)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      <h1 className="text-2xl font-bold mb-4">TSupport</h1>
      <p className="mb-4">Welcome to TSupport System.</p>
      <p className="text-sm text-gray-500">Redirecting you to the client portal...</p>
      <div className="mt-8">
        <a href="/a/client" className="text-blue-500 hover:underline">
          Click here if you are not redirected automatically
        </a>
      </div>
    </div>
  )
}
