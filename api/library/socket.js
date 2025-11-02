import { Server } from "socket.io";
import http from "http";
import express from "express";
import Message from "../models/message.js"

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"],
    credentials: true,
  },
});

// userId -> socketId
const userSocketMap = {};

// roomId -> { strokes: [] }
const sketchStateMap = {};

function getRoomId(a, b) {
  if (!a || !b) return null;
  return [String(a), String(b)].sort().join("__");
}

export function getReceiverSocketId(userId) {
  if (!userId) return null;
  return userSocketMap[String(userId)];
}

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  // naive auth: grab userId from query
  const userId = socket.handshake.query?.userId;
  if (userId) {
    userSocketMap[String(userId)] = socket.id;
  }

  // Broadcast online users
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

// 🟢 When user comes online, mark all "sent" messages TO them as delivered
Message.find({ receiverId: userId, status: "sent" })
  .then(async (undeliveredMessages) => {
    if (!undeliveredMessages.length) return;

    const deliveredIds = undeliveredMessages.map((m) => m._id);

    // Update in DB
    await Message.updateMany(
      { _id: { $in: deliveredIds } },
      { $set: { status: "delivered" } }
    );

    // Notify all senders that their messages got delivered
    for (const msg of undeliveredMessages) {
      const senderSocketId = getReceiverSocketId(String(msg.senderId));
      if (senderSocketId) {
        io.to(senderSocketId).emit("message_status_updated", {
          messageId: msg._id,
          status: "delivered",
        });
      }
    }
  })
  .catch((err) => console.warn("Auto-delivery update failed:", err));



  // Relay public keys (still used for E2EE)
  socket.on("send-public-key", ({ to, publicKey }) => {
    const targetSocketId = getReceiverSocketId(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("receive-public-key", {
        from: String(userId),
        publicKey,
      });
    }
  });

socket.on("message_delivered", async ({ messageId, senderId }) => {
  try {
    await Message.updateOne({ _id: messageId }, { status: "delivered" });
    const senderSocketId = getReceiverSocketId(String(senderId));
    if (senderSocketId) {
      io.to(senderSocketId).emit("message_status_updated", {
        messageId,
        status: "delivered",
      });
    }
  } catch (err) {
    console.warn("message_delivered error:", err);
  }
});


socket.on("mark_as_read", async ({ senderId, receiverId }) => {
  try {
    await Message.updateMany(
      { senderId, receiverId, status: { $ne: "read" } },
      { $set: { status: "read" } }
    );

    const senderSocketId = getReceiverSocketId(String(senderId));
    if (senderSocketId) {
      io.to(senderSocketId).emit("messages_read", { senderId, receiverId });
    }
  } catch (err) {
    console.warn("mark_as_read error:", err);
  }
});





  // ---------- Sketchboard ----------
  socket.on("join-sketch", ({ peerId }) => {
    if (!userId || !peerId) return;
    const roomId = getRoomId(userId, peerId);
    socket.join(roomId);

    if (!sketchStateMap[roomId]) {
      sketchStateMap[roomId] = { strokes: [] };
    }

    const { strokes } = sketchStateMap[roomId];
    io.to(socket.id).emit("sketch-init", { strokes });
  });

  socket.on("leave-sketch", ({ peerId }) => {
    if (!userId || !peerId) return;
    const roomId = getRoomId(userId, peerId);
    socket.leave(roomId);

    // cleanup if room is empty
    try {
      const room = io.sockets.adapter.rooms.get(roomId);
      if (!room || room.size === 0) {
        delete sketchStateMap[roomId];
      }
    } catch (err) {
      console.warn("leave-sketch cleanup error", err);
    }
  });

  socket.on("sketch-stroke", ({ peerId, stroke }) => {
    try {
      if (!userId || !peerId || !stroke) return;
      const roomId = getRoomId(userId, peerId);
      if (!sketchStateMap[roomId]) sketchStateMap[roomId] = { strokes: [] };

      const payload = {
        ...stroke,
        id: stroke.id || `s_${Date.now()}_${Math.random()}`,
        from: String(userId),
      };

      sketchStateMap[roomId].strokes.push(payload);

      // broadcast to everyone except sender
      socket.to(roomId).emit("sketch-stroke", payload);
    } catch (e) {
      console.warn("sketch-stroke error", e);
    }
  });

  socket.on("sketch-clear", ({ peerId }) => {
    try {
      if (!userId || !peerId) return;
      const roomId = getRoomId(userId, peerId);
      if (!roomId) return;
      if (!sketchStateMap[roomId]) {
        sketchStateMap[roomId] = { strokes: [] };
      } else {
        sketchStateMap[roomId].strokes = [];
      }
      io.to(roomId).emit("sketch-cleared");
    } catch (err) {
      console.warn("sketch-clear error", err);
    }
  });

  // ---------- Disconnect ----------
  socket.on("disconnect", () => {
    console.log("A user disconnected", socket.id);

    // cleanup user socket map
    for (const [uid, sid] of Object.entries(userSocketMap)) {
      if (sid === socket.id) {
        delete userSocketMap[uid];
        break;
      }
    }

    io.emit("getOnlineUsers", Object.keys(userSocketMap));

    // cleanup empty rooms
    try {
      for (const roomId of Object.keys(sketchStateMap)) {
        const room = io.sockets.adapter.rooms.get(roomId);
        if (!room || room.size === 0) {
          delete sketchStateMap[roomId];
        }
      }
    } catch (err) {
      console.warn("disconnect cleanup error", err);
    }
  });
});

export { io, app, server };
