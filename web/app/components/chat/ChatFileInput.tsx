import { XCircleIcon, FileTextIcon } from "lucide-react"

type UploadedFile = {
  uid: number
  file: File
  content: string
  value: string
}

type Props = {
  files: UploadedFile[]
  onFileChange: (files: UploadedFile[]) => void
}

export default function ChatFileInput({ files, onFileChange }: Props) {
  function handleRemove(uid: number) {
    onFileChange(files.filter((f) => f.uid !== uid))
  }

  return (
    <div className="flex flex-wrap gap-2">
      {files.map((uploadedFile) => {
        const isImage = uploadedFile.file.type.startsWith("image/")
        return (
          <div key={uploadedFile.uid} className="relative">
            {isImage ? (
              <div className="flex flex-col items-center gap-1">
                <img
                  src={uploadedFile.content}
                  alt={uploadedFile.file.name}
                  className="h-12 w-12 rounded object-cover"
                />
                <span className="max-w-[80px] truncate text-[10px]" title={uploadedFile.file.name}>
                  {uploadedFile.file.name}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">
                  <FileTextIcon className="h-7 w-7 text-muted-foreground" />
                </div>
                <span className="max-w-[80px] truncate text-[10px]" title={uploadedFile.file.name}>
                  {uploadedFile.file.name}
                </span>
              </div>
            )}
            <button
              onClick={() => handleRemove(uploadedFile.uid)}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-background text-destructive"
            >
              <XCircleIcon className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
