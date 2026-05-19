export default function AiTypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block h-2 w-2 rounded-full bg-primary/70"
          style={{
            animation: "aiBubbleDot 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.18}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes aiBubbleDot {
          0%, 80%, 100% { transform: scale(0.55) translateY(0); opacity: 0.3; }
          40% { transform: scale(1) translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
