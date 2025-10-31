import bcrypt from "bcryptjs";

import User from "../models/user.js";
import { generateToken } from "../library/utils.js";
import cloudinary from "../library/cloudinary.js";

export const login = async (req, res) => {
  const { name, password } = req.body;
  try {
    if(!name || !password) {
      return res.status(400).json({message:"All fields required"});
    }
    const user = await User.findOne({name});
    if(!user) {
      return res.status(400).json({message:"Wrong credentials"});
    }
    const pswd_correct = await bcrypt.compare(password, user.password);
    if(!pswd_correct) {
      return res.status(400).json({message:"Wrong credentials"});
    }

    generateToken(user._id,res);

    res.status(200).json({
      _id: user._id,
      name: user.name
    });

  } catch(error) {
    console.log("Error in login + ", error.message);
    res.status(500).json({message:"Internal Server Error"});
  }
};

export const signup = async (req, res) => {
    const { name, password } = req.body;
    try {
      if(!name || !password) {
        return res.status(400).json({message:"All fields required"});
      }
      if(password.length<5) {
        return res.status(400).json({message:"Password must be atleast 5 characters long"});
      }
      const user = await User.findOne({name});
      if(user) {
        return res.status(400).json({message:"User already exists"});
      }
      const salt = await bcrypt.genSalt(8);
      const hashed = await bcrypt.hash(password,salt);
      const newbie = new User({name,password:hashed});
      if(!newbie) {
          return res.status(400).json({error:"Invalid user data"});
      }
      
      generateToken(newbie._id,res);

      await newbie.save();
      
      res.status(201).json({
        _id: newbie._id,
        name: newbie.name
      });
    } catch(error) {
      console.log("Error in signup = ", error.message);
      res.status(500).json({message:"Internal Server Error"});
    }
};

export const logout = (req, res) => {
    try {
      res.cookie("token","",{maxAge:0});
      res.status(200).json({message:"Logged out successfully"});
    } catch (error) {
      console.log("Error in logout + ", error.message);
      res.status(500).json({message:"Internal Server Error"});
    }
};

export const checkAuth = (req, res) => {
    try {
      res.status(200).json(req.user);
    } catch(error) {
      console.log("Error in checkAuth controller + ", error.message);
      res.status(500).json({message:"Internal Server Error"});
    }
};



export const updateProfile = async (req, res) => {
  try {
    const { profilePic } = req.body;
    const userId = req.user?._id;

    if (!userId) {
      console.log("❌ No user ID");
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!profilePic) {
      console.log("❌ No profilePic provided");
      return res.status(400).json({ message: "Profile pic required" });
    }

    // ✅ Force Cloudinary to treat it as a new file (prevent cached URL reuse)
    const uploadResponse = await cloudinary.uploader.upload(profilePic, {
      folder: "chatapy_profiles",
      public_id: `pfp_${userId}_${Date.now()}`,
      overwrite: true,
    });

    console.log("✅ Cloudinary uploaded:", uploadResponse.secure_url);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePic: uploadResponse.secure_url },
      { new: true }
    ).select("-password");

    console.log("✅ Updated user in DB:", updatedUser.profilePic);

    res.status(200).json({
      success: true,
      profilePic: updatedUser.profilePic,
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("❌ Error in updateProfile:", error);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};