import React from 'react';
import toast from "react-hot-toast";
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { useStore } from '../store/store.js';

function LoginPage() {

  const [showPswd, setShowPswd] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const { login, isLoggingIn } = useStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    login(formData);
  };

  return (
    <div className="h-screen flex items-center justify-center">
      <div 
        className="bg-slate-850 text-white p-6 rounded-[40px] shadow-2xl h-[470px] w-[500px] flex items-center flex-col" 
        style={{ boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)' }}
      >
        <div className="flex items-center gap-3 hover:opacity-80 transition-all">
          <h1 className="text-5xl font-bold">CHATAPY</h1>
        </div>
  
        <h2 className="mt-7 text-2xl font-bold text-center mb-6">SIGN IN</h2>
        <form onSubmit={handleSubmit} className="h-[220px] w-[300px]">
          <div className="mb-4">
            <label className="block text-white mb-2">Username</label>
            <input
              type="text"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your username"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="mb-6">
            <label className="block text-white mb-2">Password</label>
            <div className="relative w-full">
              <input
                type={showPswd ? "text" : "password"}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
  
          <button type="submit" className="btn btn-primary w-full" disabled={isLoggingIn}>
            {isLoggingIn ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                Loading...
              </>
            ) : (
              "Log In"
            )}
          </button>
        </form>
        <div className="mt-8 text-center">
          <p className="text-white">
            Don&apos;t have an account?{" "}
            <Link to="/signup" className="link link-primary">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
