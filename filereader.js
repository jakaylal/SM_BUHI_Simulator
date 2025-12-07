import fs from "fs";
import xlsx from "xlsx";

let csvParser = null;
let pdfParse = null;

try {
  csvParser = await import("csv-parser").then(m => m.default);
} catch {
  console.warn("csv-parser not installed — using fallback CSV parser.");
}

try {
  pdfParse = (await import("pdf-parse")).default;
} catch {
  console.warn("pdf-parse not installed — using fallback PDF parser.");
}

export function readFileContent(filePath) {
  return new Promise((resolve, reject) => {
    const ext = filePath.toLowerCase();

    if (ext.endsWith(".csv")) {
      if (csvParser) {
        const rows = [];
        fs.createReadStream(filePath)
          .pipe(csvParser())
          .on("data", row => rows.push(row))
          .on("end", () => {
            if (rows.length === 0) return resolve("(Empty CSV)");

            const header = Object.keys(rows[0]).join(" | ");
            const separator = header.split("|").map(() => "---").join("|");
            const body = rows.map(r => Object.values(r).join(" | ")).join("\n");

            resolve(`${header}\n${separator}\n${body}`);
          })
          .on("error", reject);
        return;
      }
      const text = fs.readFileSync(filePath, "utf8");
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return resolve("(Empty CSV)");

      const header = lines[0].split(",").join(" | ");
      const separator = header.split("|").map(() => "---").join("|");
      const body = lines.slice(1).map(l => l.split(",").join(" | ")).join("\n");

      return resolve(`${header}\n${separator}\n${body}`);
    }
    if (ext.endsWith(".xlsx") || ext.endsWith(".xls")) {
      try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = xlsx.utils.sheet_to_json(sheet);

        if (json.length === 0) return resolve("(Empty Excel file)");

        const header = Object.keys(json[0]).join(" | ");
        const separator = header.split("|").map(() => "---").join("|");
        const body = json.map(r => Object.values(r).join(" | ")).join("\n");

        return resolve(
          `Excel Sheet: ${sheetName}\n${header}\n${separator}\n${body}`
        );
      } catch (err) {
        return reject(err);
      }
    }
    if (ext.endsWith(".pdf")) {
      fs.readFile(filePath, async (err, data) => {
        if (err) return reject(err);
        if (pdfParse) {
          try {
            const parsed = await pdfParse(data);
            return resolve(parsed.text || "(Empty PDF)");
          } catch (e) {
            console.warn("Error parsing PDF with pdf-parse, using fallback:", e);
          }
        }
        return resolve(
          "PDF parsing library not installed — cannot extract full text.\n" +
          "Binary size: " + data.length + " bytes"
        );
      });

      return;
    }
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}
