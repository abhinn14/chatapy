import {Server} from "socket.io"
import http from "http"
import express from "express"
const app = express()

const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"],
  },
})

export function getReceiverSocketId(userId) {
  return userSocketMap[userId]
}

const userSocketMap = {};

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  const userId = socket.handshake.query.userId;
  if (userId) userSocketMap[userId] = socket.id;

  // broadcast current online users
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // 1) Relay public keys for ECDH handshake
  socket.on("send-public-key", ({ to, publicKey }) => {
    const targetSocketId = userSocketMap[to];
    if (targetSocketId) {
      io.to(targetSocketId).emit("receive-public-key", {
        from: socket.handshake.query.userId,
        publicKey,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected", socket.id);
    delete userSocketMap[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export {io,app,server};