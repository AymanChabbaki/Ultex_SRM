import React, { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDB } from '../../context/DBContext';
import { useToast } from '../../context/ToastContext';
import DataTable from '../common/DataTable';
import Topbar from '../layout/Topbar';
import { categorieDepuisFichier, lireFichierDataUrl } from '../../utils/fileData';
import { pill } from '../../utils/format';

export default function DocumentsPartages() {
  const { db, updateDB, genCode, audit, notifier } = useDB();
  const { session, estDirection, peut, userCourant } = useAuth();
  const { toast } = useToast();
  const servicesUtilisateur = (session?.services || []).length
    ? session.services
    : [session?.departement || 'Commercial'];
  const servicesDisponibles = useMemo(() => {
    if (!estDirection()) return servicesUtilisateur;
    const valeurs = new Set(['Commercial']);
    (db.utilisateurs || []).forEach(u => (u.services || []).forEach(service => valeurs.add(service)));
    return [...valeurs].sort();
  }, [db.utilisateurs, estDirection, servicesUtilisateur]);
  const [serviceCible, setServiceCible] = useState(servicesUtilisateur[0] || 'Commercial');
  const [commentaire, setCommentaire] = useState('');
  const [uploadEnCours, setUploadEnCours] = useState(false);

  const documents = (db.documents || [])
    .filter(document => document.partageService && (estDirection() || servicesUtilisateur.includes(document.servicePartage)))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const handleUpload = async event => {
    const fichiers = [...(event.target.files || [])];
    event.target.value = '';
    if (!fichiers.length) return;
    setUploadEnCours(true);
    try {
      const ajoutes = await Promise.all(fichiers.map(async fichier => ({
        code: genCode('DOC'),
        nom: fichier.name,
        type: categorieDepuisFichier(fichier),
        typeFichier: fichier.type || 'Fichier',
        fichier: await lireFichierDataUrl(fichier),
        taille: fichier.size,
        commentaire,
        partageService: true,
        servicePartage: serviceCible,
        auteur: userCourant,
        par: userCourant,
        dateAjout: new Date().toISOString(),
        statut: 'Reçu',
        version: 1,
        ts: Date.now(),
      })));
      updateDB({ ...db, documents: [...ajoutes, ...(db.documents || [])] });
      ajoutes.forEach(document => audit('Documents partagés', 'Ajout', document.code, 'service', '—', `${serviceCible} · ${document.nom}`));

      const destinataires = (db.utilisateurs || []).filter(utilisateur =>
        utilisateur.actif && utilisateur.nomComplet !== userCourant &&
        ((utilisateur.services || []).includes(serviceCible) || utilisateur.departement === serviceCible)
      );
      destinataires.forEach(utilisateur => notifier(
        utilisateur.nomComplet,
        `${userCourant} a partagé ${ajoutes.length} nouveau(x) document(s) avec le service ${serviceCible}.\nLien: #documentsPartages`,
        'Documents partagés'
      ));
      setCommentaire('');
      toast(`${ajoutes.length} document(s) partagé(s) avec ${serviceCible}.`);
    } catch (error) {
      toast(error.message || 'Impossible de partager les documents.');
    } finally {
      setUploadEnCours(false);
    }
  };

  return (
    <>
      <Topbar titre="Documents partagés" />
      <div className="panneau" style={{padding:'16px', marginBottom:'14px'}}>
        <h4>Partager avec mon service</h4>
        <div style={{display:'grid', gridTemplateColumns:'minmax(180px, 280px) minmax(240px, 1fr)', gap:'12px', alignItems:'end'}}>
          <div className="champ">
            <label>Service destinataire</label>
            <select value={serviceCible} onChange={event => setServiceCible(event.target.value)}>
              {servicesDisponibles.map(service => <option key={service} value={service}>{service}</option>)}
            </select>
          </div>
          <div className="champ">
            <label>Commentaire</label>
            <input value={commentaire} onChange={event => setCommentaire(event.target.value)} placeholder="Objet ou précision (optionnel)" />
          </div>
        </div>
        {peut('ajouter') && (
          <label className="btn or" style={{display:'inline-flex', marginTop:'12px', cursor:uploadEnCours ? 'wait' : 'pointer'}}>
            {uploadEnCours ? 'Partage en cours…' : '+ Ajouter et partager des fichiers'}
            <input type="file" multiple onChange={handleUpload} disabled={uploadEnCours} style={{display:'none'}} />
          </label>
        )}
        <small style={{display:'block', marginTop:'8px', opacity:0.72}}>
          Les membres du service reçoivent une notification. Tous les formats de fichiers sont acceptés.
        </small>
      </div>

      <DataTable
        columns={[
          {key:'nom', label:'Document'},
          {key:'servicePartage', label:'Service', render:value => pill(value, 'p-bleu')},
          {key:'auteur', label:'Ajouté par'},
          {key:'dateAjout', label:'Date', render:value => value ? new Date(value).toLocaleString('fr-FR') : '—'},
          {key:'commentaire', label:'Commentaire'},
          {key:'fichier', label:'Fichier', render:(value, row) => value ? <a href={value} download={row.nom}>Télécharger</a> : '—'},
        ]}
        data={documents}
      />
    </>
  );
}
