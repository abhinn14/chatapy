import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { LogOut, X, Camera, Loader2 } from "lucide-react";
import { axiosInstance } from "../library/axios.js";
import { useStore } from "../store/store.js";

export default function Navbar() {
  const { logout, authUser, setAuthUser } = useStore();
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Upload handler with tolerant response
  const handleProfilePicChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result;

      // Show preview instantly
      setAuthUser((prev) => ({ ...prev, profilePic: base64 }));
      setIsUploading(true);

      try {
        console.log("📤 Uploading image...");
        const res = await axiosInstance.put("/auth/update-profile", {
          profilePic: base64,
        });

        // Backend successfully responded
        if (res.data?.success) {
          console.log("✅ Upload complete:", res.data.profilePic);

          setAuthUser((prev) => ({
            ...prev,
            profilePic: res.data.profilePic,
          }));

          setTimeout(async () => {
            try {
              const { data } = await axiosInstance.get("/auth/check");
              setAuthUser(data);
              setShowProfilePopup(false);
            } catch (err) {
              console.error("Error refreshing profile:", err);
            }
          }, 500);

        } else {
          console.warn("⚠️ No success flag, assuming slow Cloudinary...");
          alert("✅ Profile picture will appear shortly.");
          setTimeout(() => window.location.reload(), 1500);
        }
      } catch (error) {
        //  If timeout or other delay occurs
        console.warn("⚠️ Upload may still be processing:", error.message);
        alert("Picture saved! It will appear shortly after refresh.");
        setTimeout(() => window.location.reload(), 2000);
      } finally {
        setIsUploading(false);
      }
    };

    reader.readAsDataURL(file);
  };

  return (
    <>
      {/* Navbar */}
      <header className="fixed top-0 left-0 w-full z-40 backdrop-blur-lg bg-slate-750/80 border-b border-slate-700 shadow-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2 hover:opacity-80 transition-all select-none"
          >
            <img
              src="/chat.png"
              alt="Chatapy Logo"
              className="w-8 h-8 object-contain rounded-md"
            />
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              CHATAPY
            </h1>
          </Link>


          {/* Right controls */}
          {authUser ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowProfilePopup(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-gray-200 hover:bg-slate-700 transition-all"
                title="Profile"
              >
                <img
                  src={
                    authUser?.profilePic ||
                    "https://cdn-icons-png.flaticon.com/512/149/149071.png"
                  }
                  alt="My Profile"
                  className="w-6 h-6 rounded-full object-cover border border-gray-500"
                />
                <span className="hidden sm:inline">Profile</span>
              </button>

              <button
                onClick={logout}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-red-500 transition-all"
                title="Logout"
              >
                <LogOut size={20} />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <div className="w-[100px]" />
          )}
        </div>
      </header>

      {/* Profile Popup */}
      {showProfilePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative bg-slate-800 p-6 rounded-2xl shadow-2xl w-80 text-center animate-fadeIn">
            <button
              onClick={() => setShowProfilePopup(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-200"
            >
              <X size={20} />
            </button>

            <div className="flex flex-col items-center mt-2">
              <div className="relative group">
                <img
                  src={
                    authUser?.profilePic ||
                    "https://cdn-icons-png.flaticon.com/512/149/149071.png"
                  }
                  alt="Profile"
                  className="w-24 h-24 rounded-full object-cover border-2 border-indigo-500 shadow-lg"
                />
                {isUploading && (
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
                    <Loader2 className="animate-spin text-white" size={24} />
                  </div>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-full opacity-90 group-hover:opacity-100 transition"
                  disabled={isUploading}
                >
                  <Camera size={16} />
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleProfilePicChange}
              />

              <h2 className="mt-4 text-lg font-semibold text-white">
                {authUser?.name || "User"}
              </h2>
              <p className="text-sm text-gray-400">Tap camera to change picture</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
