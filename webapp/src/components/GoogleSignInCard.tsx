import { useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAuth } from '@/lib/use-auth'

export function GoogleSignInCard() {
  const auth = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [isRedirecting, setIsRedirecting] = useState(false)

  async function handleSignIn() {
    setError(null)
    setIsRedirecting(true)
    try {
      await auth.signInWithGoogle()
    } catch {
      setError('Could not start Google sign-in. Please try again.')
      setIsRedirecting(false)
    }
  }

  return (
    <Card className="w-full" aria-label="Authentication">
      <CardHeader>
        <CardTitle>Account access</CardTitle>
        <CardDescription>Sign in with your Google account to continue.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Sign-in failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={isRedirecting}
          onClick={() => void handleSignIn()}
        >
          {isRedirecting ? 'Redirecting…' : 'Continue with Google'}
        </Button>
      </CardContent>
    </Card>
  )
}
