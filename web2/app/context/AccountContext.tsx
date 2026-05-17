"use client"

import * as React from "react"
import { useNavigate } from "react-router"
import { type Account, getAccount, signout } from "~/backend/AccountBackend"
import { setLanguage } from "~/i18n"

type AccountState = {
  /** undefined = still loading; null = not signed in; Account = signed in */
  account: Account | null | undefined
  reload: () => void
  handleSignout: () => void
}

const AccountContext = React.createContext<AccountState | null>(null)

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [account, setAccount] = React.useState<Account | null | undefined>(undefined)

  const load = React.useCallback(() => {
    getAccount().then((res) => {
      if (res.status === "ok") {
        setAccount(res.data ?? null)
        // Sync language preference from account
        if (res.data?.language) {
          setLanguage(res.data.language)
        }
      } else {
        setAccount(null)
      }
    }).catch(() => setAccount(null))
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const handleSignout = React.useCallback(() => {
    signout().then(() => {
      setAccount(null)
      navigate("/signin")
    })
  }, [navigate])

  return (
    <AccountContext.Provider value={{ account, reload: load, handleSignout }}>
      {children}
    </AccountContext.Provider>
  )
}

export function useAccount(): AccountState {
  const ctx = React.useContext(AccountContext)
  if (!ctx) throw new Error("useAccount must be used within AccountProvider")
  return ctx
}
