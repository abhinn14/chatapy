import React from "react";
import {useEffect,useRef} from "react";

import { useChatStore } from "../store/useChatStore.js";
import ChatHeader from "./ChatHeader.jsx";
import MessageInput from "./MessageInput.jsx";
import { useStore } from "../store/store.js";

export default function ChatContainer() {
  const {messages,getMessages,isMessagesLoading,selectedUser,
    subscribeToMessages,unsubscribeFromMessages} = useChatStore();

  const {authUser} = useStore();
  const messageEndRef = useRef(null);

  useEffect(() => {
    getMessages(selectedUser._id);
    subscribeToMessages();
    return () => unsubscribeFromMessages();
  },[selectedUser._id,getMessages,subscribeToMessages,unsubscribeFromMessages]);

  useEffect(() => {
    if(messages && messageEndRef.current) {
      messageEndRef.current.scrollIntoView({behavior:"smooth"});
    }
  },[messages]);

  if(isMessagesLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-auto">
        <ChatHeader />
        <h1>Messages Loading...</h1>
        <MessageInput />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <ChatHeader />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message._id}
            className={`chat ${message.senderId === authUser._id ? "chat-end" : "chat-start"}`}
            ref={messageEndRef}>

            <div className="chat-bubble flex flex-col text-white">
              {<p>{message.text}</p>}
            </div>
          </div>
        ))}
      </div>

      <MessageInput />
    </div>
  );
};