// ResumePreviewModal.jsx
// Drop this file anywhere in your components folder and import from both dashboards.
// Usage:
//   <ResumePreviewModal resumeId={id} candidateName={name} onClose={() => setPreviewId(null)} />

import { useState, useEffect } from "react";
import { X, FileText, Download, Loader2, AlertCircle, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import axiosInstance from "../utils/axiosInstance";
import authUtils from "@/utils/authUtils";

const ResumePreviewModal = ({ resumeId, candidateName, filename, onClose }) => {
  const [status, setStatus] = useState("loading"); // loading | ready | error | unavailable
  const [objectUrl, setObjectUrl] = useState(null);
  const [isPdf, setIsPdf] = useState(false);
  const [textContent, setTextContent] = useState("");
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    if (!resumeId) return;
    let blobUrl = null;

    const load = async () => {
      setStatus("loading");
      try {
        const res = await axiosInstance.get(
          `/api/resume/${resumeId}/file?user_id=${authUtils.getUserId() || ""}`,
          { responseType: "blob" }
        );
        const mime = res.headers["content-type"] || "";
        const isPdfFile = mime.includes("pdf") || filename?.toLowerCase().endsWith(".pdf");
        setIsPdf(isPdfFile);

        if (isPdfFile) {
          blobUrl = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
          setObjectUrl(blobUrl);
          setStatus("ready");
        } else {
          // DOCX — extract text via FileReader (browser can't render DOCX natively)
          const blob = new Blob([res.data]);
          const reader = new FileReader();
          reader.onload = () => {
            // For DOCX we show the resume_text we already have — see fallback below
            // This branch just signals the file exists
            setStatus("docx");
          };
          reader.readAsArrayBuffer(blob);
        }
      } catch (err) {
        if (err.response?.status === 404) {
          setStatus("unavailable");
        } else {
          setStatus("error");
        }
      }
    };

    load();
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [resumeId, filename]);

  const handleDownload = async () => {
    try {
      const res = await axiosInstance.get(
        `/api/resume/${resumeId}/file?user_id=${authUtils.getUserId() || ""}`,
        { responseType: "blob" }
      );
      const mime = res.headers["content-type"] || "application/octet-stream";
      const url = URL.createObjectURL(new Blob([res.data], { type: mime }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "resume";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: "min(90vw, 960px)", height: "90vh" }}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F0FDF4] flex items-center justify-center">
              <FileText className="w-5 h-5 text-[#1A4D2E]" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 font-['Outfit'] text-base leading-tight">
                {candidateName || "Resume Preview"}
              </h2>
              {filename && (
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[300px]">{filename}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Zoom controls – PDF only */}
            {status === "ready" && isPdf && (
              <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 mr-1">
                <button onClick={() => setZoom(z => Math.max(50, z - 10))}
                  className="p-0.5 hover:text-[#1A4D2E] transition-colors text-gray-500" title="Zoom out">
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium text-gray-600 w-10 text-center">{zoom}%</span>
                <button onClick={() => setZoom(z => Math.min(200, z + 10))}
                  className="p-0.5 hover:text-[#1A4D2E] transition-colors text-gray-500" title="Zoom in">
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button onClick={() => setZoom(100)}
                  className="p-0.5 hover:text-[#1A4D2E] transition-colors text-gray-500 ml-0.5" title="Reset zoom">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <button onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-[#1A4D2E] hover:text-[#1A4D2E] transition-all">
              <Download className="w-3.5 h-3.5" />Download
            </button>
            <button onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-hidden bg-[#F3F4F6] relative">

          {/* Loading */}
          {status === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-10 h-10 text-[#1A4D2E] animate-spin" />
              <p className="text-sm text-gray-500">Loading original resume...</p>
            </div>
          )}

          {/* PDF viewer */}
          {status === "ready" && isPdf && objectUrl && (
            <div className="w-full h-full overflow-auto flex justify-center bg-[#525659] p-4">
              <iframe
                src={`${objectUrl}#zoom=${zoom}`}
                title="Resume PDF"
                style={{
                  width: `${zoom}%`,
                  minWidth: "600px",
                  height: "100%",
                  border: "none",
                  borderRadius: 4,
                  boxShadow: "0 4px 24px rgba(0,0,0,.3)",
                  background: "white",
                }}
              />
            </div>
          )}

          {/* DOCX — not renderable natively; show rich text display from resume_text */}
          {status === "docx" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
                <FileText className="w-8 h-8 text-blue-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 mb-1">DOCX File Preview</p>
                <p className="text-sm text-gray-500 max-w-sm">
                  Word documents can't be rendered directly in the browser. Download the original file to view it in Microsoft Word or Google Docs.
                </p>
              </div>
              <button onClick={handleDownload}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#1A4D2E] text-white text-sm font-semibold hover:bg-[#14532D] transition-colors">
                <Download className="w-4 h-4" />Download Original DOCX
              </button>
            </div>
          )}

          {/* Unavailable — file predates storage feature */}
          {status === "unavailable" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-amber-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 mb-1">Original File Not Available</p>
                <p className="text-sm text-gray-500 max-w-sm">
                  This resume was uploaded before file storage was enabled. Only the extracted text and analysis data were saved. Re-upload the file to enable preview.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <p className="font-semibold text-gray-800">Failed to Load File</p>
              <p className="text-sm text-gray-500 max-w-sm">Could not fetch the original resume file. Check your connection and try again.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResumePreviewModal;