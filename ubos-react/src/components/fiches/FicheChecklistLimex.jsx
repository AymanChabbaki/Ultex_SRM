import React, { useState, useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import StatCard from '../common/StatCard';
import { pill } from '../../utils/format';
import {
  STATUTS_CONTROLE_LIMEX, COULEUR_STATUT_LIMEX, PORTES_VALIDATION_LIMEX, DECISIONS_PORTE_LIMEX
} from '../../data/constants';
import { calculerDashboardLimex, controlesBloquantsPorte } from '../../utils/limex';

function LigneControleLimex({ ligne, controle, canYasser, canImane, canOumaima, onUpdate }) {
  const [commentaire, setCommentaire] = useState(ligne.commentaireYasser || '');
  const [controleImane, setControleImane] = useState(ligne.controleImane || '');

  const statutsDisponibles = STATUTS_CONTROLE_LIMEX.filter(s => {
    if (s === "Validé définitivement") return canOumaima;
    if (s === "Validé par Imane" || s === "Validation Oumaima requise") return canImane || canOumaima;
    return true;
  });

  return (
    <tr>
      <td className="code">{controle.id}</td>
      <td>{controle.domaine}</td>
      <td style={{ maxWidth: '260px' }}>{controle.controle}</td>
      <td>{pill(controle.priorite || '—', controle.priorite === 'P0' ? 'p-rouge' : 'p-gris')}</td>
      <td>
        <select
          value={ligne.applicable === true ? 'oui' : ligne.applicable === false ? 'non' : ''}
          disabled={!canImane && !canOumaima}
          onChange={e => onUpdate({ applicable: e.target.value === 'oui' ? true : e.target.value === 'non' ? false : null })}
        >
          <option value="">À définir</option>
          <option value="oui">Applicable</option>
          <option value="non">N/A</option>
        </select>
      </td>
      <td>
        <select
          value={ligne.statut}
          disabled={!canYasser && !canImane && !canOumaima}
          onChange={e => onUpdate({ statut: e.target.value })}
        >
          {statutsDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ marginTop: '4px' }}>{pill(ligne.statut, COULEUR_STATUT_LIMEX[ligne.statut] || 'p-gris')}</div>
      </td>
      <td>
        <input
          value={commentaire}
          disabled={!canYasser}
          onChange={e => setCommentaire(e.target.value)}
          onBlur={() => { if (commentaire !== (ligne.commentaireYasser || '')) onUpdate({ commentaireYasser: commentaire }); }}
          placeholder="Commentaire Yasser…"
        />
      </td>
      <td>
        <input
          value={controleImane}
          disabled={!canImane && !canOumaima}
          onChange={e => setControleImane(e.target.value)}
          onBlur={() => { if (controleImane !== (ligne.controleImane || '')) onUpdate({ controleImane, dateControle: new Date().toLocaleDateString('fr-FR') }); }}
          placeholder="Contrôle Imane…"
        />
      </td>
      <td style={{ textAlign: 'center' }}>
        <input
          type="checkbox"
          checked={!!ligne.validationOumaima}
          disabled={!canOumaima}
          onChange={e => onUpdate({ validationOumaima: e.target.checked })}
        />
      </td>
    </tr>
  );
}

