import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../library/axios.js";
import { useStore } from "./store.js";
import { savePrivateKeyToIndexedDB, getPrivateKeyFromIndexedDB } from "../library/secureKeys.js";


function u8ToBase64(u8) {
  let binary = "";
  for(let i=0; i<u8.length; i++)
    binary += String.fromCharCode(u8[i]);
  return btoa(binary);
}
function base64ToU8(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const u8 = new Uint8Array(len);
  for(let i=0; i<len; i++)
    u8[i] = binary.charCodeAt(i);
  return u8;
}

async function generateECDHKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return { keyPair, publicKeyJwk };
}

async function importPublicKey(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

async function importPrivateKeyFromJwk(privJwk) {
  // Only used for one-time migration from localStorage to IndexedDB
  return crypto.subtle.importKey(
    "jwk",
    privJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey"]
  );
}

async function deriveAESKey(privateKey, remotePublicKey) {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: remotePublicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptMessage(plain, aesKey) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoder.encode(plain));
  const ctU8 = new Uint8Array(ct);
  return { iv: u8ToBase64(iv), ciphertext: u8ToBase64(ctU8) };
}
async function decryptMessage({ iv, ciphertext }, aesKey) {
  const decoder = new TextDecoder();
  const ivU8 = base64ToU8(iv);
  const ctU8 = base64ToU8(ciphertext);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivU8 }, aesKey, ctU8);
  return decoder.decode(pt);
}

function normalizeId(msg) {
  if(!msg) return null;
  return String(msg._id || msg.id || "");
}


