// server/controllers/msg_controller.js
import User from "../models/user.js";
import Message from "../models/message.js";

import { getReceiverSocketId, io } from "../library/socket.js";

/**
 * List sidebar users (all except current)
 */
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

/**
 * Get conversation messages between current user and :id
 */
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

/**
 * POST /api/message/send/:id
 *
 * Accepts body:
 * {
 *   encrypted: { iv: <base64>, ciphertext: <base64> },
 *   senderPublicKeyJwk: <object or json-string>
 * }
 *
 * Saves message, persists sender public JWK (sanitized), emits to recipient & sender sockets.
 */
export const sendMessage = async (req, res) => {
  try {
    let { encrypted, senderPublicKeyJwk } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    // ----------------- normalize/parse senderPublicKeyJwk -----------------
    if (typeof senderPublicKeyJwk === "string") {
      try {
        senderPublicKeyJwk = JSON.parse(senderPublicKeyJwk);
      } catch (e) {
        // if it's a plain string (not JSON), we'll fallback to user's stored key below
        senderPublicKeyJwk = null;
      }
    }

    if (!senderPublicKeyJwk) {
      // try user's stored public key in DB if client didn't send a valid one
      const me = await User.findById(senderId).select("publicKeyJwk");
      senderPublicKeyJwk = me?.publicKeyJwk || null;
    }

    // Validate senderPublicKeyJwk shape (must be object and not contain private material)
    if (!senderPublicKeyJwk || typeof senderPublicKeyJwk !== "object") {
      return res.status(400).json({ error: "Missing or invalid senderPublicKeyJwk" });
    }

    // Defensive: strip private key fields (e.g. 'd' for EC/RSA private exponent)
    if (Object.prototype.hasOwnProperty.call(senderPublicKeyJwk, "d")) {
      delete senderPublicKeyJwk.d;
    }
    if (Object.prototype.hasOwnProperty.call(senderPublicKeyJwk, "privateKey")) {
      delete senderPublicKeyJwk.privateKey;
    }

    // Basic shape check for JWK: require 'kty' and either 'x' (EC), or 'n' (RSA) or 'crv'
    if (!senderPublicKeyJwk.kty || !(senderPublicKeyJwk.x || senderPublicKeyJwk.n || senderPublicKeyJwk.crv)) {
      return res.status(400).json({ error: "senderPublicKeyJwk doesn't look like a valid public JWK" });
    }

    // ----------------- Validate encrypted payload -----------------
    if (!encrypted || (typeof encrypted !== "object")) {
      return res.status(400).json({ error: "Encrypted payload is missing or invalid." });
    }

    // Helper: normalize various possible binary representations -> base64 string
    const normalizePart = (part) => {
      if (part == null) return null;
      // already a base64 string
      if (typeof part === "string") return part;

      // ArrayBuffer
      if (part instanceof ArrayBuffer) {
        return Buffer.from(new Uint8Array(part)).toString("base64");
      }

      // TypedArray (Uint8Array etc.)
      if (ArrayBuffer.isView(part)) {
        return Buffer.from(part).toString("base64");
      }

      // plain array of numbers
      if (Array.isArray(part)) {
        return Buffer.from(new Uint8Array(part)).toString("base64");
      }

      // object shape like { data: [..] } or { buffer: [...] }
      if (part && typeof part === "object") {
        if (Array.isArray(part.data)) {
          return Buffer.from(new Uint8Array(part.data)).toString("base64");
        }
        if (part.buffer instanceof ArrayBuffer) {
          return Buffer.from(new Uint8Array(part.buffer)).toString("base64");
        }
        if (Array.isArray(part.buffer)) {
          return Buffer.from(new Uint8Array(part.buffer)).toString("base64");
        }
      }

      // fallback: stringify (last resort)
      try {
        return Buffer.from(String(part)).toString("base64");
      } catch (e) {
        return null;
      }
    };

    // Normalize iv & ciphertext
    encrypted.iv = normalizePart(encrypted.iv);
    encrypted.ciphertext = normalizePart(encrypted.ciphertext);

    if (typeof encrypted.iv !== "string" || typeof encrypted.ciphertext !== "string") {
      return res.status(400).json({ error: "Encrypted payload parts are missing or invalid." });
    }

    // ----------------- Save message -----------------
    const newMessage = new Message({
      senderId,
      receiverId,
      encrypted,
      senderPublicKeyJwk, // persist sanitized public key for recipients to derive later
      createdAt: Date.now(),
    });

    const savedMessage = await newMessage.save();

    // ensure payload is plain object for socket emission / response
    const payload = savedMessage.toObject ? savedMessage.toObject() : savedMessage;

    // ----------------- Emit to recipient and sender if online -----------------
    try {
      const receiverSocketId = getReceiverSocketId(String(receiverId));
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("newMessage", {
          from: String(senderId),
          msg: payload,
        });
      }
      // also emit to sender so their other tabs/devices get it
      const senderSocketId = getReceiverSocketId(String(senderId));
      if (senderSocketId) {
        io.to(senderSocketId).emit("newMessage", {
          from: String(senderId),
          msg: payload,
        });
      }
    } catch (emitErr) {
      console.warn("[sendMessage] socket emit failed (non-fatal):", emitErr);
    }

    return res.status(201).json(payload);
  } catch (error) {
    // log full stack and a truncated request body to help debugging
    console.error("[sendMessage] unexpected error:", error);
    try {
      console.error("[sendMessage] req.body (truncated):", JSON.stringify(req.body).slice(0, 2000));
    } catch (e) {
      console.error("[sendMessage] failed to stringify req.body:", e);
    }
    return res.status(500).json({ error: "Internal server error", details: error?.message });
  }
};
