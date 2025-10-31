import { useRef, useState } from "react";
import { useChatStore } from "../store/useChatStore.js";
import { Send, Image as ImageIcon, X } from "lucide-react";

export default function MessageInput() {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);
  const { sendMessage } = useChatStore();
  const [isSending, setIsSending] = useState(false);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() && !file) return;

    try {
      setIsSending(true);

      if (file) {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Img = reader.result;
          await sendMessage(base64Img, "image");
          clearImage();
          setIsSending(false);
        };
        reader.readAsDataURL(file);
        return;
      }

      // text message
      await sendMessage(text.trim(), "text");
      setText("");
      setIsSending(false);
    } catch (error) {
      console.error("Failed to send message:", error);
      setIsSending(false);
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0] || null;
    if (selected) {
      setFile(selected);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result);
      reader.readAsDataURL(selected);
    }
  };

  const clearImage = () => {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="p-4 w-full border-t border-base-300">
      {/* If preview exists: show preview-only UI */}
      {preview ? (
        <form
          onSubmit={handleSendMessage}
          className="flex items-center justify-between bg-base-200 p-3 rounded-lg gap-3"
        >
          <div className="flex items-center gap-3">
            <img
              src={preview}
              alt="Preview"
              className="w-16 h-16 rounded-lg object-cover border"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Image ready to fly!</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={clearImage}
              type="button"
              className="btn btn-ghost btn-sm btn-circle relative top-[1px]"
              title="Cancel"
              disabled={isSending}
            >
              <X size={16} />
            </button>

            <button
              type="submit"
              className="btn btn-sm btn-circle btn-primary relative top-[1px]"
              title="Send Image"
              disabled={isSending}
            >
              {isSending ? (
                // minimal spinner (native)
                <svg
                  className="animate-spin h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
                  <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
              ) : (
                <Send size={20} />
              )}
            </button>
          </div>
        </form>
      ) : (
        /* Normal text + attach UI */
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2">
            <input
              type="text"
              className="w-full input input-bordered rounded-lg input-sm sm:input-md h-10"
              placeholder="Type a message..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Image button: move the entire button down slightly so circle aligns with send */}
            <button
              type="button"
              className="btn btn-sm btn-circle relative top-[1px]"
              onClick={() => fileInputRef.current?.click()}
              title="Attach image"
            >
              <ImageIcon size={18} />
            </button>
          </div>

          {/* Send button: same vertical nudge so both buttons align perfectly */}
          <button
            type="submit"
            className="btn btn-sm btn-circle relative top-[1px]"
            disabled={!text.trim()}
            title="Send"
          >
            <Send size={20} />
          </button>
        </form>
      )}
    </div>
  );
}
