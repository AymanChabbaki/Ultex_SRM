import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import KVDisplay from '../common/KVDisplay';
import DataTable from '../common/DataTable';
import Pill from '../common/Pill';
import Modal from '../common/Modal';
import LigneModal from '../common/LigneModal';
import ModuleForm from '../modules/ModuleForm';
import { MODS } from '../../data/modules';
import { calculerLigne, calculFF } from '../../utils/businessActions';
import { PrinterIcon, SearchIcon, CheckIcon, AlertIcon } from '../common/Icons';

const SEUIL_ECART_DEVIS_PCT = 15;

const fmtMAD = (v) => new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD' }).format(v||0);

const LIGNE_CHAMPS = [
  {k: 'designation', l: 'Désignation', t: 'text', req: 1},
  {k: 'categorie', l: 'Catégorie', t: 'select', opts: ['Valeur marchandise', 'Transport international', 'Droits de douane', 'Transit', 'Transport national', 'Autre']},
  {k: 'quantite', l: 'Quantité', t: 'number'},
  {k: 'prixUnitaire', l: 'Prix unitaire (MAD)', t: 'number', req: 1},
  {k: 'tauxTVA', l: 'Taux TVA (%)', t: 'number'},
  {k: 'fournisseur', l: 'Fournisseur', t: 'text'},
  {k: 'reference', l: 'Référence', t: 'text'},
  {k: 'commentaire', l: 'Commentaire', t: 'textarea', large: 1},
  {k: 'statut', l: 'Statut', t: 'select', opts: ['Estimée', 'Justifiée', 'Annulée']}
];

