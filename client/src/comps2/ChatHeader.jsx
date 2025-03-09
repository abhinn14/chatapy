import React from "react";
import {useStore} from "../store/store.js";
import {useChatStore} from "../store/useChatStore.js";

export default function ChatHeader () {
  const {selectedUser,setSelectedUser} = useChatStore();
  const {onlineUsers} = useStore();

  return (
    <div className="p-2.5 border-b border-base-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="avatar">
            <div className="size-10 rounded-full relative">
              <img src={"/avatar.png"} alt={selectedUser.name} />
            </div>
          </div>

          <div>
            <h3 className="font-medium">{selectedUser.name}</h3>
            <p className="text-sm text-base-content/70">
              {onlineUsers.includes(selectedUser._id) ? "Online" : "Offline"}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};