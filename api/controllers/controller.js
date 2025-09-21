import bcrypt from "bcryptjs";

import User from "../models/user.js";
import { generateToken } from "../library/utils.js"


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