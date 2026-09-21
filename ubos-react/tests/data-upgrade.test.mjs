import test from 'node:test';
import assert from 'node:assert/strict';
import { recordFollowup, deadlineDue, localDay } from '../src/utils/dataFollowup.js';
import { leadsDuJour, codesSansSuiviDepuis, calculerProgressionJour, calculerObjectifActif } from '../src/utils/dataPipeline.js';

const user = { nomComplet:'Ouiam', services:['Data'] };
test('manual Workflow requests are synchronized records but excluded from new leads', () => {
  const date = new Date(2026, 8, 21, 12);
  const base = { responsableData:'Data', dateDemande:localDay(date) };
  const db = { demandes:[{...base, code:'manual', createdManually:true}, {...base, code:'agent'}, {...base, code:'sheet', sourceSynchronisation:'Google Sheets'}] };
  assert.deepEqual(leadsDuJour(db, user, date).map(d => d.code).sort(), ['agent', 'sheet']);
});
test('deadlines become due at the selected hour', () => {
  assert.equal(deadlineDue('2026-09-21T15:30', new Date('2026-09-21T15:29')), false);
  assert.equal(deadlineDue('2026-09-21T15:30', new Date('2026-09-21T15:30')), true);
  assert.equal(deadlineDue('', new Date()), false);
});
test('state versions preserve notes; contact alone does not reset state inactivity', () => {
  const first = recordFollowup({code:'A1', sourceDonnees:'Workflow', dateEntreeData:'2026-09-18'}, {dataTag:'Pas réponse'}, {actor:'Ouiam', notes:'Appel sans réponse', now:new Date('2026-09-21T10:00Z')});
  const contact = recordFollowup(first, {dernierContact:'2026-09-29'}, {actor:'Ouiam', action:'Contact effectué', now:new Date('2026-09-29T12:00Z')});
  assert.equal(contact.etatVersion, 1);
  assert.equal(contact.historiqueSuivi[0].notes, 'Appel sans réponse');
  assert.equal(contact.dateDernierChangementEtat, first.dateDernierChangementEtat);
  assert.deepEqual(codesSansSuiviDepuis({clients:[contact]}, user, 7, new Date('2026-09-29T12:00Z')).map(c => c.code), ['A1']);
  const second = recordFollowup(contact, {dataTag:'Traité'}, {actor:'Ouiam', now:new Date('2026-09-29T12:00Z')});
  assert.equal(second.etatVersion, 2);
  assert.equal(second.historiqueSuivi.length, 3);
  assert.deepEqual(codesSansSuiviDepuis({clients:[second]}, user, 7, new Date('2026-09-29T12:00Z')), []);
});
test('calendar objectives count the selected day from history, even after later contacts', () => {
  const db = {objectifsData:[{dateDebut:'2026-09-01',dateFin:'2026-09-30',label:'Septembre'}], audit:[
    {date:'21/09/2026',utilisateur:'Ouiam',module:'Clients',action:'Contact effectué',objet:'A1'},
    {date:'22/09/2026',utilisateur:'Ouiam',module:'Clients',action:'Contact effectué',objet:'A1'},
  ]};
  const date = new Date(2026,8,21,12);
  assert.equal(calculerProgressionJour(db,user,date).clientsContactes,1);
  assert.equal(calculerProgressionJour(db,user,date).relancesEffectuees,1);
  assert.equal(calculerObjectifActif(db,user,date).label,'Septembre');
});
