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

  if(isMessagesLoading) {
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
        {messages.map((message) => {
          const isOwnMessage = message.senderId === authUser._id;
          const isImage = message.type === "image";

          return (
            <div
              key={message._id}
              className={`chat ${isOwnMessage ? "chat-end" : "chat-start"}`}
              ref={messageEndRef}
            >
              <div
                className={`chat-bubble flex flex-col ${
                  isImage ? "p-2 bg-base-300" : "text-white"
                }`}
              >
                {isImage ? (
                  <img
                    src={message.text}
                    alt="Encrypted image"
                    className="rounded-lg max-w-xs cursor-pointer transition-transform hover:scale-[1.02]"
                    loading="lazy"
                  />
                ) : (
                  <p className="break-words">{message.text}</p>
                )}

                <span
                  className={`text-[10px] text-zinc-400 mt-1 self-${
                    isOwnMessage ? "end" : "start"
                  }`}
                >
                  {formatDateTime(message.createdAt)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <MessageInput />
    </div>
  );
}
