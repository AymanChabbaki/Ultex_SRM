import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import FormField from '../common/FormField';
import { MODS } from '../../data/modules';
import { STATUTS_LIGNE_DEMANDE } from '../../data/constants';
import { calculerConditionnementLigne, verifierMinimumCalcul } from '../../utils/demandes';
import { pillStatut } from '../../utils/format';

const TABS = [
  { id: 'identification', label: 'Identification', keys: ['nomProduit', 'designationTechnique', 'famille', 'sousFamille', 'usage', 'secteurUtilisation', 'description', 'marqueSouhaitee', 'modeleSouhaite', 'reference', 'etatProduit', 'destinationUsage', 'lienProduit', 'photo'] },
  { id: 'quantite', label: 'Quantité & emballage', keys: ['quantite', 'unite', 'quantiteMin', 'piecesParCarton', 'nbCartons', 'poidsNetPiece', 'poidsBrutCarton', 'poidsBrutTotal', 'cbmCarton', 'cbmTotal', 'dimensionsCarton', 'typeEmballage', 'palettise', 'nbPalettes', 'empilable', 'fragile', 'marchandiseDangereuse'] },
  { id: 'fournisseur', label: 'Fournisseur & offre', keys: ['statutFournisseur', 'fournisseur', 'paysFournisseur', 'adresseEnlevement', 'contactFournisseur', 'moq', 'delaiProduction', 'conditionsPaiement', 'validiteOffre', 'quantiteDisponible', 'echantillonDisponible', 'prixEchantillon', 'proforma', 'ficheTechniqueFournisseur', 'commentairesOffre'] },
  { id: 'prix', label: 'Prix & conditions', keys: ['prixUnitaire', 'devise', 'montantMarchandise', 'incoterm', 'lieuIncoterm', 'modePaiementPropose', 'acompteFournisseur', 'soldeFournisseur', 'remise', 'fraisMoule', 'fraisEmballage', 'fraisPersonnalisation', 'fraisDocuments', 'autresFrais'] },
  { id: 'logistique', label: 'Origine & logistique', keys: ['paysOrigine', 'villeFournisseur', 'portProbable', 'modeTransportSouhaite', 'urgenceTransport', 'marchandisePrete', 'dateMarchandisePrete', 'besoinEnlevement', 'besoinTransportIntl', 'besoinTransit', 'besoinLivraisonFinale'] },
  { id: 'technique', label: 'Technique', keys: ['matiere', 'dimensionsProduit', 'couleur', 'puissanceVoltage', 'capaciteTechnologie', 'normesAnnoncees', 'certificatsDisponibles', 'manuel', 'ficheTechnique', 'caracteristiquesPersonnalisees'] },
  { id: 'reglementation', label: 'HS Code & réglementation', keys: ['hsCodeFournisseur', 'hsCodeUltex', 'statutHsCode', 'produitReglemente', 'organismesConcernes', 'licenceRequise', 'etiquetageRequis', 'msds'] },
  { id: 'exigences', label: 'Exigences client', keys: ['niveauQualite', 'prixVenteSouhaite', 'delaiSouhaite', 'personnalisation', 'criterePrincipal', 'conditionsParticulieres'] }
];

const CHAMPS_PAR_CLE = Object.fromEntries((MODS.demandeLignes.champs || []).map(f => [f.k, f]));

