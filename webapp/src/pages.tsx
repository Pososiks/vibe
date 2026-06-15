import { Link, Outlet } from '@tanstack/react-router'

import { GoogleSignInCard } from '@/components/GoogleSignInCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Typography } from '@/components/ui/typography'
import { useAuth } from '@/lib/use-auth'

export function RootLayout() {
  const auth = useAuth()

  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
          <Typography asChild variant="h6">
            <Link to="/">web_app_demo</Link>
          </Typography>
          {auth.isAuthenticated && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => void auth.signOut()}
            >
              Logout
            </Button>
          )}
        </div>
      </header>
      <Outlet />
    </main>
  )
}

export function HomePage() {
  const auth = useAuth()

  if (auth.isBootstrapping) {
    return <LoadingState />
  }

  if (!auth.user) {
    return (
      <section className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
        <div className="grid gap-5">
          <Badge variant="outline" className="w-fit">
            Golden path template
          </Badge>
          <Typography className="max-w-3xl" variant="h1">
            Sign in to open your account.
          </Typography>
          <Typography className="max-w-2xl" tone="muted">
            The web app uses Supabase Auth for Google sign-in, shared Zod contracts, and TanStack
            Query for server state. Sessions are managed by the Supabase client.
          </Typography>
        </div>
        <GoogleSignInCard />
      </section>
    )
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-12">
      <div className="grid gap-3">
        <Badge variant="outline" className="w-fit">
          Signed in
        </Badge>
        <Typography variant="h1">{auth.user.displayName ?? auth.user.email}</Typography>
        <Typography tone="muted">{auth.user.email}</Typography>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>User ID</CardTitle>
            <CardDescription wrap="break">{auth.user.id}</CardDescription>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Created</CardTitle>
            <CardDescription>{new Date(auth.user.createdAt).toLocaleString()}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </section>
  )
}

function LoadingState() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-16">
      <Card className="w-fit">
        <CardContent className="flex items-center gap-3">
          <Spinner />
          <Typography variant="bodySm" tone="muted">
            Checking session...
          </Typography>
        </CardContent>
      </Card>
    </section>
  )
}
