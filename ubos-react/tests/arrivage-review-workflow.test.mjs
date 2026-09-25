import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  ACTIONS_REVUE_ARRIVAGE,
  actionsRevueArrivage,
  ETATS_REVUE_ARRIVAGE,
  initialiserRevueArrivage,
  notificationsNouvelleCommande,
  transitionRevueArrivage,
} from '../src/utils/arrivageWorkflow.js';

const now = '2026-09-25T10:00:00.000Z';

test('a new arrival is assigned to Imane with a permanent history entry', () => {
  const arrivage = initialiserRevueArrivage({ code: 'ARR1', commandes: ['CMD1', 'CMD2'] }, 'Yasser', now);
  assert.equal(arrivage.circuitValidation, ETATS_REVUE_ARRIVAGE.IMANE);
  assert.equal(arrivage.circuitDestinataire, 'Imane');
  assert.equal(arrivage.circuitHistorique.length, 1);
  assert.deepEqual(arrivage.commandes, ['CMD1', 'CMD2']);
});

test('Imane can send to Direction, Direction returns notes, then Imane sends counter-notes again', () => {
  let arrivage = initialiserRevueArrivage({ code: 'ARR1', commandes: ['CMD1'] }, 'Yasser', now);
  let result = transitionRevueArrivage(arrivage, ACTIONS_REVUE_ARRIVAGE.ENVOYER_DIRECTION, {
    role: 'Imane', auteur: 'Imane', note: 'Merci de contrôler les documents.', date: now,
  });
  assert.equal(result.arrivage.circuitValidation, ETATS_REVUE_ARRIVAGE.DIRECTION);
  assert.equal(result.cible, 'Direction');

  result = transitionRevueArrivage(result.arrivage, ACTIONS_REVUE_ARRIVAGE.RETOUR_IMANE, {
    role: 'Direction', auteur: 'Direction', note: 'Corriger le BL.', date: now,
  });
  assert.equal(result.arrivage.circuitValidation, ETATS_REVUE_ARRIVAGE.IMANE);
  assert.equal(result.arrivage.circuitHistorique[0].note, 'Corriger le BL.');

  result = transitionRevueArrivage(result.arrivage, ACTIONS_REVUE_ARRIVAGE.ENVOYER_DIRECTION, {
    role: 'Imane', auteur: 'Imane', note: 'BL corrigé, merci de revérifier.', date: now,
  });
  assert.equal(result.arrivage.circuitValidation, ETATS_REVUE_ARRIVAGE.DIRECTION);
  assert.equal(result.arrivage.circuitHistorique.length, 4);
});

test('Imane can loop work through Yasser and validate only after it returns', () => {
  let arrivage = initialiserRevueArrivage({ code: 'ARR2', commandes: ['CMD9'] }, 'Yasser', now);
  let result = transitionRevueArrivage(arrivage, ACTIONS_REVUE_ARRIVAGE.ENVOYER_YASSER, {
    role: 'Imane', auteur: 'Imane', note: 'Compléter le suivi fournisseur.', date: now,
  });
  assert.equal(result.arrivage.circuitValidation, ETATS_REVUE_ARRIVAGE.YASSER);
  assert.deepEqual(actionsRevueArrivage(result.arrivage, 'Yasser'), [ACTIONS_REVUE_ARRIVAGE.RETOUR_IMANE]);

  result = transitionRevueArrivage(result.arrivage, ACTIONS_REVUE_ARRIVAGE.RETOUR_IMANE, {
    role: 'Yasser', auteur: 'Yasser el aouni', note: 'Suivi complété.', date: now,
  });
  assert.equal(result.arrivage.circuitValidation, ETATS_REVUE_ARRIVAGE.IMANE);

  result = transitionRevueArrivage(result.arrivage, ACTIONS_REVUE_ARRIVAGE.VALIDER, {
    role: 'Imane', auteur: 'Imane', note: '', date: now,
  });
  assert.equal(result.arrivage.circuitValidation, ETATS_REVUE_ARRIVAGE.VALIDE);
  assert.deepEqual(actionsRevueArrivage(result.arrivage, 'Imane'), []);
});

