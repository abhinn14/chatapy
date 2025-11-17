import User from "../models/user.js";
import Message from "../models/message.js";

import { getReceiverSocketId, io } from "../library/socket.js";

export const SidebarUsers = async (req, res) => {
  try {
    const UserId = req.user._id;
    const DisplayUsers = await User.find({ _id: { $ne: UserId } }).select("-password");

    res.status(200).json(DisplayUsers);

  } catch (error) {
    console.error("Error in SidebarUsers = ", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    }).sort({ createdAt: 1 });

    res.status(200).json(messages);

  } catch (error) {
    console.error("Error in getMessages controller = ", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


export const sendMessage = async (req, res) => {
  try {
    let { encrypted, senderPublicKeyJwk, type } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    if(!type) type = "text";

    // Normalizing senderPublicKeyJwk
    if(typeof senderPublicKeyJwk === "string") {
      try {
        senderPublicKeyJwk = JSON.parse(senderPublicKeyJwk);
      } catch {
        senderPublicKeyJwk = null;
      }
    }

    // If client didn’t send valid public key, I'm taking from DB
    if(!senderPublicKeyJwk) {
      const me = await User.findById(senderId).select("publicKeyJwk");
      senderPublicKeyJwk = me?.publicKeyJwk || null;
    }

    if(!senderPublicKeyJwk || typeof senderPublicKeyJwk !== "object") {
      return res.status(400).json({ error: "Missing or invalid senderPublicKeyJwk" });
    }

    // Strip private fields if accidentally present
    delete senderPublicKeyJwk.d;
    delete senderPublicKeyJwk.privateKey;

    if(!senderPublicKeyJwk.kty || !(senderPublicKeyJwk.x || senderPublicKeyJwk.n || senderPublicKeyJwk.crv)) {
      return res.status(400).json({ error: "Invalid public JWK format" });
    }

    // validating encrypted payload
    if(!encrypted || typeof encrypted !== "object") {
      return res.status(400).json({ error: "Encrypted payload missing or invalid" });
    }

    const normalizePart = (part) => {
      if (part == null) return null;
      if (typeof part === "string") return part;
      if (ArrayBuffer.isView(part)) return Buffer.from(part).toString("base64");
      if (part instanceof ArrayBuffer) return Buffer.from(new Uint8Array(part)).toString("base64");
      if (Array.isArray(part)) return Buffer.from(new Uint8Array(part)).toString("base64");
      if (part && typeof part === "object") {
        if (Array.isArray(part.data)) return Buffer.from(new Uint8Array(part.data)).toString("base64");
        if (Array.isArray(part.buffer)) return Buffer.from(new Uint8Array(part.buffer)).toString("base64");
      }
      return Buffer.from(String(part)).toString("base64");
    };

    encrypted.iv = normalizePart(encrypted.iv);
    encrypted.ciphertext = normalizePart(encrypted.ciphertext);

    if (typeof encrypted.iv !== "string" || typeof encrypted.ciphertext !== "string") {
      return res.status(400).json({ error: "Invalid encrypted payload parts" });
    }

    // ---- Save message (initially as "sent") ----
    const newMessage = new Message({
      senderId,
      receiverId,
      encrypted,
      senderPublicKeyJwk,
      type,
      status: "sent",
      createdAt: Date.now(),
    });

    const savedMessage = await newMessage.save();
    const payload = savedMessage.toObject ? savedMessage.toObject() : savedMessage;

    // ---- Emit to both sender & receiver ----
    try {
      const receiverSocketId = getReceiverSocketId(String(receiverId));
      const senderSocketId = getReceiverSocketId(String(senderId));

      // 1️⃣ Receiver online → deliver immediately
      if (receiverSocketId) {
        // Only send to receiver — don't mark delivered yet.
        io.to(receiverSocketId).emit("newMessage", {
          from: String(senderId),
          msg: payload,
        });
      } else {
        // Receiver offline
        if (senderSocketId) {
          io.to(senderSocketId).emit("message_status_updated", {
            messageId: payload._id,
            status: "sent",
          });
        }
      } 

      // 3️⃣ Always echo back to sender (sync across tabs)
      if (senderSocketId) {
        io.to(senderSocketId).emit("newMessage", {
          from: String(senderId),
          msg: payload,
        });
      }
    } catch (emitErr) {
      console.warn("[sendMessage] socket emit failed (non-fatal):", emitErr);
    }

    // ---- Respond to client ----
    return res.status(201).json(payload);
  } catch (error) {
    console.error("[sendMessage] unexpected error:", error);
    try {
      console.error("[sendMessage] req.body (truncated):", JSON.stringify(req.body).slice(0, 2000));
    } catch {}
    return res.status(500).json({ error: "Internal server error", details: error?.message });
  }
};
