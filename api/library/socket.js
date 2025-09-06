// server/library/socket.js
import { Server } from "socket.io";
import http from "http";
import express from "express";
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"], // adjust if needed
    credentials: true,
  },
});

// map of userId -> socketId (last connected socket wins)
const userSocketMap = {};

// helper to get receiver socket id
export function getReceiverSocketId(userId) {
  if (!userId) return null;
  return userSocketMap[String(userId)];
}

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  // *** Use handshake.query.userId (keep behavior consistent with frontend) ***
  const userId = socket.handshake.query?.userId;
  if (userId) {
    userSocketMap[String(userId)] = socket.id;
  }

  // broadcast current online users
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // Relay public keys for ECDH handshake
  socket.on("send-public-key", ({ to, publicKey }) => {
    const targetSocketId = getReceiverSocketId(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("receive-public-key", {
        from: String(userId),
        publicKey,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected", socket.id);
    // remove mapping(s) that referenced this socket.id
    for (const [uid, sid] of Object.entries(userSocketMap)) {
      if (sid === socket.id) {
        delete userSocketMap[uid];
        break;
      }
    }
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { io, app, server };
