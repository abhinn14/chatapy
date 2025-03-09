import express from "express";
import { protectRoute } from "../middleware/auth.js";
import { SidebarUsers, getMessages, sendMessage } from "../controllers/msg_controller.js";

const router = express.Router();

router.get("/users", protectRoute, SidebarUsers);
router.get("/:id", protectRoute, getMessages);

router.post("/send/:id", protectRoute, sendMessage);

export default router;