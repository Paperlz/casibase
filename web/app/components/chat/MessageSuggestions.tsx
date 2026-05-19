import { Button } from "~/components/ui/button"
import { formatSuggestion } from "~/lib/chatUtils"
import { updateMessage } from "~/backend/MessageBackend"
import type { Message } from "~/backend/MessageBackend"

type Props = {
  message: Message
  sendMessage: (text: string, fileName?: string) => void
}

export default function MessageSuggestions({ message, sendMessage }: Props) {
  if (message.author !== "AI" || !message.suggestions || !Array.isArray(message.suggestions)) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2">
      {message.suggestions.map((suggestion, index) => {
        let text = suggestion.text?.trim()
        if (!text) return null
        text = formatSuggestion(text)
        return (
          <Button
            key={index}
            variant="outline"
            size="sm"
            className="h-auto whitespace-normal text-left"
            onClick={() => {
              sendMessage(text, "")
              message.suggestions![index].isHit = true
              updateMessage(message.owner, message.name, message, true)
            }}
          >
            {text}
          </Button>
        )
      })}
    </div>
  )
}
