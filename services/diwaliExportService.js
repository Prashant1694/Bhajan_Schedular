const XLSX = require("xlsx");
const PDFDocument = require("pdfkit");
const { getFlatBhajanRows, getFullSequences, getSingleSequence } = require("./diwaliService");

// Helper to auto-fit Excel column widths
function calculateColWidths(dataRows, headers) {
  const colWidths = headers.map(h => ({ wch: Math.max(h.length + 2, 10) }));
  for (const row of dataRows) {
    for (let c = 0; c < row.length; c++) {
      const val = row[c] !== null && row[c] !== undefined ? String(row[c]) : "";
      if (val.length + 2 > colWidths[c].wch) {
        colWidths[c].wch = Math.min(val.length + 3, 40); // cap max width
      }
    }
  }
  return colWidths;
}

// ============================================================
// 1. YEARLY DATA EXPORT (EXCEL)
// ============================================================

async function generateYearlyExcel(event, options = {}) {
  const category = options.category || "Both"; // "Gents", "Ladies", "Both"
  const wb = XLSX.utils.book_new();

  const headers = [
    "Sr.",
    "Name",
    "Lead Singer",
    "Partner",
    "Bhajan",
    "Scale",
    "Tabla Shruti",
    "Deity",
    "Remarks"
  ];

  function formatBhajanRow(sr, b) {
    const lead = b.participant?.lead_name || "";
    const partner = b.participant?.partner_name || "";
    const pairName = (lead && partner) ? `${lead} + ${partner}` : (lead || partner || "");
    return [
      sr,
      pairName,
      lead,
      partner,
      b.bhajan_title || "",
      b.scale || "",
      b.tabla || "",
      b.deity || "",
      b.remarks || ""
    ];
  }

  // 1. If Both, create a consolidated "Total Data" sheet (matching reference Excel)
  if (category === "Both") {
    const gentsBhajans = await getFlatBhajanRows(event.id, { gender: "Gents" });
    const ladiesBhajans = await getFlatBhajanRows(event.id, { gender: "Ladies" });

    const totalSheetData = [];
    totalSheetData.push([`DIWALI BHAJANS — ${event.name.toUpperCase()} (TOTAL YEARLY DATA)`]);
    totalSheetData.push([]);

    // Gents Section
    totalSheetData.push(["Gents"]);
    totalSheetData.push([]);
    totalSheetData.push(headers);
    let gSr = 1;
    for (const b of gentsBhajans) {
      totalSheetData.push(formatBhajanRow(gSr++, b));
    }

    // Space before Ladies
    totalSheetData.push([]);
    totalSheetData.push([]);

    // Ladies Section
    totalSheetData.push(["Ladies"]);
    totalSheetData.push([]);
    totalSheetData.push(headers);
    let lSr = 1;
    for (const b of ladiesBhajans) {
      totalSheetData.push(formatBhajanRow(lSr++, b));
    }

    const wsTotal = XLSX.utils.aoa_to_sheet(totalSheetData);
    wsTotal["!cols"] = calculateColWidths(totalSheetData.slice(4), headers);
    XLSX.utils.book_append_sheet(wb, wsTotal, "Total Data");
  }

  // 2. Individual Category Sheets
  async function createCategorySheet(genderName) {
    const bhajans = await getFlatBhajanRows(event.id, { gender: genderName });
    const sheetData = [];

    sheetData.push([`DIWALI BHAJANS — ${event.name.toUpperCase()} (${genderName.toUpperCase()})`]);
    sheetData.push([]);
    sheetData.push(headers);

    let sr = 1;
    for (const b of bhajans) {
      sheetData.push(formatBhajanRow(sr++, b));
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws["!cols"] = calculateColWidths(sheetData.slice(2), headers);
    XLSX.utils.book_append_sheet(wb, ws, genderName);
  }

  if (category === "Gents" || category === "Both") {
    await createCategorySheet("Gents");
  }
  if (category === "Ladies" || category === "Both") {
    await createCategorySheet("Ladies");
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

// ============================================================
// 2. YEARLY DATA EXPORT (PDF)
// ============================================================

async function generateYearlyPdf(event, options = {}) {
  const category = options.category || "Both";

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margins: { top: 30, bottom: 30, left: 30, right: 30 }
      });

      const buffers = [];
      doc.on("data", b => buffers.push(b));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const renderHeader = (sectionTitle) => {
        doc.fontSize(16).fillColor("#7d2f45").font("Helvetica-Bold")
          .text(`DIWALI BHAJANS — ${event.name.toUpperCase()}`, { align: "center" });
        doc.moveDown(0.2);
        doc.fontSize(12).fillColor("#d98a2b").font("Helvetica-Bold")
          .text(sectionTitle, { align: "center" });
        doc.moveDown(0.5);
      };

      const renderTable = (rows, sectionTitle) => {
        renderHeader(sectionTitle);

        const colX = [30, 65, 175, 285, 485, 550, 630, 700];
        const colWidths = [35, 110, 110, 200, 65, 80, 70, 80];
        const colHeaders = ["Sr.", "Lead Singer", "Partner", "Bhajan", "Scale", "Tabla Shruti", "Deity", "Remarks"];

        // Header row
        doc.rect(30, doc.y, 750, 20).fill("#f8f4ed");
        doc.fillColor("#221e2a").font("Helvetica-Bold").fontSize(9);

        let curY = doc.y + 5;
        for (let i = 0; i < colHeaders.length; i++) {
          doc.text(colHeaders[i], colX[i] + 2, curY, { width: colWidths[i] - 4, ellipsis: true });
        }

        doc.y += 20;
        doc.font("Helvetica").fontSize(8.5);

        let sr = 1;
        for (const b of rows) {
          if (doc.y > 520) {
            doc.addPage();
            renderHeader(sectionTitle + " (Continued)");
            doc.rect(30, doc.y, 750, 20).fill("#f8f4ed");
            doc.fillColor("#221e2a").font("Helvetica-Bold").fontSize(9);
            curY = doc.y + 5;
            for (let i = 0; i < colHeaders.length; i++) {
              doc.text(colHeaders[i], colX[i] + 2, curY, { width: colWidths[i] - 4, ellipsis: true });
            }
            doc.y += 20;
            doc.font("Helvetica").fontSize(8.5);
          }

          const rowY = doc.y;
          // alternating line background
          if (sr % 2 === 0) {
            doc.rect(30, rowY - 2, 750, 18).fill("#fcfbf8");
          }

          doc.fillColor("#221e2a");
          doc.text(String(sr++), colX[0] + 2, rowY, { width: colWidths[0] - 4 });
          doc.text(b.participant?.lead_name || "-", colX[1] + 2, rowY, { width: colWidths[1] - 4, ellipsis: true });
          doc.text(b.participant?.partner_name || "-", colX[2] + 2, rowY, { width: colWidths[2] - 4, ellipsis: true });
          doc.font("Helvetica-Bold").text(b.bhajan_title || "-", colX[3] + 2, rowY, { width: colWidths[3] - 4, ellipsis: true }).font("Helvetica");
          doc.text(b.scale || "-", colX[4] + 2, rowY, { width: colWidths[4] - 4, ellipsis: true });
          doc.text(b.tabla || "-", colX[5] + 2, rowY, { width: colWidths[5] - 4, ellipsis: true });
          doc.text(b.deity || "-", colX[6] + 2, rowY, { width: colWidths[6] - 4, ellipsis: true });
          doc.text(b.remarks || "", colX[7] + 2, rowY, { width: colWidths[7] - 4, ellipsis: true });

          // horizontal border
          doc.strokeColor("#e7e0d2").lineWidth(0.5).moveTo(30, rowY + 16).lineTo(780, rowY + 16).stroke();
          doc.y = rowY + 18;
        }
      };

      if (category === "Gents" || category === "Both") {
        const gentsRows = await getFlatBhajanRows(event.id, { gender: "Gents" });
        renderTable(gentsRows, "GENTS AUDITIONS & SELECTED BHAJANS");
      }

      if (category === "Both") {
        doc.addPage();
      }

      if (category === "Ladies" || category === "Both") {
        const ladiesRows = await getFlatBhajanRows(event.id, { gender: "Ladies" });
        renderTable(ladiesRows, "LADIES AUDITIONS & SELECTED BHAJANS");
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ============================================================
// 3. SEQUENCE EXPORT (EXCEL)
// ============================================================

async function generateSequenceExcel(event, options = {}) {
  const wb = XLSX.utils.book_new();
  const sequenceId = options.sequenceId; // if specific sequence, else all
  const category = options.category || "Both";

  let sequences = [];
  if (sequenceId) {
    const single = await getSingleSequence(sequenceId);
    if (single) sequences.push(single);
  } else {
    sequences = await getFullSequences(event.id);
  }

  const headers = [
    "Sr.",
    "Sequence",
    "Gender",
    "Lead Singer",
    "Partner",
    "Bhajan",
    "Scale",
    "Tabla Shruti",
    "Deity",
    "Remarks"
  ];

  for (const seq of sequences) {
    const sheetData = [];
    const dateStr = seq.assigned_date ? ` (Date: ${seq.assigned_date})` : "";
    sheetData.push([`DIWALI BHAJANS — ${event.name.toUpperCase()} — SEQUENCE ${seq.sequence_number}${dateStr}`]);
    sheetData.push([]);
    sheetData.push(headers);

    let filteredEntries = seq.entries || [];
    if (category === "Gents") {
      filteredEntries = filteredEntries.filter(e => e.participantBhajan?.participant?.gender === "Gents");
    } else if (category === "Ladies") {
      filteredEntries = filteredEntries.filter(e => e.participantBhajan?.participant?.gender === "Ladies");
    }

    let sr = 1;
    for (const entry of filteredEntries) {
      const b = entry.participantBhajan || {};
      const p = b.participant || {};
      sheetData.push([
        sr++,
        `Seq ${seq.sequence_number}`,
        p.gender || "",
        p.lead_name || "",
        p.partner_name || "",
        b.bhajan_title || "",
        b.scale || "",
        b.tabla || "",
        b.deity || "",
        b.remarks || ""
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws["!cols"] = calculateColWidths(sheetData.slice(2), headers);
    const sheetName = `Sequence ${seq.sequence_number}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  if (sequences.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([
      [`DIWALI BHAJANS — ${event.name.toUpperCase()}`],
      [],
      ["No sequences have been generated yet. Please click 'Make Sequence' on the dashboard first."]
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Notice");
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

// ============================================================
// 4. SEQUENCE EXPORT (PDF)
// ============================================================

async function generateSequencePdf(event, options = {}) {
  const sequenceId = options.sequenceId;
  const category = options.category || "Both";

  let sequences = [];
  if (sequenceId) {
    const single = await getSingleSequence(sequenceId);
    if (single) sequences.push(single);
  } else {
    sequences = await getFullSequences(event.id);
  }

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margins: { top: 30, bottom: 30, left: 30, right: 30 }
      });

      const buffers = [];
      doc.on("data", b => buffers.push(b));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const colX = [30, 65, 175, 285, 485, 550, 630, 700];
      const colWidths = [35, 110, 110, 200, 65, 80, 70, 80];
      const colHeaders = ["Sr.", "Lead Singer", "Partner", "Bhajan", "Scale", "Tabla Shruti", "Deity", "Remarks"];

      const renderTableHeader = () => {
        doc.rect(30, doc.y, 750, 20).fill("#f8f4ed");
        doc.fillColor("#221e2a").font("Helvetica-Bold").fontSize(9);
        const curY = doc.y + 5;
        for (let i = 0; i < colHeaders.length; i++) {
          doc.text(colHeaders[i], colX[i] + 2, curY, { width: colWidths[i] - 4, ellipsis: true });
        }
        doc.y += 20;
        doc.font("Helvetica").fontSize(8.5);
      };

      if (sequences.length === 0) {
        doc.fontSize(16).fillColor("#7d2f45").font("Helvetica-Bold")
          .text(`DIWALI BHAJANS — ${event.name.toUpperCase()}`, { align: "center" });
        doc.moveDown(1);
        doc.fontSize(12).fillColor("#666666").font("Helvetica")
          .text("No sequences have been generated yet for this Diwali event.", { align: "center" });
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor("#999999")
          .text("Please click 'Make Sequence' on the dashboard first to create fair sequences.", { align: "center" });
        doc.end();
        return;
      }

      for (let sIdx = 0; sIdx < sequences.length; sIdx++) {
        const seq = sequences[sIdx];
        if (sIdx > 0) doc.addPage();

        // Sequence Header
        doc.fontSize(16).fillColor("#7d2f45").font("Helvetica-Bold")
          .text(`DIWALI BHAJANS — ${event.name.toUpperCase()}`, { align: "center" });
        doc.moveDown(0.2);

        const dateText = seq.assigned_date ? `  |  Date: ${seq.assigned_date}` : "";
        doc.fontSize(13).fillColor("#d98a2b").font("Helvetica-Bold")
          .text(`SEQUENCE ${seq.sequence_number}${dateText}`, { align: "center" });
        doc.moveDown(0.5);

        let entries = seq.entries || [];
        if (category === "Gents") {
          entries = entries.filter(e => e.participantBhajan?.participant?.gender === "Gents");
        } else if (category === "Ladies") {
          entries = entries.filter(e => e.participantBhajan?.participant?.gender === "Ladies");
        }

        renderTableHeader();

        let sr = 1;
        for (const entry of entries) {
          if (doc.y > 520) {
            doc.addPage();
            doc.fontSize(12).fillColor("#7d2f45").font("Helvetica-Bold")
              .text(`SEQUENCE ${seq.sequence_number} (Continued)`, { align: "center" });
            doc.moveDown(0.3);
            renderTableHeader();
          }

          const b = entry.participantBhajan || {};
          const p = b.participant || {};
          const rowY = doc.y;

          if (sr % 2 === 0) {
            doc.rect(30, rowY - 2, 750, 18).fill("#fcfbf8");
          }

          doc.fillColor("#221e2a");
          doc.text(String(sr++), colX[0] + 2, rowY, { width: colWidths[0] - 4 });
          doc.text(p.lead_name || "-", colX[1] + 2, rowY, { width: colWidths[1] - 4, ellipsis: true });
          doc.text(p.partner_name || "-", colX[2] + 2, rowY, { width: colWidths[2] - 4, ellipsis: true });
          doc.font("Helvetica-Bold").text(b.bhajan_title || "-", colX[3] + 2, rowY, { width: colWidths[3] - 4, ellipsis: true }).font("Helvetica");
          doc.text(b.scale || "-", colX[4] + 2, rowY, { width: colWidths[4] - 4, ellipsis: true });
          doc.text(b.tabla || "-", colX[5] + 2, rowY, { width: colWidths[5] - 4, ellipsis: true });
          doc.text(b.deity || "-", colX[6] + 2, rowY, { width: colWidths[6] - 4, ellipsis: true });
          doc.text(b.remarks || "", colX[7] + 2, rowY, { width: colWidths[7] - 4, ellipsis: true });

          doc.strokeColor("#e7e0d2").lineWidth(0.5).moveTo(30, rowY + 16).lineTo(780, rowY + 16).stroke();
          doc.y = rowY + 18;
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateYearlyExcel,
  generateYearlyPdf,
  generateSequenceExcel,
  generateSequencePdf
};
