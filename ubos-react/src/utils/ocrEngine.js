import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerRaw from 'pdfjs-dist/build/pdf.worker.min.mjs?raw';
import { createWorker } from 'tesseract.js';

// Create an in-memory Blob URL for PDF.js worker with explicit application/javascript MIME type
let workerBlobUrl = null;
try {
  const blob = new Blob([pdfWorkerRaw], { type: 'application/javascript' });
  workerBlobUrl = URL.createObjectURL(blob);
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerBlobUrl;
} catch (e) {
  console.warn("Utilisation de la configuration worker par défaut:", e);
}

/**
 * Intelligent regex parser for Invoices, Customs DUMs, BLs, and Packing Lists
 */
export function extraireChampsMetier(text) {
  const fields = {
    numeroFacture: '',
    dateDoc: '',
    montantHT: '',
    montantTVA: '',
    montantTTC: '',
    ice: '',
    fournisseur: '',
    client: '',
    telephone: '',
    blNumber: '',
    conteneur: ''
  };

  if (!text) return fields;

  // 1. Facture / Devis N°
  const matchDevis = text.match(/(?:devis|facture|invoice|n[°o]|fac|inv)[^\w]*([a-z0-9\-\/]{3,25})/i);
  if (matchDevis) fields.numeroFacture = matchDevis[1].trim();

  // 2. Nom du Client
  const matchClient = text.match(/(?:nom\s*du\s*client|client)[^\:\n]*\:\s*([^\n\r]+)/i);
  if (matchClient) fields.client = matchClient[1].trim();

  // 3. Contact / Téléphone
  const matchTel = text.match(/(?:contact|t[éel]*phone|t[éel]*)[^\:\n]*\:\s*([\+\d\s\-\.]{8,20})/i);
  if (matchTel) fields.telephone = matchTel[1].trim();

  // 4. Date (DD/MM/YYYY or YYYY-MM-DD)
  const matchDate = text.match(/(?:date)[^\:\n]*\:\s*(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/i) || text.match(/(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/);
  if (matchDate) fields.dateDoc = matchDate[1];

  // 5. ICE (15 digits in Morocco)
  const matchIce = text.match(/ICE[^\d]*(\d{15})/i);
  if (matchIce) fields.ice = matchIce[1];

  // 6. Montant TTC (Total MAD / DH)
  const matchTTC = text.match(/(?:total\s*ttc|montant\s*ttc|net\s*a\s*payer|total\s*due)[^\d]*([\d\s\,\.]+)/i) 
    || text.match(/([\d\s\,\.]{4,15})\s*MAD/i);
  if (matchTTC) fields.montantTTC = matchTTC[1].replace(/\s/g, '').replace(',', '.');

  // 7. Montant HT
  const matchHT = text.match(/(?:total\s*ht|montant\s*ht|subtotal)[^\d]*([\d\s\,\.]+)/i);
  if (matchHT) fields.montantHT = matchHT[1].replace(/\s/g, '').replace(',', '.');

  // 8. TVA
  const matchTVA = text.match(/(?:tva|vat)[^\d]*([\d\s\,\.]+)/i);
  if (matchTVA) fields.montantTVA = matchTVA[1].replace(/\s/g, '').replace(',', '.');

  // 9. BL / Conteneur
  const matchBL = text.match(/(?:b\/l|bl\s*n[°o]|bill\s*of\s*lading)[^\w]*([a-z0-9]{6,16})/i);
  if (matchBL) fields.blNumber = matchBL[1];

  const matchCont = text.match(/([a-z]{4}\d{7})/i);
  if (matchCont) fields.conteneur = matchCont[1];

  return fields;
}

/**
 * Real Optical Character Recognition (OCR) Engine using Tesseract.js
 * Extracts raw text from images (JPG, PNG, WEBP).
 */
export async function effectuerOCRImage(file, onProgress) {
  try {
    const worker = await createWorker('fra+eng');
    
    const imageUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    if (onProgress) onProgress(30, "Lancement du moteur OCR Tesseract...");

    const ret = await worker.recognize(imageUrl);
    await worker.terminate();

    const rawText = ret.data.text || '';
    if (onProgress) onProgress(100, "Extraction OCR terminée.");

    const parsedFields = extraireChampsMetier(rawText);

    return {
      success: true,
      text: rawText,
      confidence: ret.data.confidence || 85,
      parsedFields
    };
  } catch (error) {
    console.error("Erreur OCR Tesseract:", error);
    return {
      success: false,
      text: "",
      error: error.message || "Échec de l'OCR sur l'image"
    };
  }
}

/**
 * Real Optical Character Recognition (OCR) on Scanned PDF Files
 * Renders PDF pages to Canvas and runs Tesseract OCR per page.
 */
export async function effectuerOCRPdf(file, onProgress) {
  try {
    if (onProgress) onProgress(15, "Chargement et découpage des pages du PDF...");
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let combinedText = '';
    const worker = await createWorker('fra+eng');

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      if (onProgress) {
        const pct = Math.floor(20 + (pageNum / pdf.numPages) * 75);
        onProgress(pct, `Reconnaissance OCR Tesseract sur la page ${pageNum}/${pdf.numPages}...`);
      }
      
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;
      const imageUrl = canvas.toDataURL('image/png');

      const ret = await worker.recognize(imageUrl);
      if (ret.data && ret.data.text) {
        combinedText += `\n--- PAGE ${pageNum} ---\n` + ret.data.text;
      }
    }

    await worker.terminate();
    if (onProgress) onProgress(100, "OCR du PDF terminé avec succès !");

    const parsedFields = extraireChampsMetier(combinedText);

    return {
      success: true,
      text: combinedText,
      parsedFields
    };
  } catch (error) {
    console.error("Erreur OCR PDF Scanné:", error);
    return {
      success: false,
      text: "Impossible d'effectuer l'OCR sur ce PDF : " + (error.message || "Fichier invalide"),
      error: error.message
    };
  }
}
