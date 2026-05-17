import { useState, forwardRef, useImperativeHandle } from "react"
import { useTranslation } from "react-i18next"
import { PlusIcon, EditIcon, Trash2Icon, CheckIcon, XIcon, MessageSquareIcon } from "lucide-react"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"
import { cn } from "~/lib/utils"
import type { Chat } from "~/backend/ChatBackend"
import type { Store } from "~/backend/StoreBackend"

type Props = {
  chats: Chat[]
  chatName: string | undefined
  onSelectChat: (index: number) => void
  onAddChat: (store?: Store) => void
  onDeleteChat: (index: number) => void
  onUpdateChatName: (index: number, newName: string) => void
  stores?: Store[]
  currentStoreName?: string
}

export type ChatMenuHandle = {
  setSelectedKeyToChat: (chats: Chat[], chatName: string | undefined) => void
  clearSelectedKey: () => void
}

const ChatMenu = forwardRef<ChatMenuHandle, Props>(function ChatMenu(
  { chats, chatName, onSelectChat, onAddChat, onDeleteChat, onUpdateChatName, stores, currentStoreName },
  ref
) {
  const { t } = useTranslation()
  const [selectedName, setSelectedName] = useState<string | undefined>(chatName)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
  const [hoveredName, setHoveredName] = useState<string | null>(null)

  useImperativeHandle(ref, () => ({
    setSelectedKeyToChat: (_chats, name) => setSelectedName(name),
    clearSelectedKey: () => setSelectedName(undefined),
  }))

  // Group chats by category
  const categories: Record<string, Chat[]> = {}
  chats.forEach((chat) => {
    if (chat.isHidden) return
    const cat = chat.category || t("chat:Default Category")
    if (!categories[cat]) categories[cat] = []
    categories[cat].push(chat)
  })

  function handleSelect(chat: Chat) {
    const index = chats.indexOf(chat)
    setSelectedName(chat.name)
    onSelectChat(index)
  }

  function startEdit(chat: Chat, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingName(chat.name)
    setEditValue(chat.displayName)
  }

  function saveEdit(chat: Chat, e?: React.SyntheticEvent) {
    e?.stopPropagation()
    const index = chats.indexOf(chat)
    onUpdateChatName(index, editValue)
    setEditingName(null)
  }

  function handleAddChat() {
    const store = currentStoreName ? stores?.find((s) => s.name === currentStoreName) : undefined
    onAddChat(store)
  }

  return (
    <div className="flex h-full flex-col">
      {/* New Chat button */}
      <div className="p-2">
        <Button
          className="w-full gap-2"
          onClick={handleAddChat}
        >
          <PlusIcon className="h-4 w-4" />
          {t("chat:New Chat")}
        </Button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {Object.entries(categories).map(([category, categoryChats]) => (
          <div key={category} className="mb-2">
            <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              {category}
            </div>
            {categoryChats.map((chat) => {
              const isSelected = chat.name === selectedName
              const isEditing = editingName === chat.name
              const isHovered = hoveredName === chat.name
              const globalIndex = chats.indexOf(chat)

              return (
                <div
                  key={chat.name}
                  className={cn(
                    "group relative mb-0.5 flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm transition-colors",
                    isSelected
                      ? "bg-accent text-accent-foreground font-medium"
                      : "hover:bg-muted text-foreground"
                  )}
                  onClick={() => !isEditing && handleSelect(chat)}
                  onMouseEnter={() => setHoveredName(chat.name)}
                  onMouseLeave={() => setHoveredName(null)}
                >
                  <MessageSquareIcon className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />

                  {isEditing ? (
                    <div className="flex flex-1 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-6 text-xs"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(chat)
                          if (e.key === "Escape") setEditingName(null)
                        }}
                        onBlur={() => saveEdit(chat)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 shrink-0"
                        onClick={(e) => saveEdit(chat, e)}
                      >
                        <CheckIcon className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 shrink-0"
                        onClick={(e) => { e.stopPropagation(); setEditingName(null) }}
                      >
                        <XIcon className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Tooltip>
                        <TooltipTrigger className="flex-1 truncate text-left text-sm">
                          {chat.displayName || chat.name}
                        </TooltipTrigger>
                        <TooltipContent side="right">{chat.displayName || chat.name}</TooltipContent>
                      </Tooltip>

                      {(isSelected || isHovered) && (
                        <div className="ml-1 flex shrink-0 items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-60 hover:opacity-100"
                            onClick={(e) => startEdit(chat, e)}
                          >
                            <EditIcon className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-destructive opacity-60 hover:opacity-100"
                            onClick={(e) => { e.stopPropagation(); setDeleteIndex(globalIndex) }}
                          >
                            <Trash2Icon className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteIndex !== null} onOpenChange={(open) => !open && setDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("general:Sure to delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteIndex !== null && chats[deleteIndex]?.displayName}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("general:Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteIndex !== null) {
                  onDeleteChat(deleteIndex)
                  setDeleteIndex(null)
                }
              }}
            >
              {t("general:OK")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
})

export default ChatMenu
