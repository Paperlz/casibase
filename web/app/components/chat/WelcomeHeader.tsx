import { useTranslation } from "react-i18next"
import { getDefaultAiAvatar } from "~/lib/chatUtils"
import type { Store } from "~/backend/StoreBackend"

type Props = {
  store: Store | undefined
}

export default function WelcomeHeader({ store }: Props) {
  const { t } = useTranslation()
  const avatar = store?.avatar || getDefaultAiAvatar()

  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {avatar && (
        <img
          src={avatar}
          alt="AI"
          className="mb-4 h-16 w-16 rounded-full object-cover"
          onError={(e) => {
            ;(e.target as HTMLImageElement).src = getDefaultAiAvatar()
          }}
        />
      )}
      <h2 className="text-xl font-semibold tracking-tight">
        {store?.welcomeTitle || t("chat:Hello, I'm OpenAgent AI Assistant")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {store?.welcomeText || t("chat:I'm here to help answer your questions")}
      </p>
    </div>
  )
}