export default function FicheDemandeLigne({ codeProp, code: codeFromProp }) {
  const { db, updateDB, genCode, audit } = useDB();
  const { peut } = useAuth();
  const { toast } = useToast();
  const code = codeProp || codeFromProp || (window.location.hash.startsWith('#ficheDemandeLigne:') ? window.location.hash.split(':')[1] : '');

  const ligne = (db?.demandeLignes || []).find(l => l.code === code);
  const [formData, setFormData] = useState(ligne || {});
  const [ongletActif, setOngletActif] = useState('identification');
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const formRef = useRef(formData);

  useEffect(() => { formRef.current = formData; dirtyRef.current = dirty; }, [formData, dirty]);

  useEffect(() => {
    setFormData(ligne || {});
    setDirty(false);
  }, [code]);

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    const interval = setInterval(() => {
      if (dirtyRef.current) commit(formRef.current, { silencieux: true });
    }, 10000);
    return () => { window.removeEventListener('beforeunload', onBeforeUnload); clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const verif = useMemo(() => verifierMinimumCalcul(formData), [formData]);

  if (!ligne) {
    return (
      <div>
        <Topbar titre="Ligne de demande" />
        <div className="panneau"><div className="vide"><b>Ligne introuvable</b> {code ? `(${code})` : ''}</div></div>
      </div>
    );
  }

  const demande = (db.demandes || []).find(d => d.code === ligne.demande);

  const handleChange = (k, v) => {
    setFormData(prev => ({ ...prev, [k]: v }));
    setDirty(true);
  };

  const commit = (data, { silencieux } = {}) => {
    const patch = calculerConditionnementLigne(data);
    const merged = { ...data, ...patch };
    const nextLignes = (db.demandeLignes || []).map(l => l.code === code ? merged : l);
    updateDB({ ...db, demandeLignes: nextLignes });
    audit('Lignes de demande', 'Modification', code, '—', '—', merged.nomProduit || code, ligne.demande);
    setFormData(merged);
    setDirty(false);
    if (!silencieux) toast(`${code} enregistré.`);
    return merged;
  };

  const handleEnregistrer = () => commit(formData);

  const handleEnregistrerEtAjouter = () => {
    commit(formData);
    const newCode = genCode('DL');
    const brouillon = { code: newCode, demande: ligne.demande, statut: STATUTS_LIGNE_DEMANDE[0], ts: Date.now() };
    updateDB({ ...db, demandeLignes: [...(db.demandeLignes || []).map(l => l.code === code ? formData : l), brouillon] });
    audit('Lignes de demande', 'Création', newCode, '—', '—', 'Nouvelle ligne', ligne.demande);
    window.location.hash = `ficheDemandeLigne:${newCode}`;
  };

  const handleRetour = () => {
    if (dirty && !window.confirm('Des modifications ne sont pas enregistrées. Quitter sans enregistrer ?')) return;
    window.location.hash = `ficheDemande:${ligne.demande}`;
  };

  const disabled = !peut('modifier');

  return (
    <div>
      <Topbar titre={`Produit : ${formData.nomProduit || code}`} />

      <div className="outils">
        <button className="btn doux" onClick={handleRetour}>← Retour à la demande</button>
        <span className="spacer"></span>
        {demande && <span>Demande <a href={`#ficheDemande:${demande.code}`}>{demande.code}</a></span>}
      </div>

      <div className="panneau mb-lg">
        <div className="outils" style={{ padding: 0 }}>
          <b className="titre-fiche">{code}</b>
          {pillStatut(formData.statut)}
          <span className="spacer"></span>
          {dirty && <span className="p-ambre pill">Modifications non enregistrées</span>}
        </div>
        <div className="champ" style={{ maxWidth: '320px' }}>
          <label>Statut de la ligne</label>
          <select value={formData.statut || ''} disabled={disabled} onChange={e => handleChange('statut', e.target.value)}>
            {STATUTS_LIGNE_DEMANDE.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {!verif.ok && (
          <div className="vide" style={{ marginTop: '8px' }}>
            Informations manquantes pour le Calcul : {verif.manquants.join(', ')}. L'envoi reste possible « sous réserve ».
          </div>
        )}
      </div>

      <div className="onglets">
        {TABS.map(t => (
          <button key={t.id} className={`onglet ${ongletActif === t.id ? 'actif' : ''}`} onClick={() => setOngletActif(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="panneau">
        <div className="corps">
          {TABS.find(t => t.id === ongletActif)?.keys.map(k => {
            const f = CHAMPS_PAR_CLE[k];
            if (!f) return null;
            return (
              <FormField
                key={k}
                fieldConfig={f}
                value={formData[k]}
                onChange={(val) => handleChange(k, val)}
                disabled={disabled}
              />
            );
          })}
        </div>
      </div>

      <div className="outils" style={{ marginTop: '16px' }}>
        <button className="btn doux" onClick={handleRetour}>← Retour à la demande</button>
        <span className="spacer"></span>
        {peut('ajouter') && <button className="btn or" onClick={handleEnregistrerEtAjouter}>Enregistrer et ajouter un autre produit</button>}
        {!disabled && <button className="btn" onClick={handleEnregistrer}>Enregistrer</button>}
      </div>
    </div>
  );
}
