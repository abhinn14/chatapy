// useChatStore.js
import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../library/axios.js";
import { useStore } from "./store.js";

function u8ToBase64(u8) {
  let binary = "";
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  return btoa(binary);
}

function base64ToU8(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = binary.charCodeAt(i);
  return u8;
}

async function generateECDHKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  console.log("ECDH key pair generated");
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
  if (!msg) return null;
  return String(msg._id || msg.id || "");
}

export const useChatStore = create((set, get) => {
  // ------- Helper functions inside the store closure -------

  function normalizeEncryptedFingerprint(encrypted) {
    if (!encrypted) return null;
    return String(encrypted.ciphertext || encrypted.ct || "");
  }

  function findExistingMessageIndex(list, incomingMsg) {
    if (!Array.isArray(list)) return -1;
    const incomingId = normalizeId(incomingMsg);
    const incomingCt = normalizeEncryptedFingerprint(incomingMsg.encrypted);
    const incomingCreated = incomingMsg.createdAt ? String(incomingMsg.createdAt) : null;

    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const mid = normalizeId(m);
      if (mid && incomingId && String(mid) === String(incomingId)) return i;

      const mct = normalizeEncryptedFingerprint(m.encrypted);
      if (mct && incomingCt && mct === incomingCt) return i;

      const mcreated = m.createdAt ? String(m.createdAt) : null;
      if (mcreated && incomingCreated && mcreated === incomingCreated) return i;
    }
    return -1;
  }

  function upsertMessageForUser(userId, incomingMsg) {
    set((state) => {
      const map = state.messagesByUser || {};
      const list = map[userId] ? [...map[userId]] : [];
      const idx = findExistingMessageIndex(list, incomingMsg);

      if (idx !== -1) {
        const existing = list[idx];
        const newIsLocked = !incomingMsg.text || incomingMsg.text === "🔒 Encrypted Message";
        const existingHasPlain = existing.text && existing.text !== "🔒 Encrypted Message";

        if (existingHasPlain && newIsLocked) {
          // Keep existing decrypted text (no downgrade)
          list[idx] = existing;
        } else {
          // Merge and update
          list[idx] = { ...existing, ...incomingMsg };
        }
      } else {
        list.push(incomingMsg);
      }

      // Keep stable order by createdAt if available
      list.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return ta - tb;
      });

      return { messagesByUser: { ...map, [userId]: list } };
    });
  }

  // ------- Store state and methods -------

  return {
    messages: [],
    users: [],
    selectedUser: null,
    isUsersLoading: false,
    isMessagesLoading: false,
    messagesByUser: {},

    keyPair: null,
    publicKeyJwk: null,
    aesKeys: {}, // userId -> CryptoKey
    cryptoInitialized: false,

    initCrypto: async () => {
      if (get().cryptoInitialized) return;

      const { authUser } = useStore.getState();
      if (!authUser) return;

      const privJwkStr = localStorage.getItem(`privkey_${authUser._1d || authUser._id}`);
      let keyPair = null;
      let publicKeyJwk = null;

      // Note: some builds might have _1d typo; prefer _id
      // but handle both just in case
      try {
        const maybeId = authUser._id || authUser._1d;
        const privKeyStorage = localStorage.getItem(`privkey_${maybeId}`);
        if (privKeyStorage) {
          const privJwk = JSON.parse(privKeyStorage);
          const privateKey = await crypto.subtle.importKey(
            "jwk",
            privJwk,
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveKey"]
          );
          keyPair = { privateKey, publicKey: null };

          const localPub = localStorage.getItem(`pubkey_${maybeId}`);
          if (localPub) {
            publicKeyJwk = JSON.parse(localPub);
          } else {
            try {
              const res = await axiosInstance.get(`/auth/user/${maybeId}/public-key`);
              publicKeyJwk = res.data || null;
            } catch {
              publicKeyJwk = null;
            }
          }
        }
      } catch (err) {
        console.warn("Failed to import private key, regenerating new one", err);
      }

      if (!keyPair) {
        const gen = await generateECDHKeyPair();
        keyPair = gen.keyPair;
        publicKeyJwk = gen.publicKeyJwk;
        try {
          const privJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
          const id = (authUser && (authUser._id || authUser.id)) || "unknown";
          localStorage.setItem(`privkey_${id}`, JSON.stringify(privJwk));
          localStorage.setItem(`pubkey_${id}`, JSON.stringify(publicKeyJwk));
          try {
            await axiosInstance.post("/auth/upload-public-key", { publicKeyJwk });
          } catch (e) {
            console.warn("Failed to upload public key:", e?.message || e);
          }
        } catch (e) {
          console.warn("Failed to export private key JWK (continuing without persistence):", e);
        }
      }

      set({ keyPair, publicKeyJwk, cryptoInitialized: true });

      const socket = useStore.getState().socket;
      if (socket) {
        socket.off("receive-public-key");
        socket.on("receive-public-key", async ({ from, publicKey }) => {
          try {
            const imported = await importPublicKey(publicKey);
            const aesKey = await deriveAESKey(get().keyPair.privateKey, imported);
            set((s) => ({ aesKeys: { ...s.aesKeys, [from]: aesKey } }));

            // send our public key back (helps the peer derive)
            const ourPub = get().publicKeyJwk;
            if (ourPub) socket.emit("send-public-key", { to: from, publicKey: ourPub });
          } catch (err) {
            console.warn("Error handling receive-public-key:", err);
          }
        });
      }
    },

    /* getUsers */
    getUsers: async () => {
      set({ isUsersLoading: true });
      try {
        const res = await axiosInstance.get("/message/users");
        set({ users: res.data });
      } catch (e) {
        toast.error(e.response?.data?.message || e.message);
      } finally {
        set({ isUsersLoading: false });
      }
    },

    /* getMessages */
    getMessages: async (userId) => {
      try {
        set({ isMessagesLoading: true });
        await get().initCrypto();

        const res = await axiosInstance.get(`/message/${userId}`);
        const msgs = res.data || [];

        const key = await waitForAESKey(userId, 5000, { tryOfflineDerive: true });
        if (!key) {
          // store locked placeholders into bucket
          set((state) => {
            const locked = msgs.map((m) => ({ ...m, text: "🔒 Encrypted Message" }));
            const newMap = { ...(state.messagesByUser || {}), [userId]: locked };
            const shouldSetMessages = state.selectedUser && String(state.selectedUser._id) === String(userId);
            return {
              messagesByUser: newMap,
              messages: shouldSetMessages ? locked : state.messages,
              isMessagesLoading: false,
            };
          });
          return;
        }

        set((s) => ({ aesKeys: { ...s.aesKeys, [userId]: key } }));

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

        set((state) => {
          const newMap = { ...(state.messagesByUser || {}), [userId]: processed };
          const shouldSetMessages = state.selectedUser && String(state.selectedUser._id) === String(userId);
          return {
            messagesByUser: newMap,
            messages: shouldSetMessages ? processed : state.messages,
            isMessagesLoading: false,
          };
        });
      } catch (e) {
        console.error("Error in getMessages:", e);
        set({ isMessagesLoading: false });
      }
    },

    /* setSelectedUser */
    setSelectedUser: async (user) => {
      const cached = get().messagesByUser?.[user._id] || [];
      set({ selectedUser: user, messages: cached, isMessagesLoading: true });
      await get().initCrypto();
      const { publicKeyJwk, aesKeys } = get();
      const socket = useStore.getState().socket;

      if (publicKeyJwk && socket && !aesKeys[user._id]) {
        socket.emit("send-public-key", { to: user._id, publicKey: publicKeyJwk });
      }

      await get().getMessages(user._id);
    },

    /* sendMessage */
    sendMessage: async (text) => {
      const { selectedUser } = get();
      if (!selectedUser) return;

      const key = await waitForAESKey(selectedUser._id, 3000, { tryOfflineDerive: true });
      if (!key) {
        toast.error("Encryption key not ready!");
        return;
      }

      try {
        const encrypted = await encryptMessage(text, key);
        const pubJwk = get().publicKeyJwk;
        const res = await axiosInstance.post(`/message/send/${selectedUser._id}`, {
          encrypted,
          senderPublicKeyJwk: pubJwk,
        });

        // Decrypt server-saved payload and upsert into bucket
        let decryptedText = "🔒 Encrypted Message";
        try {
          decryptedText = await decryptMessage(res.data.encrypted, key);
        } catch (e) {
          console.warn("[sendMessage] decrypt after save failed:", e);
        }
        const msgWithText = { ...res.data, text: decryptedText };

        // Upsert safely (prevents duplicate when server echo arrives)
        const userId = String(selectedUser._id);
        upsertMessageForUser(userId, msgWithText);

        // Update UI messages if this conversation is open
        const selected = get().selectedUser;
        if (selected && String(selected._id) === userId) {
          const updatedBucket = get().messagesByUser?.[userId] || [];
          set({ messages: updatedBucket });
        }
      } catch (e) {
        console.error("[sendMessage] error:", e);
        toast.error(e.response?.data?.message || e.message || "Send failed");
      }
    },

    /* subscribeToMessages */
    subscribeToMessages: () => {
      const socket = useStore.getState().socket;
      if (!socket) return;

      socket.off("newMessage");
      socket.on("newMessage", async ({ from, msg }) => {
        try {
          const authUser = useStore.getState().authUser;
          const senderId = String(from);
          const isEcho = authUser && String(from) === String(authUser._id);
          const receiverId = msg?.receiverId ? String(msg.receiverId) : null;

          const targetUserId = isEcho ? (receiverId || String(get().selectedUser?._id || "")) : senderId;
          if (!targetUserId) {
            console.warn("[subscribeToMessages] can't determine conversation target for incoming msg", msg);
            return;
          }

          const decryptPartnerId = isEcho ? targetUserId : senderId;

          let text = "🔒 Encrypted Message";
          try {
            const key = await waitForAESKey(decryptPartnerId, 300, { tryOfflineDerive: false });
            if (key && msg.encrypted?.iv) {
              text = await decryptMessage(msg.encrypted, key);
            } else if (!msg.encrypted?.iv && msg.text) {
              text = msg.text;
            }
          } catch (e) {
            console.warn("[subscribeToMessages] live decrypt failed:", e);
          }

          const msgWithText = { ...msg, text };

          // Upsert into messagesByUser safely (dedupe + no downgrade)
          upsertMessageForUser(String(targetUserId), msgWithText);

          // If this conversation is open, refresh UI messages from bucket
          const selected = get().selectedUser;
          if (selected && String(selected._id) === String(targetUserId)) {
            const updatedBucket = get().messagesByUser?.[targetUserId] || [];
            set({ messages: updatedBucket });
          }
        } catch (outer) {
          console.error("subscribeToMessages handler error:", outer);
        }
      });
    },

    unsubscribeFromMessages: () => {
      const socket = useStore.getState().socket;
      if (socket) socket.off("newMessage");
    },
  };
});

/* ---------------- waitForAESKey ---------------- */
async function waitForAESKey(userId, timeoutMs = 2000, options = { tryOfflineDerive: true }) {
  const start = Date.now();
  const getState = () => useChatStore.getState();
  const setState = (patch) => useChatStore.setState(patch);

  const existing = getState().aesKeys?.[userId];
  if (existing) return existing;

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