test('Direction and Yasser cannot act outside their assigned stage and handoffs require notes', () => {
  const arrivage = initialiserRevueArrivage({ code: 'ARR3', commandes: ['CMD1'] }, 'Yasser', now);
  assert.throws(() => transitionRevueArrivage(arrivage, ACTIONS_REVUE_ARRIVAGE.RETOUR_IMANE, {
    role: 'Direction', auteur: 'Direction', note: 'Analyse', date: now,
  }), /pas autorisée/);
  assert.throws(() => transitionRevueArrivage(arrivage, ACTIONS_REVUE_ARRIVAGE.ENVOYER_DIRECTION, {
    role: 'Imane', auteur: 'Imane', note: '', date: now,
  }), /Ajoutez une note/);
});

test('a manually-started legacy arrival must contain at least one commande', () => {
  const legacy = { code: 'ARR-OLD', commandes: [] };
  assert.throws(() => transitionRevueArrivage(legacy, ACTIONS_REVUE_ARRIVAGE.DEMARRER, {
    role: 'Yasser', auteur: 'Yasser', note: 'Prêt', date: now,
  }), /au moins une commande/);
});

test('Imane cannot route or validate a newly-created empty arrival', () => {
  const empty = initialiserRevueArrivage({ code: 'ARR-EMPTY', commandes: [] }, 'Yasser', now);
  for (const action of [ACTIONS_REVUE_ARRIVAGE.ENVOYER_DIRECTION, ACTIONS_REVUE_ARRIVAGE.ENVOYER_YASSER, ACTIONS_REVUE_ARRIVAGE.VALIDER]) {
    assert.throws(() => transitionRevueArrivage(empty, action, {
      role: 'Imane', auteur: 'Imane', note: 'Prêt pour la suite', date: now,
    }), /au moins une commande/);
  }
});

test('new commandes notify Direction, Imane and Yasser without duplicates', () => {
  const db = { utilisateurs: [
    { nomComplet: 'Imane ULTEx', identifiant: 'imane', actif: true },
    { nomComplet: 'Yasser el aouni', identifiant: 'yasser', actif: true },
  ] };
  const notifications = notificationsNouvelleCommande(db, { code: 'CMD1', referenceMetier: 'C1-9600' });
  assert.deepEqual(notifications.map(item => item.dest), ['Direction', 'Imane ULTEx', 'Yasser el aouni']);
  assert.ok(notifications.every(item => item.message.includes('#ficheCommande:CMD1')));
});

test('both commande creation paths trigger stakeholder notifications', () => {
  const modules = fs.readFileSync(new URL('../src/data/modules.js', import.meta.url), 'utf8');
  const demande = fs.readFileSync(new URL('../src/components/fiches/FicheDemande.jsx', import.meta.url), 'utf8');
  assert.match(modules, /notificationsNouvelleCommande\(DB,o\)/);
  assert.match(demande, /notificationsNouvelleCommande\(db, commande\)/);
});

test('generic form persists the record before flushing post-save notifications', () => {
  const form = fs.readFileSync(new URL('../src/components/modules/ModuleForm.jsx', import.meta.url), 'utf8');
  assert.match(form, /notifier: \(\.\.\.args\) => notificationsApresSauve\.push\(args\)/);
  const saveIndex = form.indexOf('await updateDB(nextDb);');
  const notifyIndex = form.indexOf('notificationsApresSauve.forEach(args => notifier(...args));', saveIndex);
  assert.ok(saveIndex >= 0 && notifyIndex > saveIndex);
});

test('Direction LIMEX report exposes the arrival review queue', () => {
  const report = fs.readFileSync(new URL('../src/components/custom/RapportLimexDirection.jsx', import.meta.url), 'utf8');
  assert.match(report, /À analyser par Direction/);
  assert.match(report, /circuitValidation/);
  assert.match(report, /circuitDestinataire/);
  assert.match(report, /\(a\.commandes \|\| \[\]\)\.length/);
});
