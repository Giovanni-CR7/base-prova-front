import React from "react";
import ReactDOM from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import App from "./App.jsx";
import { config } from "./config.js";
import "./style.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Auth0Provider domain={config.domain} clientId={config.clientId}
      authorizationParams={{ redirect_uri: window.location.origin, audience: config.audience, scope: "openid profile email" }}>
      <App />
    </Auth0Provider>
  </React.StrictMode>
);
