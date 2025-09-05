import mongoose from "mongoose";

const msgSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    encrypted: {
      iv: { type: String, required: true },
      ciphertext: { type: String, required: true },
    },

  },
  {timestamps:true}
);

const Message = mongoose.model("Message",msgSchema);

export default Message;