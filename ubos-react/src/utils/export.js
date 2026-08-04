import * as XLSX from 'xlsx';

export function exporterJSON(db) {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", `ubos_sauvegarde_${new Date().toISOString().slice(0, 10)}.json`);
  dlAnchorElem.click();
}

export function importerJSON(file, setDB) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        setDB(json);
        resolve(true);
      } catch (err) {
        console.error("Erreur d'importation JSON:", err);
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Erreur de lecture du fichier"));
    reader.readAsText(file);
  });
}

export function exporterExcel(modId, db, mods, userCourant) {
  try {
    const xlsxLib = XLSX.default || XLSX;
    const M = mods[modId];
    if (!M || !M.coll) return;
    
    let lignes = [...(db[M.coll] || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  
  const refLabel = (coll, k, cle) => {
    if (!db[coll]) return k;
    const ref = db[coll].find(x => x.code === k);
    return ref ? (cle ? ref[cle] : ref.nom || ref.code) : k;
  };

  const data = lignes.map(o => {
    const row = { Code: o.code };
    M.champs.forEach(f => {
      if (f.t === "ref" && o[f.k]) {
        row[f.l] = refLabel(f.coll, o[f.k], f.cle);
      } else {
        row[f.l] = o[f.k];
      }
    });
    return row;
  });

  const ws = xlsxLib.utils.json_to_sheet(data);
  const wb = xlsxLib.utils.book_new();
  xlsxLib.utils.book_append_sheet(wb, ws, "Données");
  
  xlsxLib.writeFile(wb, `ubos_${modId}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    console.error("Export Error:", err);
    alert("Erreur lors de l'exportation: " + err.message);
  }
}
