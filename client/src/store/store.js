import {create} from "zustand";
import toast from "react-hot-toast";
import { io } from "socket.io-client";

import {axiosInstance} from "../library/axios.js";
import { useChatStore } from "./useChatStore.js";

const BASE_URL = import.meta.env.MODE === "development" ? "http://localhost:5000": "/";

export const useStore = create((set,get) => ({
    authUser: null,
    isSigningUp: false,
    isLoggingIn: false,
    isUpdatingProfile: false,
    isCheckingAuth: true,
    onlineUsers: [],
    socket: null,

    checkAuth: async () => {
        try {
          const res = await axiosInstance.get("/auth/check");
    
          set({authUser:res.data});
          get().connectSocket();
        } catch (err) {
          console.log("Error in checkAuth = ",err);
          set({ authUser:null});
        } finally {
          set({isCheckingAuth:false});
        }
    },


    login: async (formData) => {
      set({isLoggingIn:true});
      try {
        const res = await axiosInstance.post("/auth/login",formData);
        set({authUser:res.data});
        toast.success("Logged in successfully");
  
        get().connectSocket();
      } catch(error) {
        toast.error(error.response.data.message);
      } finally {
        set({ isLoggingIn: false });
      }
    },

    signup: async (formData) => {
        set({isSigningUp:true});
        try {
          const res = await axiosInstance.post("/auth/signup",formData);
          set({authUser:res.data});
          toast.success("Account created successfully");
          get().connectSocket();
        } catch (error) {
          toast.error(error.response.data.message);
        } finally {
          set({isSigningUp:false});
        }
    },

    logout: async () => {
      try {
        await axiosInstance.post("/auth/logout");
        set({authUser:null});
        toast.success("Logged out successfully");
        get().disconnectSocket();
      } catch (error) {
        toast.error(error.response.data.message);
      }
    },


    connectSocket: () => {
      const {authUser} = get();
      if (!authUser || get().socket?.connected) return;
  
      const socket = io(BASE_URL, {
        query: {
          userId: authUser._id,
        },
      });
      socket.connect();
   
      set({socket:socket});

      useChatStore.getState().initCrypto();

      useChatStore.getState().subscribeToMessages();
  
      socket.on("getOnlineUsers",(userIds) => {
        set({onlineUsers:userIds});
      });
    },

    disconnectSocket: () => {
      if(get().socket?.connected) {
        useChatStore.getState().unsubscribeFromMessages();
        get().socket.disconnect();
      }
    }

}));