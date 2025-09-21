import { Server } from "socket.io";
import http from "http";
import express from "express";
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


/**
 * sketchStateMap[roomId] = {
 *   strokes: [ { id, from, path: [ {x,y}...], color, width, type?, timestamp } ],
 *   crossedBy: Set of userIds who "crossed" (JS Set)
 * }
 */
// roomId -> {strokes,crossedBy}
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

  // NOTE: you can replace this with proper auth extraction if you use JWT/cookies
  const userId = socket.handshake.query?.userId;
  if (userId) {
    userSocketMap[String(userId)] = socket.id;
  }

  // Broadcast current online users
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // Relay public keys (existing behaviour)
  socket.on("send-public-key", ({ to, publicKey }) => {
    const targetSocketId = getReceiverSocketId(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("receive-public-key", {
        from: String(userId),
        publicKey,
      });
    }
  });

  // ---------- Sketchboard handlers ----------
  socket.on("join-sketch", ({ peerId }) => {
    if (!userId || !peerId) return;
    const roomId = getRoomId(userId, peerId);
    socket.join(roomId);

    if (!sketchStateMap[roomId]) {
      sketchStateMap[roomId] = { strokes: [], crossedBy: new Set() };
    }

    const { strokes, crossedBy } = sketchStateMap[roomId];
    io.to(socket.id).emit("sketch-init", {
      strokes,
      crossedBy: Array.from(crossedBy),
    });
  });

  socket.on("leave-sketch", ({ peerId }) => {
    if (!userId || !peerId) return;
    const roomId = getRoomId(userId, peerId);
    socket.leave(roomId);

    // If room is now empty, delete its sketch state so nothing persists
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
      if (!sketchStateMap[roomId]) sketchStateMap[roomId] = { strokes: [], crossedBy: new Set() };

      const payload = {
        ...stroke,
        id: stroke.id || `s_${Date.now()}_${Math.random()}`,
        from: String(userId),
      };

      sketchStateMap[roomId].strokes.push(payload);

      // broadcast to everyone in room except sender
      socket.to(roomId).emit("sketch-stroke", payload);
    } catch (e) {
      console.warn("sketch-stroke error", e);
    }
  });

  // immediate clear: any participant can call this to wipe the room's strokes right away
  socket.on("sketch-clear", ({ peerId }) => {
    try {
      if (!userId || !peerId) return;
      const roomId = getRoomId(userId, peerId);
      if (!roomId) return;
      if (!sketchStateMap[roomId]) {
        sketchStateMap[roomId] = { strokes: [], crossedBy: new Set() };
      } else {
        sketchStateMap[roomId].strokes = [];
        sketchStateMap[roomId].crossedBy = new Set();
      }
      // notify everyone in the room to clear
      io.to(roomId).emit("sketch-cleared");
    } catch (err) {
      console.warn("sketch-clear error", err);
    }
  });

  // toggle cross (legacy/optional behaviour kept for compatibility)
  socket.on("sketch-toggle-cross", async ({ peerId }) => {
    try {
      if (!userId || !peerId) return;
      const roomId = getRoomId(userId, peerId);
      if (!sketchStateMap[roomId]) sketchStateMap[roomId] = { strokes: [], crossedBy: new Set() };
      const state = sketchStateMap[roomId];
      const crossedBy = state.crossedBy;

      if (crossedBy.has(String(userId))) {
        // user is un-crossing
        crossedBy.delete(String(userId));
        if (crossedBy.size === 0) {
          io.to(roomId).emit("sketch-uncross");
        } else {
          io.to(roomId).emit("sketch-crossed", { crossedBy: Array.from(crossedBy) });
        }
      } else {
        // user is crossing
        crossedBy.add(String(userId));
        if (crossedBy.size === 1) {
          io.to(roomId).emit("sketch-crossed", { crossedBy: Array.from(crossedBy) });
        } else if (crossedBy.size >= 2) {
          // both crossed -> permanently clear strokes + reset crossedBy
          state.strokes = [];
          state.crossedBy = new Set();
          io.to(roomId).emit("sketch-cleared");
        }
      }
    } catch (e) {
      console.warn("sketch-toggle-cross error", e);
    }
  });

  // cleanup on disconnect
  socket.on("disconnect", () => {
    console.log("A user disconnected", socket.id);
    // remove mapping(s) that referenced this socket.id
    for (const [uid, sid] of Object.entries(userSocketMap)) {
      if (sid === socket.id) {
        delete userSocketMap[uid];
        break;
      }
    }

    // Broadcast updated online users
    io.emit("getOnlineUsers", Object.keys(userSocketMap));

    // Clean up any sketch rooms that are now empty
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