export const useChatStore = create((set, get) => {
  function normalizeEncryptedFingerprint(encrypted) {
    if(!encrypted) return null;
    return String(encrypted.ciphertext || "");
  }

  function findExistingMessageIndex(list, incomingMsg) {
    if(!Array.isArray(list)) return -1;
    const incomingId = normalizeId(incomingMsg);
    const incomingCt = normalizeEncryptedFingerprint(incomingMsg.encrypted);
    const incomingCreated = incomingMsg.createdAt ? String(incomingMsg.createdAt) : null;

    for(let i=0; i<list.length; i++) {
      const m = list[i];
      const mid = normalizeId(m);
      if(mid && incomingId && String(mid) === String(incomingId)) return i;

      const mct = normalizeEncryptedFingerprint(m.encrypted);
      if(mct && incomingCt && mct === incomingCt) return i;

      const mcreated = m.createdAt ? String(m.createdAt) : null;
      if(mcreated && incomingCreated && mcreated === incomingCreated) return i;
    }
    return -1;
  }

  function upsertMessageForUser(userId, incomingMsg) {
    set((state) => {
      const map = state.messagesByUser || {};
      const list = map[userId] ? [...map[userId]] : [];
      const idx = findExistingMessageIndex(list, incomingMsg);

      if(idx !== -1) {
        const existing = list[idx];
        const newIsLocked = !incomingMsg.text || incomingMsg.text === "🔒 Encrypted Message";
        const existingHasPlain = existing.text && existing.text !== "🔒 Encrypted Message";
        list[idx] = newIsLocked && existingHasPlain ? existing : { ...existing, ...incomingMsg };
      } else {
        list.push(incomingMsg);
      }

      list.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return ta - tb;
      });

      return { messagesByUser: { ...map, [userId]: list } };
    });
  }


  return {

    messages: [],
    users: [],
    selectedUser: null,
    isUsersLoading: false,
    isMessagesLoading: false,
    messagesByUser: {},

    keyPair: null,
    publicKeyJwk: null,
    aesKeys: {}, 
    cryptoInitialized: false,


    initCrypto: async () => {
      if(get().cryptoInitialized) return;

      const { authUser } = useStore.getState();
      if(!authUser) return;

      const userId = authUser._id;
      let privateKey = null;
      let publicKeyJwk = null;

      // loading a non-extractable private key from IndexedDB
      try {
        privateKey = await getPrivateKeyFromIndexedDB();
        if(privateKey) {
          const localPub = localStorage.getItem(`pubkey_${userId}`);
          if(localPub) {
            publicKeyJwk = JSON.parse(localPub);
          } else {
            try {
              const res = await axiosInstance.get(`/auth/user/${userId}/public-key`);
              publicKeyJwk = res.data || null;
              if (publicKeyJwk) {
                localStorage.setItem(`pubkey_${userId}`, JSON.stringify(publicKeyJwk));
              }
            } catch {
              publicKeyJwk = null;
            }
          }
        }
      } catch (e) {
        console.warn("IndexedDB read failed (will try migration / regeneration):", e);
      }

      // If still no private key, generating a new pair
      if(!privateKey) {
        const gen = await generateECDHKeyPair();
        privateKey = gen.keyPair.privateKey;
        publicKeyJwk = gen.publicKeyJwk;

        // Saving private key securely in IndexedDB (non-extractable)
        await savePrivateKeyToIndexedDB(privateKey);

        // Caching public key and uploading to server
        try {
          localStorage.setItem(`pubkey_${userId}`, JSON.stringify(publicKeyJwk));
        } catch {}
        try {
          await axiosInstance.post("/auth/upload-public-key", { publicKeyJwk });
        } catch (e) {
          console.warn("Upload public key failed:", e?.message || e);
        }
      }

      set({
        keyPair: { privateKey, publicKey: null },
        publicKeyJwk,
        cryptoInitialized: true,
      });

      const socket = useStore.getState().socket;
      if(socket) {
        socket.off("receive-public-key");
        socket.on("receive-public-key", async ({ from, publicKey }) => {
          try {
            const imported = await importPublicKey(publicKey);
            const aesKey = await deriveAESKey(get().keyPair.privateKey, imported);

            set((s) => ({ aesKeys: { ...s.aesKeys, [from]: aesKey } }));

            const ourPub = get().publicKeyJwk;
            if (ourPub) socket.emit("send-public-key", { to: from, publicKey: ourPub });
          } catch (err) {
            console.warn("receive-public-key error", err);
          }
        });
      }
    },

    getUsers: async () => {
      set({ isUsersLoading: true });
      try {
        const res = await axiosInstance.get("/message/users");
        set({ users: res.data });
      } catch (e) {
        toast.error(e?.response?.data?.message || e.message);
      } finally {
        set({ isUsersLoading: false });
      }
    },

    getMessages: async (userId) => {
      try {
        set({ isMessagesLoading: true });
        await get().initCrypto();

        const res = await axiosInstance.get(`/message/${userId}`);
        const msgs = res.data || [];

        const key = await waitForAESKey(userId, 5000, { tryOfflineDerive: true });

        if(!key) {
          set((state) => {
            const locked = msgs.map((m) => ({ ...m, text: "🔒 Encrypted Message" }));
            const newMap = { ...(state.messagesByUser || {}), [userId]: locked };
            const shouldSet = state.selectedUser && String(state.selectedUser._id) === String(userId);
            return {
              messagesByUser: newMap,
              messages: shouldSet ? locked : state.messages,
              isMessagesLoading: false,
            };
          });
          return;
        }

        set((s) => ({ aesKeys: { ...s.aesKeys, [userId]: key } }));

        // Decrypting messages
        const processed = await Promise.all(
          msgs.map(async (msg) => {
            if (msg.encrypted?.iv) {
              try {
                const pt = await decryptMessage(msg.encrypted, key);
                return { ...msg, text: pt };
              } catch {
                return { ...msg, text: "🔒 Encrypted Message" };
              }
            }
            return { ...msg, text: msg.text || "" };
          })
        );

        // Updating local message state
        set((state) => {
          const newMap = { ...(state.messagesByUser || {}), [userId]: processed };
          const shouldSet = state.selectedUser && String(state.selectedUser._id) === String(userId);
          return {
            messagesByUser: newMap,
            messages: shouldSet ? processed : state.messages,
            isMessagesLoading: false,
          };
        });

        // Auto mark as read
        const me = useStore.getState().authUser;
        const socket = useStore.getState().socket;
        if(socket && me) {
          socket.emit("mark_as_read", { senderId: userId, receiverId: me._id });
        }
      } catch(e) {
        console.error("getMessages error:", e);
        set({ isMessagesLoading: false });
      }
    },

    setSelectedUser: async (user) => {
      const cached = get().messagesByUser?.[user._id] || [];
      set({ selectedUser: user, messages: cached, isMessagesLoading: true });
      await get().initCrypto();
      const { publicKeyJwk, aesKeys } = get();
      const socket = useStore.getState().socket;
      const me = useStore.getState().authUser;
      if(socket && me) {
        socket.emit("mark_as_read", { senderId: user._id, receiverId: me._id });
      }

      if(publicKeyJwk && socket && !aesKeys[user._id]) {
        socket.emit("send-public-key", { to: user._id, publicKey: publicKeyJwk });
      }
      await get().getMessages(user._id);

      // marking as read for this chat now open
      if(socket) {
        const me2 = useStore.getState().authUser;
        if (me2) socket.emit("mark_as_read", { senderId: user._id, receiverId: me2._id });
      }
    },


    sendMessage: async (content, type = "text") => {
      const { selectedUser } = get();
      const { authUser } = useStore.getState();
      if(!selectedUser) return;

      const key = await waitForAESKey(selectedUser._id, 3000, { tryOfflineDerive: true });
      if(!key) {
        toast.error("Encryption key not ready!");
        return;
      }

      try {
        // encrypting FIRST so temp and server share the same ciphertext
        const encrypted = await encryptMessage(content, key);
        const pubJwk = get().publicKeyJwk;

        // optimistic temp with encrypted (for merge)
        const tempId = crypto.randomUUID();
        const tempMsg = {
          tempId,
          senderId: authUser._id,
          receiverId: selectedUser._id,
          text: content,
          type,
          status: "loading",
          encrypted,
          createdAt: new Date().toISOString(),
        };
        upsertMessageForUser(String(selectedUser._id), tempMsg);
        set({ messages: get().messagesByUser[String(selectedUser._id)] });

        // sending to server
        const res = await axiosInstance.post(`/message/send/${selectedUser._id}`, {
          encrypted,
          senderPublicKeyJwk: pubJwk,
          type,
        });

        // decrypting the saved payload for UI
        let decryptedText = "🔒 Encrypted Message";
        try { decryptedText = await decryptMessage(res.data.encrypted, key); } catch {}

        const { _id, createdAt } = res.data || {};

        // Patching the existing temp (by ciphertext) instead of pushing a new message
        set((state) => {
          const uid = String(selectedUser._id);
          const bucket = state.messagesByUser[uid] || [];
          const replaced = bucket.map((m) => {
            const mc = m?.encrypted?.ciphertext;
            const rc = res?.data?.encrypted?.ciphertext;
            if (mc && rc && mc === rc) {
              return {
                ...m,
                _id,
                createdAt: createdAt || m.createdAt,
                status: "sent",
                text: decryptedText,
              };
            }
            return m;
          });
          return {
            messagesByUser: { ...state.messagesByUser, [uid]: replaced },
            messages: state.selectedUser && String(state.selectedUser._id) === uid ? replaced : state.messages,
          };
        });
      } catch (e) {
        console.error("[sendMessage] error:", e);
        toast.error(e.response?.data?.message || e.message || "Send failed");
      }
    },


    subscribeToMessages: () => {
      const socket = useStore.getState().socket;
      if(!socket) return;

      socket.removeAllListeners("newMessage");
      socket.removeAllListeners("message_status_updated");
      socket.removeAllListeners("messages_read");

      const getLocal = useChatStore.getState;
      const setLocal = useChatStore.setState;

      // New message listener (handles encryption + instant read)
      socket.on("newMessage", async ({ from, msg }) => {
        const { authUser } = useStore.getState();
        const isOwn = String(msg.senderId) === String(authUser._id);
        const chatUserId = isOwn ? String(msg.receiverId) : String(msg.senderId);

        let text = "🔒 Encrypted Message";
        try {
          const key = await waitForAESKey(chatUserId, 500, { tryOfflineDerive: false });
          if (key && msg.encrypted?.iv) text = await decryptMessage(msg.encrypted, key);
          else if (!msg.encrypted?.iv && msg.text) text = msg.text;
        } catch {}

        const fullMsg = { ...msg, text };
        upsertMessageForUser(chatUserId, fullMsg);

        const selected = getLocal().selectedUser;
        if (selected && String(selected._id) === chatUserId) {
          setLocal({ messages: getLocal().messagesByUser[chatUserId] });
        }

        // Only receiver handles delivery & read
        if (!isOwn) {
          const me = useStore.getState().authUser;
          const { selectedUser } = getLocal();

          // Acknowledge delivery once
          socket.emit("message_delivered", { messageId: msg._id, senderId: msg.senderId });

          // Debounced "read" emit only if chat is currently open
          const isChatOpen = selectedUser && String(selectedUser._id) === String(msg.senderId);
          if(isChatOpen) {
            clearTimeout(window._readDebounce);
            window._readDebounce = setTimeout(() => {
              socket.emit("mark_as_read", { senderId: msg.senderId, receiverId: me._id });
            }, 300);
          }
        }
      });

      // Delivery / Read status updates
      socket.on("message_status_updated", ({ messageId, status }) => {
        setLocal((state) => {
          const byUser = { ...(state.messagesByUser || {}) };
          let affectedUser = null;

          for (const [uid, msgs] of Object.entries(byUser)) {
            const idx = msgs.findIndex((m) => String(m._id) === String(messageId));
            if (idx !== -1) {
              byUser[uid] = msgs.map((m) =>
                String(m._id) === String(messageId) ? { ...m, status } : m
              );
              affectedUser = uid;
              break;
            }
          }

          if (!affectedUser) return state;
          const selected = state.selectedUser?._id;
          const visible =
            selected && String(selected) === String(affectedUser)
              ? byUser[affectedUser]
              : state.messages;

          return { messagesByUser: byUser, messages: visible };
        });
      });

      // sender instantly updates blue 
      socket.on("messages_read", ({ senderId, receiverId }) => {
        const me = useStore.getState().authUser;
        const myId = String(me._id);

        setLocal((state) => {
          const byUser = { ...(state.messagesByUser || {}) };

          for(const [uid, msgs] of Object.entries(byUser)) {
            byUser[uid] = msgs.map((m) => {
              // Messages I SENT to that receiver should turn "read"
              if (
                String(m.senderId) === myId &&
                String(m.receiverId) === String(receiverId)
              ) {
                return { ...m, status: "read" };
              }
              return m;
            });
          }

          const sel = state.selectedUser?._id;
          const visible =
            sel && byUser[sel] ? byUser[sel] : state.messages;

          return { messagesByUser: byUser, messages: visible };
        });
      });
    },

    unsubscribeFromMessages: () => {
      const socket = useStore.getState().socket;
      if (socket) {
        socket.off("newMessage");
        socket.off("message_status_updated");
        socket.off("messages_read");
      }
    },
  };
});


async function waitForAESKey(userId, timeoutMs = 2000, options = { tryOfflineDerive: true }) {
  const start = Date.now();
  const getState = () => useChatStore.getState();
  const setState = (patch) => useChatStore.setState(patch);

  const existing = getState().aesKeys?.[userId];
  if(existing) return existing;

  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      const key = getState().aesKeys?.[userId];
      if (key) {
        clearInterval(interval);
        resolve(key);
        return;
      }

      if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        if (!options.tryOfflineDerive) return resolve(null);

        try {
          const localPrivate = getState().keyPair?.privateKey;
          if (!localPrivate) return resolve(null);

          const resp = await axiosInstance.get(`/auth/user/${userId}/public-key`);
          const peerPub = resp?.data;
          if (!peerPub) return resolve(null);

          const imported = await importPublicKey(peerPub);
          const derived = await deriveAESKey(localPrivate, imported);
          setState((s) => ({ aesKeys: { ...(s.aesKeys || {}), [userId]: derived } }));
          return resolve(derived);
        } catch (err) {
          console.warn("waitForAESKey fallback failed:", err);
          return resolve(null);
        }
      }
    }, 50);
  });
}
