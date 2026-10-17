import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const identity = await import(pathToFileURL(path.join(root, 'src/utils/demandeIdentity.js')).href);

test('a demande resolves from both its internal CRM code and visible reference', () => {
  const demandes = [{ id: 'DMD016507', code: 'DMD016507', referenceMetier: 'D1-9568' }];
  assert.equal(identity.findDemandeByIdentifier(demandes, 'DMD016507')?.referenceMetier, 'D1-9568');
  assert.equal(identity.findDemandeByIdentifier(demandes, 'D1-9568')?.code, 'DMD016507');
  assert.equal(identity.findDemandeByIdentifier(demandes, 'd1-9568')?.code, 'DMD016507');
});

test('paginated demande links hydrate their record before navigation', () => {
  const generic = read('src/components/modules/GenericModule.jsx');
  const fiche = read('src/components/fiches/FicheDemande.jsx');
  const commande = read('src/components/fiches/FicheCommande.jsx');

  assert.match(generic, /onClick=\{\(\) => hydraterEnregistrements\(M\.coll, \[o\]\)\}/);
  assert.match(fiche, /fetchCollectionPage\('demandes'/);
  assert.match(fiche, /findDemandeByIdentifier\(db\?\.demandes, code\)/);
  assert.match(commande, /demandeLiee\?\.referenceMetier \|\| demandeCode/);
});
