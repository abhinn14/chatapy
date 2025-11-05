import { useEffect, useRef } from "react";
import { useChatStore } from "../store/useChatStore.js";
import ChatHeader from "./ChatHeader.jsx";
import MessageInput from "./MessageInput.jsx";
import { useStore } from "../store/store.js";
import MessageSkeleton from "../skeletons/MessageSkeleton.jsx";

export default function ChatContainer() {
  const { messages, isMessagesLoading } = useChatStore();
  const { authUser } = useStore();
  const messageEndRef = useRef(null);

  // 🧠 Track messages we've already played sound for
  const playedSoundIds = useRef(new Set());

  // 🎵 Load your sound file (from /public/sounds)
  const sentSound = useRef(typeof Audio !== "undefined" ? new Audio("/sounds/sent.mp3") : null);

  useEffect(() => {
    if (sentSound.current) sentSound.current.volume = 0.5; // adjust volume if needed
  }, []);

  // 🔊 Play sound when a new own message reaches "sent" status
  useEffect(() => {
    messages.forEach((msg) => {
      const isOwnMessage = String(msg.senderId) === String(authUser._id);
      const msgId = msg._id || msg.tempId;

      if (
        isOwnMessage &&
        msg.status === "sent" &&
        !playedSoundIds.current.has(msgId)
      ) {
        playedSoundIds.current.add(msgId);
        if (sentSound.current) {
          sentSound.current.currentTime = 0;
          sentSound.current.play().catch(() => {}); // ignore autoplay errors
        }
      }
    });
  }, [messages, authUser._id]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (messages && messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString([], {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Read receipts
  const renderMessageStatus = (status) => {
    switch (status) {
      case "loading":
        return <span className="text-gray-400 animate-pulse text-[11px] ml-0.5">⏳</span>;
      case "sent":
        return <span className="text-gray-400 text-[11px] ml-0.5">✓</span>;
      case "delivered":
        return <span className="text-gray-500 text-[11px] ml-0.5">✓✓</span>;
      case "read":
        return <span className="text-blue-500 text-[11px] ml-0.5">✓✓</span>;
      default:
        return null;
    }
  };

  if (isMessagesLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-auto">
        <ChatHeader />
        <MessageSkeleton />
        <MessageInput />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <ChatHeader />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, idx) => {
          const isOwnMessage = String(message.senderId) === String(authUser._id);
          const isImage = message.type === "image";
          const isLast = idx === messages.length - 1;

          const isEncrypted =
            message.text === "🔒 Encrypted Message" ||
            message.text === "🔒 Encrypted Image" ||
            message.text === "🔒 Encrypted";

          const bubbleClass = `chat-bubble flex flex-col ${
            isImage && !isEncrypted ? "p-2 bg-base-300" : "text-white"
          }`;

          return (
            <div
              key={message._id || message.tempId}
              className={`chat ${isOwnMessage ? "chat-end" : "chat-start"}`}
              ref={isLast ? messageEndRef : null}
            >
              <div className={bubbleClass}>
                {/* Message Content */}
                {isEncrypted ? (
                  <div
                    className="relative flex items-center justify-center gap-2 p-3 rounded-lg select-none bg-[rgba(255,255,255,0.1)] backdrop-blur-sm"
                    style={{
                      backgroundColor: "rgba(0,0,0,0.2)",
                      border: "1px solid rgba(255,255,255,0.15)",
                    }}
                  >
                    <span className="text-base">🔒</span>
                    <span className="text-sm font-semibold">Encrypted</span>
                    <div className="absolute inset-0 rounded-lg backdrop-blur-md bg-[rgba(0,0,0,0.2)]" />
                  </div>
                ) : isImage ? (
                  <img
                    src={message.text}
                    alt="Chat image"
                    className="rounded-lg max-w-xs cursor-pointer transition-transform hover:scale-[1.02]"
                    loading="lazy"
                  />
                ) : (
                  <p className="break-words">{message.text}</p>
                )}

                {/* Timestamp + Read Receipts */}
                <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-zinc-400">
                  <span>{formatDateTime(message.createdAt)}</span>
                  {isOwnMessage && renderMessageStatus(message.status)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <MessageInput />
    </div>
  );
}
