import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prochainCodePartenaire, datePlusJours, factureCalculee,
  indicateursPartenaire, validerAffectations,
} from './partnerFinance.js';

const partner = { code: 'PL-FWD-001', roles: ['Forwarder'], plafondCredit: 130000 };
const invoice = {
  code: 'FP-1', partenaireId: partner.code, numero: 'MPL-2026-1',
  dateFacture: '2026-10-23', dateEcheance: '2026-12-22',
  montantTtc: 3007.78, montantCotation: 2900, devise: 'MAD',
};
const note = {
  code: 'LCN-1', partenaireId: partner.code, montant: 3007.78,
  statut: 'Remise', affectations: [{ factureId: invoice.code, montant: 3007.78 }],
};

test('MPL: code and 60-day payment deadline', () => {
  assert.equal(prochainCodePartenaire('Forwarder', []), 'PL-FWD-001');
  assert.equal(prochainCodePartenaire('Forwarder', [partner]), 'PL-FWD-002');
  assert.equal(datePlusJours(invoice.dateFacture, 60), invoice.dateEcheance);
});

test('MPL: invoice, LCN settlement and reversal', () => {
  assert.equal(validerAffectations(note, [invoice]), '');
  assert.equal(factureCalculee(invoice, [note]).statut, 'Couverte par LCN');
  assert.equal(factureCalculee(invoice, [{ ...note, statut: 'Encaissée' }]).statut, 'Payée');
  assert.equal(factureCalculee(invoice, [{ ...note, statut: 'Impayée' }]).paye, 0);
  assert.ok(Math.abs(factureCalculee(invoice, []).ecart - 3.71655) < 0.01);
  assert.ok(Math.abs(indicateursPartenaire(partner, [], [invoice], []).plafondUtilise - 2.31367) < 0.01);
});

test('MPL: allocations must match the LCN and not exceed invoice balance', () => {
  assert.match(validerAffectations({ ...note, montant: 3000 }, [invoice]), /égaler/);
  assert.match(validerAffectations({ ...note, affectations: [{ factureId: invoice.code, montant: 4000 }], montant: 4000 }, [invoice]), /supérieure/);
});
