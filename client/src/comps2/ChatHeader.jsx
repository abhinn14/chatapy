import { useState } from "react";
import { useStore } from "../store/store.js";
import { useChatStore } from "../store/useChatStore.js";
import SketchBoard from "./SketchBoard.jsx";
import { Pencil } from "lucide-react";


export default function ChatHeader() {
  const { selectedUser } = useChatStore();
  const { onlineUsers } = useStore();
  const [openSketch, setOpenSketch] = useState(false);

  if(!selectedUser) return null;
  const isOnline = onlineUsers.includes(selectedUser._id);

  return (
    <div className="p-2.5 border-b border-base-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="avatar">
              <div className="size-10 rounded-full relative">
                <img src={"/avatar.png"} alt={selectedUser.name} />
              </div>
            </div>
            {isOnline && (
              <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-zinc-900" />
            )}
          </div>

          <div>
            <h3 className="font-medium">{selectedUser.name}</h3>
            <p className="text-sm text-base-content/70">{isOnline ? "Online" : "Offline"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Sketch button*/}
          <button
            onClick={() => setOpenSketch(true)}
            className="btn btn-sm btn-outline"
            title={`Open sketch with ${selectedUser.name}`}
          >
            <Pencil className="mr-1" /> Sketch
          </button>
        </div>
      </div>

      {openSketch && <SketchBoard onClose={() => setOpenSketch(false)} />}
    </div>
  );
}
