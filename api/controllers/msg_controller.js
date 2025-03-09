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
    });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller = ", error.message);
    res.status(500).json({error:"Internal server error"});
  }
};

export const sendMessage = async (req, res) => {
  try {
    const {text} = req.body;
    const {id:receiverId} = req.params;
    const senderId = req.user._id;

    const newMessage = new Message({
      senderId,
      receiverId,
      text
    });

    await newMessage.save();

    const receiverSocketId = getReceiverSocketId(receiverId);
    if(receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage",newMessage);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage = ", error.message);
    res.status(500).json({error:"Internal server error"});
  }
};