import React from "react";
import { createRoot } from "react-dom/client";
import AdminPage from "../../src/components/admin/AdminPage";
import { configureAuthAdapter } from "../../src/services/authClient";
import "../../src/index.css";

configureAuthAdapter({ getAccessToken: async () => "fixture-admin", getAuthStatus: () => ({ configured: true, signedIn: true, provider: "firebase", userId: "fixture-owner", email: "owner@example.com" }) });
createRoot(document.getElementById("root")!).render(<AdminPage />);
