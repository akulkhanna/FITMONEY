import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import dotenv from "dotenv";
import { google } from "googleapis";


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Trust proxy for correct protocol/host detection
app.set('trust proxy', true);

// Middleware
app.use(cors());
app.use(express.json());

// Google OAuth Setup
const getOrigin = (req: express.Request) => {
  // Prioritize APP_URL from environment if available
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, "");
  }
  
  // Fallback to request headers (trusting proxy)
  const host = req.get('host');
  const protocol = req.protocol;
  return `${protocol}://${host}`;
};

const getOAuthClient = (origin: string) => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${origin}/auth/callback`
  );
};



// --- API Routes ---

// 1. Auth URL
app.get("/api/auth/url", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("CRITICAL: Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    return res.status(500).json({ 
      error: "Google OAuth credentials are not configured.",
      details: "Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the environment variables in AI Studio Settings." 
    });
  }

  const origin = getOrigin(req);
  const oauth2Client = getOAuthClient(origin);
  
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ],
    prompt: "consent",
  });
  res.json({ url });
});

// Debug endpoint for Redirect URI
app.get("/api/debug/auth", (req, res) => {
  const origin = getOrigin(req);
  res.json({ 
    origin,
    redirect_uri: `${origin}/auth/callback`,
    protocol: req.protocol,
    host: req.get('host'),
    headers: req.headers
  });
});

// 2. Auth Callback
app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  const origin = getOrigin(req);
  const oauth2Client = getOAuthClient(origin);
  
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);
    
    // Verify the user email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    if (userInfo.data.email !== "akulkhanna81304@gmail.com") {
      return res.status(403).send(`
        <html>
          <body style="background: #0A0A0A; color: white; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
            <div style="text-align: center; max-width: 400px; padding: 40px; border-radius: 24px; background: #111;">
              <h1 style="margin: 0 0 16px; font-size: 24px;">Access Denied</h1>
              <p style="color: #888; margin: 0 0 24px; line-height: 1.5;">This application is restricted to the owner only. Your account (${userInfo.data.email}) is not authorized.</p>
              <button onclick="window.close()" style="background: white; color: black; border: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; cursor: pointer;">Close Window</button>
            </div>
          </body>
        </html>
      `);
    }

    // In a real app, you'd store tokens in Firestore
    // For now, we'll send a success message to the parent window
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("OAuth Error:", error);
    res.status(500).send("Authentication failed.");
  }
});

// 3. Webhook for Logging (The "Free Bank Sync" Endpoint)
app.get("/api/transactions", async (req, res) => {
  const { sheetId, tokens } = req.query;

  if (!tokens || !sheetId) {
    return res.status(400).json({ error: "Missing authentication or sheet ID" });
  }

  try {
    const origin = getOrigin(req);
    const oauth2Client = getOAuthClient(origin);
    oauth2Client.setCredentials(JSON.parse(tokens as string));
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId as string,
      range: "Sheet1!A:E",
    });

    const rows = response.data.values || [];
    const transactions = rows.slice(1).map((row, index) => ({
      id: index,
      date: row[0],
      merchant: row[1],
      amount: parseFloat(row[2]) || 0,
      category: row[3],
      type: row[4],
    })).reverse(); // Newest first

    res.json({ transactions });
  } catch (error) {
    console.error("Fetch Transactions Error:", error);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

app.post("/api/log", async (req, res) => {
  const { logData, sheetId, tokens } = req.body;

  if (!tokens || !sheetId || !logData) {
    return res.status(400).json({ error: "Missing authentication, sheet ID, or log data" });
  }

  try {
    const origin = getOrigin(req);
    const oauth2Client = getOAuthClient(origin);
    oauth2Client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });

    // Append to Google Sheet (Date, Merchant, Amount, Category, Type)
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "Sheet1!A:E",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[logData.date, logData.merchant, logData.amount, logData.category, logData.type]],
      },
    });

    res.json({ success: true, data: logData });
  } catch (error) {
    console.error("Logging Error:", error);
    res.status(500).json({ error: "Failed to log transaction" });
  }
});

// 4. Config Persistence (Pro Features)
app.get("/api/config", async (req, res) => {
  const { sheetId, tokens } = req.query;

  if (!tokens || !sheetId) {
    return res.status(400).json({ error: "Missing authentication or sheet ID" });
  }

  try {
    const origin = getOrigin(req);
    const oauth2Client = getOAuthClient(origin);
    oauth2Client.setCredentials(JSON.parse(tokens as string));
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });

    // Try to get data from "TapSheet_Config" sheet
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId as string,
        range: "TapSheet_Config!A1",
      });

      const configJson = response.data.values?.[0]?.[0];
      if (configJson) {
        return res.json({ config: JSON.parse(configJson) });
      }
    } catch (e: any) {
      // If sheet doesn't exist, we'll create it later when saving
      if (e.code !== 404 && !e.message.includes('range')) {
        console.error("Config Load Error:", e);
      }
    }

    res.json({ config: null });
  } catch (error) {
    console.error("Fetch Config Error:", error);
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

app.post("/api/config", async (req, res) => {
  const { config, sheetId, tokens } = req.body;

  if (!tokens || !sheetId || !config) {
    return res.status(400).json({ error: "Missing authentication, sheet ID, or config" });
  }

  try {
    const origin = getOrigin(req);
    const oauth2Client = getOAuthClient(origin);
    oauth2Client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });

    // 1. Ensure "TapSheet_Config" sheet exists
    try {
      await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    } catch (e) {
      console.error("Spreadsheet access error:", e);
      return res.status(500).json({ error: "Cannot access spreadsheet" });
    }

    // Check if sheet exists, if not create it
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetExists = spreadsheet.data.sheets?.some(s => s.properties?.title === "TapSheet_Config");

    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: { title: "TapSheet_Config" }
            }
          }]
        }
      });
    }

    // 2. Save config as JSON in A1
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "TapSheet_Config!A1",
      valueInputOption: "RAW",
      requestBody: {
        values: [[JSON.stringify(config)]],
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Save Config Error:", error);
    res.status(500).json({ error: "Failed to save config" });
  }
});

// --- Vite Integration ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
