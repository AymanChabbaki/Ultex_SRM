export function lireFichierDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target.result);
    reader.onerror = () => reject(new Error(`Lecture impossible : ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function categorieDepuisFichier(file) {
  const type = String(file?.type || '');
  if (type.startsWith('image/')) return 'Photo / Image';
  if (type.startsWith('audio/')) return 'Audio';
  if (type.startsWith('video/')) return 'Vidéo';
  if (type === 'application/pdf') return 'PDF';
  return 'Autre';
}
