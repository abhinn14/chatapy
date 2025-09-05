import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../library/axios.js";
import { useStore } from "./store.js";

// ——— Crypto helpers (unchanged) ———

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
  console.log("🔑 [Crypto] Generated ECDH key pair");
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
  const aesKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: remotePublicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  console.log("🔐 [Crypto] Derived new AES key");
  return aesKey;
}
async function encryptMessage(plain, aesKey) {
  const encoder = new TextEncoder();
  // 12 byte iv for AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoder.encode(plain)
  );
  // ct is an ArrayBuffer -> convert to Uint8Array
  const ctU8 = new Uint8Array(ct);

  // Convert both to base64 strings so server+DB store strings
  return {
    iv: u8ToBase64(iv),
    ciphertext: u8ToBase64(ctU8),
  };
}

async function decryptMessage({ iv, ciphertext }, aesKey) {
  const decoder = new TextDecoder();

  // iv & ciphertext should be base64 strings. Convert to Uint8Array
  const ivU8 = base64ToU8(iv);
  const ctU8 = base64ToU8(ciphertext);

  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivU8 },
    aesKey,
    ctU8
  );
  return decoder.decode(pt);
}

// ——— Reusable Helper Function ———
const waitForAESKey = (userId) => {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      // Access the store directly to get the latest state
      const key = useChatStore.getState().aesKeys[userId];
      if (key) {
        clearInterval(interval);
        resolve(key);
      }
    }, 50);
  });
};




// ——— Zustand store ———
export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,

  // Crypto state
  keyPair: null,
  publicKeyJwk: null,
  aesKeys: {}, // userId -> CryptoKey
  cryptoInitialized: false,

  // 1) Setup key pair once on socket connect
  initCrypto: async () => {
    if (get().cryptoInitialized) return;
    const { keyPair, publicKeyJwk } = await generateECDHKeyPair();
    set({ keyPair, publicKeyJwk, cryptoInitialized: true });

    const socket = useStore.getState().socket;
    socket.on("receive-public-key", async ({ from, publicKey }) => {
      console.log("⮘ [Socket] receive-public-key from", from);

      // Prevent redundant key exchanges if a key already exists
      if (get().aesKeys[from]) {
        console.log("Key for", from, "already exists. Skipping.");
        return;
      }

      const imported = await importPublicKey(publicKey);
      const aesKey = await deriveAESKey(get().keyPair.privateKey, imported);
      set((state) => ({ aesKeys: { ...state.aesKeys, [from]: aesKey } }));

      // ✅ CRUCIAL FIX: Reply with our own public key to complete the handshake.
      console.log("⮕ [Socket] Replying with public key to", from);
      socket.emit("send-public-key", { to: from, publicKey: get().publicKeyJwk });
    });
  },

  // 2) Fetch list of users
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

  // 3) Load & decrypt past messages
  getMessages: async (userId) => {
    // The loading state is now set inside setSelectedUser
    try {
      const key = await waitForAESKey(userId);

      if (!key) {
        toast.error("Could not establish a secure connection.");
        set({ isMessagesLoading: false });
        return;
      }

      const res = await axiosInstance.get(`/message/${userId}`);
      
      const processedMessages = await Promise.all(
        res.data.map(async (msg) => {
          // ✅ ROBUST LOGIC: Decrypt ONLY if msg.encrypted exists
          if (msg.encrypted?.iv && msg.encrypted?.ciphertext) {
            try {
              const decryptedText = await decryptMessage(msg.encrypted, key);
              return { ...msg, text: decryptedText };
            } catch (decryptionError) {
              console.error("Failed to decrypt a message:", decryptionError);
              return { ...msg, text: "🔒 Failed to decrypt message" };
            }
          }
          // Otherwise, it's an old message or something is wrong, just return it.
          // The UI will use its existing `text` field.
          return msg;
        })
      );
      set({ messages: processedMessages, isMessagesLoading: false });
    } catch (e) {
      console.error("Error in getMessages:", e);
      toast.error(e.response?.data?.message || e.message);
      set({ isMessagesLoading: false }); // Ensure loading is off on error
    }
  },

  // 4) Select user and trigger key exchange
  setSelectedUser: async (user) => {
    set({ selectedUser: user, messages: [], isMessagesLoading: true });

    await get().initCrypto();
    const { publicKeyJwk, aesKeys } = get();
    const socket = useStore.getState().socket;

    if (!publicKeyJwk || !socket) {
      console.error("[ChatStore] Prerequisites missing: publicKeyJwk or socket");
      set({ isMessagesLoading: false });
      return;
    }
    
    if (!aesKeys[user._id]) {
      console.log("⮕ [Socket] Initiating key exchange with", user._id);
      socket.emit("send-public-key", { to: user._id, publicKey: publicKeyJwk });
    }

    // Call getMessages. The finally block inside it is no longer needed
    // as we handle the loading state here and within the function.
    await get().getMessages(user._id);
  },

  // 5) Encrypt & send new message
  sendMessage: async (text) => {
    const { selectedUser } = get();
    if (!selectedUser) return;

    const key = await waitForAESKey(selectedUser._id);

    if (!key) {
      toast.error("Encryption key not ready!");
      console.warn("[ChatStore] AES key missing for", selectedUser._id);
      return;
    }
    
    try {
      const encrypted = await encryptMessage(text, key);
      
      const res = await axiosInstance.post(
        `/message/send/${selectedUser._id}`,
        { encrypted }
      );
      
      const decryptedText = await decryptMessage(res.data.encrypted, key);
      // Use get() to ensure you're appending to the most recent message list
      set({ messages: [...get().messages, { ...res.data, text: decryptedText }] });
    } catch (e) {
      toast.error(e.response?.data?.message || e.message);
    }
  },

  // 6) Real-time incoming
  subscribeToMessages: () => {
    const socket = useStore.getState().socket;
    socket.on("newMessage", async ({ from, msg }) => {
      console.log("⮘ [Socket] newMessage from", from, msg);
      const { selectedUser } = get();
      
      if (selectedUser && from === selectedUser._id) {
          const key = await waitForAESKey(from); // Wait for key if it's a new chat
          if (!key) {
            console.warn("Received message but no key for sender:", from);
            return;
          }
          const text = await decryptMessage(msg.encrypted, key);
          set({ messages: [...get().messages, { ...msg, text }] });
      } else {
        toast(`New message from another user!`, { icon: '📬' });
      }
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useStore.getState().socket;
    if (socket) {
        socket.off("newMessage");
    }
  },
}));