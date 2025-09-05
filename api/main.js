import express from "express";
import {app,server} from "./library/socket.js";
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import cookieParser from "cookie-parser";

import cors from "cors";
import path from "path";

import routes from "./routes/auth.js";
import message_routes from "./routes/message.js";

const PORT = process.env.PORT;
const __dirname = path.resolve();

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(cookieParser());
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true,
}));


app.use("/api/auth",routes);
app.use("/api/message",message_routes);

if(process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(__dirname,"../client/dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname,"../client","dist","index.html"));
    });
}

server.listen(PORT, async () => {
  console.log(`server is running on ${PORT}`);
    try {
        const connecty = await mongoose.connect(process.env.MONGOdb);
        console.log(`Database connected!!!\n${connecty.connection.host}`);
    } catch(error) {
        console.log("Database Error = ", error);
    }
});