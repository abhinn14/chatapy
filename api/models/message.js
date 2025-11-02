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
    senderPublicKeyJwk: { type: Object, required: true },
    type: {
      type: String,
      enum: ["text", "image"],
      default: "text",
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },

  },
  {timestamps:true}
);

const Message = mongoose.model("Message",msgSchema);

export default Message;