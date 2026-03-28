import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { FileText, Mail, Lock, User, ArrowRight, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clearAuthData } from "@/utils/axiosInstance";
import authUtils from "@/utils/authUtils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AuthPage = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    if (isLogin) {
      if (!formData.email || !formData.password) {
        toast.error("Please fill in all fields");
        return false;
      }
      if (!formData.email.includes("@")) {
        toast.error("Please enter a valid email");
        return false;
      }
    } else {
      if (!formData.username || !formData.email || !formData.password || !formData.confirmPassword) {
        toast.error("Please fill in all fields");
        return false;
      }
      if (!formData.email.includes("@")) {
        toast.error("Please enter a valid email");
        return false;
      }
      if (formData.password.length < 6) {
        toast.error("Password must be at least 6 characters");
        return false;
      }
      if (formData.password !== formData.confirmPassword) {
        toast.error("Passwords do not match");
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    try {
      clearAuthData();

      let response;
      const headers = { "Content-Type": "application/x-www-form-urlencoded" };

      if (isLogin) {
        const loginData = new URLSearchParams();
        loginData.append("email", formData.email);
        loginData.append("password", formData.password);
        response = await axios.post(`${API}/auth/login`, loginData, { headers });
      } else {
        const signupData = new URLSearchParams();
        signupData.append("username", formData.username);
        signupData.append("email", formData.email);
        signupData.append("password", formData.password);
        response = await axios.post(`${API}/auth/signup`, signupData, { headers });
      }

      if (response.data.success) {
        const userData = authUtils.saveAuthData(response.data);

        window.dispatchEvent(new CustomEvent("userLoggedIn", {
          detail: {
            userId: userData.id,
            email: userData.email,
            sessionId: userData.sessionId
          }
        }));

        toast.success(isLogin ? "Login successful!" : "Account created successfully!");
        navigate("/performance");
      }
    } catch (error) {
      console.error("Auth error:", error);
      const errorMessage = error.response?.data?.detail || "Authentication failed. Please try again.";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A4D2E] to-[#0F3620] flex items-center justify-center px-6 relative">
      {/* Background decorative blobs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-[#D9F99D]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#D9F99D]/10 rounded-full blur-3xl pointer-events-none" />

      {/* ── Back to Home button (top-left) ── */}
      <button
        onClick={() => navigate("/")}
        className="absolute top-6 left-6 z-20 flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm font-medium group"
      >
        <span className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors group-hover:-translate-x-0.5 duration-200">
          <ArrowLeft className="w-4 h-4" />
        </span>
        Back to Home
      </button>

      <div className="w-full max-w-md relative z-10">
        {/* Logo — also navigates home */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center justify-center gap-3 mb-8 w-full hover:opacity-80 transition-opacity"
        >
          <div className="bg-white p-2 rounded-xl shadow-sm">
          <img 
            src="/talentlens-logo.png" 
            alt="TalentLens Logo" 
            className="w-12 h-12 object-contain rounded-xl"
          />
          </div>
          <span className="font-bold text-2xl text-[#D9F99D] font-['Outfit']">TalentLens</span>
        </button>

        {/* Auth Card */}
        <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl text-center font-['Outfit'] text-[#1A4D2E]">
              {isLogin ? "Welcome Back" : "Create Account"}
            </CardTitle>
            <p className="text-center text-gray-600 text-sm mt-2">
              {isLogin
                ? "Sign in to access your dashboard"
                : "Join us to start screening resumes"}
            </p>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username field - signup only */}
              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                    <Input
                      type="text"
                      name="username"
                      placeholder="John Doe"
                      value={formData.username}
                      onChange={handleInputChange}
                      className="pl-10 border-gray-300 focus:border-[#1A4D2E] focus:ring-[#1A4D2E]/20"
                    />
                  </div>
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <Input
                    type="email"
                    name="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="pl-10 border-gray-300 focus:border-[#1A4D2E] focus:ring-[#1A4D2E]/20"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="pl-10 pr-10 border-gray-300 focus:border-[#1A4D2E] focus:ring-[#1A4D2E]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password - signup only */}
              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      name="confirmPassword"
                      placeholder="••••••••"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      className="pl-10 pr-10 border-gray-300 focus:border-[#1A4D2E] focus:ring-[#1A4D2E]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1A4D2E] hover:bg-[#14532D] text-white py-2 rounded-lg font-semibold mt-6"
              >
                {loading ? (
                  "Processing..."
                ) : (
                  <>
                    {isLogin ? "Sign In" : "Create Account"}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </form>

            {/* Toggle login / signup */}
            <div className="mt-6 text-center">
              <p className="text-gray-600 text-sm">
                {isLogin ? "Don't have an account?" : "Already have an account?"}
                <button
                  onClick={() => {
                    clearAuthData();
                    setIsLogin(!isLogin);
                    setFormData({ username: "", email: "", password: "", confirmPassword: "" });
                  }}
                  className="ml-2 font-semibold text-[#1A4D2E] hover:text-[#14532D] transition-colors"
                >
                  {isLogin ? "Sign Up" : "Sign In"}
                </button>
              </p>
            </div>

            {/* First-time hint */}
            {isLogin && (
              <div className="mt-4 p-3 bg-[#F0FDF4] border border-[#D9F99D] rounded-lg text-xs text-gray-700">
                <p className="font-semibold text-[#1A4D2E] mb-2">👋 First time here?</p>
                <p>Create a new account above to get started!</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer note */}
        <p className="text-center text-white/60 text-xs mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
};

export default AuthPage;