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

export const LANGUES_OCR = [
  { value: 'fra+eng', label: 'Français + Anglais (recommandé)' },
  { value: 'fra', label: 'Français uniquement' },
  { value: 'eng', label: 'Anglais uniquement' },
  { value: 'ara+fra', label: 'Arabe + Français' }
];
export const LANGUE_OCR_DEFAUT = 'fra+eng';

/**
 * Shared Tesseract worker pool — avoids paying the ~1-2s worker init cost on
 * every OCR click. Reinitialized only when the requested language changes.
 */
let sharedWorker = null;
let sharedWorkerLang = null;

async function getWorker(lang) {
  if (sharedWorker && sharedWorkerLang === lang) return sharedWorker;
  if (sharedWorker) {
    await sharedWorker.terminate();
    sharedWorker = null;
  }
  sharedWorker = await createWorker(lang);
  sharedWorkerLang = lang;
  return sharedWorker;
}

export async function terminerMoteurOCR() {
  if (sharedWorker) {
    await sharedWorker.terminate();
    sharedWorker = null;
    sharedWorkerLang = null;
  }
}

/**
 * Grayscale + min/max contrast stretch, applied in-place on canvas pixel data.
 * A simple, well-established preprocessing step that measurably improves
 * Tesseract accuracy on low-contrast scans/photos (e.g. phone photos of invoices).
 */
function appliquerContrasteCanvas(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const n = data.length / 4;
  const gray = new Float32Array(n);
  let min = 255, max = 0;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const g = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    gray[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }

  const range = Math.max(max - min, 1);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const stretched = ((gray[i] - min) / range) * 255;
    data[o] = data[o + 1] = data[o + 2] = stretched;
  }

  ctx.putImageData(imageData, 0, 0);
}

