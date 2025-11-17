import { useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useStore } from "../store/store.js";

function SignupPage() {
  const [showPswd, setShowPswd] = useState(false);
  const [showConfirmPswd, setShowConfirmPswd] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    password: "",
    confirmPassword: "",
  });

  const { signup, isSigningUp } = useStore();

  const handleSubmit = (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match!");
      return;
    }

    if (formData.password.length < 6) {
      toast.error("Password must be at least 6 characters long!");
      return;
    }

    signup({ name: formData.name, password: formData.password });
  };

  const passwordsMatch =
    formData.password && formData.confirmPassword
      ? formData.password === formData.confirmPassword
      : true;

  return (
    <div className="h-screen flex items-center justify-center">
      <div
        className="bg-slate-850 text-white p-6 rounded-[40px] shadow-2xl h-[530px] w-[500px] flex items-center flex-col"
        style={{ boxShadow: "0 20px 50px rgba(0, 0, 0, 0.8)" }}
      >
        {/* Logo / Header */}
        <div className="flex items-center gap-3 hover:opacity-80 transition-all">
          <h1 className="text-5xl font-bold">CHATAPY</h1>
        </div>

        <h2 className="mt-7 text-2xl font-bold text-center mb-6">SIGN UP</h2>

        <form onSubmit={handleSubmit} className="h-[280px] w-[300px]">
          {/* Username */}
          <div className="mb-4">
            <label className="block text-white mb-2">Set Username</label>
            <input
              type="text"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your username"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />
          </div>

          {/* Password */}
          <div className="mb-4">
            <label className="block text-white mb-2">Set Password</label>
            <div className="relative w-full">
              <input
                type={showPswd ? "text" : "password"}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center"
                onClick={() => setShowPswd(!showPswd)}
              >
                {showPswd ? (
                  <EyeOff className="size-5 text-gray-400" />
                ) : (
                  <Eye className="size-5 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="mb-6">
            <label className="block text-white mb-2">Confirm Password</label>
            <div className="relative w-full">
              <input
                type={showConfirmPswd ? "text" : "password"}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                  !passwordsMatch
                    ? "border-red-500 focus:ring-red-500"
                    : "focus:ring-blue-500"
                }`}
                placeholder="Re-enter your password"
                value={formData.confirmPassword}
                onChange={(e) =>
                  setFormData({ ...formData, confirmPassword: e.target.value })
                }
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center"
                onClick={() => setShowConfirmPswd(!showConfirmPswd)}
              >
                {showConfirmPswd ? (
                  <EyeOff className="size-5 text-gray-400" />
                ) : (
                  <Eye className="size-5 text-gray-400" />
                )}
              </button>
            </div>
            {!passwordsMatch && (
              <p className="text-red-400 text-xs mt-1">
                Passwords do not match
              </p>
            )}
          </div>

          {/* Submit button */}
          <button
            type="submit"
            className="btn btn-primary w-full -mt-1"
            disabled={isSigningUp || !passwordsMatch}
          >
            {isSigningUp ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                Loading...
              </>
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        {/* Login redirect */}
        <div className="mt-12 text-center">
          <p className="text-white">
            Already have an account?{" "}
            <Link to="/login" className="link link-primary">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default SignupPage;
