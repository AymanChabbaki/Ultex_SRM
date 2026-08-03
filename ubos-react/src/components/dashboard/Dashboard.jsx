import React, { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import StatCard from '../common/StatCard';
import CheminDossier from '../common/CheminDossier';
import DataTable from '../common/DataTable';

const ETAPES = ["Sourcing","Études & Chiffrage","Closing","Paiement","Analyse Dossier","Transport","Transit & Douane","Certification","Livraison","Suivi Client","Clôturé"];

export default function Dashboard() {
  const { db } = useDB();
  const { session, estDirection, donneesPerso } = useAuth();

  const alertes = useMemo(() => {
    // Placeholder for calculerAlertes
    return [];
  }, [db]);

  if (!estDirection()) {
    return <div>{/* RendrePersonnel component or logic here */}</div>;
  }

  const dossActifs = db.dossiers.filter(d => d.statut !== "Annulé" && d.etape !== "Clôturé");
  const pipeline = dossActifs.reduce((s, d) => s + (+d.montantVente || 0), 0);
  const payAttente = db.paiements.filter(p => ["Prévu", "En attente", "En retard"].includes(p.statut));
  const auj = new Date(new Date().toDateString());
  const tRetard = db.taches.filter(t => t.statut !== "Terminée" && t.echeance && new Date(t.echeance) < auj);
  const leadsNouv = db.leads.filter(l => ["Nouveau", "Contacté", "En qualification"].includes(l.statut));
  
  const compte = {}; 
  dossActifs.forEach(d => compte[d.etape] = (compte[d.etape] || 0) + 1);
  
  const bloques = db.dossiers.filter(d => d.statut === "Bloqué");
  
  const notifs = db.notifs.filter(n => {
      // placeholder for destinataireEstMoi logic
      return n.dest === "Tous" || (session.services || []).includes(n.dest) || n.dest === session.nomComplet || n.dest === session.identifiant;
  }).slice(0, 6);

  const lim7 = Date.now() - 7 * 864e5;

  return (
    <>
      <Topbar titre="Dashboard Direction" />
      
      <div className="stats">
        <StatCard val={db.clients.length} label="Clients" />
        <StatCard val={leadsNouv.length} label="Leads à traiter" />
        <StatCard val={dossActifs.length} label="Dossiers actifs" />
        <StatCard val={pipeline.toLocaleString("fr-FR")} label="Pipeline (MAD)" />
        <StatCard val={payAttente.length} label="Paiements en attente" alerte={payAttente.length > 0} />
        <StatCard val={bloques.length} label="Dossiers bloqués" alerte={bloques.length > 0} />
        <StatCard val={tRetard.length} label="Tâches en retard" alerte={tRetard.length > 0} />
      </div>

      <CheminDossier compte={compte} etapes={ETAPES} />

      <div className="panneau" style={{ marginBottom: '18px' }}>
        <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '18px', color: 'var(--vert)', padding: '12px 16px', borderBottom: '1px solid var(--bord)', background: '#FBFCFA', display: 'flex', alignItems: 'center', gap: '10px' }}>
          Alertes automatiques 
          {alertes.length ? <span className="pill p-rouge">{alertes.length}</span> : <span className="pill p-vert">Aucune</span>}
          <span style={{ flex: 1 }}></span>
          <button className="btn mini or" onClick={() => window.location.hash = 'rapportDirection'}>⎙ Rapport Direction</button>
        </h4>
        {alertes.length ? (
          <div className="liste-notif">
            {alertes.slice(0, 20).map((a, i) => (
              <div key={i} className="notif nonlu" style={{ background: a[0] === "p-rouge" ? "#FBEDEA" : "#FBF6E9" }}>
                <div className="pt-n" style={{ background: a[0] === "p-rouge" ? "var(--rouge)" : "var(--or)" }}></div>
                <div style={{ flex: 1 }}>{a[1]}</div>
                <button className="btn mini doux" onClick={() => window.location.hash = a[2]}>Ouvrir</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="vide" style={{ padding: '16px' }}>Aucune alerte : dossiers suivis, paiements à jour, franchises sous contrôle.</div>
        )}
      </div>

      <div className="deux-col">
        <div>
          <h3 className="titre-sec">Dernières notifications</h3>
          <div className="panneau liste-notif">
            {notifs.length ? notifs.map(n => (
              <div key={n.code} className={`notif ${n.lu ? "lu" : "nonlu"}`}>
                <div className="pt-n"></div>
                <div>
                  <div>{n.texte}</div>
                  <div className="qui">{n.de} · {n.module} · {n.date}</div>
                </div>
              </div>
            )) : (
              <div className="vide"><b>Rien à signaler</b>Les notifications apparaîtront ici.</div>
            )}
          </div>
        </div>
        <div>
          <h3 className="titre-sec">Dernières actions (audit)</h3>
          <div className="panneau">
            {estDirection() ? (
              <div className="defile">
                <table>
                  <thead>
                    <tr><th>Heure</th><th>Utilisateur</th><th>Module</th><th>Action</th><th>Objet</th></tr>
                  </thead>
                  <tbody>
                    {db.audit.slice(0, 7).map((a, i) => (
                      <tr key={i}>
                        <td>{a.heure}</td>
                        <td>{a.utilisateur}</td>
                        <td>{a.module}</td>
                        <td>{a.action}</td>
                        <td className="code">{a.objet}</td>
                      </tr>
                    ))}
                    {!db.audit.length && <tr><td colSpan="5" className="vide">Aucune action enregistrée.</td></tr>}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="note-verrou"><b>Réservé à la Direction</b>Le journal d'audit détaillé n'est visible que par la Direction.</div>
            )}
          </div>
        </div>
      </div>

      <h3 className="titre-sec" style={{ marginTop: '18px' }}>Équipe — vue par utilisateur</h3>
      <div className="panneau">
        <div className="defile">
          <table>
            <thead>
              <tr><th>Utilisateur</th><th>Services</th><th>Tâches du jour</th><th>Tâches en retard</th><th>Dossiers affectés</th><th>Non lues</th><th>Actions (7 j)</th><th></th></tr>
            </thead>
            <tbody>
              {db.utilisateurs.filter(x => x.actif).map(x => {
                const dp = donneesPerso ? donneesPerso(x) : { tJour: [], tRetard: [], mesDossiers: [], nonLues: [] };
                const act = db.audit.filter(a => a.ts >= lim7 && a.utilisateur === x.nomComplet).length;
                return (
                  <tr key={x.identifiant}>
                    <td><b>{x.nomComplet}</b><br /><small style={{ color: 'var(--gris)' }}>{x.poste || "—"}</small></td>
                    <td>{(x.services || []).map(s => <span key={s} className="pill p-gris">{s}</span>)} {!(x.services || []).length && "—"}</td>
                    <td>{dp.tJour.length}</td>
                    <td>{dp.tRetard.length ? <b style={{ color: 'var(--rouge)' }}>{dp.tRetard.length}</b> : "0"}</td>
                    <td>{dp.mesDossiers.length}</td>
                    <td>{dp.nonLues.length}</td>
                    <td>{act}</td>
                    <td><button className="btn mini doux" onClick={() => window.location.hash = `dashUser:${x.identifiant}`}>Voir son tableau de bord</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