const FicheFF = ({ codeProp, code: codeFromProp }) => {
  const { db, updateDB, audit, notifier } = useDB();
  const { peut } = useAuth();
  const { toast } = useToast();
  const initialCode = codeProp || codeFromProp || '';
  const [code, setCode] = useState(initialCode);
  const [showEdit, setShowEdit] = useState(false);
  const [showCoherence, setShowCoherence] = useState(false);
  const [ligneEnCours, setLigneEnCours] = useState(null);

  useEffect(() => {
    const c = codeProp || codeFromProp;
    if (c) {
      setCode(c);
    } else {
      const hash = window.location.hash;
      if (hash.startsWith('#ficheFF:')) {
        setCode(hash.split(':')[1]);
      }
    }
  }, [codeProp, codeFromProp, window.location.hash]);

  const f = (db?.facturesFinales || []).find(x => x.code === code);

  if (!f) {
    return (
      <div>
        <Topbar titre="Facture Finale" />
        <div className="panneau">
          <div className="vide"><b>Facture introuvable</b> {code ? `(${code})` : ''} n'existe pas.</div>
        </div>
      </div>
    );
  }

  const c = calculFF(f, db);
  const d = (db.dossiers || []).find(x => x.code === f.dossier);
  const cl = (db.clients || []).find(x => x.code === f.client);
  const ct = (db.documents || []).find(x => x.dossier === f.dossier && x.type === "Contrat");

  const sauverFF = (patch) => {
    const nextF = { ...f, ...patch };
    updateDB({ ...db, facturesFinales: (db.facturesFinales || []).map(x => x.code === code ? nextF : x) });
    return nextF;
  };

  const handleValider = () => {
    if (!window.confirm(`Valider la facture ${code} ? Cette action confirme le montant total facturé.`)) return;
    const dateJour = new Date().toLocaleDateString('fr-FR');
    sauverFF({ validee: true, valideeLe: dateJour });
    audit('Facturation finale', 'Validation', code, 'validee', 'false', 'true');
    notifier('Direction', `Facture finale ${code} validée (${fmtMAD(c.totalTTC)}).`, 'Facturation finale');
    toast(`${code} validée.`);
  };

  const handleSaveLigne = (data) => {
    const ligne = calculerLigne({ ...data });
    const isEdit = !!ligneEnCours?.id;
    let lignes, seq = f._seqLigne || 0;
    if (isEdit) {
      lignes = (f.lignes || []).map(l => l.id === ligneEnCours.id ? { ...l, ...ligne, id: l.id } : l);
    } else {
      seq += 1;
      lignes = [...(f.lignes || []), { ...ligne, id: 'l' + seq }];
    }
    sauverFF({ lignes, _seqLigne: seq });
    audit('Facturation finale', isEdit ? 'Ligne modifiée' : 'Ligne ajoutée', code, 'lignes', '—', `${ligne.designation} : ${fmtMAD(ligne.montantTTC)}`);
    toast(isEdit ? 'Ligne mise à jour.' : 'Ligne ajoutée.');
    setLigneEnCours(null);
  };

  const verifications = [
    { label: 'Dossier lié', ok: !!d, detail: d ? d.code : 'Aucun dossier associé — la facture est orpheline.' },
    { label: 'Écart devis / facturé', ok: c.ecartDevisPct === null || Math.abs(c.ecartDevisPct) <= SEUIL_ECART_DEVIS_PCT, detail: c.ecartDevisPct === null ? 'Pas de devis initial renseigné.' : `Écart de ${c.ecartDevisPct > 0 ? '+' : ''}${c.ecartDevisPct}% par rapport au devis.` },
    { label: 'Solde dû', ok: c.joursRetard <= 0, detail: c.joursRetard > 0 ? `Solde en retard de ${c.joursRetard} jour(s).` : 'Aucun retard de paiement.' },
    { label: 'Lignes justifiées', ok: c.actives.filter(l => l.statut === 'Estimée').length === 0, detail: `${c.actives.filter(l => l.statut === 'Estimée').length} ligne(s) encore au statut « Estimée ».` },
    { label: 'Réductions en attente', ok: c.reducAttente === 0, detail: c.reducAttente > 0 ? `${fmtMAD(c.reducAttente)} de réduction(s) en attente de validation.` : 'Aucune réduction en attente.' }
  ];

  const lienDossierFields = [
    { k: 'client', l: 'Code client', render: () => cl ? <a href={`#ficheClient:${cl.code}`}>{cl.nom} ({cl.code})</a> : '—' },
    { k: 'dossier', l: 'Code dossier', render: () => d ? <a href={`#ficheDossier:${d.code}`}>{d.code}</a> : <Pill type="p-rouge" texte="MANQUANT" /> },
    { k: 'devis', l: 'Devis initial (informatif)', render: () => (
      <span>
        {fmtMAD(f.devisInitial)}
        {c.ecartDevisPct !== null && (
          <small style={{ color: Math.abs(c.ecartDevisPct) > SEUIL_ECART_DEVIS_PCT ? "var(--rouge)" : "var(--gris)", marginLeft: '8px' }}>
            Écart {c.ecartDevisPct > 0 ? "+" : ""}{c.ecartDevisPct}%
          </small>
        )}
      </span>
    )},
    { k: 'contrat', l: 'Contrat', render: () => ct ? `${ct.nom} à ${ct.code}` : '—' },
    { k: 'statutMarchandise', l: 'Statut marchandise', render: () => <Pill type={["Abandonnée par le client","Reprise par ULTEx","En contentieux"].includes(f.statutMarchandise) ? "p-rouge" : "p-gris"} texte={f.statutMarchandise || "-"} /> },
    { k: 'statutFinal', l: 'Statut financier', render: () => <Pill type={f.statutFinal === "Solde payé" ? "p-vert" : f.statutFinal === "Impayé" ? "p-rouge" : "p-ambre"} texte={f.statutFinal || "-"} /> },
    { k: 'echeance', l: 'Échéance du solde', render: () => (
      <span>
        {f.echeance || "-"}
        {c.joursRetard > 0 && <span style={{marginLeft:'8px'}}><Pill type="p-rouge" texte={`J+${c.joursRetard}`} /></span>}
      </span>
    )}
  ];

  const syntheseFields = [
    { k: 'totalHT', l: 'Total HT', render: () => fmtMAD(c.totalHT) },
    { k: 'totalTVA', l: 'Total TVA', render: () => fmtMAD(c.totalTVA) },
    { k: 'totalTTC', l: <b>TOTAL TTC FACTURÉ</b>, render: () => <b>{fmtMAD(c.totalTTC)}</b> },
    { k: 'lignes', l: 'Lignes actives / justifiées', render: () => `${c.actives.length} active(s), dont ${c.actives.filter(l=>l.statut==="Justifiée").length} justifiée(s)` }
  ];

  const etatCompteFields = [
    { k: 'totalTTC', l: 'Total facturé (TTC)', render: () => fmtMAD(c.totalTTC) },
    { k: 'reduc', l: '- Réductions validées', render: () => (
      <span>
        {fmtMAD(c.reducValidees)}
        {c.reducAttente > 0 && <span className="pill p-ambre" style={{marginLeft:'8px'}}>+ {fmtMAD(c.reducAttente)} en attente</span>}
      </span>
    )},
    { k: 'avoirs', l: '- Avoirs émis', render: () => fmtMAD(c.avoirs) },
    { k: 'paiements', l: '- Paiements reçus', render: () => (
      <span>
        {fmtMAD(c.paiementsRecus)}
        <small style={{color:'var(--gris)', marginLeft:'8px'}}>({fmtMAD(c.paiementsUBOS)} UBOS + {fmtMAD(c.paiementsHorsSysteme)} hors système)</small>
      </span>
    )},
    { k: 'remboursements', l: '+ Remboursements', render: () => fmtMAD(c.remboursements) },
    { k: 'solde', l: <b>= SOLDE DÛ PAR LE CLIENT</b>, render: () => <b style={{fontSize:'17px', color: c.soldeDu > 0.01 ? 'var(--rouge)' : 'var(--ok)'}}>{fmtMAD(Math.round(c.soldeDu))}</b> }
  ];

  return (
    <div>
      <Topbar titre={`Facture finale : ${f.code}`} />
      <div className="panneau">

        <div className="outils">
          <span className="pill p-or" style={{fontSize:'14px', padding:'6px 14px'}}>{f.code}</span>
          {f.validee ? <Pill type="p-vert" texte={`Validée le ${f.valideeLe}`} /> : <Pill type="p-gris" texte="Brouillon" />}
          <span className="spacer"></span>
          {peut("modifier") && <button className="btn doux" onClick={() => setShowEdit(true)}>Modifier l'entête</button>}
          <button className="btn doux" onClick={() => setShowCoherence(true)}><SearchIcon size={14} /> Vérifier la cohérence</button>
          {!f.validee && peut("valider") && <button className="btn" onClick={handleValider}><CheckIcon size={14} /> Valider</button>}
          <button className="btn or" onClick={() => window.print()}><PrinterIcon size={14} /> Imprimer</button>
        </div>

        {showEdit && (
          <ModuleForm
            moduleId="facturation"
            MODS={MODS}
            recordCode={code}
            onClose={() => setShowEdit(false)}
          />
        )}

        {showCoherence && (
          <Modal title="Vérification de cohérence" onClose={() => setShowCoherence(false)} footer={
            <button className="btn" onClick={() => setShowCoherence(false)}>Fermer</button>
          }>
            <div className="corps" style={{ gridTemplateColumns: '1fr' }}>
              {verifications.map((v, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderTop: i ? '1px solid var(--bord)' : 'none' }}>
                  {v.ok ? <CheckIcon size={16} color="var(--ok)" /> : <AlertIcon size={16} color="var(--rouge)" />}
                  <div>
                    <b style={{ color: v.ok ? 'var(--ok)' : 'var(--rouge)' }}>{v.label}</b>
                    <div style={{ fontSize: '12.5px', color: 'var(--gris)' }}>{v.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </Modal>
        )}

        <div className="fiche-grille">
          <div className="bloc-fiche">
            <h4>Liens du dossier</h4>
            <KVDisplay data={{}} fields={lienDossierFields} />
          </div>

          <div className="bloc-fiche">
            <h4>A. Facture finale - synthèse</h4>
            <KVDisplay data={{}} fields={syntheseFields} />
          </div>
        </div>

        <div className="bloc-fiche large">
          <h4>Lignes de facture {peut('modifier') && <button className="btn mini" style={{float:'right'}} onClick={() => setLigneEnCours({})}>+ Ajouter une ligne</button>}</h4>
          <DataTable
            columns={[
              {key: 'designation', label: 'Désignation'},
              {key: 'categorie', label: 'Catégorie'},
              {key: 'quantite', label: 'Qté'},
              {key: 'prixUnitaire', label: 'PU', render: (v) => fmtMAD(v)},
              {key: 'montantHT', label: 'Montant HT', render: (v) => fmtMAD(v)},
              {key: 'tauxTVA', label: 'TVA %'},
              {key: 'montantTVA', label: 'Montant TVA', render: (v) => fmtMAD(v)},
              {key: 'montantTTC', label: 'Montant TTC', render: (v) => <b>{fmtMAD(v)}</b>},
              {key: 'statut', label: 'Statut', render: (s) => <Pill type={s==="Justifiée"?"p-vert":s==="Estimée"?"p-ambre":"p-gris"} texte={s} />},
              {key: 'actions', label: 'Actions', render: (v, row) => peut('modifier') && <button className="btn mini" onClick={() => setLigneEnCours(row)}>Modifier</button>}
            ]}
            data={c.lignes}
          />
        </div>

        {ligneEnCours && (
          <LigneModal
            title={ligneEnCours.id ? `Modifier la ligne ${ligneEnCours.id}` : 'Ajouter une ligne'}
            champs={LIGNE_CHAMPS}
            initialData={ligneEnCours}
            onSave={handleSaveLigne}
            onClose={() => setLigneEnCours(null)}
          />
        )}

        <div className="bloc-fiche large" style={{background: 'var(--fond-jaune)'}}>
          <h4>B. État de compte / Reliquat</h4>
          <KVDisplay data={{}} fields={etatCompteFields} />
        </div>

      </div>
    </div>
  );
};

export default FicheFF;
