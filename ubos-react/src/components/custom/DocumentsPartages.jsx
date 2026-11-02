import React, { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDB } from '../../context/DBContext';
import { useToast } from '../../context/ToastContext';
import DataTable from '../common/DataTable';
import FormField from '../common/FormField';
import Topbar from '../layout/Topbar';
import { lireFichierDataUrl } from '../../utils/fileData';
import { pill } from '../../utils/format';
import { CATEGORIES_DOCUMENT } from '../../data/constants';

const CHAMP_CLIENT = { k: 'client', l: 'Client', t: 'ref', coll: 'clients', cle: 'nom' };

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
  const [clientCode, setClientCode] = useState('');
  const [typeDocument, setTypeDocument] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [uploadEnCours, setUploadEnCours] = useState(false);
  const pretAAjouter = Boolean(clientCode && typeDocument);
  const clientChoisi = (db.clients || []).find(client => client.code === clientCode);

  const documents = (db.documents || [])
    .filter(document => document.partageService && (estDirection() || servicesUtilisateur.includes(document.servicePartage)))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const handleUpload = async event => {
    const fichiers = [...(event.target.files || [])];
    event.target.value = '';
    if (!fichiers.length) return;
    if (!pretAAjouter) {
      toast('Choisissez le client et le type de document avant d’ajouter un fichier.');
      return;
    }
    setUploadEnCours(true);
    try {
      const ajoutes = await Promise.all(fichiers.map(async fichier => ({
        code: genCode('DOC'),
        nom: fichier.name,
        type: typeDocument,
        client: clientCode,
        // Kept on the document so the list shows the name without loading every client.
        clientNom: clientChoisi?.nom || '',
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
      ajoutes.forEach(document => audit('Documents partagés', 'Ajout', document.code, 'client', '—', `${clientCode} · ${typeDocument} · ${document.nom} → ${serviceCible}`));

      const destinataires = (db.utilisateurs || []).filter(utilisateur =>
        utilisateur.actif && utilisateur.nomComplet !== userCourant &&
        ((utilisateur.services || []).includes(serviceCible) || utilisateur.departement === serviceCible)
      );
      destinataires.forEach(utilisateur => notifier(
        utilisateur.nomComplet,
        `${userCourant} a ajouté ${ajoutes.length} document(s) « ${typeDocument} » pour le client ${clientCode}${clientChoisi?.nom ? ` (${clientChoisi.nom})` : ''}.\nLien: #documentsPartages`,
        'Documents partagés'
      ));
      setCommentaire('');
      toast(`${ajoutes.length} document(s) ajouté(s) au client ${clientCode}.`);
    } catch (error) {
      toast(error.message || 'Impossible de partager les documents.');
    } finally {
      setUploadEnCours(false);
    }
  };

  return (
    <>
      <Topbar titre="Documents clients" />
      <div className="panneau" style={{padding:'16px', marginBottom:'14px'}}>
        <h4>Ajouter un document client</h4>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'12px', alignItems:'end'}}>
          <FormField fieldConfig={{ ...CHAMP_CLIENT, l: 'Client *' }} value={clientCode} onChange={setClientCode} />
          <div className="champ">
            <label>Type de document *</label>
            <select value={typeDocument} onChange={event => setTypeDocument(event.target.value)}>
              <option value="">— Choisir —</option>
              {CATEGORIES_DOCUMENT.map(categorie => <option key={categorie} value={categorie}>{categorie}</option>)}
            </select>
          </div>
          <div className="champ">
            <label>Service à notifier</label>
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
          <label
            className={`btn or ${pretAAjouter ? '' : 'desactive'}`}
            title={pretAAjouter ? '' : 'Choisissez d’abord le client et le type de document'}
            style={{display:'inline-flex', marginTop:'12px', cursor: uploadEnCours ? 'wait' : pretAAjouter ? 'pointer' : 'not-allowed', opacity: pretAAjouter ? 1 : 0.55}}
          >
            {uploadEnCours ? 'Ajout en cours…' : '+ Ajouter des fichiers'}
            <input type="file" multiple onChange={handleUpload} disabled={uploadEnCours || !pretAAjouter} style={{display:'none'}} />
          </label>
        )}
        <small style={{display:'block', marginTop:'8px', opacity:0.72}}>
          Le document est rattaché au client choisi (visible aussi dans sa fiche, onglet Documents). Les membres du service choisi reçoivent une notification.
        </small>
      </div>

      <DataTable
        columns={[
          {key:'client', label:'Client', render:(value, row) => value
            ? <a href={`#ficheClient:${value}`}>{value}{row.clientNom ? ` · ${row.clientNom}` : ''}</a>
            : '—'},
          {key:'type', label:'Type', render:value => value ? pill(value, 'p-or') : '—'},
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