function pretraiterImage(imageUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        appliquerContrasteCanvas(ctx, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        resolve(imageUrl); // preprocessing failure shouldn't block OCR — fall back to the original
      }
    };
    img.onerror = () => resolve(imageUrl);
    img.src = imageUrl;
  });
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
    produit: '',
    quantite: '',
    blNumber: '',
    conteneur: ''
  };

  if (!text) return fields;

  // 1. Facture / Devis N° (e.g. IMDA8224-0826)
  const matchDevis = text.match(/(?:devis|facture|invoice|inv|fac)[\s\:\.\°Nn]*([A-Z0-9\-\/]{4,25})/i) || text.match(/(?:n[°o])[\s\:\.]*([A-Z0-9\-\/]{4,25})/i);
  if (matchDevis) fields.numeroFacture = matchDevis[1].trim();

  // 2. Nom du Client (e.g. Salaheddin el hajjaji) & Code Client (e.g. 0826IM9402)
  const matchCodeClient = text.match(/(?:client\s*n[°o]|code\s*client)[^\:\n]*\:\s*([A-Z0-9]{4,16})/i);
  if (matchCodeClient) {
    fields.codeClient = matchCodeClient[1].replace(/(?:DATE|CIN|SERVICE).*$/i, '').trim();
  }

  const matchClient = text.match(/(?:nom\s*du\s*client|client)[^\:\n]*\:\s*([^\n\r]+)/i);
  if (matchClient) {
    fields.client = matchClient[1].replace(/(?:CIN|SERVICE|DGI|Contact).*$/i, '').trim();
  }

  // 3. Contact / Téléphone (e.g. +33 6 17 84 90 87)
  const matchTel = text.match(/(?:contact|t[éel]*phone|t[éel]*)[^\:\n]*\:\s*([\+\d\s\-\.]{8,22})/i);
  if (matchTel) fields.telephone = matchTel[1].trim();

  // 4. Date (e.g. 03/08/2026)
  const matchDate = text.match(/(?:date)[^\:\n]*\:\s*(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/i) || text.match(/(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/);
  if (matchDate) fields.dateDoc = matchDate[1];

  // 5. ICE (15 digits in Morocco: 003311826000051)
  const matchIce = text.match(/ICE[^\d]*(\d{15})/i);
  if (matchIce) fields.ice = matchIce[1];

  // 6. Produit & Quantité (e.g. Brosse lissante... 306 PCS)
  const matchProd = text.match(/(brosse[^\n\r]*|\w+\s+lissante[^\n\r]*)/i);
  if (matchProd) fields.produit = matchProd[1].trim();

  const matchQte = text.match(/(\d+)\s*(?:PCS|PIECES|UNITE|KG)/i);
  if (matchQte) fields.quantite = matchQte[1];

  // 7. Montants MAD — prefer an explicitly labeled total over guessing from
  // the raw list of amounts on the page (a "biggest number = total" heuristic
  // misreads any document where a line item's subtotal exceeds the real total).
  const matchTTCExplicit = text.match(/(?:total\s*ttc|toutes\s*taxes\s*comprises|net\s*[aà]\s*payer|montant\s*total)[^\d]{0,15}([\d\s]{1,10}[,.]\d{2})/i);
  if (matchTTCExplicit) {
    const val = parseFloat(matchTTCExplicit[1].replace(/\s/g, '').replace(',', '.'));
    if (!isNaN(val)) fields.montantTTC = val.toFixed(2);
  }

  const matchHTExplicit = text.match(/(?:total\s*ht|montant\s*ht|sous[\s\-]total)[^\d]{0,15}([\d\s]{1,10}[,.]\d{2})/i);
  if (matchHTExplicit) {
    const val = parseFloat(matchHTExplicit[1].replace(/\s/g, '').replace(',', '.'));
    if (!isNaN(val)) fields.montantHT = val.toFixed(2);
  }

  if (!fields.montantTTC || !fields.montantHT) {
    const allMadAmounts = [];
    const madMatches = text.matchAll(/([\d\s]{2,10}[\,\.]\d{2})\s*(?:MAD|DH|DIRHAMS)/gi);
    for (const m of madMatches) {
      const val = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
      if (!isNaN(val) && val > 0) allMadAmounts.push(val);
    }

    // Fallback heuristic — only used when no explicitly labeled amount was found.
    if (!fields.montantTTC && allMadAmounts.length > 0) {
      fields.montantTTC = Math.max(...allMadAmounts).toFixed(2);
    }
    if (!fields.montantHT && allMadAmounts.length > 1) {
      const sorted = [...allMadAmounts].sort((a, b) => a - b);
      fields.montantHT = sorted[0].toFixed(2);
    }
  }

  // 8. BL / Conteneur
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
export async function effectuerOCRImage(file, onProgress, lang = LANGUE_OCR_DEFAUT) {
  try {
    if (onProgress) onProgress(10, "Préparation de l'image (niveaux de gris, contraste)...");

    const rawImageUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const imageUrl = await pretraiterImage(rawImageUrl);

    if (onProgress) onProgress(30, "Lancement du moteur OCR Tesseract...");

    const worker = await getWorker(lang);
    const ret = await worker.recognize(imageUrl);

    const rawText = ret.data.text || '';
    if (onProgress) onProgress(100, "Extraction OCR terminée.");

    const parsedFields = extraireChampsMetier(rawText);

    return {
      success: true,
      text: rawText,
      confidence: typeof ret.data.confidence === 'number' ? Math.round(ret.data.confidence) : null,
      parsedFields
    };
  } catch (error) {
    console.error("Erreur OCR Tesseract:", error);
    return {
      success: false,
      text: "",
      confidence: null,
      error: error.message || "Échec de l'OCR sur l'image"
    };
  }
}

/**
 * Real Optical Character Recognition (OCR) on Scanned PDF Files
 * Renders PDF pages to Canvas and runs Tesseract OCR per page.
 */
export async function effectuerOCRPdf(file, onProgress, lang = LANGUE_OCR_DEFAUT) {
  try {
    if (onProgress) onProgress(15, "Chargement et découpage des pages du PDF...");

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let combinedText = '';
    const confidences = [];
    const worker = await getWorker(lang);

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
      appliquerContrasteCanvas(context, canvas.width, canvas.height);
      const imageUrl = canvas.toDataURL('image/png');

      const ret = await worker.recognize(imageUrl);
      if (ret.data && ret.data.text) {
        combinedText += `\n--- PAGE ${pageNum} ---\n` + ret.data.text;
      }
      if (typeof ret.data?.confidence === 'number') confidences.push(ret.data.confidence);
    }

    if (onProgress) onProgress(100, "OCR du PDF terminé avec succès !");

    const parsedFields = extraireChampsMetier(combinedText);
    const confidence = confidences.length
      ? Math.round(confidences.reduce((s, c) => s + c, 0) / confidences.length)
      : null;

    return {
      success: true,
      text: combinedText,
      confidence,
      parsedFields
    };
  } catch (error) {
    console.error("Erreur OCR PDF Scanné:", error);
    return {
      success: false,
      text: "Impossible d'effectuer l'OCR sur ce PDF : " + (error.message || "Fichier invalide"),
      confidence: null,
      error: error.message
    };
  }
}
