import express from "express";
import bodyParser from "body-parser";
import path from "path";
import OpenAI from "openai";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import { readFileContent } from "./filereader.js";

dotenv.config();

const app = express();
const __dirname = path.resolve();

// OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Uploads directory
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// --------------------------------------------
// NEW SECTION ADDED: Load instruction files
// (txt, md, csv, xlsx, xls, pdf)
// --------------------------------------------
async function loadInstructionFilesWithContent() {
  const files = fs
    .readdirSync(instructionsDir)
    .filter(f => f.match(/\.(txt|md|csv|xlsx|xls|pdf)$/));

  const fileMap = {};

  for (const file of files) {
    const fullPath = path.join(instructionsDir, file);
    fileMap[file] = await readFileContent(fullPath);
  }

  return fileMap;
}


// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// ==========================
// DYNAMIC INSTRUCTIONS SYSTEM
// ==========================

// Instructions directory
const instructionsDir = path.join(__dirname, "instructions");
if (!fs.existsSync(instructionsDir)) fs.mkdirSync(instructionsDir);

// Load instruction files into memory
function loadInstructionFiles() {
  return fs.readdirSync(instructionsDir)
    .filter(f =>
      f.endsWith(".txt") ||
      f.endsWith(".md") ||
      f.endsWith(".csv") ||
      f.endsWith(".xlsx") ||
      f.endsWith(".xls") ||
      f.endsWith(".pdf")
    );
}

// Refresh on every request
let FILE_REFERENCES = loadInstructionFiles();

let chatHistory = [];

app.get("/", (req, res) => {
  res.render("index", {
    openaiResponse: null,
    error: null,
    chatHistory,
  });
});

app.post("/", upload.single("userFile"), async (req, res) => {
  let userPrompt = req.body.prompt?.trim();
  const uploadedFile = req.file;

  if (!userPrompt && !uploadedFile) {
    return res.render("index", {
      openaiResponse: null,
      error: "Please enter a message or upload a file.",
      chatHistory,
    });
  }

  try {
    let aiResponse = "";

    // Add user message to chat history (before AI response)
    chatHistory.push({ role: "user", text: userPrompt || "Uploaded a file" });

    // Handle uploaded file
    if (uploadedFile) {
      const fileText = await readFileContent(uploadedFile.path);

      aiResponse += `File "${uploadedFile.originalname}" uploaded successfully.\n\n`;
      aiResponse += `Extracted content:\n${fileText}\n\n`;

      // Add file text to user prompt
      userPrompt = userPrompt
        ? userPrompt + "\n\n" + fileText
        : fileText;

      // remove file from /uploads
      fs.unlink(uploadedFile.path, () => {});
    }

    // Reload instructions on every request
    FILE_REFERENCES = loadInstructionFiles();

    // SYSTEM PROMPT
    const SYSTEM_PROMPT = `
You are **BUHI's Elite Social Media Strategist & Simulation Analyst**.

You operate ONLY inside the BUHI simulation environment.

=====================
📌 AUTHORIZED DOCUMENTS  
You may ONLY use exact data found in the following uploaded instruction files:

${FILE_REFERENCES.map(f => `- ${f}`).join("\n")}

If a question cannot be answered using these files, respond EXACTLY with:
"I cannot answer that based on the provided documents. Could you provide more details or upload a relevant file?"

=====================
🔒 RULES  
- NO outside knowledge  
- NO assumptions  
- NO fabricated data  
- ALL insights must cite document text  

=====================
🎯 YOU CAN  
- Analyze CSV / Excel analytics  
- Interpret PDF and text instructions  
- Provide simulation-safe optimization  

=====================
🗣️ CONVERSATION STARTERS  
Hi! Welcome to the BUHI Social Media Simulation.  
Please provide:  
• Round Number  
• Impression Goal  
• Revenue Target  
• Max Budget  
(You may also upload documents or past posts.)
`;

    // FULL MESSAGE HISTORY
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...chatHistory.map(msg => ({
        role: msg.role,
        content: msg.text
      })),
      { role: "user", content: userPrompt }
    ];

    // AI COMPLETION
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages
    });

    const output = response.choices[0]?.message?.content || "(No output)";
    aiResponse += output;

    chatHistory.push({ role: "assistant", text: output });

    res.render("index", {
      openaiResponse: aiResponse,
      error: null,
      chatHistory,
    });

  } catch (err) {
    console.error("Error fetching AI response:", err);
    res.render("index", {
      openaiResponse: null,
      error: "Error fetching AI response: " + err.message,
      chatHistory,
    });
  }
});

app.post("/clear", (req, res) => {
  chatHistory = [];
  res.redirect("/");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Our app is running on port " + PORT));
