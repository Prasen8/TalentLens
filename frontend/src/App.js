import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

// Pages
import LandingPage from "@/pages/LandingPage";
import SingleUploadPage from "@/pages/SingleUploadPage";
import BulkUploadPage from "@/pages/BulkUploadPage";
import DashboardPage from "@/pages/DashboardPage";
import ResultsPage from "@/pages/ResultsPage";
import BatchDashboardPage from "@/pages/BatchDashboardPage";
import AuthPage from "@/pages/AuthPage";
import PerformanceResultsPage from "@/pages/PerformanceResultsPage";
import ResumeBuilderGuidePage from "./pages/ResumeBuilderGuidePage";
import AdvancedDashboardPage from "@/pages/Advanceddashboardpage";


// Components
import ProtectedRoute from "@/components/ProtectedRoute";

function App() {
  return (
    <div className="App min-h-screen bg-background">
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />

          {/* Protected Routes */}
          <Route path="/performance" element={<ProtectedRoute><PerformanceResultsPage /></ProtectedRoute>} />
          <Route path="/single" element={<ProtectedRoute><SingleUploadPage /></ProtectedRoute>} />
          <Route path="/bulk" element={<ProtectedRoute><BulkUploadPage /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/dashboard/advanced" element={<ProtectedRoute><AdvancedDashboardPage /></ProtectedRoute>} />
          <Route path="/batch/:batchId" element={<ProtectedRoute><BatchDashboardPage /></ProtectedRoute>} />
          <Route path="/results/:resumeId" element={<ProtectedRoute><ResultsPage /></ProtectedRoute>} />
          <Route path="/resume-guide" element={<ProtectedRoute><ResumeBuilderGuidePage /></ProtectedRoute>} />
          

        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </div>
  );
}

export default App;
