import User from "../models/user.js";
import Message from "../models/message.js";

import {getReceiverSocketId,io} from "../library/socket.js";

export const SidebarUsers = async (req, res) => {
  try {
    const UserId = req.user._id;
    const DisplayUsers = await User.find({_id:{$ne:UserId}}).select("-password");
    res.status(200).json(DisplayUsers);
  } catch (error) {
    console.error("Error in SidebarUsers = ", error.message);
    res.status(500).json({error:"Internal server error"});
  }
};

export const getMessages = async (req, res) => {
  try {
    const {id:userToChatId} = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    }).sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller = ", error.message);
    res.status(500).json({error:"Internal server error"});
  }
};
export const sendMessage = async (req, res) => {
  try {
    let { encrypted } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    if (!encrypted) {
      return res.status(400).json({ error: "Encrypted payload is missing." });
    }

    // Helper: convert many possible binary shapes into base64 string
    const normalizePart = (part) => {
      // Already a string — but could be "12,34,56" from old clients
      if (typeof part === "string") {
        // detect comma-separated numbers only (legacy array serialized to string)
        if (/^[\d,\s]+$/.test(part)) {
          const nums = part.split(",").map(s => Number(s.trim())).filter(n => !Number.isNaN(n));
          return Buffer.from(new Uint8Array(nums)).toString("base64");
        }
        // assume it's already base64 (or some other string) — return as-is
        return part;
      }

      // If it's an actual array of numbers
      if (Array.isArray(part)) {
        return Buffer.from(new Uint8Array(part)).toString("base64");
      }

      // Buffer-like object: { type: 'Buffer', data: [...] } or { data: [...] }
      if (part && (Array.isArray(part.data) || Array.isArray(part.buffer))) {
        const arr = Array.isArray(part.data) ? part.data : part.buffer;
        return Buffer.from(new Uint8Array(arr)).toString("base64");
      }

      // Uint8Array instance
      if (part instanceof Uint8Array) {
        return Buffer.from(part).toString("base64");
      }

      // unknown shape — return as-is (will fail validation below)
      return part;
    };

    // normalize both parts
    encrypted.iv = normalizePart(encrypted.iv);
    encrypted.ciphertext = normalizePart(encrypted.ciphertext);

    // final validation: they must be strings now
    if (typeof encrypted.iv !== "string" || typeof encrypted.ciphertext !== "string") {
      return res.status(400).json({ error: "Encrypted payload is missing or invalid." });
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      encrypted,
    });

    const savedMessage = await newMessage.save();

    // notify receiver (emit normalized saved message)
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", {
        from: String(senderId),
        msg: savedMessage.toObject ? savedMessage.toObject() : savedMessage,
      });
    }

    return res.status(201).json(savedMessage);
  } catch (error) {
    console.log("Error in sendMessage = ", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
