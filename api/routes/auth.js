import express from "express";
import { login, signup, logout, checkAuth } from "../controllers/controller.js";
import { protectRoute } from "../middleware/auth.js";
const router = express.Router();

router.post("/login",login);
router.post("/signup",signup);
router.post("/logout",logout);

router.get("/check",protectRoute,checkAuth);

export default router;