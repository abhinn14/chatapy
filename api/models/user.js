import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
        minlength: 5
    },
    profilePic: {
      type: String,
      default: "",
    },
    publicKeyJwk: { type: Object } 
},{timestamps:true});

const User = mongoose.model("User",userSchema);

export default User;