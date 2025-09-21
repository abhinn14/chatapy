import express from "express";
import { login, signup, logout, checkAuth } from "../controllers/controller.js";
import { protectRoute } from "../middleware/auth.js";
import User from "../models/user.js";
const router = express.Router();

router.post("/login",login);
router.post("/signup",signup);
router.post("/logout",logout);

router.get("/check",protectRoute,checkAuth);

router.post('/upload-public-key', protectRoute, async (req, res) => {
  const { publicKeyJwk } = req.body;
  if(!publicKeyJwk)
    return res.status(400).json({ message: "Missing publicKeyJwk" });
  await User.findByIdAndUpdate(req.user._id, { publicKeyJwk });
  res.status(200).json({ message: "Saved" });
});

router.get('/user/:id/public-key', async (req, res) => {
  const user = await User.findById(req.params.id).select('publicKeyJwk');
  res.json(user?.publicKeyJwk || null);
});

export default router;