import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { AlertCircle, HelpCircle, Info, Loader2 } from "lucide-react"
import i18next from "i18next"

import { signin } from "~/backend/AccountBackend"
import { validateAndClearSigninState } from "~/lib/AuthConfig"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import "~/i18n"

type ErrorDetails = {
  msg?: string
  data?: unknown
  data2?: unknown
}

export default function AuthCallback() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [message, setMessage] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<ErrorDetails | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const code = params.get("code")
    const state = params.get("state")

    if (!code || !state) {
      navigate("/signin")
      return
    }

    const stateError = validateAndClearSigninState(state)
    if (stateError) {
      setMessage(stateError.msg ?? i18next.t("login:Login Error"))
      setErrorDetails(stateError)
      return
    }

    signin(code, state)
      .then((res) => {
        if (res.status === "ok") {
          const from = sessionStorage.getItem("from") || "/"
          sessionStorage.removeItem("from")
          navigate(from)
          return
        }

        setMessage(res.msg ?? i18next.t("login:Login Error"))
        setErrorDetails(res)
      })
      .catch((err: Error) => {
        setMessage(err.message)
        setErrorDetails({ msg: err.message })
      })
  }, [navigate, params])

  function renderDetailValue(value: unknown): string {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2)
  }

  const detailItems = [
    errorDetails?.msg
      ? { label: i18next.t("login:Error Message"), value: errorDetails.msg }
      : null,
    errorDetails?.data !== undefined
      ? {
          label: i18next.t("login:Additional Information"),
          value: renderDetailValue(errorDetails.data),
        }
      : null,
    errorDetails?.data2 !== undefined
      ? {
          label: i18next.t("login:More Details"),
          value: renderDetailValue(errorDetails.data2),
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>

  if (message === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{i18next.t("login:Signing in...")}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <CardTitle className="text-2xl">
            {i18next.t("login:Login Error")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTitle>{i18next.t("login:Login Error")}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDetailsOpen(true)}>
              <Info className="h-4 w-4" />
              {i18next.t("login:Details")}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                window.open("https://openagentai.org/help/", "_blank")
              }
            >
              <HelpCircle className="h-4 w-4" />
              {i18next.t("login:Help")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{i18next.t("login:Error Details")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {detailItems.map((detail) => (
              <div key={detail.label} className="space-y-2">
                <div className="text-sm font-medium">{detail.label}</div>
                <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">
                  {detail.value}
                </pre>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setDetailsOpen(false)}>
              {i18next.t("general:Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
