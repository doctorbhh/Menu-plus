import { useState, useEffect } from "react";
import FileUpload from "./components/FileUpload";
import MenuPreview from "./components/MenuPreview";
import LoginForm from "./components/LoginForm";
import {
  parseMenuExcel,
  downloadMenuJSON,
  copyToClipboard,
} from "./utils/excelParser";
import "./index.css";

// Empty for Vercel (relative paths), or 'http://localhost:3001' for local dev
const API_URL = "";

function App() {
  const [menuData, setMenuData] = useState(null);
  const [fileName, setFileName] = useState("");
  const [showJSON, setShowJSON] = useState(false);
  const [toast, setToast] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [apiStatus, setApiStatus] = useState(null);

  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");

  // Check for existing session on load
  useEffect(() => {
    const savedToken = localStorage.getItem("adminToken");
    const savedUsername = localStorage.getItem("adminUsername");

    if (savedToken && savedUsername) {
      // Verify token is still valid
      verifyToken(savedToken).then((valid) => {
        if (valid) {
          setToken(savedToken);
          setUsername(savedUsername);
          setIsLoggedIn(true);
        } else {
          localStorage.removeItem("adminToken");
          localStorage.removeItem("adminUsername");
        }
      });
    }
  }, []);

  const verifyToken = async (tokenToVerify) => {
    try {
      const response = await fetch(`${API_URL}/api/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", token: tokenToVerify }),
      });
      const data = await response.json();
      return data.valid;
    } catch {
      return false;
    }
  };

  const handleLogin = async (user, pass) => {
    const response = await fetch(`${API_URL}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", username: user, password: pass }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Login failed");
    }

    // Save to state and localStorage
    setToken(data.token);
    setUsername(data.username);
    setIsLoggedIn(true);
    localStorage.setItem("adminToken", data.token);
    localStorage.setItem("adminUsername", data.username);
    showToast(`Welcome back, ${data.username}! 👋`);
  };

  const handleRegister = async (user, pass) => {
    const response = await fetch(`${API_URL}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "register",
        username: user,
        password: pass,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Registration failed");
    }

    showToast("Account created! Please login. ✅");
  };

  const handleLogout = () => {
    setToken("");
    setUsername("");
    setIsLoggedIn(false);
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUsername");
    showToast("Logged out successfully 👋");
  };

  const handleFileLoaded = (arrayBuffer, name) => {
    try {
      const parsed = parseMenuExcel(arrayBuffer);
      setMenuData(parsed);
      setFileName(name);
      showToast("Menu parsed successfully! 🎉");
    } catch (error) {
      console.error("Parse error:", error);
      showToast("Error parsing file. Please check the format.");
    }
  };

  const handleDownload = () => {
    if (menuData) {
      const outputName =
        fileName.replace(/\.(xlsx|xls|csv)$/i, "") + "_menu.json";
      downloadMenuJSON(menuData, outputName);
      showToast("JSON file downloaded! 📥");
    }
  };

  const handleCopy = async () => {
    if (menuData) {
      await copyToClipboard(menuData);
      showToast("Copied to clipboard! 📋");
    }
  };

  const handlePublish = async () => {
    if (!menuData) return;

    setIsPublishing(true);
    try {
      const response = await fetch(`${API_URL}/api/menu`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(menuData),
      });

      const data = await response.json();

      if (response.ok) {
        setApiStatus("published");
        showToast("✅ Published to API! Flutter app can now fetch the menu.");
      } else {
        throw new Error(data.error || "Failed to publish");
      }
    } catch (error) {
      console.error("Publish error:", error);
      showToast(`❌ ${error.message}`);
      setApiStatus("error");
    } finally {
      setIsPublishing(false);
    }
  };

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 4000);
  };

  // Show login if not authenticated
  if (!isLoggedIn) {
    return (
      <div className="app">
        <header className="header">
          <h1>
            🍽️ <span>Menu+</span> Admin
          </h1>
          <span className="badge">v2.0</span>
        </header>
        <LoginForm onLogin={handleLogin} onRegister={handleRegister} />
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1>
          🍽️ <span>Menu+</span> Admin
        </h1>
        <div className="header-right">
          <span className="user-badge">👤 {username}</span>
          <button className="btn btn-small btn-outline" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Upload Section */}
      <section className="upload-section">
        <h2 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>
          📤 Upload Menu File
        </h2>
        <FileUpload onFileLoaded={handleFileLoaded} />
      </section>

      {/* Preview Section */}
      {menuData && (
        <section className="preview-section">
          <div className="preview-header">
            <h2>👁️ Menu Preview</h2>
            <div className="tab-buttons">
              <button
                className={`tab-btn ${!showJSON ? "active" : ""}`}
                onClick={() => setShowJSON(false)}
              >
                📊 Cards View
              </button>
              <button
                className={`tab-btn ${showJSON ? "active" : ""}`}
                onClick={() => setShowJSON(true)}
              >
                {"{ }"} JSON View
              </button>
            </div>
          </div>

          {showJSON ? (
            <pre className="json-preview">
              {JSON.stringify(menuData, null, 2)}
            </pre>
          ) : (
            <MenuPreview menuData={menuData} />
          )}

          {/* Export Actions */}
          <div className="export-section" style={{ marginTop: "1.5rem" }}>
            <button className="btn btn-primary" onClick={handleDownload}>
              📥 Download JSON
            </button>
            <button className="btn btn-secondary" onClick={handleCopy}>
              📋 Copy to Clipboard
            </button>
            <button
              className="btn btn-success"
              onClick={handlePublish}
              disabled={isPublishing}
            >
              {isPublishing ? "⏳ Publishing..." : "🚀 Publish to API"}
            </button>
          </div>

          {/* API Info */}
          <div
            style={{
              marginTop: "1.5rem",
              padding: "1rem",
              background:
                apiStatus === "published"
                  ? "rgba(34, 197, 94, 0.1)"
                  : "var(--bg-tertiary)",
              borderRadius: "0.5rem",
              border: `1px solid ${apiStatus === "published" ? "var(--accent-green)" : "var(--border-color)"}`,
            }}
          >
            <h4 style={{ color: "var(--accent-blue)", marginBottom: "0.5rem" }}>
              📡 API Endpoint
            </h4>
            <code
              style={{
                display: "block",
                background: "var(--bg-primary)",
                padding: "0.75rem",
                borderRadius: "4px",
                color: "var(--accent-green)",
                fontSize: "0.9rem",
              }}
            >
              GET https://your-app.vercel.app/api/menu
            </code>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.8rem",
                marginTop: "0.5rem",
              }}
            >
              {apiStatus === "published"
                ? "✅ Menu published! Update your Flutter app with the Vercel URL."
                : 'Click "Publish to API" to make menu available. Deploy to Vercel for permanent hosting.'}
            </p>
          </div>
        </section>
      )}

      {/* Toast Notification */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;