export default function FicheChecklistLimex({ codeProp, code: codeFromProp }) {
  const { db, updateDB, audit } = useDB();
  const { peut, estDirection, session } = useAuth();
  const { toast } = useToast();
  const code = codeProp || codeFromProp || (window.location.hash.startsWith('#ficheChecklistLimex:') ? window.location.hash.split(':')[1] : '');

  const [filtrePhase, setFiltrePhase] = useState('');
  const [filtreStatut, setFiltreStatut] = useState('');
  const [filtrePriorite, setFiltrePriorite] = useState('');
  const [afficherNA, setAfficherNA] = useState(false);
  const [recherche, setRecherche] = useState('');

  const canYasser = peut('modifier');
  const canImane = peut('valider');
  const canOumaima = estDirection();

  const dossier = (db?.dossiers || []).find(d => d.code === code);
  const parId = useMemo(() => new Map((db.controlesLimex || []).map(c => [c.id, c])), [db.controlesLimex]);
  const lignes = useMemo(() => (db.dossierControlesLimex || []).filter(l => l.dossier === code), [db.dossierControlesLimex, code]);

  if (!dossier) {
    return (
      <div>
        <Topbar titre="Checklist LIMEX" />
        <div className="panneau"><div className="vide"><b>Dossier introuvable</b> ({code})</div></div>
      </div>
    );
  }

  if (!lignes.length) {
    return (
      <div>
        <Topbar titre={`Checklist LIMEX — ${code}`} />
        <div className="panneau">
          <div className="vide">
            <b>Aucune checklist générée pour ce dossier</b>
            Ce dossier a été créé avant l'activation du référentiel LIMEX, ou aucun contrôle actif n'existe. Importez le référentiel dans le Centre d'importation.
          </div>
        </div>
      </div>
    );
  }

  const dash = calculerDashboardLimex(db, code);

  const phases = [...new Set((db.controlesLimex || []).map(c => c.phase))];

  const lignesFiltrees = lignes.filter(l => {
    const c = parId.get(l.controleId);
    if (!c) return false;
    if (!afficherNA && l.applicable === false) return false;
    if (filtrePhase && c.phase !== filtrePhase) return false;
    if (filtreStatut && l.statut !== filtreStatut) return false;
    if (filtrePriorite && c.priorite !== filtrePriorite) return false;
    if (recherche && !(`${c.id} ${c.controle} ${c.domaine}`.toLowerCase().includes(recherche.toLowerCase()))) return false;
    return true;
  });

  const handleUpdateLigne = (ligneCode, patch) => {
    const nextLignes = (db.dossierControlesLimex || []).map(l => l.code === ligneCode ? { ...l, ...patch } : l);
    updateDB({ ...db, dossierControlesLimex: nextLignes });
    audit('Checklist LIMEX', 'Mise à jour contrôle', ligneCode, Object.keys(patch)[0], '—', JSON.stringify(patch), code);
  };

  const porteInfo = (porte) => {
    const rec = (db.limexPortesValidation || []).find(p => p.dossier === code && p.porte === porte.n);
    const bloquants = controlesBloquantsPorte(db, code, porte);
    return { rec, bloquants };
  };

  const handleDecisionPorte = (porte, decision) => {
    const { bloquants } = porteInfo(porte);
    if ((decision === 'GO' || decision === 'GO sous conditions') && bloquants.length > 0 && decision !== 'GO sous conditions') {
      toast(`Impossible : ${bloquants.length} contrôle(s) P0 encore ouvert(s) sur cette porte (${bloquants.join(', ')}).`);
      return;
    }
    if (decision === 'GO sous conditions' && bloquants.length > 0 && !canOumaima) {
      toast("Seule la Direction peut autoriser un GO sous conditions avec des contrôles P0 ouverts.");
      return;
    }
    const nextPortes = [...(db.limexPortesValidation || [])];
    const idx = nextPortes.findIndex(p => p.dossier === code && p.porte === porte.n);
    const rec = {
      code: `${code}__PORTE${porte.n}`,
      dossier: code,
      porte: porte.n,
      decision,
      validateur: session?.nomComplet || session?.identifiant || '',
      date: new Date().toLocaleDateString('fr-FR'),
      controlesBloquants: bloquants,
      ts: Date.now()
    };
    if (idx > -1) nextPortes[idx] = rec; else nextPortes.push(rec);
    updateDB({ ...db, limexPortesValidation: nextPortes });
    audit('Checklist LIMEX', `Porte ${porte.n} — décision`, rec.code, 'decision', '—', decision, code);
    toast(`Porte ${porte.n} : ${decision}`);
  };

  return (
    <div>
      <Topbar titre={`Checklist LIMEX — ${code}`} />

      <div className="outils">
        <button className="btn mini doux" onClick={() => window.location.hash = `ficheDossier:${code}`}>← Retour au dossier</button>
      </div>

      <div className="stats">
        <StatCard val={dash.applicables} label="Contrôles applicables" />
        <StatCard val={dash.valides} label="Validés" />
        <StatCard val={dash.enAttente} label="En attente" alerte={dash.enAttente > 0} />
        <StatCard val={dash.nonConformes} label="Non conformes" alerte={dash.nonConformes > 0} />
        <StatCard val={dash.bloques} label="Bloqués" alerte={dash.bloques > 0} />
        <StatCard val={dash.p0Ouverts} label="P0 encore ouverts" alerte={dash.p0Ouverts > 0} />
        <StatCard val={dash.p1Ouverts} label="P1 encore ouverts" alerte={dash.p1Ouverts > 0} />
        <StatCard val={`${dash.tauxAvancement}%`} label="Avancement" />
      </div>

      <h3 className="titre-sec">Portes de validation</h3>
      <div className="panneau mb-lg">
        <div className="defile">
          <table>
            <thead>
              <tr><th>Porte</th><th>Contrôles P0 bloquants</th><th>Décision</th><th>Validateur / Date</th></tr>
            </thead>
            <tbody>
              {PORTES_VALIDATION_LIMEX.map(porte => {
                const { rec, bloquants } = porteInfo(porte);
                return (
                  <tr key={porte.n}>
                    <td><b>{porte.n}. {porte.titre}</b></td>
                    <td>{bloquants.length ? pill(`${bloquants.length} ouvert(s)`, 'p-rouge') : pill('Aucun', 'p-vert')}</td>
                    <td>
                      <select
                        value={rec?.decision || 'En attente'}
                        disabled={!canImane && !canOumaima}
                        onChange={e => handleDecisionPorte(porte, e.target.value)}
                      >
                        {DECISIONS_PORTE_LIMEX.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td><small>{rec ? `${rec.validateur || '—'} · ${rec.date}` : '—'}</small></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <h3 className="titre-sec">Contrôles ({lignesFiltrees.length} / {lignes.length})</h3>
      <div className="outils">
        <input type="search" placeholder="Rechercher un contrôle…" value={recherche} onChange={e => setRecherche(e.target.value)} />
        <select value={filtrePhase} onChange={e => setFiltrePhase(e.target.value)}>
          <option value="">Toutes les phases</option>
          {phases.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}>
          <option value="">Tous les statuts</option>
          {STATUTS_CONTROLE_LIMEX.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filtrePriorite} onChange={e => setFiltrePriorite(e.target.value)}>
          <option value="">Toutes priorités</option>
          {['P0','P1','P2','P3','P4','P5','P6','P7','P8'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
          <input type="checkbox" checked={afficherNA} onChange={e => setAfficherNA(e.target.checked)} /> Afficher les N/A
        </label>
      </div>

      <div className="panneau">
        <div className="defile">
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Domaine</th><th>Contrôle</th><th>Priorité</th><th>Applicable</th>
                <th>Statut</th><th>Commentaire Yasser</th><th>Contrôle Imane</th><th>Validé Oumaima</th>
              </tr>
            </thead>
            <tbody>
              {lignesFiltrees.map(l => {
                const c = parId.get(l.controleId);
                if (!c) return null;
                return (
                  <LigneControleLimex
                    key={l.code}
                    ligne={l}
                    controle={c}
                    canYasser={canYasser}
                    canImane={canImane}
                    canOumaima={canOumaima}
                    onUpdate={(patch) => handleUpdateLigne(l.code, patch)}
                  />
                );
              })}
              {!lignesFiltrees.length && (
                <tr><td colSpan="9" className="vide">Aucun contrôle ne correspond à ces filtres.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
