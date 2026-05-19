import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { AlertCircle, Loader2 } from "lucide-react"
import i18next from "i18next"

import { getSigninOptions, signinWithPassword } from "~/backend/AccountBackend"
import { getSigninUrl, getSignupUrl } from "~/lib/AuthConfig"
import { Alert, AlertDescription } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import "~/i18n"

export function meta() {
  return [{ title: "Sign In - OpenAgent" }]
}

export default function SigninPage() {
  const navigate = useNavigate()
  const passwordRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [showSignin, setShowSignin] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [username, setUsername] = useState("admin")
  const [password, setPassword] = useState("")

  useEffect(() => {
    let cancelled = false
    getSigninOptions()
      .then((res) => {
        if (cancelled) return

        if (res.status === "ok" && res.data?.casdoorAvailable) {
          const signinUrl = getSigninUrl()
          if (signinUrl) {
            window.location.replace(signinUrl)
            return
          }
        }

        setLoading(false)
        setShowSignin(
          res.status === "ok" &&
            !res.data?.casdoorAvailable &&
            !!res.data?.signinAvailable
        )
        setErrorMessage(res.status === "ok" ? "" : (res.msg ?? ""))
      })
      .catch((err: Error) => {
        if (cancelled) return
        setLoading(false)
        setShowSignin(false)
        setErrorMessage(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!loading && showSignin) {
      passwordRef.current?.focus()
    }
  }, [loading, showSignin])

  const signupUrl = getSignupUrl()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setErrorMessage("")

    try {
      const res = await signinWithPassword(username, password)
      if (res.status === "ok") {
        const from = sessionStorage.getItem("from") || "/"
        sessionStorage.removeItem("from")
        navigate(from)
        return
      }

      setErrorMessage(res.msg || i18next.t("login:Login Error"))
      setPassword("")
      passwordRef.current?.focus()
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Unknown error")
      setPassword("")
      passwordRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  function renderCardContent() {
    if (loading) {
      return (
        <>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold">
              {i18next.t("login:Signing in...")}
            </CardTitle>
            <CardDescription>
              {i18next.t("login:Preparing the workspace entry screen.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-2 pb-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {i18next.t("login:Loading OpenAgent sign in.")}
            </p>
          </CardContent>
        </>
      )
    }

    if (!showSignin) {
      const message =
        errorMessage || i18next.t("account:Sign in is unavailable")
      return (
        <>
          <CardHeader className="space-y-1">
            <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-md bg-destructive/10">
              <AlertCircle className="h-4 w-4 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-semibold">
              {i18next.t("login:Login Error")}
            </CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => navigate("/")}
            >
              {i18next.t("general:Back Home")}
            </Button>
          </CardContent>
        </>
      )
    }

    return (
      <>
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold">
            {i18next.t("login:Welcome back")}
          </CardTitle>
          <CardDescription>
            {i18next.t("login:Enter your credentials to sign in.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorMessage && (
            <Alert variant="destructive" className="py-2.5">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="username">{i18next.t("general:Username")}</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={i18next.t("general:Username")}
                disabled={submitting}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">{i18next.t("general:Password")}</Label>
              <Input
                ref={passwordRef}
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={i18next.t("general:Password")}
                disabled={submitting}
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {i18next.t("account:Sign In")}
            </Button>
          </form>

          {signupUrl && (
            <p className="text-center text-sm text-muted-foreground">
              {i18next.t("account:Don't have an account?")}{" "}
              <a
                href={signupUrl}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {i18next.t("account:Sign Up")}
              </a>
            </p>
          )}
        </CardContent>
      </>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center">
          <img
            src="https://cdn.openagentai.org/img/openagent-logo_1900x450.png"
            alt="OpenAgent"
            className="h-8 w-auto object-contain"
          />
        </div>
        <Card className="shadow-sm">
          {renderCardContent()}
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          {i18next.t(
            "login:Self-hosted. 30+ model providers. Full MCP support."
          )}
        </p>
      </div>
    </div>
  )
}
