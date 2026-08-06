import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import FormField from '../common/FormField';
import DataTable from '../common/DataTable';
import { MODS } from '../../data/modules';
import { STATUTS_LIGNE_DEMANDE, TYPES_TRAITEMENT_LIGNE } from '../../data/constants';
import {
  calculerConditionnementLigne, verifierMinimumCalcul, verifierMinimumSourcing,
  suggererTypeTraitement, suggererRoutesComplementaires, checklistEnvoiCalcul,
  calculerEcheanceRoutage, construireMessageRoutage
} from '../../utils/demandes';
import { pillStatut, pill } from '../../utils/format';

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

const STATUT_PAR_SERVICE = {
  'Sourcing': 'En sourcing',
  'Études & Chiffrage': 'En calcul',
  'Analyse Dossiers': 'En réglementation',
  'Transport': 'En transport'
};

const SERVICES_DISPONIBLES = ['Sourcing', 'Études & Chiffrage', 'Analyse Dossiers', 'Transport'];

const STATUT_CHECKLIST_PILL = { 'Disponible': 'p-vert', 'Manquante': 'p-rouge', 'Non applicable': 'p-gris', 'À confirmer': 'p-ambre' };

export default function FicheDemandeLigne({ codeProp, code: codeFromProp }) {
  const { db, updateDB, genCode, audit, notifier } = useDB();
  const { peut } = useAuth();
  const { toast } = useToast();
  const code = codeProp || codeFromProp || (window.location.hash.startsWith('#ficheDemandeLigne:') ? window.location.hash.split(':')[1] : '');

  const ligne = (db?.demandeLignes || []).find(l => l.code === code);
  const [formData, setFormData] = useState(ligne || {});
  const [ongletActif, setOngletActif] = useState('identification');
  const [dirty, setDirty] = useState(false);
  const [servicesSelectionnes, setServicesSelectionnes] = useState([]);
  const dirtyRef = useRef(false);
  const formRef = useRef(formData);

  useEffect(() => { formRef.current = formData; dirtyRef.current = dirty; }, [formData, dirty]);

  useEffect(() => {
    setFormData(ligne || {});
    setDirty(false);
    setServicesSelectionnes([]);
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

  const verifCalcul = useMemo(() => verifierMinimumCalcul(formData), [formData]);
  const verifSourcing = useMemo(() => verifierMinimumSourcing(formData), [formData]);
  const suggestionType = useMemo(() => suggererTypeTraitement(formData), [formData]);
  const routesComplementaires = useMemo(() => suggererRoutesComplementaires(formData), [formData]);
  const checklist = useMemo(() => checklistEnvoiCalcul(formData), [formData]);

  useEffect(() => {
    if (formData.typeTraitement === 'Traitement combiné' && servicesSelectionnes.length === 0) {
      const set = new Set(routesComplementaires.map(r => r.service));
      set.add('Études & Chiffrage');
      setServicesSelectionnes(Array.from(set));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.typeTraitement]);

  if (!ligne) {
    return (
      <div>
        <Topbar titre="Ligne de demande" />
        <div className="panneau"><div className="vide"><b>Ligne introuvable</b> {code ? `(${code})` : ''}</div></div>
      </div>
    );
  }

  const demande = (db.demandes || []).find(d => d.code === ligne.demande);
  const routages = (db.demandeRoutages || []).filter(r => r.ligne === code).sort((a, b) => (b.dateEnvoi || 0) - (a.dateEnvoi || 0));

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

  // Sends the (freshly saved) line to a single service: creates the task,
  // the routage record and the notification in one atomic updateDB call.
  const envoyer = (service, opts = {}) => {
    const patch = calculerConditionnementLigne(formData);
    const merged = { ...formData, ...patch };
    const statutCible = opts.statutCible || STATUT_PAR_SERVICE[service] || merged.statut;
    const finalLigne = { ...merged, statut: statutCible };
    const echeance = calculerEcheanceRoutage(service);
    const libelle = opts.libelleTache || `${service} — ${finalLigne.nomProduit || finalLigne.code}`;
    const tache = {
      code: genCode('T'), titre: libelle, dossier: '', assigne: service, echeance,
      priorite: 'Normale', origine: 'Tâche courante', statut: 'À faire',
      remarque: `Ligne ${finalLigne.code} de la demande ${finalLigne.demande}.${opts.sousReserve ? ' Sous réserve — manquant : ' + (opts.manquants || []).join(', ') + '.' : ''}`,
      ts: Date.now()
    };
    const routage = {
      code: genCode('RT'), ligne: finalLigne.code, demande: finalLigne.demande, service, responsable: service,
      statut: opts.sousReserve ? 'Envoyée sous réserve' : 'Envoyée', echeance, dateEnvoi: Date.now(), resultat: ''
    };
    updateDB({
      ...db,
      demandeLignes: (db.demandeLignes || []).map(l => l.code === code ? finalLigne : l),
      taches: [tache, ...(db.taches || [])],
      demandeRoutages: [routage, ...(db.demandeRoutages || [])]
    });
    audit('Lignes de demande', `Envoi — ${service}`, finalLigne.code, 'statut', formData.statut, statutCible, finalLigne.demande);
    const texte = construireMessageRoutage({
      titre: opts.titreNotif || `NOUVELLE DEMANDE — ${service.toUpperCase()}`,
      ligne: finalLigne, demande, echeance,
      extra: opts.sousReserve ? `Sous réserve — manquant : ${(opts.manquants || []).join(', ')}.` : null
    });
    notifier(service, texte, 'Demandes');
    setFormData(finalLigne);
    setDirty(false);
    toast(`Envoyé à ${service}${opts.sousReserve ? ' (sous réserve)' : ''}.`);
  };

  // "Traitement combiné" : plusieurs services en parallèle, un seul updateDB.
  const envoyerVersPlusieursServices = (services) => {
    if (!services.length) return;
    const patch = calculerConditionnementLigne(formData);
    const merged = { ...formData, ...patch };
    const statutCible = STATUT_PAR_SERVICE[services[0]] || merged.statut;
    const finalLigne = { ...merged, statut: statutCible };
    const taches = [];
    const routagesNouveaux = [];
    services.forEach(service => {
      const echeance = calculerEcheanceRoutage(service);
      taches.push({
        code: genCode('T'), titre: `${service} — ${finalLigne.nomProduit || finalLigne.code}`, dossier: '', assigne: service,
        echeance, priorite: 'Normale', origine: 'Tâche courante', statut: 'À faire',
        remarque: `Ligne ${finalLigne.code} de la demande ${finalLigne.demande} — traitement combiné.`, ts: Date.now()
      });
      routagesNouveaux.push({
        code: genCode('RT'), ligne: finalLigne.code, demande: finalLigne.demande, service, responsable: service,
        statut: 'Envoyée', echeance, dateEnvoi: Date.now(), resultat: ''
      });
    });
    updateDB({
      ...db,
      demandeLignes: (db.demandeLignes || []).map(l => l.code === code ? finalLigne : l),
      taches: [...taches, ...(db.taches || [])],
      demandeRoutages: [...routagesNouveaux, ...(db.demandeRoutages || [])]
    });
    audit('Lignes de demande', 'Envoi — Traitement combiné', finalLigne.code, 'statut', formData.statut, statutCible, finalLigne.demande);
    services.forEach((service, i) => {
      const texte = construireMessageRoutage({
        titre: `NOUVELLE DEMANDE — ${service.toUpperCase()} (traitement combiné)`,
        ligne: finalLigne, demande, echeance: routagesNouveaux[i].echeance
      });
      notifier(service, texte, 'Demandes');
    });
    setFormData(finalLigne);
    setDirty(false);
    toast(`Envoyé à ${services.length} service(s) : ${services.join(', ')}.`);
  };

  const handleDemanderInfosManquantes = () => {
    const dest = demande?.responsableData || 'Data';
    const manquants = (formData.typeTraitement === 'Sourcing nécessaire') ? verifSourcing.manquants : verifCalcul.manquants;
    const tache = {
      code: genCode('T'), titre: `Compléter les informations — ${formData.nomProduit || code}`, dossier: '', assigne: dest,
      echeance: '', priorite: 'Normale', origine: 'Tâche courante', statut: 'À faire',
      remarque: `Ligne ${code} de la demande ${demande?.code}. Informations manquantes : ${manquants.join(', ') || 'à préciser'}.`, ts: Date.now()
    };
    updateDB({ ...db, taches: [tache, ...(db.taches || [])] });
    audit('Lignes de demande', "Demande d'informations manquantes", code, '—', '—', manquants.join(', '), demande?.code);
    notifier(dest, `Informations manquantes sur la ligne ${code} (${formData.nomProduit || ''}) de la demande ${demande?.code} : ${manquants.join(', ')}.\nLien : #ficheDemandeLigne:${code}`, 'Demandes');
    toast("Demande d'informations envoyée.");
  };

  const toggleService = (s) => setServicesSelectionnes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const disabled = !peut('modifier');
  const typeTraitement = formData.typeTraitement;

  const renderActionsCircuit = () => {
    if (!typeTraitement) {
      return <p className="vide">Choisissez ou confirmez un type de traitement ci-dessus pour afficher les actions d'envoi.</p>;
    }
    if (typeTraitement === 'Sourcing nécessaire') {
      return (
        <>
          {!verifSourcing.ok && <p className="vide">Informations manquantes pour le Sourcing : {verifSourcing.manquants.join(', ')}. L'envoi reste possible « sous réserve ».</p>}
          <button className="btn or" onClick={() => envoyer('Sourcing', { sousReserve: !verifSourcing.ok, manquants: verifSourcing.manquants, titreNotif: 'NOUVELLE DEMANDE DE SOURCING' })}>
            Enregistrer et envoyer au Sourcing
          </button>
        </>
      );
    }
    if (typeTraitement === 'Fournisseur connu, Proforma disponible' || typeTraitement === 'Calcul direct possible') {
      return (
        <>
          <table style={{ marginBottom: '12px' }}>
            <thead><tr><th>Élément</th><th>Statut</th></tr></thead>
            <tbody>
              {checklist.map(c => <tr key={c.champ}><td>{c.label}</td><td>{pill(c.statut, STATUT_CHECKLIST_PILL[c.statut] || 'p-gris')}</td></tr>)}
            </tbody>
          </table>
          <button className="btn or" onClick={() => envoyer('Études & Chiffrage', { sousReserve: !verifCalcul.ok, manquants: verifCalcul.manquants, titreNotif: 'NOUVELLE DEMANDE — ÉTUDES & CHIFFRAGE' })}>
            {verifCalcul.ok ? 'Envoyer à Études & Chiffrage' : 'Envoyer sous réserve'}
          </button>
          {!verifCalcul.ok && <button className="btn doux" style={{ marginLeft: '8px' }} onClick={handleDemanderInfosManquantes}>Demander les informations manquantes</button>}
        </>
      );
    }
    if (typeTraitement === 'Fournisseur connu, offre incomplète') {
      return (
        <>
          <button className="btn doux" onClick={handleDemanderInfosManquantes}>Demander les informations manquantes</button>
          <button className="btn or" style={{ marginLeft: '8px' }} onClick={() => envoyer('Études & Chiffrage', { sousReserve: true, manquants: verifCalcul.manquants, titreNotif: 'NOUVELLE DEMANDE — ÉTUDES & CHIFFRAGE' })}>
            Envoyer au Calcul sous réserve
          </button>
        </>
      );
    }
    if (typeTraitement === 'Étude technique nécessaire') {
      return (
        <button className="btn or" onClick={() => envoyer('Études & Chiffrage', { statutCible: 'En étude technique', libelleTache: `Étude technique — ${formData.nomProduit || code}`, titreNotif: 'NOUVELLE DEMANDE — ÉTUDE TECHNIQUE' })}>
          Envoyer à Études & Chiffrage (étude technique)
        </button>
      );
    }
    if (typeTraitement === 'Analyse réglementaire nécessaire') {
      return (
        <button className="btn or" onClick={() => envoyer('Analyse Dossiers', { titreNotif: 'NOUVELLE DEMANDE — ANALYSE RÉGLEMENTAIRE' })}>
          Envoyer à Analyse Dossiers
        </button>
      );
    }
    if (typeTraitement === 'Cotation transport nécessaire') {
      return (
        <button className="btn or" onClick={() => envoyer('Transport', { titreNotif: 'NOUVELLE DEMANDE — COTATION TRANSPORT' })}>
          Envoyer à Transport
        </button>
      );
    }
    if (typeTraitement === 'Informations client manquantes') {
      return <button className="btn doux" onClick={handleDemanderInfosManquantes}>Demander les informations manquantes</button>;
    }
    if (typeTraitement === 'Traitement combiné') {
      return (
        <>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {SERVICES_DISPONIBLES.map(s => (
              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <input type="checkbox" checked={servicesSelectionnes.includes(s)} onChange={() => toggleService(s)} />
                {s}
              </label>
            ))}
          </div>
          <button className="btn or" disabled={!servicesSelectionnes.length} onClick={() => envoyerVersPlusieursServices(servicesSelectionnes)}>
            Envoyer aux services sélectionnés
          </button>
        </>
      );
    }
    return null;
  };

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
      </div>

      <div className="panneau mb-lg">
        <h4>Circuit de traitement</h4>
        {!formData.typeTraitement && (
          <p className="vide" style={{ textAlign: 'left' }}>
            Circuit suggéré par UBOS : <b>{suggestionType}</b>.{' '}
            <button className="btn mini or" onClick={() => handleChange('typeTraitement', suggestionType)}>Confirmer ce circuit</button>
          </p>
        )}
        <div className="champ" style={{ maxWidth: '460px' }}>
          <label>
            Type de traitement
            {formData.typeTraitement && formData.typeTraitement !== suggestionType && (
              <small style={{ fontWeight: 400, textTransform: 'none', marginLeft: '8px' }}>(suggestion UBOS : {suggestionType})</small>
            )}
          </label>
          <select value={formData.typeTraitement || ''} disabled={disabled} onChange={e => handleChange('typeTraitement', e.target.value)}>
            <option value="">—</option>
            {TYPES_TRAITEMENT_LIGNE.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {routesComplementaires.length > 0 && (
          <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {routesComplementaires.map(r => (
              <span key={r.service} className="pill p-ambre" title={r.motif}>{r.service} — {r.motif}</span>
            ))}
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

      <div className="panneau mb-lg">
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

      <div className="bloc-fiche large">
        <h4>Actions du circuit</h4>
        {renderActionsCircuit()}
      </div>

      <div className="bloc-fiche large">
        <h4>Routage</h4>
        <DataTable
          columns={[
            { key: 'service', label: 'Service' },
            { key: 'responsable', label: 'Responsable' },
            { key: 'dateEnvoi', label: "Date d'envoi", render: (v) => v ? new Date(v).toLocaleDateString('fr-FR') : '—' },
            { key: 'echeance', label: 'Échéance' },
            { key: 'statut', label: 'Statut', render: (s) => pillStatut(s) },
            { key: 'resultat', label: 'Résultat', render: (v) => v || '—' }
          ]}
          data={routages}
        />
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
