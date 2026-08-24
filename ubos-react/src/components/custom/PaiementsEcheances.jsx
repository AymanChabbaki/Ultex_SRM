import React, { useState } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import Modal from '../common/Modal';
import FormField from '../common/FormField';
import { pill, pillStatut, fmtMAD } from '../../utils/format';
import { MODS } from '../../data/modules';
const ONGLETS = ['À préparer', 'Prêt à payer', 'Soumis Direction', 'Autorisé', 'Payé', 'Tous'];

function calculerAlertesPaiement(p) {
  const alertes = [];
  if (!p.beneficiaire) alertes.push('Bénéficiaire absent');
  if (!p.iban) alertes.push('Coordonnées bancaires absentes');
  if (!p.montant) alertes.push('Montant incohérent');
  if (p.statut === 'Payé' && p.montantFournisseurTotal && (+p.avancePayee || 0) > (+p.montantFournisseurTotal || 0)) alertes.push('Reliquat dépassé');
  return alertes;
}

const CHAMPS_PAIEMENT = MODS.paiements.champs;
const CHAMPS_DOC_CASA = MODS.documentsComptablesCasa.champs;

export default function PaiementsEcheances() {
  const { db, updateDB, genCode, audit, notifier, userCourant } = useDB();
  const { estDirection } = useAuth();
  const { toast } = useToast();
  const [onglet, setOnglet] = useState('À préparer');
  const [showAjouter, setShowAjouter] = useState(false);
  const [formData, setFormData] = useState({});
  const [ordreOuvert, setOrdreOuvert] = useState(null);
  const [showRapport, setShowRapport] = useState(false);
  const [docForm, setDocForm] = useState(null);

  const paiements = db.paiements || [];
  const filtres = onglet === 'Tous' ? paiements : paiements.filter(p => p.statut === onglet || (!p.statut && onglet === 'À préparer'));
  const docsCasa = db.documentsComptablesCasa || [];

  const handleChange = (k, v) => setFormData(prev => ({ ...prev, [k]: v }));

  const handleAjouter = () => {
    if (!formData.montant || !formData.beneficiaire) { toast('Bénéficiaire et montant sont obligatoires.'); return; }
    const code = genCode('PAY');
    const paiement = { code, ts: Date.now(), par: userCourant, statut: 'À préparer', responsablePreparation: userCourant, devise: 'MAD', ...formData };
    updateDB({ ...db, paiements: [paiement, ...paiements] });
    audit('Paiements', 'Préparation', code, '—', '—', `${formData.beneficiaire} — ${fmtMAD(formData.montant)}`);
    toast(`Paiement ${code} créé.`);
    setShowAjouter(false);
    setFormData({});
  };

  const changerStatut = (p, statut) => {
    updateDB({ ...db, paiements: paiements.map(x => x.code === p.code ? { ...x, statut } : x) });
    audit('Paiements', 'Changement de statut', p.code, 'statut', p.statut, statut);
    if (statut === 'Soumis Direction') notifier('Direction', `Paiement à valider — ${p.beneficiaire} (${fmtMAD(p.montant)})\nLien : #paiementsEcheances`, 'Paiements');
    toast(`Statut : ${statut}.`);
  };

  const handlePreparerOrdre = () => {
    updateDB({ ...db, paiements: paiements.map(x => x.code === ordreOuvert.code ? { ...x, ordreVirementPrepare: true, statut: 'Soumis Direction' } : x) });
    audit('Paiements', 'Ordre de virement préparé', ordreOuvert.code, 'statut', ordreOuvert.statut, 'Soumis Direction');
    notifier('Direction', `Ordre de virement à valider — ${ordreOuvert.beneficiaire} (${fmtMAD(ordreOuvert.montant)})\nLien : #paiementsEcheances`, 'Paiements');
    toast('Ordre de virement envoyé à la Direction.');
    setOrdreOuvert(null);
  };

  const handleAjouterDoc = () => {
    if (!docForm.typeDocument) { toast('Choisissez un type de document.'); return; }
    const code = genCode('DCC');
    updateDB({ ...db, documentsComptablesCasa: [{ code, ts: Date.now(), par: userCourant, statut: 'À classer', ...docForm }, ...docsCasa] });
    audit('Documents comptables Casa', 'Ajout', code, '—', '—', docForm.typeDocument);
    toast('Document ajouté.');
    setDocForm(null);
  };

  const classerDoc = (d) => {
    updateDB({ ...db, documentsComptablesCasa: docsCasa.map(x => x.code === d.code ? { ...x, statut: 'Classé' } : x) });
    audit('Documents comptables Casa', 'Classé', d.code, 'statut', d.statut, 'Classé');
    toast('Document classé.');
  };

  const totauxParDevise = {};
  paiements.filter(p => p.statut !== 'Annulé').forEach(p => {
    const dev = p.devise || 'MAD';
    totauxParDevise[dev] = (totauxParDevise[dev] || 0) + (+p.montant || 0);
  });

  return (
    <div>
      <Topbar titre="Paiements & Échéances" />

      <div className="outils">
        {ONGLETS.map(o => (
          <button key={o} className={`btn mini ${onglet === o ? 'or' : 'doux'}`} onClick={() => setOnglet(o)}>{o}</button>
        ))}
        <span className="spacer"></span>
        {estDirection() && <button className="btn doux" onClick={() => setShowRapport(true)}>Générer rapport Paiements Direction</button>}
        <button className="btn or" onClick={() => setShowAjouter(true)}>+ Ajouter un paiement</button>
      </div>

      <div className="panneau">
        <div className="defile">
          <table>
            <thead><tr><th>Code</th><th>Bénéficiaire</th><th>Type</th><th>Montant</th><th>Échéance</th><th>Priorité</th><th>Statut</th><th>Alertes</th><th></th></tr></thead>
            <tbody>
              {filtres.length ? filtres.map(p => {
                const alertes = calculerAlertesPaiement(p);
                return (
                  <tr key={p.code}>
                    <td className="code">{p.code}</td>
                    <td>{p.beneficiaire || '—'}</td>
                    <td>{p.nature || '—'}</td>
                    <td>{Number(p.montant || 0).toLocaleString('fr-FR')} {p.devise || 'MAD'}</td>
                    <td>{p.echeance || '—'}</td>
                    <td>{p.priorite ? pill(p.priorite, p.priorite === 'Priorité 1' ? 'p-rouge' : p.priorite === 'Priorité 2' ? 'p-ambre' : 'p-gris') : '—'}</td>
                    <td>{pillStatut(p.statut || 'À préparer')}</td>
                    <td>{alertes.length ? alertes.map((a, i) => <span key={i} className="pill p-rouge" style={{ marginRight: '4px' }}>⚠ {a}</span>) : '—'}</td>
                    <td>
                      {p.statut === 'À préparer' && <button className="btn mini doux" onClick={() => changerStatut(p, 'Prêt à payer')}>Prêt à payer</button>}{' '}
                      {['À préparer', 'Prêt à payer'].includes(p.statut || 'À préparer') && <button className="btn mini or" onClick={() => setOrdreOuvert(p)}>Ordre de virement</button>}
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="9"><div className="vide">Rien dans cette catégorie.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bloc-fiche large">
        <h4>Documents comptables Casa</h4>
        <button className="btn mini doux" style={{ marginBottom: '10px' }} onClick={() => setDocForm({})}>+ Ajouter un document</button>
        <div className="defile">
          <table>
            <thead><tr><th>Date</th><th>Dossier</th><th>Type</th><th>Fournisseur</th><th>Montant</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              {docsCasa.length ? docsCasa.slice(0, 20).map(d => (
                <tr key={d.code}>
                  <td>{d.date}</td>
                  <td>{d.dossier || '—'}</td>
                  <td>{d.typeDocument}</td>
                  <td>{d.fournisseur || '—'}</td>
                  <td>{fmtMAD(d.montant)}</td>
                  <td>{pillStatut(d.statut)}</td>
                  <td>{d.statut !== 'Classé' && <button className="btn mini doux" onClick={() => classerDoc(d)}>Classé</button>}</td>
                </tr>
              )) : (
                <tr><td colSpan="7"><div className="vide">Aucun document.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAjouter && (
        <Modal title="+ Ajouter un paiement" onClose={() => setShowAjouter(false)} large footer={
          <><button className="btn doux" onClick={() => setShowAjouter(false)}>Annuler</button><button className="btn or" onClick={handleAjouter}>Créer</button></>
        }>
          <div className="corps">
            {CHAMPS_PAIEMENT.filter(f => f.k !== 'statut').map((f, i) => (
              <FormField key={i} fieldConfig={f} value={formData[f.k]} onChange={(val) => handleChange(f.k, val)} db={db} />
            ))}
          </div>
        </Modal>
      )}

      {ordreOuvert && (
        <Modal title="Préparer l'ordre de virement" onClose={() => setOrdreOuvert(null)} footer={
          <><button className="btn doux" onClick={() => setOrdreOuvert(null)}>Annuler</button><button className="btn or" onClick={handlePreparerOrdre}>Envoyer à la Direction</button></>
        }>
          <div className="corps">
            <div className="kv" style={{ gridColumn: '1/-1' }}>
              <div><label>Bénéficiaire</label><span>{ordreOuvert.beneficiaire || '—'}</span></div>
              <div><label>Banque</label><span>{ordreOuvert.banque || '—'}</span></div>
              <div><label>Compte / IBAN</label><span>{ordreOuvert.iban || '—'}</span></div>
              <div><label>Montant</label><span>{Number(ordreOuvert.montant || 0).toLocaleString('fr-FR')} {ordreOuvert.devise || 'MAD'}</span></div>
              <div><label>Motif</label><span>{ordreOuvert.nature || '—'}</span></div>
              <div><label>Référence dossier</label><span>{ordreOuvert.dossier || ordreOuvert.codeReference || '—'}</span></div>
            </div>
          </div>
        </Modal>
      )}

      {docForm && (
        <Modal title="+ Document comptable Casa" onClose={() => setDocForm(null)} footer={
          <><button className="btn doux" onClick={() => setDocForm(null)}>Annuler</button><button className="btn or" onClick={handleAjouterDoc}>Ajouter</button></>
        }>
          <div className="corps">
            {CHAMPS_DOC_CASA.filter(f => f.k !== 'statut').map((f, i) => (
              <FormField key={i} fieldConfig={f} value={docForm[f.k]} onChange={(val) => setDocForm(prev => ({ ...prev, [f.k]: val }))} db={db} />
            ))}
          </div>
        </Modal>
      )}

      {showRapport && (
        <Modal title="Rapport Paiements Direction" onClose={() => setShowRapport(false)} large footer={
          <><button className="btn doux" onClick={() => setShowRapport(false)}>Fermer</button><button className="btn or" onClick={() => window.print()}>Imprimer</button></>
        }>
          <div className="corps">
            <div className="defile" style={{ gridColumn: '1/-1' }}>
              <table>
                <thead><tr><th>Code</th><th>Bénéficiaire</th><th>Type</th><th>Montant</th><th>Échéance</th><th>Priorité</th><th>Statut</th></tr></thead>
                <tbody>
                  {paiements.filter(p => p.statut !== 'Annulé').map(p => (
                    <tr key={p.code}>
                      <td>{p.code}</td><td>{p.beneficiaire || '—'}</td><td>{p.nature || '—'}</td>
                      <td>{Number(p.montant || 0).toLocaleString('fr-FR')} {p.devise || 'MAD'}</td>
                      <td>{p.echeance || '—'}</td><td>{p.priorite || '—'}</td><td>{p.statut || 'À préparer'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ gridColumn: '1/-1', marginTop: '14px' }}>
              {Object.entries(totauxParDevise).map(([dev, total]) => (
                <div key={dev}><b>Total {dev} :</b> {total.toLocaleString('fr-FR')}</div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
