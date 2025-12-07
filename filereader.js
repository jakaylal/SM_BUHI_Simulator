import fs from "fs";
import csv from "csv-parser";
import xlsx from "xlsx";

export function readFileContent(filePath) {
  return new Promise((resolve, reject) => {
    const ext = filePath.toLowerCase();

    if (ext.endsWith(".csv")) {
      const rows = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row) => rows.push(row))
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

        return resolve(`Excel Sheet: ${sheetName}\n${header}\n${separator}\n${body}`);
      } catch (err) {
        return reject(err);
      }
    }

    if (ext.endsWith(".pdf")) {
      fs.readFile(filePath, (err, data) => {
        if (err) return reject(err);

        pdf(data)
          .then((parsed) => resolve(parsed.text || "(Empty PDF)"))
          .catch(reject);
      });
      return;
    }

    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

